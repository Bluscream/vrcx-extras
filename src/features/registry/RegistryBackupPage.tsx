import { useEffect, useState } from 'react';
import {
    DatabaseIcon,
    RefreshCwIcon,
    RotateCcwIcon,
    SearchIcon,
    KeyIcon,
    ShieldAlertIcon,
    CheckIcon,
    ActivityIcon,
    ArrowRightIcon,
    Trash2Icon
} from 'lucide-react';

import {
    fetchRegistryBackups,
    restoreRegistryBackup,
    resetRegistry,
    toErrorMessage
} from '@/api/client';
import type { RegistryBackupSnapshot } from '@/types';

export function RegistryBackupPage() {
    const [backups, setBackups] = useState<RegistryBackupSnapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [wiping, setWiping] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // Active selection for viewing/comparison
    const [selectedBackup, setSelectedBackup] = useState<RegistryBackupSnapshot | null>(null);

    // Search filter inside registry keys
    const [entrySearch, setEntrySearch] = useState('');

    // Restoring state
    const [restoringIndex, setRestoringIndex] = useState<number | null>(null);

    const loadBackups = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchRegistryBackups();
            setBackups(data);
            if (data.length > 0) {
                // Select Current Registry (index -1) by default if present
                const currentReg = data.find((b) => b.index === -1) || data[0];
                setSelectedBackup(currentReg);
            }
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBackups();
    }, []);

    const handleResetRegistry = async () => {
        if (!confirm('Are you sure you want to WIPE the live VRChat registry in Proton prefix?\n\nThis will remove all VRChat settings and preferences in Wine.')) {
            return;
        }

        setWiping(true);
        setError(null);
        setStatusMessage(null);

        try {
            const result = await resetRegistry();
            setStatusMessage(result.message);
            await loadBackups();
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setWiping(false);
        }
    };

    const handleRestoreBackup = async (index: number) => {
        if (
            !confirm(
                'IMPORTANT: Please ensure VRChat and Steam are fully CLOSED before restoring!\n\nDo you want to proceed with restoring this backup to your Linux Wine prefix?'
            )
        ) {
            return;
        }

        setRestoringIndex(index);
        setStatusMessage(null);
        setError(null);
        try {
            const res = await restoreRegistryBackup(index);
            setStatusMessage(res.message);
            await loadBackups();
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setRestoringIndex(null);
        }
    };

    const currentLiveBackup = backups.find((b) => b.index === -1) || null;
    const isComparingWithCurrent = selectedBackup && selectedBackup.index !== -1;

    // Collect combined key set when comparing
    const combinedKeys = Array.from(
        new Set([
            ...Object.keys(currentLiveBackup?.entries || {}),
            ...Object.keys(selectedBackup?.entries || {})
        ])
    ).filter((key) => key.toLowerCase().includes(entrySearch.toLowerCase()));

    return (
        <div className="flex h-full flex-col gap-4 p-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <DatabaseIcon className="size-6 text-primary" />
                        VRChat Linux Registry Browser & Comparison
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Compare live Proton prefix registry against saved backups and restore with zero data loss.
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

            {/* Alert / Status Banners */}
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
                {/* Backups List Sidebar */}
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
                                const isSelected = selectedBackup?.key === b.key;
                                const isLive = b.index === -1;
                                const isRestoring = restoringIndex === b.index;

                                return (
                                    <div
                                        key={b.key}
                                        onClick={() => setSelectedBackup(b)}
                                        className={`group relative flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors ${
                                            isLive
                                                ? isSelected
                                                    ? 'border-emerald-500 bg-emerald-500/10'
                                                    : 'border-emerald-500/30 hover:bg-emerald-500/5'
                                                : isSelected
                                                ? 'border-primary bg-primary/5'
                                                : 'hover:bg-accent/50 border-transparent'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-semibold text-sm truncate flex items-center gap-1.5">
                                                {isLive && <ActivityIcon className="size-4 text-emerald-500 animate-pulse" />}
                                                {b.name}
                                            </span>
                                            {isLive && (
                                                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                                    LIVE
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>{new Date(b.date).toLocaleDateString()} {new Date(b.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span>{b.keyCount} keys</span>
                                        </div>

                                        {!isLive && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRestoreBackup(b.index);
                                                }}
                                                disabled={isRestoring}
                                                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                            >
                                                <RotateCcwIcon className={`size-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                                                {isRestoring ? 'Restoring...' : 'Restore to Proton'}
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Selected Viewer & Direct Value Comparison */}
                <div className="flex min-w-0 flex-1 flex-col rounded-xl border bg-card p-4 shadow-xs">
                    {selectedBackup ? (
                        <>
                            <div className="flex items-center justify-between border-b pb-3">
                                <div>
                                    <h2 className="text-lg font-semibold flex items-center gap-2">
                                        {selectedBackup.name}
                                        {isComparingWithCurrent && (
                                            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                                                <ArrowRightIcon className="size-3.5" /> Comparing against Live Prefix
                                            </span>
                                        )}
                                    </h2>
                                    <p className="text-xs text-muted-foreground">
                                        Created: {new Date(selectedBackup.date).toLocaleString()} • {selectedBackup.keyCount} Registry Keys
                                    </p>
                                </div>
                            </div>

                            {/* Search inside keys */}
                            <div className="my-3 flex items-center gap-2">
                                <div className="relative flex-1">
                                    <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Search registry keys (e.g. AUDIO, FPS, AVATAR)..."
                                        value={entrySearch}
                                        onChange={(e) => setEntrySearch(e.target.value)}
                                        className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                </div>
                            </div>

                            {/* Key Comparison Table */}
                            <div className="flex-1 overflow-y-auto rounded-lg border">
                                <table className="w-full text-left text-xs">
                                    <thead className="sticky top-0 bg-muted text-muted-foreground">
                                        <tr>
                                            <th className="p-2.5 font-medium">Key Name</th>
                                            {isComparingWithCurrent ? (
                                                <>
                                                    <th className="p-2.5 font-medium text-emerald-600 dark:text-emerald-400">Current (Live Prefix)</th>
                                                    <th className="p-2.5 font-medium text-primary">Backup ({selectedBackup.name})</th>
                                                </>
                                            ) : (
                                                <>
                                                    <th className="p-2.5 font-medium">Type</th>
                                                    <th className="p-2.5 font-medium">Value Data</th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {combinedKeys.length === 0 ? (
                                            <tr>
                                                <td colSpan={isComparingWithCurrent ? 3 : 3} className="p-4 text-center text-muted-foreground">
                                                    No matching registry keys.
                                                </td>
                                            </tr>
                                        ) : (
                                            combinedKeys.map((key) => {
                                                const currentVal = currentLiveBackup?.entries?.[key];
                                                const backupVal = selectedBackup.entries?.[key];

                                                if (isComparingWithCurrent) {
                                                    let currentStr = currentVal !== undefined ? String(currentVal.data) : '<NOT IN LIVE>';
                                                    const backupStr = backupVal !== undefined ? String(backupVal.data) : '<NOT IN BACKUP>';

                                                    // If live prefix only has unhashed hex (e.g. 15ABE8AE2B5E) but backup has the string (e.g. Favorites)
                                                    if (currentVal && typeof backupVal?.data === 'string' && typeof currentVal.data === 'string' && /^[0-9A-Fa-f]+$/.test(currentVal.data)) {
                                                        // They represent the same underlying preference
                                                        currentStr = backupStr;
                                                    }

                                                    const isDifferent = currentStr !== backupStr;

                                                    return (
                                                        <tr key={key} className={`font-mono transition-colors ${isDifferent ? 'bg-amber-500/10' : 'hover:bg-accent/30'}`}>
                                                            <td className="p-2.5 font-sans font-medium max-w-56 truncate" title={key}>
                                                                <span className="flex items-center gap-1.5">
                                                                    <KeyIcon className="size-3.5 shrink-0 text-primary/70" />
                                                                    {key}
                                                                </span>
                                                            </td>
                                                            <td className={`p-2.5 max-w-xs truncate ${currentVal === undefined ? 'text-destructive font-bold' : 'text-muted-foreground'}`} title={currentStr}>
                                                                {currentStr}
                                                            </td>
                                                            <td className={`p-2.5 max-w-xs truncate ${backupVal === undefined ? 'text-destructive font-bold' : isDifferent ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-muted-foreground'}`} title={backupStr}>
                                                                {backupStr}
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                // Single view mode (Current Live selected)
                                                return (
                                                    <tr key={key} className="hover:bg-accent/30 font-mono">
                                                        <td className="p-2.5 font-sans font-medium max-w-64 truncate" title={key}>
                                                            <span className="flex items-center gap-1.5">
                                                                <KeyIcon className="size-3.5 shrink-0 text-emerald-500" />
                                                                {key}
                                                            </span>
                                                        </td>
                                                        <td className="p-2.5 text-muted-foreground">
                                                            {backupVal?.type === 4 ? 'DWORD' : backupVal?.type === 1 ? 'String' : `Hex(${backupVal?.type})`}
                                                        </td>
                                                        <td className="p-2.5 max-w-md truncate text-muted-foreground" title={String(backupVal?.data)}>
                                                            {String(backupVal?.data)}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                            Select a backup from the sidebar to compare or view its contents.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
