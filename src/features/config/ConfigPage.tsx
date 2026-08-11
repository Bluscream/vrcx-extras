import { useEffect, useState, useMemo } from 'react';
import {
    FileJsonIcon,
    RefreshCwIcon,
    SaveIcon,
    PlusIcon,
    Trash2Icon,
    InfoIcon,
    CheckIcon,
    ShieldAlertIcon,
    CodeIcon,
    ListIcon
} from 'lucide-react';

import {
    fetchVRChatConfig,
    saveVRChatConfig,
    fetchConfigSchema,
    toErrorMessage
} from '@/api/client';
import { isJsonObject, isJsonValue, toThrownMessage } from '@/types';
import type { ConfigSchema, ConfigSchemaProperty, JsonObject, JsonValue } from '@/types';

/** The data types the "Add Setting" form can produce. */
const NEW_PROP_TYPES = ['string', 'number', 'boolean', 'json'] as const;
type NewPropType = (typeof NEW_PROP_TYPES)[number];

/**
 * Renders a config value into a single-line input.
 *
 * Objects and arrays have no scalar representation, so they are shown as JSON
 * rather than the "[object Object]" that a bare interpolation would produce.
 */
function toInputValue(value: JsonValue | undefined): string | number {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value === 'string' || typeof value === 'number') {
        return value;
    }
    if (typeof value === 'boolean') {
        return String(value);
    }
    return JSON.stringify(value);
}

/**
 * Converts edited input text back to the shape the field started with, so
 * editing a nested object does not flatten it into a string.
 */
function fromInputValue(text: string, previous: JsonValue | undefined, wantsNumber: boolean): JsonValue {
    if (wantsNumber) {
        return Number(text);
    }
    if (previous !== null && typeof previous === 'object') {
        try {
            const decoded: unknown = JSON.parse(text);
            return isJsonValue(decoded) ? decoded : text;
        } catch {
            return text;
        }
    }
    return text;
}

/** Narrows the <select> value, which the DOM types only as string. */
function toPropType(value: string): NewPropType {
    return (NEW_PROP_TYPES as readonly string[]).includes(value) ? (value as NewPropType) : 'string';
}

export function ConfigPage() {
    const [config, setConfig] = useState<JsonObject>({});
    const [rawText, setRawText] = useState<string>('{}');
    const [filePath, setFilePath] = useState<string>('');
    const [schema, setSchema] = useState<ConfigSchema>({});
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [viewMode, setViewMode] = useState<'form' | 'json'>('form');

    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    // New Property Modal / Quick Add
    const [newPropKey, setNewPropKey] = useState('');
    const [newPropVal, setNewPropVal] = useState('');
    const [newPropType, setNewPropType] = useState<NewPropType>('string');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);
            const [res, schemaData] = await Promise.all([
                fetchVRChatConfig(),
                fetchConfigSchema().catch(() => ({}))
            ]);
            setConfig(res.config || {});
            setRawText(JSON.stringify(res.config || {}, null, 2));
            setFilePath(res.filePath);
            setSchema(schemaData || {});
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (updatedConfig: JsonObject) => {
        try {
            setSaving(true);
            setError(null);
            const res = await saveVRChatConfig(updatedConfig);
            setStatusMessage(res.message);
            setConfig(updatedConfig);
            setRawText(JSON.stringify(updatedConfig, null, 2));
            setTimeout(() => setStatusMessage(null), 3500);
        } catch (err) {
            setError(toErrorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const handleRawJsonSave = () => {
        try {
            const parsed: unknown = JSON.parse(rawText);
            if (!isJsonObject(parsed)) {
                setError('Config must be a JSON object.');
                return;
            }
            void handleSave(parsed);
        } catch (err: unknown) {
            setError(`JSON Syntax Error: ${toThrownMessage(err, 'invalid JSON')}`);
        }
    };

    const handleFieldChange = (key: string, value: JsonValue) => {
        const next = { ...config, [key]: value };
        setConfig(next);
        setRawText(JSON.stringify(next, null, 2));
    };

    const handleFieldDelete = (key: string) => {
        const next = { ...config };
        delete next[key];
        setConfig(next);
        setRawText(JSON.stringify(next, null, 2));
    };

    const handleAddProperty = () => {
        if (!newPropKey.trim()) return;
        let parsedVal: JsonValue = newPropVal;
        if (newPropType === 'number') {
            parsedVal = Number(newPropVal) || 0;
        } else if (newPropType === 'boolean') {
            parsedVal = newPropVal === 'true' || newPropVal === '1';
        } else if (newPropType === 'json') {
            try {
                // JSON.parse returns `any`; keep the value opaque until it is
                // confirmed to be something representable in the config file.
                const decoded: unknown = JSON.parse(newPropVal);
                parsedVal = isJsonValue(decoded) ? decoded : newPropVal;
            } catch {
                parsedVal = newPropVal;
            }
        }

        const next = { ...config, [newPropKey.trim()]: parsedVal };
        setConfig(next);
        setRawText(JSON.stringify(next, null, 2));
        setNewPropKey('');
        setNewPropVal('');
    };

    const knownKeys = useMemo(() => {
        return schema.properties ? Object.keys(schema.properties) : [];
    }, [schema]);

    const activeKeys = useMemo(() => {
        const set = new Set([...knownKeys, ...Object.keys(config)]);
        return Array.from(set).sort();
    }, [knownKeys, config]);

    return (
        <div className="flex h-full flex-col gap-4 p-4 sm:p-6 relative">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight">
                        <FileJsonIcon className="size-6 shrink-0 text-primary" />
                        VRChat Config Manager (`config.json`)
                    </h1>
                    <p className="text-muted-foreground text-sm font-mono truncate max-w-2xl" title={filePath}>
                        {filePath || 'AppData/LocalLow/VRChat/VRChat/config.json'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-lg border bg-muted p-1 text-xs">
                        <button
                            onClick={() => setViewMode('form')}
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                                viewMode === 'form' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <ListIcon className="size-3.5" /> Visual Form
                        </button>
                        <button
                            onClick={() => setViewMode('json')}
                            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors ${
                                viewMode === 'json' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <CodeIcon className="size-3.5" /> Raw JSON
                        </button>
                    </div>

                    <button
                        onClick={loadData}
                        className="bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                    >
                        <RefreshCwIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                    <button
                        onClick={() => (viewMode === 'form' ? handleSave(config) : handleRawJsonSave())}
                        disabled={saving}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium shadow-xs transition-colors disabled:opacity-50"
                    >
                        <SaveIcon className={`size-4 ${saving ? 'animate-spin' : ''}`} />
                        Save Config
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

            {viewMode === 'json' ? (
                <div className="flex-1 flex flex-col rounded-xl border bg-card p-4 shadow-xs">
                    <div className="flex items-center justify-between pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b mb-3">
                        <span>Raw Config Code Editor</span>
                        <span className="font-mono text-[0.7rem] text-primary">Validates JSON syntax before saving</span>
                    </div>
                    <textarea
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        className="flex-1 w-full font-mono text-xs bg-muted/40 p-4 rounded-lg border outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                        placeholder="{ ... }"
                    />
                </div>
            ) : (
                <div className="flex flex-1 flex-col lg:flex-row gap-4 lg:gap-6 min-h-0">
                    {/* Add Custom Setting Card */}
                    <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <PlusIcon className="size-4 text-primary" /> Add Setting
                        </h2>
                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block text-muted-foreground mb-1 font-medium">Property Key</label>
                                <input
                                    type="text"
                                    placeholder="e.g. cache_size"
                                    value={newPropKey}
                                    onChange={(e) => setNewPropKey(e.target.value)}
                                    className="w-full h-8 rounded-md border bg-background px-2.5 outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                            <div>
                                <label className="block text-muted-foreground mb-1 font-medium">Data Type</label>
                                <select
                                    value={newPropType}
                                    onChange={(e) => setNewPropType(toPropType(e.target.value))}
                                    className="w-full h-8 rounded-md border bg-background px-2 outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                    <option value="string">String</option>
                                    <option value="number">Number / Integer</option>
                                    <option value="boolean">Boolean (true / false)</option>
                                    <option value="json">Array / JSON Object</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-muted-foreground mb-1 font-medium">Initial Value</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 30"
                                    value={newPropVal}
                                    onChange={(e) => setNewPropVal(e.target.value)}
                                    className="w-full h-8 rounded-md border bg-background px-2.5 outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>
                            <button
                                onClick={handleAddProperty}
                                className="w-full h-8 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors"
                            >
                                <PlusIcon className="size-3.5" /> Set Property
                            </button>
                        </div>
                    </div>

                    {/* Settings Form List */}
                    {/* One column on phones, more as the viewport widens. `content-start`
                        keeps rows from stretching when the grid is taller than its rows. */}
                    <div className="flex-1 overflow-y-auto rounded-xl border bg-card p-4 shadow-xs grid content-start gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {activeKeys.length === 0 ? (
                            <div className="col-span-full p-8 text-center text-muted-foreground text-sm">No settings configured.</div>
                        ) : (
                            activeKeys.map((key) => {
                                const propDef: ConfigSchemaProperty | undefined = schema.properties?.[key];
                                const isConfigured = key in config;
                                const val = config[key];

                                return (
                                    <div
                                        key={key}
                                        className={`flex flex-col p-3.5 rounded-lg border transition-all ${
                                            isConfigured ? 'bg-background border-border/70 shadow-2xs' : 'bg-muted/20 border-dashed border-border/50'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-1.5">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-mono text-sm font-semibold text-foreground break-all">{key}</span>
                                                    {propDef?.type && (
                                                        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[0.65rem] font-bold text-primary">
                                                            {propDef.type.toUpperCase()}
                                                        </span>
                                                    )}
                                                    {!isConfigured && (
                                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                                                            SCHEMA DEFAULT
                                                        </span>
                                                    )}
                                                </div>
                                                {propDef?.description && (
                                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-start gap-1">
                                                        <InfoIcon className="size-3 mt-0.5 text-muted-foreground shrink-0" />
                                                        {propDef.description}
                                                    </p>
                                                )}
                                            </div>

                                            {isConfigured && (
                                                <button
                                                    onClick={() => handleFieldDelete(key)}
                                                    className="shrink-0 text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                                                    title="Remove property from config"
                                                >
                                                    <Trash2Icon className="size-4" />
                                                </button>
                                            )}
                                        </div>

                                        {/* Dynamic Control Input — pinned to the card's bottom so
                                            controls line up across a row of uneven descriptions. */}
                                        <div className="mt-auto pt-2.5">
                                            {typeof val === 'boolean' || propDef?.type === 'boolean' ? (
                                                <div className="flex items-center gap-3">
                                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(val ?? propDef?.default ?? false)}
                                                            onChange={(e) => handleFieldChange(key, e.target.checked)}
                                                            className="size-4 rounded border-primary text-primary focus:ring-primary"
                                                        />
                                                        Enabled ({Boolean(val ?? propDef?.default ?? false) ? 'true' : 'false'})
                                                    </label>
                                                </div>
                                            ) : Array.isArray(val) || propDef?.type === 'array' ? (
                                                <input
                                                    type="text"
                                                    value={Array.isArray(val) ? val.join(', ') : JSON.stringify(val ?? propDef?.default ?? [])}
                                                    onChange={(e) =>
                                                        handleFieldChange(
                                                            key,
                                                            e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                                                        )
                                                    }
                                                    placeholder="e.g. particle_system_limiter"
                                                    className="w-full h-8 font-mono text-xs rounded-md border bg-background px-2.5 outline-none focus:ring-2 focus:ring-primary/50"
                                                />
                                            ) : (
                                                <input
                                                    type={propDef?.type === 'integer' || typeof val === 'number' ? 'number' : 'text'}
                                                    value={toInputValue(val)}
                                                    placeholder={propDef?.default !== undefined ? `Default: ${String(propDef.default)}` : ''}
                                                    onChange={(e) =>
                                                        handleFieldChange(
                                                            key,
                                                            fromInputValue(
                                                                e.target.value,
                                                                val,
                                                                propDef?.type === 'integer' || typeof val === 'number'
                                                            )
                                                        )
                                                    }
                                                    className="w-full h-8 font-mono text-xs rounded-md border bg-background px-2.5 outline-none focus:ring-2 focus:ring-primary/50"
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
