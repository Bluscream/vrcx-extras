import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import {
    UserIcon,
    SearchIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    RefreshCwIcon,
    AlertCircleIcon,
    UsersIcon,
} from 'lucide-react';
import { List } from 'react-window';
import { fetchUserTimeline } from '@/api/client';
import { useSelectedPlayersParam } from '@/hooks/useSelectedPlayersParam';
import { PlayerPicker } from '@/features/links/PlayerPicker';
import { ExportDropdown } from '@/components/ExportDropdown';
import type { Player, UserTimelineRow } from '@/types';
import { Button } from '@/ui/button';

// ─── Source / type badge colours ─────────────────────────────────────────────

const SOURCE_COLORS: Record<string, string> = {
    gamelog_join_leave: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
    gamelog_external: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40',
    gamelog_portal_spawn: 'bg-violet-500/20 text-violet-400 border-violet-500/40',
    feed_gps: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    feed_online_offline: 'bg-teal-500/20 text-teal-400 border-teal-500/40',
    feed_status: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    feed_bio: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
    feed_avatar: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
    friend_log_history: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    notifications: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    notifications_v2: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
    moderation: 'bg-red-500/20 text-red-400 border-red-500/40',
    notes: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
};

const SOURCE_LABELS: Record<string, string> = {
    gamelog_join_leave: 'Join/Leave',
    gamelog_external: 'External',
    gamelog_portal_spawn: 'Portal',
    feed_gps: 'GPS',
    feed_online_offline: 'Online',
    feed_status: 'Status',
    feed_bio: 'Bio',
    feed_avatar: 'Avatar',
    friend_log_history: 'Friend Log',
    notifications: 'Notification',
    notifications_v2: 'Notification',
    moderation: 'Moderation',
    notes: 'Note',
};

function sourceBadge(source: string) {
    return SOURCE_COLORS[source] ?? 'bg-muted text-muted-foreground border-border';
}

function sourceLabel(source: string) {
    return SOURCE_LABELS[source] ?? source;
}

function formatTs(ts: string): string {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

interface RowItemData {
    rows: UserTimelineRow[];
    expandedIdx: number | null;
    toggleExpand: (idx: number) => void;
}

const TimelineRow = memo(({ index, style, data }: { index: number; style: React.CSSProperties; data: RowItemData }) => {
    const row = data.rows[index];
    if (!row) return <div style={style} />;
    const isExpanded = data.expandedIdx === index;

    return (
        <div
            style={style}
            className={`flex flex-col border-b border-border/40 text-xs transition-colors cursor-pointer select-none
                ${isExpanded ? 'bg-accent/20' : 'hover:bg-accent/10'}`}
            onClick={() => data.toggleExpand(index)}
        >
            <div className="flex items-center gap-2 px-3 py-2 overflow-hidden">
                {/* Timestamp */}
                <span className="w-36 shrink-0 text-muted-foreground font-mono text-[0.68rem] tabular-nums">
                    {formatTs(row.created_at)}
                </span>

                {/* Source badge */}
                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${sourceBadge(row.source)}`}>
                    {sourceLabel(row.source)}
                </span>

                {/* Type */}
                <span className="w-28 shrink-0 truncate text-muted-foreground font-mono" title={row.type}>
                    {row.type}
                </span>

                {/* Display name */}
                <span className="w-40 shrink-0 truncate font-medium text-foreground" title={row.display_name ?? row.user_id ?? ''}>
                    {row.display_name ?? <span className="text-muted-foreground italic">{row.user_id ?? '?'}</span>}
                </span>

                {/* Detail */}
                <span className="flex-1 min-w-0 truncate text-muted-foreground" title={row.detail}>
                    {row.detail}
                </span>

                {/* Expand icon */}
                <span className="shrink-0 text-muted-foreground ml-1">
                    {isExpanded ? <ChevronUpIcon className="size-3.5" /> : <ChevronDownIcon className="size-3.5" />}
                </span>
            </div>

            {isExpanded && (
                <div className="px-3 pb-3 pt-0">
                    <pre className="rounded-lg bg-muted/60 border border-border/40 p-3 text-[0.7rem] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(row.raw, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
});
TimelineRow.displayName = 'TimelineRow';

// ─── UserPage ─────────────────────────────────────────────────────────────────

export function UserPage() {
    const {
        selected,
        updateSelection,
        commitSelectionToUrl,
        isHydrating,
        hydrationError,
        hadDeepLink
    } = useSelectedPlayersParam();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<UserTimelineRow[] | null>(null);
    const [total, setTotal] = useState(0);

    // Filters
    const [searchFilter, setSearchFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    const abortRef = useRef<AbortController | null>(null);

    const handleSearch = useCallback(async (playersToSearch: Player[] = selected) => {
        if (playersToSearch.length === 0) return;
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        setLoading(true);
        setError(null);
        setRows(null);
        setExpandedIdx(null);
        setSourceFilter(new Set());

        const ids = playersToSearch.map((p) => p.id);
        const names = playersToSearch.map((p) => p.displayName);

        commitSelectionToUrl(playersToSearch);

        try {
            const data = await fetchUserTimeline(ids, names, ctrl.signal);
            setRows(data.rows);
            setTotal(data.total);
        } catch (err: unknown) {
            if ((err as { name?: string }).name !== 'AbortError') {
                setError(err instanceof Error ? err.message : 'Unknown error');
            }
        } finally {
            setLoading(false);
        }
    }, [selected, commitSelectionToUrl]);

    // Auto-trigger search when hydrating deep link
    const autoSearched = useRef(false);
    useEffect(() => {
        if (hadDeepLink && selected.length > 0 && !autoSearched.current && !isHydrating) {
            autoSearched.current = true;
            handleSearch(selected);
        }
    }, [hadDeepLink, selected, isHydrating, handleSearch]);

    function addPlayer(player: Player) {
        if (!selected.some((p) => p.id === player.id)) {
            updateSelection([...selected, player]);
        }
    }

    function removePlayer(id: string) {
        updateSelection(selected.filter((p) => p.id !== id));
    }

    // All unique sources in current results for filter checkboxes
    const allSources = useMemo(() => {
        if (!rows) return [];
        return [...new Set(rows.map((r) => r.source))].sort();
    }, [rows]);

    // Filtered rows
    const filteredRows = useMemo(() => {
        if (!rows) return [];
        const q = searchFilter.toLowerCase();
        return rows.filter((row) => {
            if (sourceFilter.size > 0 && !sourceFilter.has(row.source)) return false;
            if (q) {
                return (
                    row.display_name?.toLowerCase().includes(q) ||
                    row.user_id?.toLowerCase().includes(q) ||
                    row.type.toLowerCase().includes(q) ||
                    row.detail.toLowerCase().includes(q) ||
                    row.source.toLowerCase().includes(q)
                );
            }
            return true;
        });
    }, [rows, searchFilter, sourceFilter]);

    const toggleExpand = useCallback((idx: number) => {
        setExpandedIdx((prev) => (prev === idx ? null : idx));
    }, []);

    const itemData: RowItemData = useMemo(() => ({
        rows: filteredRows,
        expandedIdx,
        toggleExpand,
    }), [filteredRows, expandedIdx, toggleExpand]);

    // Dynamic row heights for expanded rows
    const getItemSize = useCallback(
        (index: number) => {
            if (expandedIdx === index) {
                const raw = filteredRows[index]?.raw;
                const lines = raw ? JSON.stringify(raw, null, 2).split('\n').length : 5;
                return 40 + 24 + Math.min(lines, 30) * 16 + 24;
            }
            return 40;
        },
        [expandedIdx, filteredRows]
    );



    return (
        <div className="flex h-full flex-col gap-4 p-6">
            {/* Header */}
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <UsersIcon className="size-6 text-primary" />
                        User Timeline
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Look up one or more players to view every database entry involving them — join/leave events, feed updates, notifications, and notes.
                    </p>
                </div>
                {rows && (
                    <ExportDropdown
                        title="User Timeline Report"
                        filenamePrefix="user_timeline"
                        data={filteredRows as unknown as Record<string, unknown>[]}
                    />
                )}
            </header>

            {/* Unified Player Picker */}
            <div className="rounded-xl border bg-card p-4 shadow-xs flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <PlayerPicker
                        selected={selected}
                        onAdd={addPlayer}
                        onRemove={removePlayer}
                        isBusy={isHydrating}
                    />
                    <Button
                        id="user-timeline-search-btn"
                        onClick={() => handleSearch(selected)}
                        disabled={selected.length === 0 || loading || isHydrating}
                        className="shrink-0"
                    >
                        {loading ? (
                            <>
                                <RefreshCwIcon className="size-4 animate-spin mr-1.5" />
                                Searching…
                            </>
                        ) : (
                            <>
                                <SearchIcon className="size-4 mr-1.5" />
                                Search Timeline
                            </>
                        )}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Search by player name or user ID. Selection is saved to the URL parameter for easy sharing.
                </p>
            </div>

            {/* Hydration or Fetch Error */}
            {(error || hydrationError) && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircleIcon className="size-5 shrink-0" />
                    <span>{error || hydrationError}</span>
                </div>
            )}

            {/* Results */}
            {rows !== null && (
                <div className="flex flex-col flex-1 min-h-0 gap-3">
                    {/* Toolbar: stats + search + source filters */}
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">{filteredRows.length.toLocaleString()}</span>
                            {filteredRows.length !== total && <> of <span className="font-semibold text-foreground">{total.toLocaleString()}</span></>} rows
                        </span>

                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                            <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                            <input
                                type="text"
                                id="timeline-filter-search"
                                placeholder="Filter results…"
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                className="h-8 w-full rounded-lg border bg-background pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>

                        {/* Source filter pills */}
                        <div className="flex flex-wrap gap-1.5">
                            {allSources.map((src) => {
                                const active = sourceFilter.has(src);
                                return (
                                    <button
                                        key={src}
                                        onClick={() => {
                                            setSourceFilter((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(src)) next.delete(src); else next.add(src);
                                                return next;
                                            });
                                            setExpandedIdx(null);
                                        }}
                                        className={`rounded border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide transition-all ${
                                            active
                                                ? sourceBadge(src) + ' ring-1 ring-current'
                                                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                                        }`}
                                    >
                                        {sourceLabel(src)}
                                    </button>
                                );
                            })}
                            {sourceFilter.size > 0 && (
                                <button
                                    onClick={() => { setSourceFilter(new Set()); setExpandedIdx(null); }}
                                    className="rounded border border-border px-2 py-0.5 text-[0.65rem] text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    ✕ clear
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="flex-1 min-h-0 rounded-xl border bg-card shadow-xs overflow-hidden flex flex-col">
                        {/* Header row */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted text-muted-foreground text-xs font-semibold shrink-0">
                            <span className="w-36 shrink-0">Timestamp</span>
                            <span className="w-20 shrink-0">Source</span>
                            <span className="w-28 shrink-0">Type</span>
                            <span className="w-40 shrink-0">Display Name</span>
                            <span className="flex-1">Detail</span>
                        </div>

                        {filteredRows.length === 0 ? (
                            <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm py-16">
                                {rows.length === 0 ? 'No entries found for the selected player(s).' : 'No entries match the current filters.'}
                            </div>
                        ) : (
                            <div className="flex-1 min-h-0">
                                {React.createElement(List as any, {
                                    rowComponent: TimelineRow,
                                    rowCount: filteredRows.length,
                                    rowHeight: getItemSize,
                                    rowProps: { data: itemData },
                                    style: { height: '100%' }
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {rows === null && !loading && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                    <UserIcon className="size-12 opacity-20" />
                    <p className="text-sm">Select one or more players using the search bar above and click Search Timeline.</p>
                </div>
            )}
        </div>
    );
}
