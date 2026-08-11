import type { DatabaseStatus, EntityDetailsResponse, OverlappingSession, Player, UnifiedSearchResults } from '@/types';

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

export async function updateRegistryKey(key: string, value: string, type?: string | number): Promise<{ success: boolean; message: string }> {
    const response = await fetch('/api/registry/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, type })
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(payload?.error || 'Failed to update registry key', response.status);
    }
    return response.json();
}

export async function fetchVRChatConfig(signal?: AbortSignal): Promise<import('@/types').VRChatConfigResponse> {
    return request<import('@/types').VRChatConfigResponse>('config', {}, signal);
}

export async function saveVRChatConfig(rawTextOrObj: string | Record<string, any>): Promise<{ success: boolean; message: string }> {
    const rawText = typeof rawTextOrObj === 'string' ? rawTextOrObj : JSON.stringify(rawTextOrObj, null, 2);
    const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText })
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

export async function fetchRegistryDefinitions(): Promise<Record<string, import('@/types').RegistryDefinition>> {
    try {
        const response = await fetch('https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/registry.csv');
        if (!response.ok) return {};
        const text = await response.text();
        const lines = text.split('\n');
        const map: Record<string, import('@/types').RegistryDefinition> = {};

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.match(/(?:^|,)(?:"([^"]*)"|([^,]*))/g)?.map((p) => {
                let s = p.replace(/^,/, '').trim();
                if (s.startsWith('"') && s.endsWith('"')) {
                    s = s.slice(1, -1);
                }
                return s;
            }) || [];

            if (parts.length >= 3) {
                const keyName = parts[0];
                map[keyName] = {
                    keyName,
                    valueType: parts[1],
                    description: parts[2],
                    defaultValue: parts[3] || '',
                    pattern: parts[4] || ''
                };
            }
        }
        return map;
    } catch {
        return {};
    }
}

export async function fetchConfigSchema(): Promise<import('@/types').ConfigSchema> {
    try {
        const response = await fetch('https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/config.schema.json');
        if (!response.ok) return {};
        return await response.json();
    } catch {
        return {};
    }
}

/** Parse a single RFC-4180 CSV line respecting double-quoted fields. */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { field += '"'; i++; }
                else { inQuotes = false; }
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') { inQuotes = true; }
            else if (ch === ',') { result.push(field); field = ''; }
            else { field += ch; }
        }
    }
    result.push(field);
    return result;
}

export async function fetchCmdLineDefinitions(): Promise<Record<string, import('@/types').CmdLineDefinition>> {
    try {
        const response = await fetch('https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/cmdline.csv');
        if (!response.ok) return {};
        const text = await response.text();
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const map: Record<string, import('@/types').CmdLineDefinition> = {};

        for (let i = 1; i < lines.length; i++) {
            const parts = parseCSVLine(lines[i]);
            if (parts.length >= 3) {
                const keyName = parts[0];
                map[keyName] = {
                    keyName,
                    valueType: parts[1],
                    description: parts[2].replace(/\\n/g, '\n'),
                    defaultValue: parts[3] || '',
                    pattern: parts[4] || ''
                };
            }
        }
        return map;
    } catch {
        return {};
    }
}

export async function fetchEnvDefinitions(): Promise<Record<string, import('@/types').CmdLineDefinition>> {
    try {
        const response = await fetch('https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/env.csv');
        if (!response.ok) return {};
        const text = await response.text();
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const map: Record<string, import('@/types').CmdLineDefinition> = {};

        for (let i = 1; i < lines.length; i++) {
            const parts = parseCSVLine(lines[i]);
            if (parts.length >= 3) {
                const keyName = parts[0];
                map[keyName] = {
                    keyName,
                    valueType: parts[1],
                    description: parts[2].replace(/\\n/g, '\n'),
                    defaultValue: parts[3] || '',
                    pattern: parts[4] || ''
                };
            }
        }
        return map;
    } catch {
        return {};
    }
}

