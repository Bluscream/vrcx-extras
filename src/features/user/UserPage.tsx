import React, { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
import {
    UserIcon,
    SearchIcon,
    XIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    DownloadIcon,
    RefreshCwIcon,
    AlertCircleIcon,
    UsersIcon,
} from 'lucide-react';
import { List } from 'react-window';
import { fetchUserTimeline } from '@/api/client';
import type { UserTimelineRow } from '@/types';

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

// ─── Tag input ────────────────────────────────────────────────────────────────

interface TagInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
    id?: string;
}

function TagInput({ tags, onChange, placeholder, id }: TagInputProps) {
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    function addTag(raw: string) {
        const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
        const next = [...new Set([...tags, ...parts])];
        if (next.length !== tags.length) onChange(next);
        setInput('');
    }

    function removeTag(tag: string) {
        onChange(tags.filter((t) => t !== tag));
    }

    return (
        <div
            id={id}
            onClick={() => inputRef.current?.focus()}
            className="flex flex-wrap gap-1.5 items-center min-h-[2.5rem] w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm cursor-text focus-within:ring-2 focus-within:ring-primary/50"
        >
            {tags.map((tag) => (
                <span
                    key={tag}
                    className="flex items-center gap-1 rounded-md bg-primary/15 border border-primary/30 px-2 py-0.5 text-xs font-mono text-primary"
                >
                    {tag}
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                        className="hover:text-destructive transition-colors"
                        aria-label={`Remove ${tag}`}
                    >
                        <XIcon className="size-3" />
                    </button>
                </span>
            ))}
            <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
                        e.preventDefault();
                        addTag(input);
                    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
                        onChange(tags.slice(0, -1));
                    }
                }}
                onBlur={() => { if (input.trim()) addTag(input); }}
                placeholder={tags.length === 0 ? placeholder : ''}
                className="flex-1 min-w-[140px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
        </div>
    );
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

interface RowItemData {
    rows: UserTimelineRow[];
    expandedIdx: number | null;
    toggleExpand: (idx: number) => void;
}

const TimelineRow = memo(({ index, style, data }: { index: number; style: React.CSSProperties; data: RowItemData }) => {
    const row = data.rows[index];
    if (!row) return null;
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
    const [userIds, setUserIds] = useState<string[]>([]);
    const [displayNames, setDisplayNames] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<UserTimelineRow[] | null>(null);
    const [total, setTotal] = useState(0);

    // Filters
    const [searchFilter, setSearchFilter] = useState('');
    const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set());
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    // Load from URL params on mount
    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        const ids = sp.get('ids')?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
        const names = sp.get('names')?.split(',').map(s => s.trim()).filter(Boolean) ?? [];
        if (ids.length > 0) setUserIds(ids);
        if (names.length > 0) setDisplayNames(names);
    }, []);

    const abortRef = useRef<AbortController | null>(null);

    const handleSearch = useCallback(async () => {
        if (userIds.length === 0 && displayNames.length === 0) return;
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;

        setLoading(true);
        setError(null);
        setRows(null);
        setExpandedIdx(null);
        setSourceFilter(new Set());

        // Update URL for deep linking
        const sp = new URLSearchParams();
        if (userIds.length > 0) sp.set('ids', userIds.join(','));
        if (displayNames.length > 0) sp.set('names', displayNames.join(','));
        window.history.replaceState({}, '', `?${sp.toString()}`);

        try {
            const data = await fetchUserTimeline(userIds, displayNames, ctrl.signal);
            setRows(data.rows);
            setTotal(data.total);
        } catch (err: unknown) {
            if ((err as { name?: string }).name !== 'AbortError') {
                setError(err instanceof Error ? err.message : 'Unknown error');
            }
        } finally {
            setLoading(false);
        }
    }, [userIds, displayNames]);

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
                return 40 + 24 + Math.min(lines, 30) * 16 + 24; // header + pre padding + lines + bottom
            }
            return 40;
        },
        [expandedIdx, filteredRows]
    );

    function exportData(format: 'json' | 'csv') {
        if (!filteredRows.length) return;
        if (format === 'json') {
            const blob = new Blob([JSON.stringify(filteredRows, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'user_timeline.json'; a.click();
        } else {
            const headers = ['created_at', 'source', 'type', 'user_id', 'display_name', 'detail'];
            const lines = [
                headers.join(','),
                    ...filteredRows.map((r) =>
                        headers.map((h) => JSON.stringify(String((r as unknown as Record<string, unknown>)[h] ?? ''))).join(',')
                    )
            ];
            const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'user_timeline.csv'; a.click();
        }
    }

    const canSearch = userIds.length > 0 || displayNames.length > 0;

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
                        Look up one or more users to see every database entry involving them — join/leave events, feed, notifications, and more.
                    </p>
                </div>
                {rows && (
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => exportData('csv')}
                            className="flex items-center gap-1.5 rounded-lg border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                        >
                            <DownloadIcon className="size-3.5" /> CSV
                        </button>
                        <button
                            onClick={() => exportData('json')}
                            className="flex items-center gap-1.5 rounded-lg border bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                        >
                            <DownloadIcon className="size-3.5" /> JSON
                        </button>
                    </div>
                )}
            </header>

            {/* Search inputs */}
            <div className="rounded-xl border bg-card p-4 shadow-xs flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide" htmlFor="user-ids-input">
                            User IDs <span className="font-normal normal-case">(usr_xxx)</span>
                        </label>
                        <TagInput
                            id="user-ids-input"
                            tags={userIds}
                            onChange={setUserIds}
                            placeholder="Paste usr_… ids, press Enter or comma"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide" htmlFor="display-names-input">
                            Display Names
                        </label>
                        <TagInput
                            id="display-names-input"
                            tags={displayNames}
                            onChange={setDisplayNames}
                            placeholder="Type name, press Enter or comma"
                        />
                    </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                        Matches by exact user ID or partial display name across all 13 VRCX tables.
                    </p>
                    <button
                        id="user-timeline-search-btn"
                        onClick={handleSearch}
                        disabled={!canSearch || loading}
                        className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
                    >
                        {loading
                            ? <RefreshCwIcon className="size-4 animate-spin" />
                            : <SearchIcon className="size-4" />}
                        {loading ? 'Searching…' : 'Search'}
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircleIcon className="size-5 shrink-0" />
                    <span>{error}</span>
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
                                {rows.length === 0 ? 'No entries found for the given users.' : 'No entries match the current filters.'}
                            </div>
                        ) : (
                            <div className="flex-1 min-h-0">
                                {React.createElement(List as any, {
                                    height: Math.max(300, window.innerHeight - 420),
                                    itemCount: filteredRows.length,
                                    itemSize: getItemSize,
                                    width: '100%',
                                    itemData: itemData,
                                    children: (props: any) => <TimelineRow {...props} />
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
                    <p className="text-sm">Enter one or more user IDs or display names above and click Search.</p>
                </div>
            )}
        </div>
    );
}
