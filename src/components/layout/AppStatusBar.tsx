import { DatabaseIcon } from 'lucide-react';

import type { DatabaseStatus } from '@/types';

export function AppStatusBar({
    status,
    error,
    resultCount
}: {
    status: DatabaseStatus | null;
    error: string | null;
    resultCount: number | null;
}) {
    const connected = status?.connected ?? false;
    const label = error
        ? 'Database unavailable'
        : connected
          ? 'SQLite · read-only'
          : 'Connecting…';

    return (
        <footer className="vrcx-0-statusbar text-muted-foreground flex h-7 shrink-0 items-center gap-3 border-t px-3 text-xs">
            <span className="flex items-center gap-1.5">
                <i
                    className={`x-status-icon ${connected && !error ? 'green' : 'red'}`}
                />
                <DatabaseIcon className="size-3" />
                {label}
            </span>

            {status?.path && !error ? (
                <span
                    className="truncate font-mono text-[0.7rem]"
                    title={status.path}
                >
                    {status.path}
                </span>
            ) : null}

            {resultCount !== null ? (
                <span className="ml-auto shrink-0">
                    {resultCount} overlapping{' '}
                    {resultCount === 1 ? 'session' : 'sessions'}
                </span>
            ) : null}
        </footer>
    );
}
