import { useEffect, useState, useMemo } from 'react';
import { ExportDropdown } from '@/components/ExportDropdown';
import { FilterInput } from '@/components/FilterInput';
import { PageHeader, PageShell } from '@/components/layout/PageHeader';
import { StatusBanner } from '@/components/StatusBanner';
import { Button } from '@/ui/button';
import {
    TerminalIcon,
    RefreshCwIcon,
    SaveIcon,
    CheckIcon,
    PowerIcon,
    InfoIcon,
    LayersIcon,
    PlayIcon,
    SquareIcon,
    WrenchIcon,
    ChevronDownIcon
} from 'lucide-react';

import {
    fetchLaunchOptions,
    saveLaunchOptionsApi,
    saveCompatToolApi,
    stopSteamApi,
    startSteamApi,
    fetchCmdLineDefinitions,
    fetchEnvDefinitions,
    toErrorMessage
} from '@/api/client';
import type { CmdLineDefinition, CompatTool } from '@/types';

// ---------------------------------------------------------------------------
// Helpers: parse the raw launch options string into structured parts
// ---------------------------------------------------------------------------

interface ParsedLaunchOptions {
    /** ENV_VAR=value pairs that appear before %command% */
    envVars: Record<string, string>;
    /** Boolean-style flag args like --enable-debug-gui */
    flags: Set<string>;
    /** Key=value args like --fps=144 */
    kvArgs: Record<string, string>;
    /** true if %command% is present */
    hasCommand: boolean;
    /** Everything that couldn't be parsed (preserves wrappers like gamemoderun, mangohud) */
    unparsed: string[];
}

function parseLaunchOptions(raw: string): ParsedLaunchOptions {
    const envVars: Record<string, string> = {};
    const flags = new Set<string>();
    const kvArgs: Record<string, string> = {};
    let hasCommand = false;
    const unparsed: string[] = [];

    const tokens = raw.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];

    for (const token of tokens) {
        if (token === '%command%') {
            hasCommand = true;
            continue;
        }

        // ENV_VAR=value (all-caps key, no leading --)
        if (/^[A-Z_][A-Z0-9_]*=/.test(token)) {
            const eq = token.indexOf('=');
            envVars[token.slice(0, eq)] = token.slice(eq + 1);
            continue;
        }

        // --flag=value or -flag=value
        if (/^--?[a-zA-Z][\w-]+=/.test(token)) {
            const eq = token.indexOf('=');
            kvArgs[token.slice(0, eq)] = token.slice(eq + 1);
            continue;
        }

        // --flag or -flag (no value)
        if (/^--?[a-zA-Z]/.test(token)) {
            flags.add(token);
            continue;
        }

        unparsed.push(token);
    }

    return { envVars, flags, kvArgs, hasCommand, unparsed };
}

/** Re-serialize parsed options back to a raw string */
function serializeLaunchOptions(parsed: ParsedLaunchOptions): string {
    const parts: string[] = [];

    // Env vars first
    for (const [k, v] of Object.entries(parsed.envVars)) {
        parts.push(v ? `${k}=${v}` : `${k}=`);
    }

    // Wrappers / unparsed tokens (e.g. gamemoderun, mangohud)
    for (const t of parsed.unparsed) {
        if (!parts.includes(t)) parts.push(t);
    }

    // %command%
    if (parsed.hasCommand) parts.push('%command%');

    // kv args
    for (const [k, v] of Object.entries(parsed.kvArgs)) {
        parts.push(`${k}=${v}`);
    }

    // boolean flags
    for (const f of parsed.flags) {
        parts.push(f);
    }

    return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandLinePage() {
    // Raw string state (kept in sync with parsed state)
    const [rawLaunchOptions, setRawLaunchOptions] = useState<string>('');
    const [filePath, setFilePath] = useState<string>('');
    const [steamRunning, setSteamRunning] = useState<boolean>(false);

    // Compat tool state — savedCompatTool = what's on disk, compatTool = staged selection
    const [savedCompatTool, setSavedCompatTool] = useState<string>('');
    const [compatTool, setCompatTool] = useState<string>('');
    const [availableCompatTools, setAvailableCompatTools] = useState<CompatTool[]>([]);
    const [compatToolDropdownOpen, setCompatToolDropdownOpen] = useState(false);

    // CSV definitions
    const [cmdDefs, setCmdDefs] = useState<Record<string, CmdLineDefinition>>({});
    const [envDefs, setEnvDefs] = useState<Record<string, CmdLineDefinition>>({});

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // Filter state for each column
    const [envFilter, setEnvFilter] = useState('');
    const [cmdFilter, setCmdFilter] = useState('');

    // Baseline saved values for dirty detection
    const [savedLaunchOptions, setSavedLaunchOptions] = useState<string>('');

    // Dialog states (single shared flow for stop/restart — covers both saves)
    const [showStopDialog, setShowStopDialog] = useState(false);
    const [showRestartDialog, setShowRestartDialog] = useState(false);
    const [pendingSave, setPendingSave] = useState<{ launchOpts: string; compatTool: string } | null>(null);

    // Dirty = either launch options or compat tool have changed from what's saved
    const isDirty = rawLaunchOptions !== savedLaunchOptions || compatTool !== savedCompatTool;

    // ---------------------------------------------------------------------------
    // Derived parsed state — kept live as rawLaunchOptions changes
    // ---------------------------------------------------------------------------
    const parsed = useMemo(() => parseLaunchOptions(rawLaunchOptions), [rawLaunchOptions]);

    /**
     * One flat row per known env var / flag, with whether it is currently on
     * and the value in effect — the same information the two columns show.
     */
    const exportRows = useMemo(() => {
        const envRows = Object.values(envDefs ?? {}).map((def) => ({
            kind: 'env' as const,
            name: def.keyName,
            active: parsed.envVars[def.keyName] !== undefined,
            value: parsed.envVars[def.keyName] ?? '',
            default: def.defaultValue ?? '',
            description: def.description ?? ''
        }));
        const flagRows = Object.values(cmdDefs ?? {}).map((def) => ({
            kind: 'flag' as const,
            name: def.keyName,
            active: parsed.flags.has(def.keyName) || parsed.kvArgs[def.keyName] !== undefined,
            value: parsed.kvArgs[def.keyName] ?? '',
            default: def.defaultValue ?? '',
            description: def.description ?? ''
        }));
        return [...envRows, ...flagRows];
    }, [envDefs, cmdDefs, parsed]);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [data, cmds, envs] = await Promise.all([
                fetchLaunchOptions(),
                fetchCmdLineDefinitions().catch(() => ({})),
                fetchEnvDefinitions().catch(() => ({}))
            ]);

            const lo = data.rawLaunchOptions || '';
            const ct = data.compatTool || '';
            setRawLaunchOptions(lo);
            setSavedLaunchOptions(lo);
            setFilePath(data.filePath || '');
            setSteamRunning(data.steamRunning || false);
            setCompatTool(ct);
            setSavedCompatTool(ct);
            setAvailableCompatTools(data.availableCompatTools || []);
            setCmdDefs(cmds || {});
            setEnvDefs(envs || {});
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    // ---------------------------------------------------------------------------
    // Toggle helpers — mutate parsed and re-serialize
    // ---------------------------------------------------------------------------

    const toggleEnvVar = (varName: string, def: CmdLineDefinition) => {
        const next = parseLaunchOptions(rawLaunchOptions);
        if (next.envVars[varName] !== undefined) {
            delete next.envVars[varName];
        } else {
            next.envVars[varName] = def.defaultValue || '1';
        }
        setRawLaunchOptions(serializeLaunchOptions(next));
    };

    const toggleFlag = (flag: string) => {
        const next = parseLaunchOptions(rawLaunchOptions);
        // e.g. --fps from --fps=90. split always yields at least one element.
        const flagBase = flag.split('=')[0] ?? flag;
        if (next.flags.has(flag) || next.kvArgs[flagBase] !== undefined) {
            next.flags.delete(flag);
            delete next.kvArgs[flagBase];
        } else {
            next.flags.add(flag);
        }
        setRawLaunchOptions(serializeLaunchOptions(next));
    };

    const isEnvActive = (varName: string) => parsed.envVars[varName] !== undefined;
    const isFlagActive = (flag: string) => {
        const base = flag.split('=')[0] ?? flag;
        return parsed.flags.has(flag) || parsed.kvArgs[base] !== undefined;
    };

    // ---------------------------------------------------------------------------
    // Unified save flow — saves both launch options and compat tool together
    // ---------------------------------------------------------------------------
    const handleSaveInitiate = () => {
        setPendingSave({ launchOpts: rawLaunchOptions, compatTool });
        if (steamRunning) {
            setShowStopDialog(true);
        } else {
            executeSave(false, false);
        }
    };

    const handleStopDialogChoice = (shouldStop: boolean) => {
        setShowStopDialog(false);
        if (shouldStop) {
            setShowRestartDialog(true);
        } else {
            executeSave(false, false);
        }
    };

    const handleRestartDialogChoice = (shouldRestart: boolean) => {
        setShowRestartDialog(false);
        executeSave(true, shouldRestart);
    };

    const executeSave = async (stopSteamFirst: boolean, restartSteamAfter: boolean) => {
        if (!pendingSave) return;
        const { launchOpts, compatTool: pendingTool } = pendingSave;
        try {
            setSaving(true);
            setError(null);

            if (stopSteamFirst) {
                await stopSteamApi();
                await new Promise((r) => setTimeout(r, 2500));
            }

            const messages: string[] = [];

            if (launchOpts !== savedLaunchOptions) {
                const res = await saveLaunchOptionsApi(launchOpts, false, false);
                messages.push(res.message);
                setSavedLaunchOptions(launchOpts);
            }

            if (pendingTool !== savedCompatTool) {
                const res = await saveCompatToolApi(pendingTool, false, false);
                messages.push(res.message);
                setSavedCompatTool(pendingTool);
            }

            if (restartSteamAfter) await startSteamApi();

            setStatusMessage(messages.join(' ') || 'No changes to save.');
            setTimeout(() => setStatusMessage(null), 4000);
            await loadData();
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setSaving(false);
            setPendingSave(null);
        }
    };

    // Compat tool selection — just stages the value, no immediate save
    const handleCompatToolSelect = (toolName: string) => {
        setCompatToolDropdownOpen(false);
        setCompatTool(toolName);
    };

    // Selected tool display name
    const currentToolDisplay = (availableCompatTools.find((t) => t.name === compatTool)?.displayName ?? compatTool) || 'None / Default';

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (
        <PageShell onClick={() => setCompatToolDropdownOpen(false)}>
            <PageHeader
                icon={TerminalIcon}
                title="VRChat Steam Launch Options & Environment Manager"
                description={filePath || 'userdata/.../config/localconfig.vdf'}
                mono
                actions={
                    <>
                    {/* Steam status pill: green=closed (safe to edit), red=running (risky) */}
                    <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        steamRunning
                            ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    }`}>
                        <PowerIcon className="size-3.5" />
                        Steam
                    </span>

                    {/* Compat tool dropdown — inline in header */}
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={() => setCompatToolDropdownOpen((o) => !o)}
                            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 max-w-[220px] ${
                                compatTool !== savedCompatTool
                                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400'
                                    : 'bg-background'
                            }`}
                            title={`Compatibility tool: ${currentToolDisplay}${compatTool !== savedCompatTool ? ' (unsaved)' : ''}`}
                        >
                            <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="font-mono truncate">{currentToolDisplay}</span>
                            {compatTool !== savedCompatTool && <span className="size-1.5 rounded-full bg-amber-500 shrink-0" />}
                            <ChevronDownIcon className={`size-3.5 shrink-0 transition-transform ${compatToolDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {compatToolDropdownOpen && (
                            <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-xl border bg-card shadow-2xl overflow-hidden">
                                <div className="max-h-64 overflow-y-auto py-1">
                                    <button
                                        onClick={() => handleCompatToolSelect('')}
                                        className={`w-full text-left px-3.5 py-2 text-xs font-mono hover:bg-muted/60 transition-colors flex items-center justify-between ${compatTool === '' ? 'text-primary font-semibold' : ''}`}
                                    >
                                        <span>None / Default</span>
                                        {compatTool === '' && <CheckIcon className="size-3.5" />}
                                    </button>
                                    <div className="border-t my-1" />
                                    {availableCompatTools.map((tool) => (
                                        <button
                                            key={tool.name}
                                            onClick={() => handleCompatToolSelect(tool.name)}
                                            className={`w-full text-left px-3.5 py-2 text-xs font-mono hover:bg-muted/60 transition-colors flex items-center justify-between ${compatTool === tool.name ? 'text-primary font-semibold bg-primary/5' : ''}`}
                                            title={tool.path}
                                        >
                                            <span className="truncate">{tool.displayName}</span>
                                            {compatTool === tool.name && <CheckIcon className="size-3.5 shrink-0" />}
                                        </button>
                                    ))}
                                    {availableCompatTools.length === 0 && (
                                        <div className="px-3.5 py-2 text-xs text-muted-foreground italic">No tools found</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <ExportDropdown
                        title="Launch Options & Environment"
                        filenamePrefix="launch_options"
                        data={exportRows}
                    />
                    <Button variant="secondary" onClick={loadData}>
                        <RefreshCwIcon className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </Button>
                    <Button
                        onClick={handleSaveInitiate}
                        disabled={saving || !isDirty}
                        className={isDirty ? 'ring-primary/50 ring-offset-background animate-pulse ring-2 ring-offset-1' : ''}
                    >
                        <SaveIcon className={saving ? 'animate-spin' : ''} />
                        Save{isDirty ? ' *' : ''}
                    </Button>
                    </>
                }
            />

            {error && <StatusBanner>{error}</StatusBanner>}
            {statusMessage && <StatusBanner variant="success">{statusMessage}</StatusBanner>}

            <div className="flex flex-col gap-4 min-h-0 flex-1">

                {/* Raw Launch Options textarea */}
                <div className="rounded-xl border bg-card p-4 shadow-xs">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center justify-between">
                        <span>Steam Launch Options String</span>
                        <span className="flex items-center gap-2">
                            <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${parsed.hasCommand ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'}`}>
                                {parsed.hasCommand ? '%command% present ✓' : '%command% missing — Steam will append it automatically'}
                            </span>
                            <span className="font-mono text-[0.7rem] text-primary">Saved to localconfig.vdf</span>
                        </span>
                    </label>
                    <textarea
                        value={rawLaunchOptions}
                        onChange={(e) => setRawLaunchOptions(e.target.value)}
                        className="w-full h-20 font-mono text-xs bg-muted/40 p-3 rounded-lg border outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                        placeholder={`e.g. PROTON_LOG=1 %command% --enable-debug-gui`}
                    />
                    <p className="text-[0.68rem] text-muted-foreground mt-1">
                        <strong>%command%</strong> is replaced by Steam with the actual game executable path at launch. You don't need it for simple flags — Steam appends it automatically. Use it when running wrappers like <code>gamemoderun %command%</code> or setting env vars before it.
                    </p>
                </div>

                <div className="flex flex-1 gap-6 min-h-0">
                    {/* Environment Variables column */}
                    <div className="flex-1 flex flex-col rounded-xl border bg-card p-4 shadow-xs min-h-0">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5 border-b pb-2">
                            <LayersIcon className="size-4 text-emerald-500" /> Environment Variables
                            <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">env.csv</span>
                        </h2>
                        {/* Filter bar */}
                        <FilterInput
                            value={envFilter}
                            onChange={setEnvFilter}
                            placeholder="Filter env vars…"
                            className="mb-2.5 sm:max-w-none"
                        />
                        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                            {Object.values(envDefs ?? {})
                                .sort((a, b) => {
                                    const aOn = isEnvActive(a.keyName) ? 0 : 1;
                                    const bOn = isEnvActive(b.keyName) ? 0 : 1;
                                    return aOn - bOn;
                                })
                                .filter((item) => {
                                    if (!envFilter) return true;
                                    const q = envFilter.toLowerCase();
                                    return item.keyName.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
                                })
                                .map((item) => {
                                const active = isEnvActive(item.keyName);
                                return (
                                    <div
                                        key={item.keyName}
                                        onClick={() => toggleEnvVar(item.keyName, item)}
                                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                            active ? 'bg-emerald-500/10 border-emerald-500/40 shadow-2xs' : 'bg-background hover:bg-muted/50 border-border/60'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-xs font-bold text-foreground">{item.keyName}</span>
                                                {active && parsed.envVars[item.keyName] && (
                                                    <span className="font-mono text-[0.65rem] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                        ={parsed.envVars[item.keyName]}
                                                    </span>
                                                )}
                                                <span className="rounded bg-primary/10 px-1.5 py-0.2 font-mono text-[0.65rem] font-bold text-primary">
                                                    {item.valueType}
                                                </span>
                                            </div>
                                            <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                active ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'
                                            }`}>
                                                {active ? 'ON' : 'OFF'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1 whitespace-pre-line">
                                            <InfoIcon className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                                            <span>{item.description}</span>
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Command Line Flags column */}
                    <div className="flex-1 flex flex-col rounded-xl border bg-card p-4 shadow-xs min-h-0">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5 border-b pb-2">
                            <TerminalIcon className="size-4 text-primary" /> Command Line Flags
                            <span className="ml-auto font-mono text-[0.65rem] text-muted-foreground">cmdline.csv</span>
                        </h2>
                        {/* Filter bar */}
                        <FilterInput
                            value={cmdFilter}
                            onChange={setCmdFilter}
                            placeholder="Filter flags…"
                            className="mb-2.5 sm:max-w-none"
                        />
                        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                            {Object.values(cmdDefs ?? {})
                                .sort((a, b) => {
                                    const aOn = isFlagActive(a.keyName) ? 0 : 1;
                                    const bOn = isFlagActive(b.keyName) ? 0 : 1;
                                    return aOn - bOn;
                                })
                                .filter((item) => {
                                    if (!cmdFilter) return true;
                                    const q = cmdFilter.toLowerCase();
                                    return item.keyName.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
                                })
                                .map((item) => {
                                const active = isFlagActive(item.keyName);
                                return (
                                    <div
                                        key={item.keyName}
                                        onClick={() => toggleFlag(item.keyName)}
                                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                            active ? 'bg-primary/10 border-primary/40 shadow-2xs' : 'bg-background hover:bg-muted/50 border-border/60'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-xs font-bold text-foreground">{item.keyName}</span>
                                                <span className="rounded bg-primary/10 px-1.5 py-0.2 font-mono text-[0.65rem] font-bold text-primary">
                                                    {item.valueType}
                                                </span>
                                            </div>
                                            <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                                active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                                            }`}>
                                                {active ? 'ON' : 'OFF'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1 whitespace-pre-line">
                                            <InfoIcon className="size-3 text-muted-foreground shrink-0 mt-0.5" />
                                            <span>{item.description}</span>
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Dialog: Stop Steam before saving */}
            {showStopDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl space-y-4">
                        <div className="flex items-center gap-3 text-amber-500">
                            <SquareIcon className="size-6 shrink-0" />
                            <h3 className="text-base font-semibold text-foreground">Steam Process Active</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Steam is currently running. Would you like to gracefully stop it before saving?
                        </p>
                        <div className="flex items-center justify-between pt-2 border-t">
                            <button
                                onClick={() => { setShowStopDialog(false); setPendingSave(null); }}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="flex gap-2">
                                <button onClick={() => handleStopDialogChoice(false)} className="px-3.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-accent transition-colors">
                                    No, Save Directly
                                </button>
                                <button onClick={() => handleStopDialogChoice(true)} className="px-3.5 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors">
                                    Yes, Stop Steam
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Dialog: Restart Steam after saving */}
            {showRestartDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-2xl space-y-4">
                        <div className="flex items-center gap-3 text-emerald-500">
                            <PlayIcon className="size-6 shrink-0" />
                            <h3 className="text-base font-semibold text-foreground">Restart Steam?</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Steam will be gracefully closed. Would you like to automatically restart it once saving finishes?
                        </p>
                        <div className="flex items-center justify-between pt-2 border-t">
                            <button
                                onClick={() => { setShowRestartDialog(false); setPendingSave(null); }}
                                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="flex gap-2">
                                <button onClick={() => handleRestartDialogChoice(false)} className="px-3.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-accent transition-colors">
                                    No, Keep Closed
                                </button>
                                <button onClick={() => handleRestartDialogChoice(true)} className="px-3.5 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors">
                                    Yes, Restart Steam
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </PageShell>
    );
}
