import { Router } from 'express';

import { getDb, queryAll, resolveDbPath } from './db.js';
import { getDirectory, searchDirectory } from './directory.js';
import { isInstanceLocation, parseLocation } from './location.js';
import { findSimultaneousWindows, summarizeParticipants } from './overlap.js';
import { getOwnerPrefix, tableExists } from './schema.js';

const MAX_PLAYER_RESULTS = 50;
const MAX_TARGET_USERS = 10;

function parseUserIds(raw) {
    return [
        ...new Set(
            String(raw ?? '')
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean)
        )
    ].slice(0, MAX_TARGET_USERS);
}

/** Wraps an async handler so rejections reach the error middleware. */
function asyncRoute(handler) {
    return (req, res, next) => handler(req, res).catch(next);
}

export const router = Router();

router.get(
    '/status',
    asyncRoute(async (_req, res) => {
        const db = await getDb();
        const prefix = await getOwnerPrefix(db);
        res.json({ connected: true, path: resolveDbPath(), prefix });
    })
);

router.get(
    '/players',
    asyncRoute(async (req, res) => {
        const db = await getDb();
        const prefix = await getOwnerPrefix(db);
        if (!prefix) {
            res.json([]);
            return;
        }

        const entries = await getDirectory(db, prefix);
        res.json(
            searchDirectory(
                entries,
                String(req.query.q ?? ''),
                MAX_PLAYER_RESULTS
            )
        );
    })
);

/**
 * Reads each target user's instance visits as [arrival, next arrival) windows.
 *
 * A GPS row records that the user *arrived* at `location` at `created_at`; the
 * row's `time` column is how long they spent at `previous_location`, so it must
 * not be used to date this row's stay. The user leaves when their next GPS row
 * fires — including rows for 'private'/'offline'/'traveling', which is why the
 * window function runs before any location filtering.
 */
async function readVisits(db, table, targetIds) {
    const placeholders = targetIds.map(() => '?').join(', ');
    const rows = await queryAll(
        db,
        `SELECT user_id, display_name, location, world_name,
                created_at AS joined_at,
                LEAD(created_at) OVER (
                    PARTITION BY user_id ORDER BY created_at
                ) AS left_at
         FROM ${table}
         WHERE user_id IN (${placeholders})`,
        targetIds
    );

    const now = Date.now();
    /** @type {Map<string, Map<string, object[]>>} location -> user -> visits */
    const byLocation = new Map();

    for (const row of rows) {
        if (!isInstanceLocation(row.location)) {
            continue;
        }

        const joinedAt = Date.parse(row.joined_at);
        // A null `left_at` is the user's most recent row: still there.
        const leftAt = row.left_at ? Date.parse(row.left_at) : now;
        if (!Number.isFinite(joinedAt) || !Number.isFinite(leftAt)) {
            continue;
        }

        let users = byLocation.get(row.location);
        if (!users) {
            users = new Map();
            byLocation.set(row.location, users);
        }

        const visits = users.get(row.user_id) ?? [];
        visits.push({
            userId: row.user_id,
            displayName: row.display_name || row.user_id,
            worldName: row.world_name || '',
            joinedAt,
            leftAt: Math.max(leftAt, joinedAt)
        });
        users.set(row.user_id, visits);
    }

    return byLocation;
}

router.get(
    '/find-links',
    asyncRoute(async (req, res) => {
        const targetIds = parseUserIds(req.query.user_ids);

        if (targetIds.length === 0) {
            res.json([]);
            return;
        }

        const db = await getDb();
        const prefix = await getOwnerPrefix(db);
        const table = `${prefix}_feed_gps`;
        if (!prefix || !(await tableExists(db, table))) {
            res.json([]);
            return;
        }

        const byLocation = await readVisits(db, table, targetIds);

        const sessions = [];

        for (const [location, visitsByUser] of byLocation) {
            // Every selected user must have been present — a "link" between
            // three people is not two of them meeting.
            if (visitsByUser.size !== targetIds.length) {
                continue;
            }

            const info = parseLocation(location);
            const worldName =
                visitsByUser.values().next().value?.[0]?.worldName ?? '';

            for (const window of findSimultaneousWindows(
                visitsByUser,
                targetIds
            )) {
                sessions.push({
                    location,
                    ...info,
                    worldName,
                    joinedAt: window.start,
                    leftAt: window.end,
                    durationMs: window.end - window.start,
                    participants: summarizeParticipants(window)
                });
            }
        }

        sessions.sort(
            (a, b) => b.durationMs - a.durationMs || b.leftAt - a.leftAt
        );
        res.json(sessions);
    })
);
