import { Router } from 'express';

import { getDb, resolveDbPath } from './db.js';
import {
    getDirectory,
    getDisplayNames,
    searchDirectory
} from './directory.js';
import { parseLocation } from './location.js';
import { findSimultaneousWindows, summarizeParticipants } from './overlap.js';
import { readPresence } from './presence.js';
import { getOwnerPrefix } from './schema.js';

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

        // `ids` hydrates a deep link (/player-links?users=...) back into full
        // player records, so it bypasses ranking and preserves the given order.
        const ids = parseUserIds(req.query.ids);
        if (ids.length > 0) {
            const byId = new Map(entries.map((entry) => [entry.id, entry]));
            res.json(ids.map((id) => byId.get(id)).filter(Boolean));
            return;
        }

        res.json(
            searchDirectory(
                entries,
                String(req.query.q ?? ''),
                MAX_PLAYER_RESULTS
            )
        );
    })
);

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
        const buckets = await readPresence(db, prefix, targetIds);
        const names = await getDisplayNames(db, prefix, targetIds);

        const sessions = [];

        for (const bucket of buckets.values()) {
            // Every selected user must have been present — a "link" between
            // three people is not two of them meeting.
            if (bucket.byUser.size !== targetIds.length) {
                continue;
            }

            const info = parseLocation(bucket.location);

            for (const window of findSimultaneousWindows(
                bucket.byUser,
                targetIds
            )) {
                sessions.push({
                    location: bucket.location,
                    ...info,
                    worldName: bucket.worldName,
                    joinedAt: window.start,
                    leftAt: window.end,
                    durationMs: window.end - window.start,
                    participants: summarizeParticipants(window, names)
                });
            }
        }

        sessions.sort(
            (a, b) => b.durationMs - a.durationMs || b.leftAt - a.leftAt
        );
        res.json(sessions);
    })
);
