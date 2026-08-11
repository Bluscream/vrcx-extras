import { Router } from 'express';

import type {
    DatabaseStatus,
    OverlappingSession,
    Player
} from '../shared/api.ts';
import { resolveDbPath, isDbReadOnly, setDbReadOnly } from './db.ts';
import { getDirectory, getDisplayNames, searchDirectory } from './directory.ts';
import { parseLocation } from './location.ts';
import { findSimultaneousWindows, summarizeParticipants } from './overlap.ts';
import { readPresence } from './presence.ts';
import { readRosters } from './roster.ts';
import { getOwnerPrefix } from './schema.ts';
import { performUnifiedSearch } from './search.ts';
import {
    readRegistryBackupsFromDb,
    readCurrentProtonRegistry,
    restoreRegistryBackup,
    wipeProtonRegistry,
    updateProtonRegistryKey
} from './registry.ts';
import { readVRChatConfig, saveVRChatConfig } from './config.ts';
import { readLaunchOptions, saveLaunchOptions, isSteamRunning, stopSteam, startSteam, saveCompatTool } from './launcher.ts';

import {
    readSettings,
    writeSettings,
    resetSettings,
    getDiskCacheStatus,
    clearDiskCache,
    fetchDefinitionContent
} from './settings.ts';

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

import { openApiSpec } from './openapi.ts';

export const router = Router();

router.get('/openapi.json', (_req, res) => {
    res.json(openApiSpec);
});

router.get('/settings', (_req, res) => {
    try {
        const settings = readSettings();
        const diskCache = getDiskCacheStatus();
        res.json({ settings, diskCache });
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to read settings' });
    }
});

router.post('/settings', (req, res) => {
    try {
        const newSettings = req.body;
        if (!newSettings || typeof newSettings !== 'object') {
            res.status(400).json({ error: 'Invalid settings body' });
            return;
        }
        const success = writeSettings(newSettings);
        res.json({ success, settings: readSettings() });
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to write settings' });
    }
});

router.delete('/settings', (_req, res) => {
    try {
        const settings = resetSettings();
        res.json({ success: true, message: 'Settings reset to defaults', settings });
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to reset settings' });
    }
});

router.post('/cache/clear', (_req, res) => {
    try {
        const success = clearDiskCache();
        res.json({ success });
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to clear disk cache' });
    }
});

router.get('/definitions/:name', async (req, res) => {
    try {
        const name = req.params.name as any;
        const forceRefresh = req.query.refresh === 'true';
        if (!['cmdline', 'env', 'registry', 'configSchema'].includes(name)) {
            res.status(400).json({ error: 'Invalid definition name' });
            return;
        }
        const content = await fetchDefinitionContent(name, forceRefresh);
        if (name === 'configSchema') {
            res.type('json').send(content);
        } else {
            res.type('text/csv').send(content);
        }
    } catch (err: any) {
        console.error(`[API] Error fetching definition "${req.params.name}":`, err);
        res.status(500).json({ error: err?.message || 'Failed to fetch definition' });
    }
});

router.post('/registry/reset', async (_req, res) => {
    try {
        console.log('[API] POST /api/registry/reset');
        const result = await wipeProtonRegistry();
        res.json(result);
    } catch (err: any) {
        console.error('[API] Error in POST /api/registry/reset:', err);
        res.status(500).json({ error: err?.message || 'Failed to wipe registry' });
    }
});

router.post('/registry/update', async (req, res) => {
    try {
        const { key, value, type } = req.body || {};
        if (!key) {
            res.status(400).json({ error: 'Missing key name' });
            return;
        }
        console.log(`[API] POST /api/registry/update key="${key}"`);
        const result = await updateProtonRegistryKey(key, value, type ?? 1);
        res.json(result);
    } catch (err: any) {
        console.error('[API] Error in POST /api/registry/update:', err);
        res.status(500).json({ error: err?.message || 'Failed to update registry key' });
    }
});

router.get('/db/mode', (_req, res) => {
    try {
        res.json({ readOnly: isDbReadOnly() });
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to check DB mode' });
    }
});

router.post('/db/mode', (req, res) => {
    try {
        const { readOnly } = req.body || {};
        const newMode = setDbReadOnly(Boolean(readOnly));
        res.json({ readOnly: newMode });
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to change DB mode' });
    }
});

router.get('/registry/backups', async (_req, res) => {
    try {
        console.log('[API] GET /api/registry/backups');
        const backups = readRegistryBackupsFromDb();
        const currentLive = await readCurrentProtonRegistry();
        const result = currentLive ? [currentLive, ...backups] : backups;
        res.json(result);
    } catch (err: any) {
        console.error('[API] Error in GET /api/registry/backups:', err);
        res.status(500).json({ error: err?.message || 'Failed to read backups' });
    }
});

router.post('/registry/backups/:index/restore', async (req, res) => {
    try {
        const index = parseInt(req.params.index, 10);
        console.log(`[API] POST /api/registry/backups/${index}/restore`);
        const result = await restoreRegistryBackup(index);
        res.json(result);
    } catch (err: any) {
        console.error(`[API] Error in POST /api/registry/backups/${req.params.index}/restore:`, err);
        res.status(500).json({ error: err?.message || 'Failed to restore backup' });
    }
});

// node:sqlite is synchronous, so handlers are too. Express already funnels a
// synchronous throw into the error middleware, so no async wrapper is needed.

router.get('/status', (_req, res) => {
    const status: DatabaseStatus = {
        connected: true,
        path: resolveDbPath(),
        prefix: getOwnerPrefix(),
        readOnly: isDbReadOnly()
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

router.get('/config', (_req, res) => {
    try {
        console.log('[API] GET /api/config');
        const data = readVRChatConfig();
        res.json(data);
    } catch (err: any) {
        console.error('[API] Error in GET /api/config:', err);
        res.status(500).json({ error: err?.message || 'Failed to read VRChat config' });
    }
});

router.post('/config', (req, res) => {
    try {
        console.log('[API] POST /api/config');
        let configObj = req.body?.config;
        if (!configObj && typeof req.body?.rawText === 'string') {
            try {
                configObj = JSON.parse(req.body.rawText);
            } catch (pErr) {
                res.status(400).json({ error: 'Invalid rawText JSON syntax' });
                return;
            }
        }
        if (!configObj || typeof configObj !== 'object') {
            res.status(400).json({ error: 'Invalid config payload — must be JSON object or valid rawText string' });
            return;
        }
        const result = saveVRChatConfig(configObj);
        res.json(result);
    } catch (err: any) {
        console.error('[API] Error in POST /api/config:', err);
        res.status(500).json({ error: err?.message || 'Failed to save VRChat config' });
    }
});

router.get('/launcher', async (_req, res) => {
    try {
        console.log('[API] GET /api/launcher');
        const data = readLaunchOptions();
        const steamRunning = await isSteamRunning();
        res.json({ ...data, steamRunning });
    } catch (err: any) {
        console.error('[API] Error in GET /api/launcher:', err);
        res.status(500).json({ error: err?.message || 'Failed to read launch options' });
    }
});

router.post('/launcher', async (req, res) => {
    try {
        console.log('[API] POST /api/launcher');
        const { launchOptions, stopSteamFirst, restartSteamAfter } = req.body || {};

        let steamWasRunning = await isSteamRunning();

        if (stopSteamFirst && steamWasRunning) {
            console.log('[API] Gracefully shutting down Steam before saving localconfig.vdf...');
            await stopSteam();
            await new Promise((resolve) => setTimeout(resolve, 2500));
        }

        const result = saveLaunchOptions(String(launchOptions ?? ''));

        if (restartSteamAfter) {
            console.log('[API] Restarting Steam...');
            await startSteam();
        }

        res.json(result);
    } catch (err: any) {
        console.error('[API] Error in POST /api/launcher:', err);
        res.status(500).json({ error: err?.message || 'Failed to save launch options' });
    }
});

router.post('/launcher/steam/stop', async (_req, res) => {
    try {
        await stopSteam();
        res.json({ success: true, message: 'Steam process stopped.' });
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to stop Steam' });
    }
});

router.post('/launcher/steam/start', async (_req, res) => {
    try {
        await startSteam();
        res.json({ success: true, message: 'Steam launched.' });
    } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to start Steam' });
    }
});

router.post('/launcher/compat-tool', async (req, res) => {
    try {
        const { toolName, stopSteamFirst, restartSteamAfter } = req.body || {};
        console.log(`[API] POST /api/launcher/compat-tool toolName="${toolName}"`);
        if (typeof toolName !== 'string') {
            res.status(400).json({ error: 'Missing or invalid toolName' });
            return;
        }

        if (stopSteamFirst && await isSteamRunning()) {
            console.log('[API] Stopping Steam before saving compat tool...');
            await stopSteam();
            await new Promise((resolve) => setTimeout(resolve, 2500));
        }

        const result = saveCompatTool(toolName);

        if (restartSteamAfter) {
            console.log('[API] Restarting Steam after compat tool save...');
            await startSteam();
        }

        res.json(result);
    } catch (err: any) {
        console.error('[API] Error in POST /api/launcher/compat-tool:', err);
        res.status(500).json({ error: err?.message || 'Failed to save compat tool' });
    }
});
