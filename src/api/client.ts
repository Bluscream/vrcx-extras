import type { DatabaseStatus, OverlappingSession, Player } from '@/types';

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

export function findLinks(userIds: string[], signal?: AbortSignal) {
    return request<OverlappingSession[]>(
        'find-links',
        { user_ids: userIds.join(',') },
        signal
    );
}

/** AbortError is a cancellation, not a failure worth showing the user. */
export function isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError';
}

export function toErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
