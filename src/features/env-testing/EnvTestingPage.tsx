import { useEffect, useState } from 'react';
import { PageHeader, PageShell } from '@/components/layout/PageHeader';
import { StatusBanner } from '@/components/StatusBanner';
import { Button } from '@/ui/button';
import {
    FlaskConicalIcon,
    PlayIcon,
    RefreshCwIcon,
    WrenchIcon,
    LayersIcon,
    CheckCircle2Icon,
    ShieldCheckIcon,
    PowerIcon,
    InfoIcon
} from 'lucide-react';

import {
    fetchLaunchOptions,
    launchEnvTestWindowApi,
    stopSteamApi,
    startSteamApi,
    toErrorMessage
} from '@/api/client';
import type { CompatTool, EnvTestingLaunchResponse } from '@/types';

export function EnvTestingPage() {
    const [compatTools, setCompatTools] = useState<CompatTool[]>([]);
    const [selectedTool, setSelectedTool] = useState<string>('');
    const [cmdString, setCmdString] = useState<string>(
        'WINEDLLOVERRIDES="iyuv_32=" G_TLS_GNUTLS_PRIORITY=NORMAL %command% --enable-avpro-in-proton --disable-hw-video-decoding'
    );
    const [worldId, setWorldId] = useState<string>('wrld_a2fd9533-5c69-400b-a34e-ae0c11df99e1');

    const [steamRunning, setSteamRunning] = useState<boolean>(false);
    const [restartSteam, setRestartSteam] = useState<boolean>(true);

    const [loadingTools, setLoadingTools] = useState<boolean>(true);
    const [launching, setLaunching] = useState<boolean>(false);
    const [togglingSteam, setTogglingSteam] = useState<boolean>(false);
    const [launchResult, setLaunchResult] = useState<EnvTestingLaunchResponse | null>(null);

    const [bannerMessage, setBannerMessage] = useState<string | null>(null);
    const [bannerType, setBannerType] = useState<'success' | 'error'>('success');

    useEffect(() => {
        loadTools();
    }, []);

    async function loadTools() {
        setLoadingTools(true);
        try {
            const data = await fetchLaunchOptions();
            setCompatTools(data.availableCompatTools || []);
            setSteamRunning(Boolean(data.steamRunning));

            if (data.compatTool) {
                setSelectedTool(data.compatTool);
            } else if (data.availableCompatTools && data.availableCompatTools.length > 0) {
                setSelectedTool(data.availableCompatTools[0]?.name || '');
            }
        } catch (err: unknown) {
            setBannerMessage(`Failed to load installed Proton tools: ${toErrorMessage(err)}`);
            setBannerType('error');
        } finally {
            setLoadingTools(false);
        }
    }

    async function handleToggleSteam() {
        setTogglingSteam(true);
        setBannerMessage(null);
        try {
            if (steamRunning) {
                await stopSteamApi();
                setSteamRunning(false);
                setBannerMessage('Steam process shut down successfully.');
                setBannerType('success');
            } else {
                await startSteamApi();
                setSteamRunning(true);
                setBannerMessage('Steam launcher started.');
                setBannerType('success');
            }
        } catch (err: unknown) {
            setBannerMessage(`Failed to toggle Steam: ${toErrorMessage(err)}`);
            setBannerType('error');
        } finally {
            setTogglingSteam(false);
        }
    }

    async function handleLaunchTestWindow() {
        setLaunching(true);
        setLaunchResult(null);
        setBannerMessage(null);
        try {
            const targetWorldId = worldId.trim() || 'wrld_a2fd9533-5c69-400b-a34e-ae0c11df99e1';

            const res = await launchEnvTestWindowApi(selectedTool, cmdString, targetWorldId, restartSteam);
            setLaunchResult(res);
            setBannerMessage(
                'VRChat test window launched! Permanent Steam configuration backed up to RAM and restored.'
            );
            setBannerType('success');
        } catch (err: unknown) {
            setBannerMessage(`Failed to spawn VRChat test window: ${toErrorMessage(err)}`);
            setBannerType('error');
        } finally {
            setLaunching(false);
            // Refresh steam status
            loadTools();
        }
    }

    return (
        <PageShell>
            <PageHeader
                title="Environment Testing"
                description="Launch temporary VRChat test instances with custom Proton tools and Steam launch command strings without modifying your permanent Steam settings."
                icon={FlaskConicalIcon}
                actions={
                    <div className="flex gap-2">
                        <Button
                            variant={steamRunning ? 'destructive' : 'default'}
                            size="sm"
                            onClick={handleToggleSteam}
                            disabled={togglingSteam}
                        >
                            <PowerIcon className="mr-2 h-4 w-4" />
                            {steamRunning ? 'Stop Steam' : 'Start Steam'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={loadTools} disabled={loadingTools}>
                            <RefreshCwIcon className={`mr-2 h-4 w-4 ${loadingTools ? 'animate-spin' : ''}`} />
                            Reload
                        </Button>
                    </div>
                }
            />

            {bannerMessage && (
                <div className="mb-4">
                    <StatusBanner variant={bannerType}>
                        {bannerMessage}
                    </StatusBanner>
                </div>
            )}

            <div className="space-y-6">
                {/* Steam Status Banner */}
                {steamRunning && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                        <InfoIcon className="h-4 w-4 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-semibold">Steam is currently running.</span> Steam caches compatibility configuration in memory while active. When launching a test instance, Steam will automatically restart to apply the temporary configuration cleanly.
                        </div>
                    </div>
                )}

                {/* Configuration Panel */}
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-card-foreground flex items-center gap-2">
                            <WrenchIcon className="h-5 w-5 text-primary" />
                            Temporary Environment Configuration
                        </h2>
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                            <ShieldCheckIcon className="h-3.5 w-3.5" />
                            RAM Backup Protection Active (Non-Permanent)
                        </span>
                    </div>

                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        {/* Proton Tool Dropdown */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground flex items-center gap-2">
                                <LayersIcon className="h-4 w-4 text-muted-foreground" />
                                Proton Compatibility Tool
                            </label>
                            <select
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                value={selectedTool}
                                onChange={(e) => setSelectedTool(e.target.value)}
                                disabled={loadingTools}
                            >
                                <option value="">Default System Proton</option>
                                {compatTools.map((tool) => (
                                    <option key={tool.name} value={tool.name}>
                                        {tool.displayName} ({tool.name})
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-muted-foreground">
                                Select Proton compatibility tool for this test instance.
                            </p>
                        </div>

                        {/* World ID */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground flex items-center gap-2">
                                <FlaskConicalIcon className="h-4 w-4 text-muted-foreground" />
                                Target World ID
                            </label>
                            <input
                                type="text"
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                value={worldId}
                                onChange={(e) => setWorldId(e.target.value)}
                                placeholder="wrld_a2fd9533-5c69-400b-a34e-ae0c11df99e1"
                            />
                            <p className="text-xs text-muted-foreground">
                                VRChat world ID to join upon startup.
                            </p>
                        </div>

                        {/* Full Steam Launch Command */}
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground flex items-center justify-between">
                                <span>Steam Launch Command (Full String)</span>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        className="text-xs text-primary hover:underline font-mono"
                                        onClick={() => setCmdString('WINEDLLOVERRIDES="iyuv_32=" %command% --enable-hw-video-decoding')}
                                    >
                                        + Combination #1 (GE-Proton9-25)
                                    </button>
                                    <button
                                        type="button"
                                        className="text-xs text-primary hover:underline font-mono"
                                        onClick={() => setCmdString('WINEDLLOVERRIDES="iyuv_32=" G_TLS_GNUTLS_PRIORITY=NORMAL %command% --enable-avpro-in-proton --disable-hw-video-decoding')}
                                    >
                                        + Combination #2 (Proton-GE RTSP)
                                    </button>
                                </div>
                            </label>
                            <input
                                type="text"
                                className="w-full font-mono text-xs rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                value={cmdString}
                                onChange={(e) => setCmdString(e.target.value)}
                                placeholder="WINEDLLOVERRIDES=iyuv_32= %command% --enable-hw-video-decoding"
                            />
                            <p className="text-xs text-muted-foreground">
                                Exact launch options string as stored in Steam <code className="text-primary font-mono">localconfig.vdf</code> (including environment variables, wrappers, <code className="text-primary font-mono">%command%</code>, and flags).
                            </p>
                        </div>
                    </div>

                    {/* Steam Restart Toggle */}
                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                            <input
                                type="checkbox"
                                checked={restartSteam}
                                onChange={(e) => setRestartSteam(e.target.checked)}
                                className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                            />
                            Automatically restart Steam if running to guarantee configuration reload
                        </label>
                    </div>

                    {/* Launch Action Button */}
                    <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-border">
                        <Button
                            variant="default"
                            onClick={handleLaunchTestWindow}
                            disabled={launching}
                        >
                            <PlayIcon className={`mr-2 h-4 w-4 ${launching ? 'animate-spin' : ''}`} />
                            {launching ? 'Spawning VRChat Test Window...' : 'Launch Temporary VRChat Instance'}
                        </Button>
                    </div>
                </div>

                {/* Launch Confirmation Display */}
                {launchResult && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-2 text-emerald-600 font-semibold">
                            <CheckCircle2Icon className="h-5 w-5" />
                            VRChat Test Instance Spawned
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">{launchResult.message}</p>

                        <div className="space-y-2 text-xs font-mono bg-card p-4 rounded-lg border border-border">
                            <div>
                                <span className="text-muted-foreground">Original Proton Tool Restored from RAM : </span>
                                <span className="text-foreground font-semibold">{launchResult.originalToolRestored || '(Default)'}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Original LaunchOptions Restored      : </span>
                                <span className="text-foreground font-semibold">{launchResult.originalOptionsRestored || '(Unset)'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </PageShell>
    );
}
