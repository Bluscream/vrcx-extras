import React, { useEffect, useState, useMemo, memo } from 'react';
import {
    DatabaseIcon,
    RefreshCwIcon,
    RotateCcwIcon,
    SearchIcon,
    ShieldAlertIcon,
    CheckIcon,
    ActivityIcon,
    ArrowRightIcon,
    Trash2Icon,
    Edit3Icon,
    CheckCircle2Icon,
    XCircleIcon
} from 'lucide-react';

import { List } from 'react-window';

import {
    fetchRegistryBackups,
    restoreRegistryBackup,
    resetRegistry,
    fetchRegistryDefinitions,
    updateRegistryKey,
    toErrorMessage
} from '@/api/client';
import type { RegistryBackupSnapshot, RegistryDefinition, RegistryEntry } from '@/types';

interface RowData {
    keys: string[];
    currentLiveBackup: RegistryBackupSnapshot | null;
    selectedBackup: RegistryBackupSnapshot;
    isComparingWithCurrent: boolean;
    definitions: Record<string, RegistryDefinition>;
    inlineCell: { key: string; field: 'name' | 'value' } | null;
    inlineNameVal: string;
    inlineDataVal: string;
    setInlineNameVal: (v: string) => void;
    setInlineDataVal: (v: string) => void;
    startInlineEdit: (key: string, field: 'name' | 'value', entry: RegistryEntry) => void;
    saveInlineEdit: (key: string, type: number) => void;
    setInlineCell: (v: { key: string; field: 'name' | 'value' } | null) => void;
    setContextMenu: (v: { x: number; y: number; keyName: string; entry: RegistryEntry } | null) => void;
}

const RegistryRow = memo(({ index, style, data }: { index: number; style: React.CSSProperties; data: RowData }) => {
    const key = data.keys[index];
    const currentVal = data.currentLiveBackup?.entries?.[key];
    const backupVal = data.selectedBackup.entries?.[key];
    const activeVal = data.isComparingWithCurrent ? currentVal : (backupVal || currentVal);
    const def = data.definitions[key];

    const isEditingName = data.inlineCell?.key === key && data.inlineCell.field === 'name';
    const isEditingVal = data.inlineCell?.key === key && data.inlineCell.field === 'value';
    const rowTitle = def ? `[VRCOSC] ${def.description}${def.defaultValue ? ` (Default: ${def.defaultValue})` : ''}` : key;

    const isDifferent = data.isComparingWithCurrent && String(currentVal?.data ?? '') !== String(backupVal?.data ?? '');
    const cStr = String(currentVal?.data ?? '-');
    const bStr = String(backupVal?.data ?? '-');

    return (
        <div
            style={style}
            title={rowTitle}
            onContextMenu={(e) => {
                e.preventDefault();
                if (activeVal) data.setContextMenu({ x: e.clientX, y: e.clientY, keyName: key, entry: activeVal });
            }}
            className={`flex items-center text-xs font-mono border-b border-border/40 transition-colors ${
                isDifferent ? 'bg-amber-500/10 hover:bg-amber-500/20' : 'hover:bg-accent/30'
            }`}
        >
            <div
                onDoubleClick={() => activeVal && data.startInlineEdit(key, 'name', activeVal)}
                className="w-2/5 px-2.5 py-1.5 font-sans font-medium truncate hover:bg-primary/10 hover:outline hover:outline-primary/30 rounded transition-all shrink-0"
            >
                {isEditingName ? (
                    <div className="flex items-center gap-1">
                        <input
                            type="text"
                            value={data.inlineNameVal}
                            autoFocus
                            onChange={(e) => data.setInlineNameVal(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') data.saveInlineEdit(key, activeVal?.type || 1);
                                if (e.key === 'Escape') data.setInlineCell(null);
                            }}
                            className="h-7 w-full rounded border border-primary bg-background px-1.5 text-xs outline-none"
                        />
                        <button onClick={() => data.saveInlineEdit(key, activeVal?.type || 1)} className="text-emerald-500 hover:text-emerald-400">
                            <CheckCircle2Icon className="size-4" />
                        </button>
                        <button onClick={() => data.setInlineCell(null)} className="text-muted-foreground hover:text-foreground">
                            <XCircleIcon className="size-4" />
                        </button>
                    </div>
                ) : (
                    <span className="truncate block" title={key}>{key}</span>
                )}
            </div>

            <div className="w-20 px-2.5 py-1.5 text-muted-foreground font-mono text-[0.7rem] font-bold shrink-0">
                {(() => {
                    const t = activeVal?.type ?? backupVal?.type;
                    switch (t) {
                        case 1:
                            return 'STRING';
                        case 3:
                            return 'BINARY';
                        case 4:
                            return 'DWORD';
                        case 11:
                            return 'QWORD';
                        default:
                            return `TYPE(${t ?? '?'})`;
                    }
                })()}
            </div>

            {/* Value Column(s) */}
            {data.isComparingWithCurrent ? (
                <>
                    <div
                        onDoubleClick={() => currentVal && data.startInlineEdit(key, 'value', currentVal)}
                        className="flex-1 min-w-0 px-2.5 py-1.5 truncate hover:outline hover:outline-emerald-500/30 rounded transition-all text-muted-foreground hover:bg-emerald-500/10"
                    >
                        {isEditingVal ? (
                            <div className="flex items-center gap-1">
                                <input
                                    type="text"
                                    value={data.inlineDataVal}
                                    autoFocus
                                    onChange={(e) => data.setInlineDataVal(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') data.saveInlineEdit(key, currentVal?.type || 1);
                                        if (e.key === 'Escape') data.setInlineCell(null);
                                    }}
                                    className="h-7 w-full rounded border border-primary bg-background px-1.5 text-xs outline-none"
                                />
                                <button onClick={() => data.saveInlineEdit(key, currentVal?.type || 1)} className="text-emerald-500 hover:text-emerald-400">
                                    <CheckCircle2Icon className="size-4" />
                                </button>
                                <button onClick={() => data.setInlineCell(null)} className="text-muted-foreground hover:text-foreground">
                                    <XCircleIcon className="size-4" />
                                </button>
                            </div>
                        ) : (
                            <span className={`truncate block font-mono text-xs ${isDifferent ? 'text-amber-500 font-medium' : ''}`} title={cStr}>{cStr}</span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0 px-2.5 py-1.5 truncate text-foreground">
                        <span className={`truncate block font-mono text-xs ${isDifferent ? 'text-emerald-500 dark:text-emerald-400 font-semibold' : ''}`} title={bStr}>{bStr}</span>
                    </div>
                </>
            ) : (
                <div
                    onDoubleClick={() => backupVal && data.startInlineEdit(key, 'value', backupVal)}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-muted-foreground truncate hover:bg-primary/10 hover:outline hover:outline-primary/30 rounded transition-all"
                >
                    {isEditingVal ? (
                        <div className="flex items-center gap-1">
                            <input
                                type="text"
                                value={data.inlineDataVal}
                                autoFocus
                                onChange={(e) => data.setInlineDataVal(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') data.saveInlineEdit(key, backupVal?.type || 1);
                                    if (e.key === 'Escape') data.setInlineCell(null);
                                }}
                                className="h-7 w-full rounded border border-primary bg-background px-1.5 text-xs outline-none"
                            />
                            <button onClick={() => data.saveInlineEdit(key, backupVal?.type || 1)} className="text-emerald-500 hover:text-emerald-400">
                                <CheckCircle2Icon className="size-4" />
                            </button>
                            <button onClick={() => data.setInlineCell(null)} className="text-muted-foreground hover:text-foreground">
                                <XCircleIcon className="size-4" />
                            </button>
                        </div>
                    ) : (
                        <span className="truncate block" title={String(backupVal?.data)}>{String(backupVal?.data)}</span>
                    )}
                </div>
            )}
        </div>
    );
});

RegistryRow.displayName = 'RegistryRow';

export function RegistryBackupPage() {
    const [backups, setBackups] = useState<RegistryBackupSnapshot[]>([]);
    const [definitions, setDefinitions] = useState<Record<string, RegistryDefinition>>({});
    const [loading, setLoading] = useState(true);
    const [wiping, setWiping] = useState(false);
    const [restoring, setRestoring] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const [selectedBackup, setSelectedBackup] = useState<RegistryBackupSnapshot | null>(null);
    const [entrySearch, setEntrySearch] = useState('');

    const [inlineCell, setInlineCell] = useState<{ key: string; field: 'name' | 'value' } | null>(null);
    const [inlineNameVal, setInlineNameVal] = useState<string>('');
    const [inlineDataVal, setInlineDataVal] = useState<string>('');

    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; keyName: string; entry: RegistryEntry } | null>(null);

    useEffect(() => {
        loadBackups();
        loadDefinitions();
    }, []);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const loadBackups = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await fetchRegistryBackups();
            setBackups(data);
            if (data.length > 0 && !selectedBackup) {
                const live = data.find((b) => b.index === -1);
                const vanilla = data.find((b) => b.name === 'Vanilla');
                setSelectedBackup(vanilla || live || data[0]);
            }
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const loadDefinitions = async () => {
        try {
            const defs = await fetchRegistryDefinitions();
            setDefinitions(defs);
        } catch (err) {
            console.error('Failed to load VRCOSC definitions:', err);
        }
    };

    const startInlineEdit = (key: string, field: 'name' | 'value', entry: RegistryEntry) => {
        setInlineCell({ key, field });
        setInlineNameVal(key);
        setInlineDataVal(String(entry.data));
    };

    const saveInlineEdit = async (key: string, type: number) => {
        if (!inlineCell) return;
        try {
            if (inlineCell.field === 'name') {
                if (inlineNameVal !== key) {
                    await updateRegistryKey(inlineNameVal, inlineDataVal, type);
                    setStatusMessage(`Renamed key "${key}" to "${inlineNameVal}".`);
                }
            } else {
                await updateRegistryKey(key, inlineDataVal, type);
                setStatusMessage(`Updated value for key "${key}".`);
            }
            setInlineCell(null);
            await loadBackups();
            setTimeout(() => setStatusMessage(null), 3000);
        } catch (err) {
            setError(toErrorMessage(err));
        }
    };

    const handleResetRegistry = async () => {
        if (!confirm('Are you sure you want to reset your VRChat registry settings to default (Vanilla state)?')) {
            return;
        }
        try {
            setWiping(true);
            setError(null);
            const res = await resetRegistry();
            setStatusMessage(res.message);
            await loadBackups();
            setTimeout(() => setStatusMessage(null), 4000);
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setWiping(false);
        }
    };

    const handleRestoreBackup = async (index: number) => {
        if (!confirm('Are you sure you want to restore this registry snapshot into your live system?')) {
            return;
        }
        try {
            setRestoring(true);
            setError(null);
            const res = await restoreRegistryBackup(index);
            setStatusMessage(res.message);
            await loadBackups();
            setTimeout(() => setStatusMessage(null), 4000);
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setRestoring(false);
        }
    };

    const currentLiveBackup = backups.find((b) => b.index === -1) || null;
    const isComparingWithCurrent = Boolean(selectedBackup && selectedBackup.index !== -1);

    const combinedKeys = useMemo(() => {
        const allKeysSet = new Set<string>();
        if (selectedBackup?.entries) {
            Object.keys(selectedBackup.entries).forEach((k) => allKeysSet.add(k));
        }
        if (isComparingWithCurrent && currentLiveBackup?.entries) {
            Object.keys(currentLiveBackup.entries).forEach((k) => allKeysSet.add(k));
        }

        const q = entrySearch.toLowerCase();
        return Array.from(allKeysSet).sort().filter((key) => !q || key.toLowerCase().includes(q));
    }, [selectedBackup, currentLiveBackup, isComparingWithCurrent, entrySearch]);

    const itemData: RowData = useMemo(() => ({
        keys: combinedKeys,
        currentLiveBackup,
        selectedBackup: selectedBackup!,
        isComparingWithCurrent,
        definitions,
        inlineCell,
        inlineNameVal,
        inlineDataVal,
        setInlineNameVal,
        setInlineDataVal,
        startInlineEdit,
        saveInlineEdit,
        setInlineCell,
        setContextMenu
    }), [
        combinedKeys,
        currentLiveBackup,
        selectedBackup,
        isComparingWithCurrent,
        definitions,
        inlineCell,
        inlineNameVal,
        inlineDataVal
    ]);

    return (
        <div className="flex h-full flex-col gap-4 p-6 relative">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <DatabaseIcon className="size-6 text-primary" />
                        VRChat Linux Registry Browser & Inline Editor
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Double-click any key name or value to edit inline directly in the table. Hover rows for VRCOSC definitions.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={loadBackups}
                        className="bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                    >
                        <RefreshCwIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={handleResetRegistry}
                        disabled={wiping}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        <Trash2Icon className={`size-4 ${wiping ? 'animate-spin' : ''}`} />
                        Reset
                    </button>
                </div>
            </header>

            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    <ShieldAlertIcon className="size-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
            {statusMessage && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckIcon className="size-5 shrink-0" />
                    <span>{statusMessage}</span>
                </div>
            )}

            <div className="flex min-h-0 flex-1 gap-6">
                <div className="flex w-80 shrink-0 flex-col gap-2 rounded-xl border bg-card p-3 shadow-xs">
                    <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Registry Snapshots
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1">
                        {loading && backups.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">Loading snapshots...</div>
                        ) : backups.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">No registry snapshots found.</div>
                        ) : (
                            backups.map((b) => {
                                const isCurrent = b.index === -1;
                                const isSelected = selectedBackup?.key === b.key;
                                return (
                                    <button
                                        key={b.key}
                                        onClick={() => setSelectedBackup(b)}
                                        className={`flex w-full flex-col gap-1 rounded-lg p-2.5 text-left text-xs transition-all ${
                                            isSelected ? 'bg-primary text-primary-foreground font-medium shadow-xs' : 'hover:bg-accent/50 text-foreground'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold truncate max-w-44 flex items-center gap-1.5">
                                                {isCurrent ? <span className="flex items-center gap-1 text-emerald-500 dark:text-emerald-400 font-bold"><ActivityIcon className="size-3.5" />{b.name}</span> : b.name}
                                            </span>
                                            {isCurrent ? <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[0.65rem] font-bold text-emerald-500 dark:text-emerald-400">LIVE</span> : <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">{b.keyCount} keys</span>}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="flex flex-1 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-xs">
                    {selectedBackup ? (
                        <>
                            <div className="flex items-center justify-between border-b pb-3">
                                <div>
                                    <h2 className="flex items-center gap-2 text-base font-semibold">
                                        {selectedBackup.index === -1 ? (
                                            <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-1.5"><ActivityIcon className="size-4" /> Current Registry</span>
                                        ) : (
                                            <>Comparing Current Registry <ArrowRightIcon className="size-4 text-muted-foreground" /> {selectedBackup.name}</>
                                        )}
                                    </h2>
                                </div>
                                {isComparingWithCurrent && (
                                    <button
                                        onClick={() => handleRestoreBackup(selectedBackup.index)}
                                        disabled={restoring}
                                        className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shadow-xs transition-colors disabled:opacity-50"
                                    >
                                        <RotateCcwIcon className={`size-3.5 ${restoring ? 'animate-spin' : ''}`} />
                                        Restore Selected Backup
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                                    <input type="text" placeholder="Search keys (e.g. Wing, AUDIO)..." value={entrySearch} onChange={(e) => setEntrySearch(e.target.value)} className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/50" />
                                </div>
                            </div>

                            <div className="flex-1 overflow-hidden rounded-lg border flex flex-col">
                                <div className="flex items-center bg-muted text-muted-foreground font-medium text-xs border-b shrink-0">
                                    <div className="w-2/5 px-2.5 py-2">Key Name</div>
                                    <div className="w-20 px-2.5 py-2">Type</div>
                                    {isComparingWithCurrent ? (
                                        <>
                                            <div className="flex-1 px-2.5 py-2 text-emerald-600">Current (Live)</div>
                                            <div className="flex-1 px-2.5 py-2 text-primary">Backup Value</div>
                                        </>
                                    ) : (
                                        <div className="flex-1 px-2.5 py-2">Value</div>
                                    )}
                                </div>

                                <div className="flex-1 min-h-0">
                                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                    {React.createElement(List as any, {
                                        height: 550,
                                        itemCount: combinedKeys.length,
                                        itemSize: 36,
                                        width: '100%',
                                        itemData: itemData,
                                        children: (props: any) => <RegistryRow {...props} />
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">Select a backup.</div>
                    )}
                </div>
            </div>

            {contextMenu && (
                <div style={{ top: contextMenu.y, left: contextMenu.x }} className="fixed z-50 min-w-44 rounded-lg border bg-popover p-1.5 shadow-xl text-xs">
                    <div className="px-2 py-1 font-semibold text-[0.65rem] text-muted-foreground border-b mb-1 truncate max-w-48">{contextMenu.keyName}</div>
                    <button onClick={() => { startInlineEdit(contextMenu.keyName, 'name', contextMenu.entry); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-left"><Edit3Icon className="size-3.5 text-primary" /> Edit Key Name Inline</button>
                    <button onClick={() => { startInlineEdit(contextMenu.keyName, 'value', contextMenu.entry); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent text-left"><Edit3Icon className="size-3.5 text-emerald-500" /> Edit Key Value Inline</button>
                </div>
            )}
        </div>
    );
}
