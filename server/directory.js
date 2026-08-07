import { queryAll } from './db.js';
import { tableExists } from './schema.js';

/**
 * The directory is rebuilt from ~500k feed rows, so it is cached rather than
 * recomputed per keystroke. VRCX keeps writing to the database while this app
 * runs, hence a short TTL instead of a one-shot load.
 */
const CACHE_TTL_MS = 15_000;

let cache = null;
let inflight = null;

function blankEntry(id) {
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

function upsert(entries, userId, displayName) {
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

function toTimestamp(value) {
    const ms = Date.parse(value ?? '');
    return Number.isFinite(ms) ? ms : null;
}

async function build(db, prefix) {
    const entries = new Map();
    const table = (suffix) => `${prefix}${suffix}`;

    // Current friends carry the most authoritative display names.
    if (await tableExists(db, table('_friend_log_current'))) {
        for (const row of await queryAll(
            db,
            `SELECT user_id, display_name, trust_level, friend_number
             FROM ${table('_friend_log_current')}`
        )) {
            const entry = upsert(entries, row.user_id, row.display_name);
            if (entry) {
                entry.isFriend = true;
                entry.trustLevel = row.trust_level || null;
                entry.friendNumber = row.friend_number ?? null;
                // A current friend's name supersedes older feed rows.
                if (row.display_name) {
                    entry.displayName = row.display_name;
                }
            }
        }
    }

    if (await tableExists(db, table('_moderation'))) {
        for (const row of await queryAll(
            db,
            `SELECT user_id, display_name, block, mute
             FROM ${table('_moderation')}`
        )) {
            const entry = upsert(entries, row.user_id, row.display_name);
            if (entry) {
                entry.isBlocked = Boolean(row.block);
                entry.isMuted = Boolean(row.mute);
            }
        }
    }

    if (await tableExists(db, table('_notes'))) {
        for (const row of await queryAll(
            db,
            `SELECT user_id, display_name FROM ${table('_notes')}`
        )) {
            const entry = upsert(entries, row.user_id, row.display_name);
            if (entry) {
                entry.hasNote = true;
            }
        }
    }

    if (await tableExists(db, 'favorite_friend')) {
        for (const row of await queryAll(
            db,
            'SELECT user_id FROM favorite_friend'
        )) {
            const entry = upsert(entries, row.user_id, '');
            if (entry) {
                entry.isFavorite = true;
            }
        }
    }

    if (await tableExists(db, table('_friend_log_history'))) {
        for (const row of await queryAll(
            db,
            `SELECT DISTINCT user_id, display_name
             FROM ${table('_friend_log_history')}
             WHERE user_id IS NOT NULL`
        )) {
            upsert(entries, row.user_id, row.display_name);
        }
    }

    // Both feeds are indexed on (user_id, created_at), so MAX() per user is an
    // index scan rather than a full table sort.
    for (const suffix of ['_feed_gps', '_feed_online_offline']) {
        if (!(await tableExists(db, table(suffix)))) {
            continue;
        }
        for (const row of await queryAll(
            db,
            `SELECT user_id, MAX(created_at) AS last_seen, COUNT(*) AS hits
             FROM ${table(suffix)}
             WHERE user_id IS NOT NULL
             GROUP BY user_id`
        )) {
            const entry = upsert(entries, row.user_id, '');
            if (!entry) {
                continue;
            }
            const lastSeen = toTimestamp(row.last_seen);
            if (lastSeen && (!entry.lastSeen || lastSeen > entry.lastSeen)) {
                entry.lastSeen = lastSeen;
            }
            if (suffix === '_feed_gps') {
                entry.sessionCount = row.hits ?? 0;
            }
        }
    }

    // Fill in names for users only ever seen in the feed.
    const unnamed = [...entries.values()].filter((entry) => !entry.displayName);
    if (unnamed.length > 0 && (await tableExists(db, table('_feed_gps')))) {
        const names = await queryAll(
            db,
            `SELECT user_id, display_name FROM ${table('_feed_gps')}
             WHERE display_name IS NOT NULL AND display_name != ''
             GROUP BY user_id`
        );
        const nameById = new Map(
            names.map((row) => [row.user_id, row.display_name])
        );
        for (const entry of unnamed) {
            entry.displayName = nameById.get(entry.id) || entry.id;
        }
    }

    return [...entries.values()];
}

export async function getDirectory(db, prefix) {
    if (cache && Date.now() - cache.builtAt < CACHE_TTL_MS) {
        return cache.entries;
    }
    // Collapse concurrent rebuilds (a fast typist outruns the query).
    inflight ??= build(db, prefix)
        .then((entries) => {
            cache = { entries, builtAt: Date.now() };
            return entries;
        })
        .finally(() => {
            inflight = null;
        });
    return inflight;
}

const MONTH_MS = 30 * 86_400_000;

/**
 * Ranks matches so the people you actually have a relationship with float to
 * the top, then breaks ties by recency. Moderation entries score too — a
 * blocked or muted user is still a user you know.
 */
function score(entry, query, now) {
    const name = entry.displayName.toLowerCase();
    let value = 0;

    if (query) {
        if (name === query) value += 1000;
        else if (name.startsWith(query)) value += 600;
        else if (name.includes(query)) value += 300;
        else value += 50; // matched on user id
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

export function searchDirectory(entries, rawQuery, limit) {
    const query = rawQuery.trim().toLowerCase();
    const now = Date.now();

    const matches = query
        ? entries.filter(
              (entry) =>
                  entry.displayName.toLowerCase().includes(query) ||
                  entry.id.toLowerCase().includes(query)
          )
        : entries;

    return matches
        .map((entry) => ({ entry, rank: score(entry, query, now) }))
        .sort(
            (a, b) =>
                b.rank - a.rank ||
                a.entry.displayName.localeCompare(b.entry.displayName)
        )
        .slice(0, limit)
        .map(({ entry }) => entry);
}

/**
 * Current display name per user id. VRChat allows renames, and the feed tables
 * keep whatever name was current when each row was written — one user id here
 * legitimately spans several names. The friend list wins when present, since it
 * reflects the live name; otherwise the most recent sighting does.
 */
export async function getDisplayNames(db, prefix, userIds) {
    const placeholders = userIds.map(() => '?').join(', ');
    const names = new Map();

    const sources = [
        ['gamelog_join_leave', 'created_at'],
        [`${prefix}_feed_gps`, 'created_at']
    ];

    for (const [table, orderColumn] of sources) {
        if (!(await tableExists(db, table))) {
            continue;
        }
        for (const row of await queryAll(
            db,
            `SELECT user_id, display_name, MAX(${orderColumn}) AS seen_at
             FROM ${table}
             WHERE user_id IN (${placeholders})
               AND display_name IS NOT NULL AND display_name != ''
             GROUP BY user_id`,
            userIds
        )) {
            const existing = names.get(row.user_id);
            if (!existing || existing.seenAt < row.seen_at) {
                names.set(row.user_id, {
                    name: row.display_name,
                    seenAt: row.seen_at
                });
            }
        }
    }

    const friendTable = `${prefix}_friend_log_current`;
    if (await tableExists(db, friendTable)) {
        for (const row of await queryAll(
            db,
            `SELECT user_id, display_name FROM ${friendTable}
             WHERE user_id IN (${placeholders})`,
            userIds
        )) {
            if (row.display_name) {
                names.set(row.user_id, {
                    name: row.display_name,
                    seenAt: '9999'
                });
            }
        }
    }

    return new Map(
        [...names].map(([userId, entry]) => [userId, entry.name])
    );
}

export function invalidateDirectory() {
    cache = null;
}
