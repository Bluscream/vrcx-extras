import { useEffect, useState, useMemo } from 'react';
import { ExportDropdown } from '@/components/ExportDropdown';
import { Modal } from '@/components/Modal';
import { SegmentedTabs } from '@/components/SegmentedTabs';
import { PageHeader, PageShell } from '@/components/layout/PageHeader';
import { StatusBanner } from '@/components/StatusBanner';
import { Button } from '@/ui/button';
import {
    FileJsonIcon,
    RefreshCwIcon,
    SaveIcon,
    PlusIcon,
    Trash2Icon,
    InfoIcon,
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
    const [addOpen, setAddOpen] = useState(false);

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
        setNewPropType('string');
        setAddOpen(false);
    };

    const knownKeys = useMemo(() => {
        return schema.properties ? Object.keys(schema.properties) : [];
    }, [schema]);

    const activeKeys = useMemo(() => {
        const set = new Set([...knownKeys, ...Object.keys(config)]);
        return Array.from(set).sort();
    }, [knownKeys, config]);

    /** One flat row per config key, mirroring what the form shows. */
    const exportRows = useMemo(() => {
        return activeKeys.map((key) => {
            const value = config[key];
            const propDef = schema.properties?.[key];
            return {
                key,
                value: value === undefined ? null : typeof value === 'object' ? JSON.stringify(value) : String(value),
                type: propDef?.type ?? (value === undefined ? '' : typeof value),
                set: value !== undefined,
                known: knownKeys.includes(key),
                description: propDef?.description ?? '',
                default: propDef?.default === undefined ? '' : String(propDef.default)
            };
        });
    }, [activeKeys, config, schema, knownKeys]);

    return (
        <PageShell>
            <PageHeader
                icon={FileJsonIcon}
                title="VRChat Config Manager (config.json)"
                description={filePath || 'AppData/LocalLow/VRChat/VRChat/config.json'}
                mono
                actions={
                    <>
                    <SegmentedTabs
                        value={viewMode}
                        onChange={setViewMode}
                        options={[
                            { value: 'form' as const, label: 'Visual Form', icon: ListIcon },
                            { value: 'json' as const, label: 'Raw JSON', icon: CodeIcon }
                        ]}
                    />

                    <ExportDropdown
                        title="VRChat Config"
                        filenamePrefix="vrchat_config"
                        data={exportRows}
                    />
                    <Button variant="outline" onClick={() => setAddOpen(true)}>
                        <PlusIcon />
                        Add
                    </Button>
                    <Button variant="secondary" onClick={loadData}>
                        <RefreshCwIcon className={loading ? 'animate-spin' : ''} />
                        Refresh
                    </Button>
                    <Button
                        onClick={() => (viewMode === 'form' ? handleSave(config) : handleRawJsonSave())}
                        disabled={saving}
                    >
                        <SaveIcon className={saving ? 'animate-spin' : ''} />
                        Save Config
                    </Button>
                    </>
                }
            />

            {error && <StatusBanner>{error}</StatusBanner>}
            {statusMessage && <StatusBanner variant="success">{statusMessage}</StatusBanner>}

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
                <div className="flex min-h-0 flex-1 flex-col">
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

            <Modal
                open={addOpen}
                onClose={() => setAddOpen(false)}
                title="Add Setting"
                description="Define a key that is not part of the known schema. It is written to config.json when you save."
                footer={
                    <>
                        <Button variant="ghost" onClick={() => setAddOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleAddProperty} disabled={!newPropKey.trim()}>
                            <PlusIcon />
                            Set Property
                        </Button>
                    </>
                }
            >
                <form
                    className="space-y-3 text-xs"
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleAddProperty();
                    }}
                >
                    <div>
                        <label htmlFor="new-prop-key" className="text-muted-foreground mb-1 block font-medium">
                            Property Key
                        </label>
                        <input
                            id="new-prop-key"
                            type="text"
                            autoFocus
                            placeholder="e.g. cache_size"
                            value={newPropKey}
                            onChange={(e) => setNewPropKey(e.target.value)}
                            className="focus:ring-primary/50 bg-background h-8 w-full rounded-md border px-2.5 outline-none focus:ring-2"
                        />
                    </div>
                    <div>
                        <label htmlFor="new-prop-type" className="text-muted-foreground mb-1 block font-medium">
                            Data Type
                        </label>
                        <select
                            id="new-prop-type"
                            value={newPropType}
                            onChange={(e) => setNewPropType(toPropType(e.target.value))}
                            className="focus:ring-primary/50 bg-background h-8 w-full rounded-md border px-2 outline-none focus:ring-2"
                        >
                            <option value="string">String</option>
                            <option value="number">Number / Integer</option>
                            <option value="boolean">Boolean (true / false)</option>
                            <option value="json">Array / JSON Object</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="new-prop-value" className="text-muted-foreground mb-1 block font-medium">
                            Initial Value
                        </label>
                        <input
                            id="new-prop-value"
                            type="text"
                            placeholder="e.g. 30"
                            value={newPropVal}
                            onChange={(e) => setNewPropVal(e.target.value)}
                            className="focus:ring-primary/50 bg-background h-8 w-full rounded-md border px-2.5 outline-none focus:ring-2"
                        />
                    </div>
                    {/* Enables Enter-to-submit without a visible duplicate button. */}
                    <button type="submit" className="hidden" />
                </form>
            </Modal>
        </PageShell>
    );
}
