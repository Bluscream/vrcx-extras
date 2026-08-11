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

/** AbortError is a cancellation, not a failure worth showing the user. */
export function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError';
}

export function toErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

