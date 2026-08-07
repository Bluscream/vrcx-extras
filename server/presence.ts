import { queryAll } from './db.ts';
import { instanceKey, isInstanceLocation, parseLocation } from './location.ts';
import type { Visit } from './overlap.ts';
import { tableExists } from './schema.ts';

/**
 * Presence is reconstructed from two independent sources, because neither is
 * complete on its own:
 *
 * - `gamelog_join_leave` is parsed from the local VRChat log. It is exact —
 *   explicit join/leave events with durations — but only covers instances the
 *   owner was personally in.
 * - `<prefix>_feed_gps` is polled from the API. It covers friends anywhere,
 *   including instances the owner never entered, but only records transitions
 *   it happens to observe, so it misses short visits entirely.
 *
 * Using only the feed silently loses meetups the game log recorded precisely.
 */

export interface InstanceBucket {
    key: string;
    location: string;
    worldName: string;
    byUser: Map<string, Visit[]>;
    lastEventAt: number;
}

/**
 * VRCX writes the raw world id into `world_name` when the name has not been
 * resolved yet, so an id-shaped value is a placeholder rather than a name.
 */
function usableWorldName(name: string | null): name is string {
    return Boolean(name) && !name!.startsWith('wrld_');
}

function addInterval(
    bucket: InstanceBucket,
    userId: string,
    start: number | null,
    end: number | null
): void {
    if (start === null || end === null || end <= start) {
        return;
    }
    const visits = bucket.byUser.get(userId) ?? [];
    visits.push({ userId, joinedAt: start, leftAt: end });
    bucket.byUser.set(userId, visits);
}

function bucketFor(
    buckets: Map<string, InstanceBucket>,
    location: string
): InstanceBucket {
    const key = instanceKey(location);
    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = {
            key,
            location,
            worldName: '',
            byUser: new Map(),
            lastEventAt: 0
        };
        buckets.set(key, bucket);
    }
    // Prefer a location string carrying access-type tags over a bare one.
    if (location.length > bucket.location.length) {
        bucket.location = location;
    }
    return bucket;
}

interface JoinLeaveEvent {
    userId: string | null;
    type: string | null;
    location: string | null;
    at: number | null;
    durationMs: number | null;
}

function readGameLog(targetIds: string[], buckets: Map<string, InstanceBucket>) {
    if (!tableExists('gamelog_join_leave')) {
        return;
    }

    const placeholders = targetIds.map(() => '?').join(', ');
    const events = queryAll<JoinLeaveEvent>(
        `SELECT user_id, type, location, created_at, time
         FROM gamelog_join_leave
         WHERE user_id IN (${placeholders})
         ORDER BY created_at, id`,
        targetIds,
        (row) => ({
            userId: row.nonEmptyText('user_id'),
            type: row.nonEmptyText('type'),
            location: row.nonEmptyText('location'),
            at: row.timestampOrNull('created_at'),
            durationMs: row.numberOrNull('time')
        })
    );

    /** `${userId}|${key}` -> join timestamp awaiting its matching leave. */
    const open = new Map<string, number>();

    for (const event of events) {
        if (!event.userId || !isInstanceLocation(event.location) || !event.at) {
            continue;
        }
        const bucket = bucketFor(buckets, event.location);
        bucket.lastEventAt = Math.max(bucket.lastEventAt, event.at);

        const openKey = `${event.userId}|${bucket.key}`;

        if (event.type === 'OnPlayerJoined') {
            // Duplicate joins without an intervening leave: keep the earliest.
            if (!open.has(openKey)) {
                open.set(openKey, event.at);
            }
            continue;
        }

        if (event.type === 'OnPlayerLeft') {
            // VRCX may start mid-instance and record a leave with no join; the
            // `time` column carries the duration, so the join can be recovered.
            const start =
                open.get(openKey) ??
                (event.durationMs && event.durationMs > 0
                    ? event.at - event.durationMs
                    : null);
            open.delete(openKey);
            addInterval(bucket, event.userId, start, event.at);
        }
    }

    // A join with no leave means the log ended while they were still present
    // (crash, or the owner left first). Close it at the last thing seen there.
    for (const [openKey, start] of open) {
        const separator = openKey.indexOf('|');
        const bucket = buckets.get(openKey.slice(separator + 1));
        if (bucket) {
            addInterval(
                bucket,
                openKey.slice(0, separator),
                start,
                bucket.lastEventAt
            );
        }
    }
}

function readGpsFeed(
    prefix: string,
    targetIds: string[],
    buckets: Map<string, InstanceBucket>
) {
    const table = `${prefix}_feed_gps`;
    if (!prefix || !tableExists(table)) {
        return;
    }

    const placeholders = targetIds.map(() => '?').join(', ');
    // A GPS row records an *arrival*; the row's `time` column is the duration
    // spent at `previous_location`, so the stay ends at the next row instead.
    const rows = queryAll(
        `SELECT user_id, location, world_name,
                created_at AS joined_at,
                LEAD(created_at) OVER (
                    PARTITION BY user_id ORDER BY created_at
                ) AS left_at
         FROM ${table}
         WHERE user_id IN (${placeholders})`,
        targetIds,
        (row) => ({
            userId: row.nonEmptyText('user_id'),
            location: row.nonEmptyText('location'),
            worldName: row.nonEmptyText('world_name'),
            joinedAt: row.timestampOrNull('joined_at'),
            leftAt: row.timestampOrNull('left_at')
        })
    );

    const now = Date.now();

    for (const row of rows) {
        if (!row.userId || !isInstanceLocation(row.location)) {
            continue;
        }
        const bucket = bucketFor(buckets, row.location);
        if (!bucket.worldName && usableWorldName(row.worldName)) {
            bucket.worldName = row.worldName;
        }
        // A null `left_at` is the user's most recent row: still there.
        addInterval(bucket, row.userId, row.joinedAt, row.leftAt ?? now);
    }
}

/** World names for buckets neither source labelled. */
function fillWorldNames(buckets: Map<string, InstanceBucket>) {
    const missing = [...buckets.values()].filter((b) => !b.worldName);
    if (missing.length === 0) {
        return;
    }

    const nameByWorld = new Map<string, string>();
    const record = (id: string | null, name: string | null) => {
        if (id && usableWorldName(name)) {
            nameByWorld.set(id, name);
        }
    };

    // Lowest priority first — later sources overwrite earlier ones.
    if (tableExists('gamelog_location')) {
        for (const entry of queryAll(
            `SELECT world_id, world_name, MAX(created_at) AS seen_at
             FROM gamelog_location
             WHERE world_name IS NOT NULL AND world_name != ''
             GROUP BY world_id`,
            [],
            (row) => ({
                id: row.nonEmptyText('world_id'),
                name: row.nonEmptyText('world_name')
            })
        )) {
            record(entry.id, entry.name);
        }
    }

    // cache_world holds the canonical name straight from the API.
    if (tableExists('cache_world')) {
        for (const entry of queryAll(
            `SELECT id, name FROM cache_world
             WHERE name IS NOT NULL AND name != ''`,
            [],
            (row) => ({
                id: row.nonEmptyText('id'),
                name: row.nonEmptyText('name')
            })
        )) {
            record(entry.id, entry.name);
        }
    }

    for (const bucket of missing) {
        bucket.worldName =
            nameByWorld.get(parseLocation(bucket.location).worldId) ?? '';
    }
}

export function readPresence(
    prefix: string,
    targetIds: string[]
): Map<string, InstanceBucket> {
    const buckets = new Map<string, InstanceBucket>();
    readGameLog(targetIds, buckets);
    readGpsFeed(prefix, targetIds, buckets);
    fillWorldNames(buckets);
    return buckets;
}
