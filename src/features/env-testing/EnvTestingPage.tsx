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
    XCircleIcon,
    InfoIcon,
    ShieldCheckIcon
} from 'lucide-react';

import {
    fetchLaunchOptions,
    runSingleEnvTestApi,
    launchEnvTestWindowApi,
    toErrorMessage
} from '@/api/client';
import type { CompatTool, EnvTestingRunResult, EnvTestingLaunchResponse } from '@/types';

export function EnvTestingPage() {
    const [compatTools, setCompatTools] = useState<CompatTool[]>([]);
    const [selectedTool, setSelectedTool] = useState<string>('');
    const [envVars, setEnvVars] = useState<string>('WINEDLLOVERRIDES=iyuv_32= G_TLS_GNUTLS_PRIORITY=NORMAL');
    const [cmdArgs, setCmdArgs] = useState<string>('--enable-avpro-in-proton --disable-hw-video-decoding');
    const [worldOrUrl, setWorldOrUrl] = useState<string>('wrld_a2fd9533-5c69-400b-a34e-ae0c11df99e1');

    const [loadingTools, setLoadingTools] = useState<boolean>(true);
    const [testing, setTesting] = useState<boolean>(false);
    const [launching, setLaunching] = useState<boolean>(false);

    const [testResult, setTestResult] = useState<EnvTestingRunResult | null>(null);
    const [launchResult, setLaunchResult] = useState<EnvTestingLaunchResponse | null>(null);

    const [bannerMessage, setBannerMessage] = useState<string | null>(null);
    const [bannerType, setBannerType] = useState<'success' | 'error' | 'warning' | 'info'>('info');

    useEffect(() => {
        loadTools();
    }, []);

    async function loadTools() {
        setLoadingTools(true);
        try {
            const data = await fetchLaunchOptions();
            setCompatTools(data.availableCompatTools || []);
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

    async function handleRunSingleTest() {
        setTesting(true);
        setTestResult(null);
        setBannerMessage(null);
        try {
            const res = await runSingleEnvTestApi(selectedTool, envVars, cmdArgs, worldOrUrl);
            setTestResult(res);
            if (res.success) {
                setBannerMessage(`Test passed! Stream decoded cleanly in ${res.elapsed_ms.toFixed(0)}ms.`);
                setBannerType('success');
            } else {
                setBannerMessage(`Test failed (${res.hresult}). Solution: ${res.solution || 'Inspect logs'}`);
                setBannerType('warning');
            }
        } catch (err: unknown) {
            setBannerMessage(`Single test execution error: ${toErrorMessage(err)}`);
            setBannerType('error');
        } finally {
            setTesting(false);
        }
    }

    async function handleLaunchTestWindow() {
        setLaunching(true);
        setLaunchResult(null);
        setBannerMessage(null);
        try {
            const targetWorldId = worldOrUrl.startsWith('wrld_')
                ? worldOrUrl
                : 'wrld_a2fd9533-5c69-400b-a34e-ae0c11df99e1';

            const res = await launchEnvTestWindowApi(selectedTool, envVars, cmdArgs, targetWorldId);
            setLaunchResult(res);
            setBannerMessage(
                `VRChat test window launched! Permanent Steam settings backed up to RAM and restored cleanly.`
            );
            setBannerType('success');
        } catch (err: unknown) {
            setBannerMessage(`Failed to spawn VRChat test window: ${toErrorMessage(err)}`);
            setBannerType('error');
        } finally {
            setLaunching(false);
        }
    }

    return (
        <PageShell>
            <PageHeader
                title="Environment Testing"
                description="Sandbox for testing Proton compatibility tools, environment variables, launch options, and stream URLs in real-time without permanently altering Steam settings."
                icon={FlaskConicalIcon}
                actions={
                    <Button variant="outline" size="sm" onClick={loadTools} disabled={loadingTools}>
                        <RefreshCwIcon className={`mr-2 h-4 w-4 ${loadingTools ? 'animate-spin' : ''}`} />
                        Reload Tools
                    </Button>
                }
            />

            {bannerMessage && (
                <div className="mb-4">
                    <StatusBanner variant={bannerType === 'error' ? 'error' : 'success'}>
                        {bannerMessage}
                    </StatusBanner>
                </div>
            )}

            <div className="space-y-6">
                {/* Configuration Panel */}
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-card-foreground flex items-center gap-2">
                            <WrenchIcon className="h-5 w-5 text-primary" />
                            Compatibility Test Configuration
                        </h2>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full border border-border">
                            <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-500" />
                            RAM Backup Protection Active
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
                                Select installed Proton version to test.
                            </p>
                        </div>

                        {/* World ID or Video Stream URL */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground flex items-center gap-2">
                                <FlaskConicalIcon className="h-4 w-4 text-muted-foreground" />
                                World ID or Stream URL
                            </label>
                            <input
                                type="text"
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                value={worldOrUrl}
                                onChange={(e) => setWorldOrUrl(e.target.value)}
                                placeholder="wrld_... or https://..."
                            />
                            <p className="text-xs text-muted-foreground">
                                Target VRChat world ID or video stream URL for playback test.
                            </p>
                        </div>

                        {/* Environment Variables Input */}
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground flex items-center justify-between">
                                <span>Environment Variables</span>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        className="text-xs text-primary hover:underline"
                                        onClick={() => setEnvVars('WINEDLLOVERRIDES=iyuv_32= G_TLS_GNUTLS_PRIORITY=NORMAL')}
                                    >
                                        + Preset: Recommended
                                    </button>
                                    <button
                                        type="button"
                                        className="text-xs text-primary hover:underline"
                                        onClick={() => setEnvVars('G_TLS_GNUTLS_PRIORITY=NORMAL')}
                                    >
                                        + Preset: GnuTLS Normal
                                    </button>
                                </div>
                            </label>
                            <input
                                type="text"
                                className="w-full font-mono text-xs rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                value={envVars}
                                onChange={(e) => setEnvVars(e.target.value)}
                                placeholder="WINEDLLOVERRIDES=iyuv_32= G_TLS_GNUTLS_PRIORITY=NORMAL"
                            />
                            <p className="text-xs text-muted-foreground">
                                Space-separated KEY=VALUE pairs passed to Proton runtime environment.
                            </p>
                        </div>

                        {/* Launch Flags / Command Line Arguments */}
                        <div className="space-y-2 md:col-span-2">
                            <label className="text-sm font-medium text-foreground flex items-center justify-between">
                                <span>Command Line Launch Flags</span>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        className="text-xs text-primary hover:underline"
                                        onClick={() => setCmdArgs('--enable-avpro-in-proton --disable-hw-video-decoding')}
                                    >
                                        + Preset: AVPro + SW Decode
                                    </button>
                                </div>
                            </label>
                            <input
                                type="text"
                                className="w-full font-mono text-xs rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                                value={cmdArgs}
                                onChange={(e) => setCmdArgs(e.target.value)}
                                placeholder="--enable-avpro-in-proton --disable-hw-video-decoding"
                            />
                            <p className="text-xs text-muted-foreground">
                                Arguments passed to VRChat / harness binary.
                            </p>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-border">
                        <Button
                            variant="default"
                            onClick={handleRunSingleTest}
                            disabled={testing || launching}
                        >
                            <PlayIcon className={`mr-2 h-4 w-4 ${testing ? 'animate-spin' : ''}`} />
                            {testing ? 'Running Benchmark Test...' : 'Run Benchmark Test'}
                        </Button>

                        <Button
                            variant="secondary"
                            onClick={handleLaunchTestWindow}
                            disabled={testing || launching}
                        >
                            <FlaskConicalIcon className={`mr-2 h-4 w-4 ${launching ? 'animate-spin' : ''}`} />
                            {launching ? 'Spawning VRChat Window...' : 'Try in VRChat (Spawn Window)'}
                        </Button>
                    </div>
                </div>

                {/* Benchmark Test Result Display */}
                {testResult && (
                    <div className={`rounded-xl border p-6 shadow-sm ${testResult.success ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-md font-semibold flex items-center gap-2">
                                {testResult.success ? (
                                    <CheckCircle2Icon className="h-5 w-5 text-emerald-500" />
                                ) : (
                                    <XCircleIcon className="h-5 w-5 text-amber-500" />
                                )}
                                Single Benchmark Execution Result
                            </h3>
                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${testResult.success ? 'bg-emerald-500/20 text-emerald-600 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-600 border border-amber-500/30'}`}>
                                {testResult.success ? 'PASS' : 'FAIL'}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4 mb-4">
                            <div className="rounded-lg bg-card p-3 border border-border">
                                <span className="text-xs text-muted-foreground block">Decode Latency</span>
                                <span className="font-semibold">{testResult.elapsed_ms.toFixed(1)} ms</span>
                            </div>
                            <div className="rounded-lg bg-card p-3 border border-border">
                                <span className="text-xs text-muted-foreground block">HRESULT</span>
                                <span className="font-mono text-xs">{testResult.hresult}</span>
                            </div>
                            <div className="rounded-lg bg-card p-3 border border-border">
                                <span className="text-xs text-muted-foreground block">Error Classification</span>
                                <span className="font-medium text-amber-600">{testResult.error_type || 'None'}</span>
                            </div>
                            <div className="rounded-lg bg-card p-3 border border-border">
                                <span className="text-xs text-muted-foreground block">Attempts</span>
                                <span className="font-semibold">{testResult.attempts || 1}</span>
                            </div>
                        </div>

                        {testResult.solution && (
                            <div className="rounded-lg bg-card p-3.5 border border-border text-xs flex items-start gap-2">
                                <InfoIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-semibold block mb-0.5">Recommended Solution:</span>
                                    <span className="text-muted-foreground">{testResult.solution}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Launch Confirmation Display */}
                {launchResult && (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-2 text-emerald-600 font-semibold">
                            <CheckCircle2Icon className="h-5 w-5" />
                            VRChat Test Window Launched Successfully
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">{launchResult.message}</p>

                        <div className="space-y-2 text-xs font-mono bg-card p-4 rounded-lg border border-border">
                            <div>
                                <span className="text-muted-foreground">Original Tool Restored from RAM  : </span>
                                <span className="text-foreground font-semibold">{launchResult.originalToolRestored || '(Default)'}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Original LaunchOptions Restored   : </span>
                                <span className="text-foreground font-semibold">{launchResult.originalOptionsRestored || '(Unset)'}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </PageShell>
    );
}
