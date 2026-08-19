import { isJsonObject } from '@/types';
import {
    parseCmdLineDefinitions,
    parseRegistryDefinitions,
    type RegistryDefinitionIndex
} from '../../shared/definitions.ts';
import type { CmdLineDefinition, DatabaseStatus, RegistryValueType, EntityDetailsResponse, JsonObject, OverlappingSession, Player, UnifiedSearchResults, UserTimelineResponse } from '@/types';

export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

async function request<T>(
    path: string,
    params: Record<string, string | number>,
    signal?: AbortSignal
): Promise<T> {
    const query = new URLSearchParams(
        Object.entries(params).map(([key, value]) => [key, String(value)])
    );
    const response = await fetch(`/api/${path}?${query}`, { signal });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const message =
            payload && typeof payload.error === 'string'
                ? payload.error
                : `Request failed with status ${response.status}`;
        throw new ApiError(message, response.status);
    }

    return payload as T;
}

export function fetchDatabaseStatus(signal?: AbortSignal) {
    return request<DatabaseStatus>('status', {}, signal);
}

export function searchPlayers(query: string, signal?: AbortSignal) {
    return request<Player[]>('players', { q: query }, signal);
}

/** Hydrates user ids from a deep link into full player records. */
export function resolvePlayers(ids: string[], signal?: AbortSignal) {
    return request<Player[]>('players', { ids: ids.join(',') }, signal);
}

export function fetchEntityDetails(id: string, signal?: AbortSignal) {
    return request<EntityDetailsResponse>('entity-details', { id }, signal);
}


export function unifiedSearch(query: string, signal?: AbortSignal) {
    return request<UnifiedSearchResults>('search', { q: query }, signal);
}


export function findLinks(userIds: string[], signal?: AbortSignal) {
    return request<OverlappingSession[]>(
        'find-links',
        { user_ids: userIds.join(',') },
        signal
    );
}

export function fetchRegistryBackups(signal?: AbortSignal) {
    return request<import('@/types').RegistryBackupSnapshot[]>('registry/backups', {}, signal);
}

export async function fetchDbMode(): Promise<{ readOnly: boolean }> {
    const response = await fetch('/api/db/mode');
    if (!response.ok) throw new ApiError('Failed to fetch DB mode', response.status);
    return response.json();
}

export async function toggleDbMode(readOnly: boolean): Promise<{ readOnly: boolean }> {
    const response = await fetch('/api/db/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readOnly })
    });
    if (!response.ok) throw new ApiError('Failed to toggle DB mode', response.status);
    return response.json();
}

export async function resetRegistry(): Promise<{ success: boolean; message: string }> {
    const response = await fetch('/api/registry/reset', {
        method: 'POST'
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(payload?.error || 'Failed to reset VRChat registry', response.status);
    }
    return response.json();
}

export async function restoreRegistryBackup(index: number): Promise<{
    success: boolean;
    message: string;
    verifiedCount: number;
    missingKeys: string[];
    extraKeys: string[];
}> {
    const response = await fetch(`/api/registry/backups/${index}/restore`, {
        method: 'POST'
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(payload?.error || 'Failed to restore backup', response.status);
    }
    return response.json();
}

/** Raised when a write contradicts the key's definition; retryable with force. */
export class RegistryValidationError extends ApiError {
    constructor(
        message: string,
        readonly errors: string[],
        readonly warnings: string[]
    ) {
        super(message, 422);
        this.name = 'RegistryValidationError';
    }
}

export async function updateRegistryKey(
    key: string,
    value: string,
    type?: RegistryValueType,
    force = false
): Promise<{ success: boolean; message: string; warnings?: string[] }> {
    const response = await fetch('/api/registry/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, type, force })
    });
    if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const detail = isJsonObject(payload) ? payload : {};
        const message = typeof detail['error'] === 'string' ? detail['error'] : 'Failed to update registry key';
        // 422 means the value contradicts the definition rather than being
        // malformed, so the caller can offer to write it anyway.
        if (response.status === 422 && detail['overridable'] === true) {
            throw new RegistryValidationError(
                message,
                toStringArray(detail['errors']),
                toStringArray(detail['warnings'])
            );
        }
        throw new ApiError(message, response.status);
    }
    return response.json();
}

function toStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function fetchVRChatConfig(signal?: AbortSignal): Promise<import('@/types').VRChatConfigResponse> {
    return request<import('@/types').VRChatConfigResponse>('config', {}, signal);
}

export async function saveVRChatConfig(
    configOrRawText: string | JsonObject
): Promise<{ success: boolean; message: string }> {
    let configObj: JsonObject;
    if (typeof configOrRawText === 'string') {
        const parsed: unknown = JSON.parse(configOrRawText);
        if (!isJsonObject(parsed)) {
            throw new ApiError('Config must be a JSON object', 400);
        }
        configObj = parsed;
    } else {
        configObj = configOrRawText;
    }

    const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configObj })
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(payload?.error || 'Failed to save VRChat config', response.status);
    }
    return response.json();
}

export function fetchLaunchOptions(signal?: AbortSignal) {
    return request<import('@/types').LaunchOptionsResponse>('launcher', {}, signal);
}

export async function saveLaunchOptionsApi(
    launchOptions: string,
    stopSteamFirst: boolean,
    restartSteamAfter: boolean
): Promise<{ success: boolean; message: string; filePath: string }> {
    const response = await fetch('/api/launcher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ launchOptions, stopSteamFirst, restartSteamAfter })
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(payload?.error || 'Failed to save launch options', response.status);
    }
    return response.json();
}

export async function stopSteamApi(): Promise<{ success: boolean; message: string }> {
    const response = await fetch('/api/launcher/steam/stop', { method: 'POST' });
    return response.json();
}

export async function startSteamApi(): Promise<{ success: boolean; message: string }> {
    const response = await fetch('/api/launcher/steam/start', { method: 'POST' });
    return response.json();
}

export async function saveCompatToolApi(
    toolName: string,
    stopSteamFirst: boolean,
    restartSteamAfter: boolean
): Promise<{ success: boolean; message: string }> {
    const response = await fetch('/api/launcher/compat-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName, stopSteamFirst, restartSteamAfter })
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(payload?.error || 'Failed to save compat tool', response.status);
    }
    return response.json();
}

/** AbortError is a cancellation, not a failure worth showing the user. */
export function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError';
}

export function toErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export interface DefinitionUrls {
    cmdline: string;
    env: string;
    registry: string;
    configSchema: string;
}

export const DEFAULT_DEFINITION_URLS: DefinitionUrls = {
    cmdline: 'https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/cmdline.csv',
    env: 'https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/env.csv',
    registry: 'https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/registry.csv',
    configSchema: 'https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/config.schema.json'
};

const SETTINGS_URLS_KEY = 'vrcx_definition_urls';

export function getDefinitionUrls(): DefinitionUrls {
    try {
        const stored = localStorage.getItem(SETTINGS_URLS_KEY);
        if (stored) return { ...DEFAULT_DEFINITION_URLS, ...JSON.parse(stored) };
    } catch {}
    return DEFAULT_DEFINITION_URLS;
}

export function saveDefinitionUrls(urls: DefinitionUrls) {
    try {
        localStorage.setItem(SETTINGS_URLS_KEY, JSON.stringify(urls));
    } catch {}
}

export function clearDefinitionCache() {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('vrcx_cache_')) {
            keysToRemove.push(k);
        }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
}

export function getCacheStatus(): { count: number; oldestAgeMinutes: number | null } {
    let count = 0;
    let oldestTimestamp: number | null = null;

    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('vrcx_cache_')) {
            count++;
            try {
                const item = JSON.parse(localStorage.getItem(k) || '{}');
                if (item.timestamp && (oldestTimestamp === null || item.timestamp < oldestTimestamp)) {
                    oldestTimestamp = item.timestamp;
                }
            } catch {}
        }
    }

    const oldestAgeMinutes = oldestTimestamp ? Math.floor((Date.now() - oldestTimestamp) / 60000) : null;
    return { count, oldestAgeMinutes };
}



export async function fetchServerSettings(): Promise<import('@/types').SettingsResponse> {
    const response = await fetch('/api/settings');
    if (!response.ok) throw new ApiError('Failed to fetch settings', response.status);
    return response.json();
}

export async function saveServerSettings(settings: import('@/types').AppSettings): Promise<import('@/types').SettingsSaveResponse> {
    const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
    });
    if (!response.ok) throw new ApiError('Failed to save settings', response.status);
    return response.json();
}

export async function resetServerSettings(): Promise<import('@/types').SettingsResetResponse> {
    const response = await fetch('/api/settings', { method: 'DELETE' });
    if (!response.ok) throw new ApiError('Failed to reset settings', response.status);
    return response.json();
}

export async function clearServerDiskCache(): Promise<{ success: boolean }> {
    const response = await fetch('/api/cache/clear', { method: 'POST' });
    if (!response.ok) throw new ApiError('Failed to clear disk cache', response.status);
    return response.json();
}

export async function fetchRegistryDefinitions(forceRefresh = false): Promise<RegistryDefinitionIndex> {
    try {
        const url = `/api/definitions/registry${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        if (!response.ok) return { exact: {}, templated: [] };
        return parseRegistryDefinitions(await response.text());
    } catch {
        return { exact: {}, templated: [] };
    }
}

export async function fetchConfigSchema(forceRefresh = false): Promise<import('@/types').ConfigSchema> {
    try {
        const url = `/api/definitions/configSchema${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        if (!response.ok) return {};
        return await response.json();
    } catch {
        return {};
    }
}

export async function fetchCmdLineDefinitions(forceRefresh = false): Promise<Record<string, CmdLineDefinition>> {
    try {
        const url = `/api/definitions/cmdline${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        if (!response.ok) return {};
        return parseCmdLineDefinitions(await response.text());
    } catch {
        return {};
    }
}

export async function fetchEnvDefinitions(forceRefresh = false): Promise<Record<string, CmdLineDefinition>> {
    try {
        const url = `/api/definitions/env${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        if (!response.ok) return {};
        return parseCmdLineDefinitions(await response.text());
    } catch {
        return {};
    }
}

/** Prefetch all definitions and server configs in parallel on app startup. */
export async function prefetchAllDefinitionsAndConfig() {
    await Promise.allSettled([
        fetchCmdLineDefinitions(),
        fetchEnvDefinitions(),
        fetchRegistryDefinitions(),
        fetchConfigSchema(),
        fetchLaunchOptions(),
        fetchVRChatConfig()
    ]);
}
export function fetchUserTimeline(
    userIds: string[],
    displayNames: string[],
    signal?: AbortSignal
) {
    const params: Record<string, string> = {};
    if (userIds.length > 0) params.ids = userIds.join(',');
    if (displayNames.length > 0) params.names = displayNames.join(',');
    return request<UserTimelineResponse>('user/timeline', params, signal);
}

export async function runSingleEnvTestApi(
    tool: string,
    env: string,
    args: string,
    url: string
): Promise<import('@/types').EnvTestingRunResult> {
    const response = await fetch('/api/env-testing/run-single-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, env, args, url })
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(payload?.error || 'Failed to execute single environment test', response.status);
    }
    return response.json();
}

export async function launchEnvTestWindowApi(
    tool: string,
    env: string,
    args: string,
    worldId: string
): Promise<import('@/types').EnvTestingLaunchResponse> {
    const response = await fetch('/api/env-testing/launch-test-window', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, env, args, worldId })
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(payload?.error || 'Failed to spawn VRChat test window', response.status);
    }
    return response.json();
}
