import { useEffect, useState } from 'react';
import {
    RefreshCwIcon,
    GlobeIcon,
    RotateCcwIcon,
    CheckIcon,
    ClockIcon,
    ExternalLinkIcon
} from 'lucide-react';
import {
    getDefinitionUrls,
    saveDefinitionUrls,
    clearDefinitionCache,
    getCacheStatus,
    prefetchAllDefinitionsAndConfig,
    DEFAULT_DEFINITION_URLS
} from '@/api/client';

export function SettingsPage() {
    const [urls, setUrls] = useState(getDefinitionUrls());
    const [cacheInfo, setCacheInfo] = useState(getCacheStatus());
    const [savedMsg, setSavedMsg] = useState(false);
    const [clearedMsg, setClearedMsg] = useState(false);
    const [fetching, setFetching] = useState(false);

    const refreshCacheInfo = () => {
        setCacheInfo(getCacheStatus());
    };

    const handleSaveUrls = (e: React.FormEvent) => {
        e.preventDefault();
        saveDefinitionUrls(urls);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 3000);
    };

    const handleResetUrls = () => {
        setUrls(DEFAULT_DEFINITION_URLS);
        saveDefinitionUrls(DEFAULT_DEFINITION_URLS);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 3000);
    };

    const handleClearCache = async () => {
        setFetching(true);
        clearDefinitionCache();
        await prefetchAllDefinitionsAndConfig();
        refreshCacheInfo();
        setFetching(false);
        setClearedMsg(true);
        setTimeout(() => setClearedMsg(false), 3000);
    };

    useEffect(() => {
        refreshCacheInfo();
    }, []);

    return (
        <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 max-w-4xl">
            <div>
                <h1 className="text-xl font-bold tracking-tight">Settings & Preferences</h1>
                <p className="text-sm text-muted-foreground">
                    Manage definition sources, caching behavior, and system settings.
                </p>
            </div>

            {/* Cache Management Card */}
            <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                        <ClockIcon className="size-5 text-primary" />
                        <h2>Definition Cache & Startup Background Prefetching</h2>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                        1 Hour Cache TTL
                    </span>
                </div>

                <p className="text-sm text-muted-foreground">
                    Definitions (Command Line flags, Environment Variables, Registry keys, Config schema) are automatically prefetched on startup and cached locally in your browser for 1 hour to ensure fast navigation.
                </p>

                <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3.5 text-xs">
                    <div>
                        <span className="text-muted-foreground">Cached Items Count:</span>
                        <p className="font-mono text-sm font-semibold text-foreground">{cacheInfo.count} definitions cached</p>
                    </div>
                    <div>
                        <span className="text-muted-foreground">Cache Age:</span>
                        <p className="font-mono text-sm font-semibold text-foreground">
                            {cacheInfo.oldestAgeMinutes !== null
                                ? `${cacheInfo.oldestAgeMinutes} min old (Expires in ${Math.max(0, 60 - cacheInfo.oldestAgeMinutes)} min)`
                                : 'Empty / Not Cached'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 pt-1">
                    <button
                        onClick={handleClearCache}
                        disabled={fetching}
                        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                        <RefreshCwIcon className={`size-3.5 ${fetching ? 'animate-spin' : ''}`} />
                        {fetching ? 'Fetching & Refetching...' : 'Clear Cache & Refetch Definitions Now'}
                    </button>
                    {clearedMsg && (
                        <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium animate-fade-in">
                            <CheckIcon className="size-4" /> Cache cleared & prefetched successfully!
                        </span>
                    )}
                </div>
            </div>

            {/* Definition Repository URLs Form */}
            <form onSubmit={handleSaveUrls} className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
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
                    Customize raw HTTPS URLs used to fetch CSV and JSON schema definitions. Changes apply immediately to new requests.
                </p>

                <div className="space-y-3.5 text-xs">
                    <div>
                        <label className="font-medium text-foreground block mb-1">Command Line Flags CSV (`cmdline.csv`)</label>
                        <input
                            type="url"
                            value={urls.cmdline}
                            onChange={(e) => setUrls({ ...urls, cmdline: e.target.value })}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/50"
                            required
                        />
                    </div>

                    <div>
                        <label className="font-medium text-foreground block mb-1">Environment Variables CSV (`env.csv`)</label>
                        <input
                            type="url"
                            value={urls.env}
                            onChange={(e) => setUrls({ ...urls, env: e.target.value })}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/50"
                            required
                        />
                    </div>

                    <div>
                        <label className="font-medium text-foreground block mb-1">Registry Definitions CSV (`registry.csv`)</label>
                        <input
                            type="url"
                            value={urls.registry}
                            onChange={(e) => setUrls({ ...urls, registry: e.target.value })}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/50"
                            required
                        />
                    </div>

                    <div>
                        <label className="font-medium text-foreground block mb-1">VRChat Config Schema JSON (`config.schema.json`)</label>
                        <input
                            type="url"
                            value={urls.configSchema}
                            onChange={(e) => setUrls({ ...urls, configSchema: e.target.value })}
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
                                <CheckIcon className="size-4" /> Settings saved!
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
        </div>
    );
}
