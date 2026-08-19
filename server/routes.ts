import { Router } from 'express';

import {
    REGISTRY_VALUE_TYPE,
    isDefinitionName,
    isRegistryValueType,
    type DatabaseStatus,
    type OverlappingSession,
    type Player
} from '../shared/api.ts';
import { resolveDbPath, isDbReadOnly, setDbReadOnly } from './db.ts';
import { getDirectory, getDisplayNames, searchDirectory } from './directory.ts';
import { parseLocation } from './location.ts';
import { findSimultaneousWindows, summarizeParticipants } from './overlap.ts';
import { readPresence } from './presence.ts';
import { readRosters } from './roster.ts';
import { isJsonObject, toErrorMessage } from '../shared/json.ts';
import { getOwnerPrefix } from './schema.ts';
import { performUnifiedSearch } from './search.ts';
import {
    getCurrentProtonRegistry,
    invalidateLiveRegistryCache,
    invalidateRegistryBackupCache,
    readRegistryBackupsFromDb,
    restoreRegistryBackup,
    validateRegistryWrite,
    wipeProtonRegistry,
    updateProtonRegistryKey
} from './registry.ts';
import { readVRChatConfig, saveVRChatConfig } from './config.ts';
import { readLaunchOptions, saveLaunchOptions, isSteamRunning, stopSteam, startSteam, saveCompatTool, launchTemporaryTestInstance } from './launcher.ts';
import { getUserTimeline } from './user.ts';

import {
    readSettings,
    writeSettings,
    resetSettings,
    getDiskCacheStatus,
    clearDiskCache,
    fetchDefinitionContent
} from './settings.ts';

/** Rendered into the 400 body so a bad client sees the accepted values. */
const DEFINITION_TYPE_HINT = Object.values(REGISTRY_VALUE_TYPE).join(', ');

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
    } catch (err: unknown) {
        res.status(500).json({ error: toErrorMessage(err, 'Failed to read settings') });
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
    } catch (err: unknown) {
        res.status(500).json({ error: toErrorMessage(err, 'Failed to write settings') });
    }
});

router.delete('/settings', (_req, res) => {
    try {
        const settings = resetSettings();
        res.json({ success: true, message: 'Settings reset to defaults', settings });
    } catch (err: unknown) {
        res.status(500).json({ error: toErrorMessage(err, 'Failed to reset settings') });
    }
});

router.post('/cache/clear', (_req, res) => {
    try {
        const success = clearDiskCache();
        res.json({ success });
    } catch (err: unknown) {
        res.status(500).json({ error: toErrorMessage(err, 'Failed to clear disk cache') });
    }
});

router.get('/definitions/:name', async (req, res) => {
    try {
        const name = req.params.name;
        const forceRefresh = req.query.refresh === 'true';
        if (!isDefinitionName(name)) {
            res.status(400).json({ error: 'Invalid definition name' });
            return;
        }
        const content = await fetchDefinitionContent(name, forceRefresh);
        if (name === 'configSchema') {
            res.type('json').send(content);
        } else {
            res.type('text/csv').send(content);
        }
    } catch (err: unknown) {
        console.error(`[API] Error fetching definition "${req.params.name}":`, err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to fetch definition') });
    }
});

router.post('/registry/reset', async (_req, res) => {
    try {
        console.log('[API] POST /api/registry/reset');
        const result = await wipeProtonRegistry();
        invalidateLiveRegistryCache();
        res.json(result);
    } catch (err: unknown) {
        console.error('[API] Error in POST /api/registry/reset:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to wipe registry') });
    }
});

router.post('/registry/update', async (req, res) => {
    try {
        // This writes into the user's real Wine prefix, so the body is
        // validated rather than trusted: a wrong value type would be written
        // back as the wrong kind of registry entry.
        const body: unknown = req.body;
        const { key, value, type, force: body_force } = isJsonObject(body) ? body : {};

        if (typeof key !== 'string' || key.length === 0) {
            res.status(400).json({ error: 'Missing key name' });
            return;
        }
        if (typeof value !== 'string' && typeof value !== 'number') {
            res.status(400).json({ error: 'Registry value must be a string or a number' });
            return;
        }
        const valueType = type === undefined ? REGISTRY_VALUE_TYPE.string : type;
        if (!isRegistryValueType(valueType)) {
            res.status(400).json({
                error: `Unsupported registry value type: ${String(type)} (expected one of ${DEFINITION_TYPE_HINT})`
            });
            return;
        }

        // Compare the write against the published definition for this key.
        // `force` lets a caller override deliberately; nothing is written that
        // contradicts a definition without the caller having said so.
        const force = body_force === true;
        const check = await validateRegistryWrite(key, value, valueType);
        for (const warning of check.warnings) {
            console.warn(`[API] registry/update "${key}": ${warning}`);
        }
        if (!check.ok && !force) {
            console.warn(`[API] Refused registry/update "${key}": ${check.errors.join(' ')}`);
            res.status(422).json({
                error: check.errors.join(' '),
                errors: check.errors,
                warnings: check.warnings,
                // Tells the client this is overridable rather than malformed.
                overridable: true
            });
            return;
        }
        if (!check.ok) {
            console.warn(`[API] Forced registry/update "${key}" despite: ${check.errors.join(' ')}`);
        }

        console.log(`[API] POST /api/registry/update key="${key}"`);
        const result = await updateProtonRegistryKey(key, value, valueType);
        invalidateLiveRegistryCache();
        res.json({ ...result, warnings: check.warnings });
    } catch (err: unknown) {
        console.error('[API] Error in POST /api/registry/update:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to update registry key') });
    }
});

router.get('/db/mode', (_req, res) => {
    try {
        res.json({ readOnly: isDbReadOnly() });
    } catch (err: unknown) {
        res.status(500).json({ error: toErrorMessage(err, 'Failed to check DB mode') });
    }
});

router.post('/db/mode', (req, res) => {
    try {
        const { readOnly } = req.body || {};
        const newMode = setDbReadOnly(Boolean(readOnly));
        // The remount opens a fresh connection; drop snapshots read off the old one.
        invalidateRegistryBackupCache();
        res.json({ readOnly: newMode });
    } catch (err: unknown) {
        res.status(500).json({ error: toErrorMessage(err, 'Failed to change DB mode') });
    }
});

router.get('/registry/backups', async (_req, res) => {
    try {
        console.log('[API] GET /api/registry/backups');
        const backups = readRegistryBackupsFromDb();
        const currentLive = await getCurrentProtonRegistry();
        const result = currentLive ? [currentLive, ...backups] : backups;
        res.json(result);
    } catch (err: unknown) {
        console.error('[API] Error in GET /api/registry/backups:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to read backups') });
    }
});

router.post('/registry/backups/:index/restore', async (req, res) => {
    try {
        const index = parseInt(req.params.index, 10);
        console.log(`[API] POST /api/registry/backups/${index}/restore`);
        const result = await restoreRegistryBackup(index);
        invalidateLiveRegistryCache();
        res.json(result);
    } catch (err: unknown) {
        console.error(`[API] Error in POST /api/registry/backups/${req.params.index}/restore:`, err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to restore backup') });
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
    } catch (err: unknown) {
        console.error('[API] Error in GET /api/config:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to read VRChat config') });
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
    } catch (err: unknown) {
        console.error('[API] Error in POST /api/config:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to save VRChat config') });
    }
});

router.get('/launcher', async (_req, res) => {
    try {
        console.log('[API] GET /api/launcher');
        const data = readLaunchOptions();
        const steamRunning = await isSteamRunning();
        res.json({ ...data, steamRunning });
    } catch (err: unknown) {
        console.error('[API] Error in GET /api/launcher:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to read launch options') });
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
    } catch (err: unknown) {
        console.error('[API] Error in POST /api/launcher:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to save launch options') });
    }
});

router.post('/launcher/steam/stop', async (_req, res) => {
    try {
        await stopSteam();
        res.json({ success: true, message: 'Steam process stopped.' });
    } catch (err: unknown) {
        res.status(500).json({ error: toErrorMessage(err, 'Failed to stop Steam') });
    }
});

router.post('/launcher/steam/start', async (_req, res) => {
    try {
        await startSteam();
        res.json({ success: true, message: 'Steam launched.' });
    } catch (err: unknown) {
        res.status(500).json({ error: toErrorMessage(err, 'Failed to start Steam') });
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
    } catch (err: unknown) {
        console.error('[API] Error in POST /api/launcher/compat-tool:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to save compat tool') });
    }
});

// ─── User Timeline ────────────────────────────────────────────────────────────

router.get('/user/timeline', (req, res) => {
    try {
        console.log('[API] GET /api/user/timeline');
        const rawIds = typeof req.query.ids === 'string' ? req.query.ids : '';
        const rawNames = typeof req.query.names === 'string' ? req.query.names : '';

        const userIds = rawIds.split(',').map((s) => s.trim()).filter(Boolean);
        const displayNames = rawNames.split(',').map((s) => s.trim()).filter(Boolean);

        if (userIds.length === 0 && displayNames.length === 0) {
            res.status(400).json({ error: 'Provide at least one user id (ids=) or display name (names=)' });
            return;
        }

        const rows = getUserTimeline(userIds, displayNames);
        res.json({ rows, total: rows.length, userIds, displayNames });
    } catch (err: unknown) {
        console.error('[API] Error in GET /api/user/timeline:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to query user timeline') });
    }
});

// ─── Local Report Store & Upload Proxy (HTML Report Sharing) ───────────────────

const localReportStore = new Map<string, { content: string; createdAt: number }>();

// Clean up local reports older than 24 hours
setInterval(() => {
    const now = Date.now();
    for (const [id, item] of localReportStore.entries()) {
        if (now - item.createdAt > 24 * 60 * 60 * 1000) {
            localReportStore.delete(id);
        }
    }
}, 60 * 60 * 1000);

router.get('/reports/:id', (req, res) => {
    const report = localReportStore.get(req.params.id);
    if (!report) {
        res.status(404).send('Report expired or not found.');
        return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(report.content);
});

interface UploadResult {
    /** Link that opens the report as a live, interactive page in any browser. */
    url: string;
    /** Optional second rendering front-end for the same file. */
    altUrl?: string;
    /** The stored file itself (usually served as text/plain — source, not a page). */
    rawUrl?: string;
    /** false = the link downloads / shows source instead of rendering. */
    renders: boolean;
}

/**
 * pastes.dev (bytebin) — no account, no API key, no token.
 *
 * bytebin stores the Content-Type it was posted with and returns the bytes as-is,
 * so posting `text/html` yields a URL that browsers render as a real page.
 * Verified in a browser: `document.contentType === 'text/html'`, no CSP, the
 * report's inline JavaScript runs and the filter box works. 9 MB uploads accepted.
 *
 * Retention is not documented — treat these links as temporary.
 */
async function uploadToBytebin(content: string): Promise<UploadResult> {
    const res = await fetch('https://api.pastes.dev/post', {
        method: 'POST',
        headers: { 'Content-Type': 'text/html', 'User-Agent': 'vrcx-extras' },
        body: content,
        signal: AbortSignal.timeout(30000)
    });

    if (!res.ok) {
        throw new Error(`pastes.dev returned HTTP ${res.status}`);
    }

    const { key } = (await res.json()) as { key?: string };
    if (!key) {
        throw new Error('pastes.dev response contained no key');
    }

    // api.pastes.dev/<key> serves the raw bytes with the stored content type;
    // pastes.dev/<key> is the syntax-highlighting viewer, not the live page.
    return { url: `https://api.pastes.dev/${key}`, rawUrl: `https://api.pastes.dev/${key}`, renders: true };
}

router.post('/upload', async (req, res) => {
    try {
        const { content, filename = 'report.html' } = req.body || {};
        if (typeof content !== 'string' || !content.trim()) {
            res.status(400).json({ error: 'Field "content" (HTML string) is required' });
            return;
        }

        // Always store locally first for instant, 100% full-screen rendering
        const reportId = Math.random().toString(36).substring(2, 10);
        localReportStore.set(reportId, { content, createdAt: Date.now() });

        const host = req.get('host') || '127.0.0.1:8990';
        const protocol = req.protocol || 'http';
        const localUrl = `${protocol}://${host}/api/reports/${reportId}`;

        console.log(`[API] POST /api/upload — filename: ${filename}, stored locally at: ${localUrl}`);

        // Only providers that need no login/token AND serve the file back as raw
        // renderable text/html are kept. Anything requiring auth (GitHub Gist) or
        // serving text/plain (Catbox, dpaste, 0x0.st) was removed deliberately —
        // those links show source or download instead of opening the live report.
        const providers = [{ name: 'pastes.dev', fn: () => uploadToBytebin(content) }];

        const errors: string[] = [];
        for (const p of providers) {
            try {
                console.log(`[API] Uploading via ${p.name}…`);
                const result = await p.fn();
                console.log(`[API] Upload successful via ${p.name}: ${result.url}`);
                res.json({ success: true, ...result, localUrl, provider: p.name });
                return;
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[API] Upload via ${p.name} failed: ${msg}. Trying fallback…`);
                errors.push(`${p.name}: ${msg}`);
            }
        }

        // If all remote services fail, return local server URL as guaranteed working fallback
        res.json({
            success: true,
            url: localUrl,
            localUrl,
            provider: 'local',
            renders: true,
            warning: `Remote upload failed (${errors.join('; ')}); serving via local server — this link only works on your own network.`
        });
    } catch (err: unknown) {
        console.error('[API] Error in POST /api/upload:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to upload report file') });
    }
});

// ─── Environment Testing & Single Benchmark Endpoints ─────────────────────────

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

router.post('/env-testing/run-single-test', async (req, res) => {
    try {
        const { tool = '', cmd = '', env = '', args = '', url = '' } = req.body || {};
        const vrcvtBin = '/run/media/system/Data/Projects/vrcvt/bin/vrcvt';

        const cliArgs = ['--single', '--json'];
        if (tool) cliArgs.push('--tool', tool);
        if (cmd) cliArgs.push('--cmd', cmd);
        else {
            if (env) cliArgs.push('--env', env);
            if (args) cliArgs.push('--args', args);
        }
        if (url) cliArgs.push('--url', url);

        const { stdout } = await execFileAsync(vrcvtBin, cliArgs, { timeout: 20000 });
        const result = JSON.parse(stdout.trim());
        res.json(result);
    } catch (err: unknown) {
        console.error('[API] Error in POST /api/env-testing/run-single-test:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to execute environment test') });
    }
});

router.post('/env-testing/launch-test-window', async (req, res) => {
    try {
        const { tool = '', cmd = '', env = '', args = '', worldId = 'wrld_a2fd9533-5c69-400b-a34e-ae0c11df99e1', restartSteam = true } = req.body || {};
        const fullCmd = cmd || `${env} %command% ${args}`.trim();
        const result = await launchTemporaryTestInstance(tool, fullCmd, worldId, Boolean(restartSteam));
        res.json(result);
    } catch (err: unknown) {
        console.error('[API] Error in POST /api/env-testing/launch-test-window:', err);
        res.status(500).json({ error: toErrorMessage(err, 'Failed to spawn VRChat test window') });
    }
});



