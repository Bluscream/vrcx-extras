import { Router } from 'express';

import type {
    DatabaseStatus,
    OverlappingSession,
    Player
} from '../shared/api.ts';
import { resolveDbPath } from './db.ts';
import { getDirectory, getDisplayNames, searchDirectory } from './directory.ts';
import { parseLocation } from './location.ts';
import { findSimultaneousWindows, summarizeParticipants } from './overlap.ts';
import { readPresence } from './presence.ts';
import { readRosters } from './roster.ts';
import { getOwnerPrefix } from './schema.ts';
import { performUnifiedSearch } from './search.ts';

const MAX_PLAYER_RESULTS = 50;
const MAX_TARGET_USERS = 10;

function parseUserIds(raw: unknown): string[] {
    return [
        ...new Set(
            String(raw ?? '')
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean)
        )
    ].slice(0, MAX_TARGET_USERS);
}

export const router = Router();

// node:sqlite is synchronous, so handlers are too. Express already funnels a
// synchronous throw into the error middleware, so no async wrapper is needed.

router.get('/status', (_req, res) => {
    const status: DatabaseStatus = {
        connected: true,
        path: resolveDbPath(),
        prefix: getOwnerPrefix()
    };
    res.json(status);
});

router.get('/players', (req, res) => {
    const prefix = getOwnerPrefix();
    if (!prefix) {
        res.json([] satisfies Player[]);
        return;
    }

    const entries = getDirectory(prefix);

    // `ids` hydrates a deep link (/player-links?users=...) back into full
    // player records, so it bypasses ranking and preserves the given order.
    const ids = parseUserIds(req.query.ids);
    if (ids.length > 0) {
        const byId = new Map(
            entries.map((entry) => [entry.player.id, entry.player])
        );
        const resolved = ids
            .map((id) => byId.get(id))
            .filter((entry): entry is Player => entry !== undefined);
        res.json(resolved);
        return;
    }

    res.json(
        searchDirectory(entries, String(req.query.q ?? ''), MAX_PLAYER_RESULTS)
    );
});

import { getEntityDetails } from './entities.ts';

router.get('/entity-details', (req, res) => {
    const id = String(req.query.id ?? '').trim();
    if (!id) {
        res.status(400).json({ error: 'Missing id parameter' });
        return;
    }

    const prefix = getOwnerPrefix();
    const details = getEntityDetails(prefix, id);
    if (!details) {
        res.status(404).json({ error: 'Entity not found' });
        return;
    }

    res.json(details);
});


router.get('/search', (req, res) => {
    const prefix = getOwnerPrefix();
    const query = String(req.query.q ?? '');
    res.json(performUnifiedSearch(prefix, query));
});



router.get('/find-links', (req, res) => {
    const targetIds = parseUserIds(req.query.user_ids);
    if (targetIds.length === 0) {
        res.json([] satisfies OverlappingSession[]);
        return;
    }

    const prefix = getOwnerPrefix();
    const buckets = readPresence(prefix, targetIds);
    const names = getDisplayNames(prefix, targetIds);

    // Every selected user must have been present — a "link" between three
    // people is not two of them meeting. Filtering first also means only
    // instances that can produce a session get a roster lookup.
    const matched = [...buckets.values()].filter(
        (bucket) => bucket.byUser.size === targetIds.length
    );
    const rosters = readRosters(matched.map((bucket) => bucket.key));

    const sessions: OverlappingSession[] = [];

    for (const bucket of matched) {
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
                participants: summarizeParticipants(window, names),
                roster: rosters.get(bucket.key) ?? null
            });
        }
    }

    sessions.sort(
        (a, b) => b.durationMs - a.durationMs || b.leftAt - a.leftAt
    );
    res.json(sessions);
});
