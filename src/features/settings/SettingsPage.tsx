import { useEffect, useState } from 'react';
import {
    RefreshCwIcon,
    GlobeIcon,
    RotateCcwIcon,
    CheckIcon,
    ClockIcon,
    ExternalLinkIcon,
    HardDriveIcon,
    SlidersHorizontalIcon,
    FolderIcon
} from 'lucide-react';
import {
    fetchServerSettings,
    saveServerSettings,
    clearServerDiskCache,
    prefetchAllDefinitionsAndConfig,
    DEFAULT_DEFINITION_URLS
} from '@/api/client';
import type { AppSettings, DiskCacheStatus } from '@/types';

const DEFAULT_PATHS = {
    steamDir: '/run/media/system/Data/Games/Steam',
    protonPrefix: '',
    wineBin: '',
    vrchatAppData: '',
    localConfigVdf: '',
    steamConfigVdf: '',
    compatToolsDir: ''
};

const TTL_OPTIONS = [
    { label: '0m (Off - Direct)', minutes: 0 },
    { label: '15 minutes', minutes: 15 },
    { label: '30 minutes', minutes: 30 },
    { label: '1 hour (Default)', minutes: 60 },
    { label: '2 hours', minutes: 120 },
    { label: '6 hours', minutes: 360 },
    { label: '12 hours', minutes: 720 },
    { label: '24 hours', minutes: 1440 }
];

export function SettingsPage() {
    const [settings, setSettings] = useState<AppSettings>({
        urls: DEFAULT_DEFINITION_URLS,
        paths: DEFAULT_PATHS,
        cacheTtlMinutes: 60
    });
    const [diskCache, setDiskCache] = useState<DiskCacheStatus>({ count: 0, totalSizeBytes: 0, files: [] });

    const [activeSection, setActiveSection] = useState<'cache' | 'urls' | 'paths'>('cache');
    const [savedMsg, setSavedMsg] = useState(false);
    const [clearedMsg, setClearedMsg] = useState(false);
    const [loading, setLoading] = useState(true);
    const [fetching, setFetching] = useState(false);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const data = await fetchServerSettings();
            setSettings({
                ...data.settings,
                paths: { ...DEFAULT_PATHS, ...(data.settings.paths || {}) }
            });
            setDiskCache(data.diskCache);
        } catch (err) {
            console.error('Failed to load settings from server', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSettings();
    }, []);

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        try {
            const res = await saveServerSettings(settings);
            setSettings({
                ...res.settings,
                paths: { ...DEFAULT_PATHS, ...(res.settings.paths || {}) }
            });
            setSavedMsg(true);
            setTimeout(() => setSavedMsg(false), 3000);
        } catch (err) {
            console.error('Failed to save settings', err);
        }
    };

    const handleResetUrls = async () => {
        const updated = { ...settings, urls: DEFAULT_DEFINITION_URLS };
        setSettings(updated);
        await saveServerSettings(updated);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 3000);
    };

    const handleResetPaths = async () => {
        const updated = { ...settings, paths: DEFAULT_PATHS };
        setSettings(updated);
        await saveServerSettings(updated);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 3000);
    };

    const handleClearDiskCache = async () => {
        setFetching(true);
        await clearServerDiskCache();
        await prefetchAllDefinitionsAndConfig();
        const data = await fetchServerSettings();
        setDiskCache(data.diskCache);
        setFetching(false);
        setClearedMsg(true);
        setTimeout(() => setClearedMsg(false), 3000);
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                <RefreshCwIcon className="size-4 animate-spin mr-2" /> Loading settings from config.toml...
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 max-w-4xl">
            <div>
                <h1 className="text-xl font-bold tracking-tight">Settings & Preferences</h1>
                <p className="text-sm text-muted-foreground">
                    Persisted directly to TOML configuration file on disk (<code className="font-mono text-xs">~/.config/vrcx-extras/config.toml</code>).
                </p>
            </div>

            {/* Modular Section Navigation Tabs */}
            <div className="flex gap-2 border-b pb-3">
                <button
                    onClick={() => setActiveSection('cache')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        activeSection === 'cache'
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <ClockIcon className="size-4" /> Cache & Prefetching
                </button>
                <button
                    onClick={() => setActiveSection('urls')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        activeSection === 'urls'
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <GlobeIcon className="size-4" /> Definition URLs
                </button>
                <button
                    onClick={() => setActiveSection('paths')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        activeSection === 'paths'
                            ? 'bg-primary text-primary-foreground shadow-xs'
                            : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                    }`}
                >
                    <FolderIcon className="size-4" /> System Paths
                </button>
            </div>

            {/* SECTION 1: Cache & TTL Slider */}
            {activeSection === 'cache' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-2 font-semibold text-foreground">
                                <SlidersHorizontalIcon className="size-5 text-primary" />
                                <h2>Definition Cache TTL (Expiration Slider)</h2>
                            </div>
                            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                                Current TTL: {settings.cacheTtlMinutes === 0 ? 'Disabled (Direct fetch)' : `${settings.cacheTtlMinutes} minutes`}
                            </span>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Configure how long fetched definition CSV and schema files remain cached on disk (`~/.config/vrcx-extras/cache/`). Set to 0 to bypass caching.
                        </p>

                        <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                                <span>0m (Disabled)</span>
                                <span>15m</span>
                                <span>30m</span>
                                <span className="text-primary font-bold">1h (Default)</span>
                                <span>2h</span>
                                <span>6h</span>
                                <span>12h</span>
                                <span>24h</span>
                            </div>

                            <input
                                type="range"
                                min={0}
                                max={TTL_OPTIONS.length - 1}
                                step={1}
                                value={TTL_OPTIONS.findIndex((o) => o.minutes === settings.cacheTtlMinutes) < 0 ? 3 : TTL_OPTIONS.findIndex((o) => o.minutes === settings.cacheTtlMinutes)}
                                onChange={(e) => {
                                    const idx = parseInt(e.target.value, 10);
                                    const option = TTL_OPTIONS[idx];
                                    if (!option) {
                                        return;
                                    }
                                    setSettings({ ...settings, cacheTtlMinutes: option.minutes });
                                }}
                                className="w-full h-2 rounded-lg bg-muted accent-primary cursor-pointer"
                            />

                            <div className="text-center text-xs font-mono text-muted-foreground pt-1">
                                Selected Option: <span className="font-semibold text-foreground">{TTL_OPTIONS.find((o) => o.minutes === settings.cacheTtlMinutes)?.label || `${settings.cacheTtlMinutes} min`}</span>
                            </div>
                        </div>

                        <div className="flex justify-end border-t pt-3">
                            <button
                                onClick={() => handleSave()}
                                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                Save Cache Settings
                            </button>
                        </div>
                    </div>

                    {/* Disk Cache Status Card */}
                    <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
                        <div className="flex items-center justify-between border-b pb-3">
                            <div className="flex items-center gap-2 font-semibold text-foreground">
                                <HardDriveIcon className="size-5 text-emerald-500" />
                                <h2>Disk Cache Files (`~/.config/vrcx-extras/cache/`)</h2>
                            </div>
                            <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                                {(diskCache.totalSizeBytes / 1024).toFixed(1)} KB Total
                            </span>
                        </div>

                        <div className="space-y-2">
                            {diskCache.files.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No cached files on disk yet. Startup prefetching will populate the cache folder.</p>
                            ) : (
                                diskCache.files.map((file) => (
                                    <div key={file.name} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs font-mono">
                                        <span className="font-medium text-foreground">{file.name}</span>
                                        <div className="flex items-center gap-4 text-muted-foreground">
                                            <span>{(file.sizeBytes / 1024).toFixed(1)} KB</span>
                                            <span>{file.ageMinutes} min old</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <button
                                onClick={handleClearDiskCache}
                                disabled={fetching}
                                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                <RefreshCwIcon className={`size-3.5 ${fetching ? 'animate-spin' : ''}`} />
                                {fetching ? 'Clearing & Re-downloading...' : 'Clear Disk Cache & Re-download Now'}
                            </button>
                            {clearedMsg && (
                                <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                                    <CheckIcon className="size-4" /> Disk cache cleared & updated!
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* SECTION 2: Definition URLs */}
            {activeSection === 'urls' && (
                <form onSubmit={handleSave} className="rounded-xl border bg-card p-5 shadow-xs space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between border-b pb-3">
                        <div className="flex items-center gap-2 font-semibold text-foreground">
                            <GlobeIcon className="size-5 text-primary" />
                            <h2>Remote Definition Repository URLs</h2>
                        </div>
                        <a
                            href="https://github.com/Bluscream/vrchat-definitions"
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Bluscream/vrchat-definitions <ExternalLinkIcon className="size-3" />
                        </a>
                    </div>

                    <p className="text-sm text-muted-foreground">
                        Customize raw HTTPS URLs used to fetch CSV and JSON schema definitions. Persisted in <code className="font-mono text-xs">config.toml</code>.
                    </p>

                    <div className="space-y-3.5 text-xs">
                        <div>
                            <label className="font-medium text-foreground block mb-1">Command Line Flags CSV (`cmdline.csv`)</label>
                            <input
                                type="url"
                                value={settings.urls.cmdline}
                                onChange={(e) => setSettings({ ...settings, urls: { ...settings.urls, cmdline: e.target.value } })}
                                className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/50"
                                required
                            />
                        </div>

                        <div>
                            <label className="font-medium text-foreground block mb-1">Environment Variables CSV (`env.csv`)</label>
                            <input
                                type="url"
                                value={settings.urls.env}
                                onChange={(e) => setSettings({ ...settings, urls: { ...settings.urls, env: e.target.value } })}
                                className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/50"
                                required
                            />
                        </div>

                        <div>
                            <label className="font-medium text-foreground block mb-1">Registry Definitions CSV (`registry.csv`)</label>
                            <input
                                type="url"
                                value={settings.urls.registry}
                                onChange={(e) => setSettings({ ...settings, urls: { ...settings.urls, registry: e.target.value } })}
                                className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/50"
                                required
                            />
                        </div>

                        <div>
                            <label className="font-medium text-foreground block mb-1">VRChat Config Schema JSON (`config.schema.json`)</label>
                            <input
                                type="url"
                                value={settings.urls.configSchema}
                                onChange={(e) => setSettings({ ...settings, urls: { ...settings.urls, configSchema: e.target.value } })}
                                className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/50"
                                required
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-3">
                        <button
                            type="button"
                            onClick={handleResetUrls}
                            className="flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                        >
                            <RotateCcwIcon className="size-3.5" /> Restore Default URLs
                        </button>

                        <div className="flex items-center gap-3">
                            {savedMsg && (
                                <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                                    <CheckIcon className="size-4" /> Saved to config.toml!
                                </span>
                            )}
                            <button
                                type="submit"
                                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                Save Settings
                            </button>
                        </div>
                    </div>
                </form>
            )}

            {/* SECTION 3: System Paths */}
            {activeSection === 'paths' && (
                <form onSubmit={handleSave} className="rounded-xl border bg-card p-5 shadow-xs space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between border-b pb-3">
                        <div className="flex items-center gap-2 font-semibold text-foreground">
                            <FolderIcon className="size-5 text-primary" />
                            <h2>System File & Directory Paths</h2>
                        </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                        Configure your primary Steam directory. All VRChat sub-paths (Proton prefix, AppData, VDF configs, compatibility tools) automatically derive from this root folder.
                    </p>

                    <div className="space-y-4 text-xs">
                        <div>
                            <label className="font-medium text-foreground block mb-1">
                                Primary Steam Installation Directory <span className="text-primary font-semibold">(Primary Root Anchor)</span>
                            </label>
                            <input
                                type="text"
                                placeholder="/run/media/system/Data/Games/Steam or ~/.local/share/Steam"
                                value={settings.paths?.steamDir || ''}
                                onChange={(e) => setSettings({ ...settings, paths: { ...settings.paths, steamDir: e.target.value } })}
                                className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <p className="text-[0.75rem] text-muted-foreground mt-1.5 leading-relaxed">
                                Automatically derives:
                                <br />• <code className="font-mono">&lt;SteamDir&gt;/steamapps/compatdata/438100/pfx</code> (Proton Prefix)
                                <br />• <code className="font-mono">&lt;ProtonPrefix&gt;/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat</code> (VRChat AppData)
                                <br />• <code className="font-mono">&lt;SteamDir&gt;/compatibilitytools.d</code> (Compatibility Tools)
                                <br />• <code className="font-mono">&lt;SteamDir&gt;/userdata/&lt;id&gt;/config/localconfig.vdf</code> (Launch Options)
                            </p>
                        </div>

                        <div>
                            <label className="font-medium text-foreground block mb-1">Wine Executable Binary (`wine` CLI) <span className="text-muted-foreground font-normal">(Optional Override)</span></label>
                            <input
                                type="text"
                                placeholder="/usr/bin/wine or GE-Proton wine binary path"
                                value={settings.paths?.wineBin || ''}
                                onChange={(e) => setSettings({ ...settings, paths: { ...settings.paths, wineBin: e.target.value } })}
                                className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-3">
                        <button
                            type="button"
                            onClick={handleResetPaths}
                            className="flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
                        >
                            <RotateCcwIcon className="size-3.5" /> Restore Default Paths
                        </button>

                        <div className="flex items-center gap-3">
                            {savedMsg && (
                                <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                                    <CheckIcon className="size-4" /> Saved to config.toml!
                                </span>
                            )}
                            <button
                                type="submit"
                                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                            >
                                Save Settings
                            </button>
                        </div>
                    </div>
                </form>
            )}
        </div>
    );
}
