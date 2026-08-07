import type { Player } from '../shared/api.ts';
import { queryAll } from './db.ts';
import { foldName, foldQuery } from './fold.ts';
import { tableExists } from './schema.ts';

/**
 * A player plus the ASCII forms their name can be found by. The keys are kept
 * server-side rather than added to Player, since the UI never needs them and
 * they would roughly double the payload of every search response.
 */
export interface DirectoryEntry {
    player: Player;
    /** Lowercased name, its folded forms, then the user id. */
    keys: string[];
}

/**
 * The directory is rebuilt from ~500k feed rows, so it is cached rather than
 * recomputed per keystroke. VRCX keeps writing to the database while this app
 * runs, hence a short TTL instead of a one-shot load.
 */
const CACHE_TTL_MS = 15_000;

let cache: { entries: DirectoryEntry[]; builtAt: number } | null = null;

function blankEntry(id: string): Player {
    return {
        id,
        displayName: '',
        isFriend: false,
        isFavorite: false,
        isBlocked: false,
        isMuted: false,
        hasNote: false,
        trustLevel: null,
        friendNumber: null,
        lastSeen: null,
        sessionCount: 0
    };
}

function upsert(
    entries: Map<string, Player>,
    userId: string | null,
    displayName: string | null
): Player | null {
    if (!userId) {
        return null;
    }
    let entry = entries.get(userId);
    if (!entry) {
        entry = blankEntry(userId);
        entries.set(userId, entry);
    }
    if (displayName && !entry.displayName) {
        entry.displayName = displayName;
    }
    return entry;
}

function build(prefix: string): DirectoryEntry[] {
    const entries = new Map<string, Player>();
    const table = (suffix: string) => `${prefix}${suffix}`;

    // Current friends carry the most authoritative display names.
    if (tableExists(table('_friend_log_current'))) {
        for (const record of queryAll(
            `SELECT user_id, display_name, trust_level, friend_number
             FROM ${table('_friend_log_current')}`,
            [],
            (row) => ({
                userId: row.nonEmptyText('user_id'),
                displayName: row.nonEmptyText('display_name'),
                trustLevel: row.nonEmptyText('trust_level'),
                friendNumber: row.numberOrNull('friend_number')
            })
        )) {
            const entry = upsert(entries, record.userId, record.displayName);
            if (entry) {
                entry.isFriend = true;
                entry.trustLevel = record.trustLevel;
                entry.friendNumber = record.friendNumber;
                // A current friend's name supersedes older feed rows.
                if (record.displayName) {
                    entry.displayName = record.displayName;
                }
            }
        }
    }

    if (tableExists(table('_moderation'))) {
        for (const record of queryAll(
            `SELECT user_id, display_name, block, mute
             FROM ${table('_moderation')}`,
            [],
            (row) => ({
                userId: row.nonEmptyText('user_id'),
                displayName: row.nonEmptyText('display_name'),
                blocked: row.boolean('block'),
                muted: row.boolean('mute')
            })
        )) {
            const entry = upsert(entries, record.userId, record.displayName);
            if (entry) {
                entry.isBlocked = record.blocked;
                entry.isMuted = record.muted;
            }
        }
    }

    if (tableExists(table('_notes'))) {
        for (const record of queryAll(
            `SELECT user_id, display_name FROM ${table('_notes')}`,
            [],
            (row) => ({
                userId: row.nonEmptyText('user_id'),
                displayName: row.nonEmptyText('display_name')
            })
        )) {
            const entry = upsert(entries, record.userId, record.displayName);
            if (entry) {
                entry.hasNote = true;
            }
        }
    }

    if (tableExists('favorite_friend')) {
        for (const userId of queryAll(
            'SELECT user_id FROM favorite_friend',
            [],
            (row) => row.nonEmptyText('user_id')
        )) {
            const entry = upsert(entries, userId, null);
            if (entry) {
                entry.isFavorite = true;
            }
        }
    }

    if (tableExists(table('_friend_log_history'))) {
        for (const record of queryAll(
            `SELECT DISTINCT user_id, display_name
             FROM ${table('_friend_log_history')}
             WHERE user_id IS NOT NULL`,
            [],
            (row) => ({
                userId: row.nonEmptyText('user_id'),
                displayName: row.nonEmptyText('display_name')
            })
        )) {
            upsert(entries, record.userId, record.displayName);
        }
    }

    // Both feeds are indexed on (user_id, created_at), so MAX() per user is an
    // index scan rather than a full table sort.
    for (const suffix of ['_feed_gps', '_feed_online_offline'] as const) {
        if (!tableExists(table(suffix))) {
            continue;
        }
        for (const record of queryAll(
            `SELECT user_id, MAX(created_at) AS last_seen, COUNT(*) AS hits
             FROM ${table(suffix)}
             WHERE user_id IS NOT NULL
             GROUP BY user_id`,
            [],
            (row) => ({
                userId: row.nonEmptyText('user_id'),
                lastSeen: row.timestampOrNull('last_seen'),
                hits: row.numberOrNull('hits') ?? 0
            })
        )) {
            const entry = upsert(entries, record.userId, null);
            if (!entry) {
                continue;
            }
            if (
                record.lastSeen &&
                (!entry.lastSeen || record.lastSeen > entry.lastSeen)
            ) {
                entry.lastSeen = record.lastSeen;
            }
            if (suffix === '_feed_gps') {
                entry.sessionCount = record.hits;
            }
        }
    }

    // Fill in names for users only ever seen in the feed.
    const unnamed = [...entries.values()].filter((entry) => !entry.displayName);
    if (unnamed.length > 0 && tableExists(table('_feed_gps'))) {
        const nameById = new Map(
            queryAll(
                `SELECT user_id, display_name FROM ${table('_feed_gps')}
                 WHERE display_name IS NOT NULL AND display_name != ''
                 GROUP BY user_id`,
                [],
                (row) =>
                    [
                        row.nonEmptyText('user_id'),
                        row.nonEmptyText('display_name')
                    ] as const
            ).filter(
                (pair): pair is readonly [string, string] =>
                    pair[0] !== null && pair[1] !== null
            )
        );
        for (const entry of unnamed) {
            entry.displayName = nameById.get(entry.id) ?? entry.id;
        }
    }

    return [...entries.values()].map((player) => ({
        player,
        keys: [
            player.displayName.toLowerCase(),
            ...foldName(player.displayName),
            player.id.toLowerCase()
        ]
    }));
}

export function getDirectory(prefix: string): DirectoryEntry[] {
    if (cache && Date.now() - cache.builtAt < CACHE_TTL_MS) {
        return cache.entries;
    }
    const entries = build(prefix);
    cache = { entries, builtAt: Date.now() };
    return entries;
}

const MONTH_MS = 30 * 86_400_000;

/**
 * Ranks matches so the people you actually have a relationship with float to
 * the top, then breaks ties by recency. Moderation entries score too — a
 * blocked or muted user is still a user you know.
 */
function score(
    { player: entry, keys }: DirectoryEntry,
    queries: string[],
    now: number
): number {
    let value = 0;

    if (queries.length > 0) {
        // Best quality across every (query form, name form) pair. The raw name
        // is keys[0], so an unstyled match still outranks a folded one of the
        // same shape.
        let best = 0;
        for (const query of queries) {
            for (const [index, key] of keys.entries()) {
                if (!key.includes(query)) continue;
                const quality =
                    key === query ? 1000 : key.startsWith(query) ? 600 : 300;
                // Later keys are less direct evidence than the raw name.
                best = Math.max(best, quality - Math.min(index, 3) * 20);
            }
        }
        value += best;
    }

    if (entry.isFavorite) value += 260;
    if (entry.isFriend) value += 200;
    if (entry.isBlocked) value += 90;
    if (entry.isMuted) value += 80;
    if (entry.hasNote) value += 40;

    if (entry.lastSeen) {
        // Full recency credit within a month, decaying to zero across a year.
        const age = Math.max(now - entry.lastSeen, 0);
        value += 150 * Math.max(0, 1 - age / (12 * MONTH_MS));
        if (age < MONTH_MS) value += 60;
    }

    // Someone with hundreds of shared instances is a likelier target than a
    // one-off encounter, but this must not outweigh an explicit relationship.
    value += Math.min(Math.log10(entry.sessionCount + 1) * 25, 75);

    return value;
}

export function searchDirectory(
    entries: DirectoryEntry[],
    rawQuery: string,
    limit: number
): Player[] {
    const queries = rawQuery.trim() ? foldQuery(rawQuery) : [];
    const now = Date.now();

    const matches =
        queries.length > 0
            ? entries.filter((entry) =>
                  entry.keys.some((key) =>
                      queries.some((query) => key.includes(query))
                  )
              )
            : entries;

    return matches
        .map((entry) => ({ entry, rank: score(entry, queries, now) }))
        .sort(
            (a, b) =>
                b.rank - a.rank ||
                a.entry.player.displayName.localeCompare(
                    b.entry.player.displayName
                )
        )
        .slice(0, limit)
        .map(({ entry }) => entry.player);
}

/**
 * Current display name per user id. VRChat allows renames, and the feed tables
 * keep whatever name was current when each row was written — one user id here
 * legitimately spans several names. The friend list wins when present, since it
 * reflects the live name; otherwise the most recent sighting does.
 */
export function getDisplayNames(
    prefix: string,
    userIds: string[]
): Map<string, string> {
    const placeholders = userIds.map(() => '?').join(', ');
    const latest = new Map<string, { name: string; seenAt: string }>();

    for (const table of [`gamelog_join_leave`, `${prefix}_feed_gps`]) {
        if (!tableExists(table)) {
            continue;
        }
        for (const record of queryAll(
            `SELECT user_id, display_name, MAX(created_at) AS seen_at
             FROM ${table}
             WHERE user_id IN (${placeholders})
               AND display_name IS NOT NULL AND display_name != ''
             GROUP BY user_id`,
            userIds,
            (row) => ({
                userId: row.nonEmptyText('user_id'),
                name: row.nonEmptyText('display_name'),
                seenAt: row.textOrNull('seen_at') ?? ''
            })
        )) {
            if (!record.userId || !record.name) {
                continue;
            }
            const existing = latest.get(record.userId);
            if (!existing || existing.seenAt < record.seenAt) {
                latest.set(record.userId, {
                    name: record.name,
                    seenAt: record.seenAt
                });
            }
        }
    }

    const friendTable = `${prefix}_friend_log_current`;
    if (tableExists(friendTable)) {
        for (const record of queryAll(
            `SELECT user_id, display_name FROM ${friendTable}
             WHERE user_id IN (${placeholders})`,
            userIds,
            (row) => ({
                userId: row.nonEmptyText('user_id'),
                name: row.nonEmptyText('display_name')
            })
        )) {
            if (record.userId && record.name) {
                // Sorts above any real ISO timestamp.
                latest.set(record.userId, {
                    name: record.name,
                    seenAt: '9999'
                });
            }
        }
    }

    return new Map(
        [...latest].map(([userId, entry]) => [userId, entry.name])
    );
}

export function invalidateDirectory(): void {
    cache = null;
}
