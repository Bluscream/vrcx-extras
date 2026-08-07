import { queryAll } from './db.js';
import { instanceKey, isInstanceLocation, parseLocation } from './location.js';
import { tableExists } from './schema.js';

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
 * Using only the feed (as this app originally did) silently loses meetups that
 * the game log recorded precisely. Intervals from both are unioned per user and
 * merged before intersection.
 */

/**
 * VRCX writes the raw world id into `world_name` when the name has not been
 * resolved yet, so an id-shaped value is a placeholder rather than a name.
 */
function usableWorldName(name) {
    return Boolean(name) && !name.startsWith('wrld_');
}

function addInterval(byUser, userId, start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return;
    }
    const intervals = byUser.get(userId) ?? [];
    intervals.push({ userId, joinedAt: start, leftAt: end });
    byUser.set(userId, intervals);
}

function bucketFor(buckets, key, location) {
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

async function readGameLog(db, targetIds, buckets) {
    if (!(await tableExists(db, 'gamelog_join_leave'))) {
        return;
    }

    const placeholders = targetIds.map(() => '?').join(', ');
    const events = await queryAll(
        db,
        `SELECT user_id, display_name, type, location, created_at, time
         FROM gamelog_join_leave
         WHERE user_id IN (${placeholders})
         ORDER BY created_at, id`,
        targetIds
    );

    /** `${userId}|${key}` -> join timestamp awaiting its matching leave. */
    const open = new Map();

    for (const event of events) {
        if (!isInstanceLocation(event.location)) {
            continue;
        }
        const key = instanceKey(event.location);
        const bucket = bucketFor(buckets, key, event.location);
        const at = Date.parse(event.created_at);
        if (!Number.isFinite(at)) {
            continue;
        }
        bucket.lastEventAt = Math.max(bucket.lastEventAt, at);

        const openKey = `${event.user_id}|${key}`;

        if (event.type === 'OnPlayerJoined') {
            // Duplicate joins without an intervening leave: keep the earliest.
            if (!open.has(openKey)) {
                open.set(openKey, at);
            }
            continue;
        }

        if (event.type === 'OnPlayerLeft') {
            const duration = Number(event.time) || 0;
            // VRCX may start mid-instance and record a leave with no join; the
            // `time` column carries the duration, so the join can be recovered.
            const start = open.has(openKey)
                ? open.get(openKey)
                : duration > 0
                  ? at - duration
                  : null;
            open.delete(openKey);
            if (start !== null) {
                addInterval(bucket.byUser, event.user_id, start, at);
            }
        }
    }

    // A join with no leave means the log ended while they were still present
    // (crash, or the owner left first). Close it at the last thing seen there.
    for (const [openKey, start] of open) {
        const separator = openKey.indexOf('|');
        const userId = openKey.slice(0, separator);
        const key = openKey.slice(separator + 1);
        const bucket = buckets.get(key);
        if (bucket) {
            addInterval(bucket.byUser, userId, start, bucket.lastEventAt);
        }
    }
}

async function readGpsFeed(db, prefix, targetIds, buckets) {
    const table = `${prefix}_feed_gps`;
    if (!prefix || !(await tableExists(db, table))) {
        return;
    }

    const placeholders = targetIds.map(() => '?').join(', ');
    // A GPS row records an *arrival*; the row's `time` column is the duration
    // spent at `previous_location`, so the stay ends at the next row instead.
    const rows = await queryAll(
        db,
        `SELECT user_id, location, world_name,
                created_at AS joined_at,
                LEAD(created_at) OVER (
                    PARTITION BY user_id ORDER BY created_at
                ) AS left_at
         FROM ${table}
         WHERE user_id IN (${placeholders})`,
        targetIds
    );

    const now = Date.now();

    for (const row of rows) {
        if (!isInstanceLocation(row.location)) {
            continue;
        }
        const bucket = bucketFor(
            buckets,
            instanceKey(row.location),
            row.location
        );
        if (!bucket.worldName && usableWorldName(row.world_name)) {
            bucket.worldName = row.world_name;
        }
        // A null `left_at` is the user's most recent row: still there.
        addInterval(
            bucket.byUser,
            row.user_id,
            Date.parse(row.joined_at),
            row.left_at ? Date.parse(row.left_at) : now
        );
    }
}

/** World names for buckets the GPS feed did not label. */
async function fillWorldNames(db, buckets) {
    const missing = [...buckets.values()].filter((b) => !b.worldName);
    if (missing.length === 0) {
        return;
    }

    const nameByWorld = new Map();

    // Lowest priority first — later sources overwrite earlier ones.
    if (await tableExists(db, 'gamelog_location')) {
        for (const row of await queryAll(
            db,
            `SELECT world_id, world_name, MAX(created_at) AS seen_at
             FROM gamelog_location
             WHERE world_name IS NOT NULL AND world_name != ''
             GROUP BY world_id`
        )) {
            if (usableWorldName(row.world_name)) {
                nameByWorld.set(row.world_id, row.world_name);
            }
        }
    }

    // cache_world holds the canonical name straight from the API.
    if (await tableExists(db, 'cache_world')) {
        for (const row of await queryAll(
            db,
            `SELECT id, name FROM cache_world
             WHERE name IS NOT NULL AND name != ''`
        )) {
            if (usableWorldName(row.name)) {
                nameByWorld.set(row.id, row.name);
            }
        }
    }

    for (const bucket of missing) {
        bucket.worldName =
            nameByWorld.get(parseLocation(bucket.location).worldId) ?? '';
    }
}

export async function readPresence(db, prefix, targetIds) {
    /** @type {Map<string, object>} instance key -> bucket */
    const buckets = new Map();
    await readGameLog(db, targetIds, buckets);
    await readGpsFeed(db, prefix, targetIds, buckets);
    await fillWorldNames(db, buckets);
    return buckets;
}
