import {
    ArrowDownIcon,
    ArrowUpIcon,
    CheckIcon,
    ChevronsUpDownIcon,
    CopyIcon,
    ExternalLinkIcon
} from 'lucide-react';

import {
    type SortAccessors,
    type SortDirection,
    useSortableRows
} from '@/hooks/useSortableRows';
import {
    buildVrcxWorldUri,
    formatDateTime,
    formatDuration
} from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AccessType, InstanceRoster, OverlappingSession } from '@/types';
import { Badge } from '@/ui/badge';
import { Button, buttonVariants } from '@/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/ui/table';

const accessTypeStyles: Record<AccessType, string> = {
    Public: 'text-status-online border-status-online/40',
    'Friends+': 'text-status-joinme border-status-joinme/40',
    Friends: 'text-status-joinme border-status-joinme/40',
    Group: 'text-status-askme border-status-askme/40',
    Private: 'text-muted-foreground border-border'
};

type ColumnKey =
    | 'instance'
    | 'access'
    | 'duration'
    | 'joinedAt'
    | 'players';

const accessors: SortAccessors<OverlappingSession, ColumnKey> = {
    // World first, then instance id, so repeat visits to one world group
    // together instead of being interleaved by whatever the previous sort was.
    instance: (session) =>
        `${session.worldName || session.worldId}\u0000${session.instanceId}`,
    access: (session) => session.accessType,
    duration: (session) => session.durationMs,
    joinedAt: (session) => session.joinedAt,
    // Unknown rosters sort below every known count rather than as zero.
    players: (session) => session.roster?.total ?? -1
};

// Time-like and count columns are most useful largest-first.
const defaultDirections: Partial<Record<ColumnKey, SortDirection>> = {
    duration: 'desc',
    joinedAt: 'desc',
    players: 'desc'
};

const columns: { key: ColumnKey; label: string; className?: string }[] = [
    { key: 'instance', label: 'Instance' },
    { key: 'access', label: 'Access' },
    { key: 'duration', label: 'Duration', className: 'text-right' },
    { key: 'joinedAt', label: 'When' },
    { key: 'players', label: 'Players', className: 'text-right' }
];

/**
 * Unique players ever recorded in the instance, with the full list on hover.
 * A native `title` keeps this readable for long rosters and needs no popover
 * machinery; the count is the sortable value, the names are the detail.
 */
function RosterCount({ roster }: { roster: InstanceRoster | null }) {
    if (!roster) {
        return (
            <span
                className="text-muted-foreground"
                title="Not recorded — you were not in this instance, so its player list is unknown"
            >
                —
            </span>
        );
    }

    const shown = roster.names.join('\n');
    const tooltip =
        roster.truncated > 0
            ? `${shown}\n… and ${roster.truncated} more`
            : shown;

    return (
        <span className="cursor-help underline decoration-dotted underline-offset-4" title={tooltip}>
            {roster.total}
        </span>
    );
}

function sessionKey(session: OverlappingSession) {
    return `${session.location}-${session.joinedAt}`;
}

export function SessionTable({
    sessions,
    copiedKey,
    onCopy
}: {
    sessions: OverlappingSession[];
    copiedKey: string | null;
    onCopy: (key: string, session: OverlappingSession) => void;
}) {
    // Explicit type arguments: inferring from the `initial` literal would
    // narrow the key type to just 'joinedAt'.
    const { sortedRows, sort, toggleSort } = useSortableRows<
        OverlappingSession,
        ColumnKey
    >(
        sessions,
        accessors,
        { key: 'joinedAt', direction: 'desc' },
        defaultDirections
    );

    return (
        <div className="vrcx-0-data-table ring-foreground/10 overflow-hidden rounded-xl ring-1">
            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        {columns.map((column) => {
                            const isActive = sort.key === column.key;
                            const SortIcon = !isActive
                                ? ChevronsUpDownIcon
                                : sort.direction === 'asc'
                                  ? ArrowUpIcon
                                  : ArrowDownIcon;
                            return (
                                <TableHead
                                    key={column.key}
                                    aria-sort={
                                        isActive
                                            ? sort.direction === 'asc'
                                                ? 'ascending'
                                                : 'descending'
                                            : 'none'
                                    }
                                    className={cn('p-0', column.className)}
                                >
                                    <button
                                        type="button"
                                        onClick={() => toggleSort(column.key)}
                                        className={cn(
                                            'hover:text-foreground focus-visible:ring-ring/50 flex h-10 w-full items-center gap-1 px-2 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-inset',
                                            column.className ===
                                                'text-right' &&
                                                'justify-end',
                                            !isActive && 'text-muted-foreground'
                                        )}
                                    >
                                        {column.label}
                                        <SortIcon
                                            className={cn(
                                                'size-3.5 shrink-0',
                                                !isActive && 'opacity-50'
                                            )}
                                        />
                                    </button>
                                </TableHead>
                            );
                        })}
                        <TableHead className="w-0">
                            <span className="sr-only">Actions</span>
                        </TableHead>
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {sortedRows.map((session) => {
                        const key = sessionKey(session);
                        return (
                            <TableRow key={key}>
                                <TableCell
                                    className="max-w-80 truncate"
                                    title={session.worldId}
                                >
                                    <span className="font-medium">
                                        {session.worldName ||
                                            session.worldId ||
                                            'Unknown world'}
                                    </span>
                                    {session.instanceId ? (
                                        <span className="text-muted-foreground ml-1.5 font-mono text-xs">
                                            #{session.instanceId}
                                        </span>
                                    ) : null}
                                </TableCell>

                                <TableCell>
                                    <Badge
                                        variant="outline"
                                        className={
                                            accessTypeStyles[
                                                session.accessType
                                            ] ?? accessTypeStyles.Private
                                        }
                                    >
                                        {session.accessType}
                                    </Badge>
                                </TableCell>

                                <TableCell className="text-right tabular-nums">
                                    {formatDuration(session.durationMs)}
                                </TableCell>

                                <TableCell className="text-muted-foreground text-xs">
                                    <time
                                        dateTime={new Date(
                                            session.joinedAt
                                        ).toISOString()}
                                    >
                                        {formatDateTime(session.joinedAt)}
                                    </time>
                                </TableCell>

                                <TableCell className="text-right tabular-nums">
                                    <RosterCount roster={session.roster} />
                                </TableCell>

                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label="Copy launch link"
                                            title="Copy launch link"
                                            onClick={() => onCopy(key, session)}
                                        >
                                            {copiedKey === key ? (
                                                <CheckIcon className="text-status-online" />
                                            ) : (
                                                <CopyIcon />
                                            )}
                                        </Button>
                                        {/*
                                          * A real anchor, not a button that
                                          * assigns location.href. Browsers
                                          * treat a link click as user-initiated
                                          * and hand the custom scheme to the OS;
                                          * a scripted location assignment is
                                          * frequently ignored without any error.
                                          */}
                                        <a
                                            href={
                                                session.worldId
                                                    ? buildVrcxWorldUri(
                                                          session.worldId
                                                      )
                                                    : undefined
                                            }
                                            aria-label="Open world in VRCX"
                                            aria-disabled={
                                                !session.worldId || undefined
                                            }
                                            title={
                                                session.worldId
                                                    ? 'Open world in VRCX'
                                                    : 'World is unknown, cannot open in VRCX'
                                            }
                                            className={cn(
                                                buttonVariants({
                                                    variant: 'ghost',
                                                    size: 'icon-sm'
                                                }),
                                                !session.worldId &&
                                                    'pointer-events-none opacity-50'
                                            )}
                                        >
                                            <ExternalLinkIcon />
                                        </a>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
