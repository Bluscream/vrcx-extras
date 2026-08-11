/**
 * The HTTP contract between server/ and src/. Both sides import these, so a
 * change to a response shape breaks compilation on whichever side is now wrong
 * instead of surfacing as an undefined field at runtime.
 */
import type { JsonObject, JsonValue } from './json.ts';

export interface Player {
    id: string;
    displayName: string;
    isFriend: boolean;
    isFavorite: boolean;
    isBlocked: boolean;
    isMuted: boolean;
    hasNote: boolean;
    trustLevel: string | null;
    friendNumber: number | null;
    /** Epoch ms of the last feed entry for this user, null if never seen. */
    lastSeen: number | null;
    /** Number of GPS feed rows — a rough proxy for how often you cross paths. */
    sessionCount: number;
}

export interface SessionParticipant {
    userId: string;
    displayName: string;
    joinedAt: number;
    leftAt: number;
}

export type AccessType =
    | 'Public'
    | 'Friends+'
    | 'Friends'
    | 'Group'
    | 'Private';

export interface OverlappingSession {
    location: string;
    worldId: string;
    worldName: string;
    instanceId: string;
    accessType: AccessType;
    joinedAt: number;
    leftAt: number;
    durationMs: number;
    participants: SessionParticipant[];
    /**
     * Everyone ever recorded in this instance, from the local game log.
     * `null` when the owner was never in it, so no roster exists — distinct
     * from a roster that is genuinely empty.
     */
    roster: InstanceRoster | null;
}

export interface InstanceRoster {
    /** Distinct users ever recorded in this instance. */
    total: number;
    /** Display names, alphabetical; capped for transport. */
    names: string[];
    /** How many names the cap dropped. */
    truncated: number;
}

export interface DatabaseStatus {
    connected: boolean;
    path: string;
    /** Owner-scoped table prefix, empty when no owner row could be resolved. */
    prefix: string;
    readOnly?: boolean;
}

export interface AltCandidate {
    player: Player;
    score: number;
    reasons: string[];
}

export type SearchCategory = 'players' | 'worlds' | 'avatars' | 'instances' | 'pages';

export interface SearchResultItem {
    id: string;
    category: SearchCategory;
    title: string;
    subtitle?: string;
    imageUrl?: string;
    targetUrl: string;
}

export interface UnifiedSearchResults {
    players: SearchResultItem[];
    worlds: SearchResultItem[];
    avatars: SearchResultItem[];
    instances: SearchResultItem[];
    pages: SearchResultItem[];
}

export interface PlayerDetails {
    player: Player;
    pastNames: string[];
    topCompanions: Array<{
        userId: string;
        displayName: string;
        sharedInstances: number;
    }>;
    potentialAlts: AltCandidate[];
}

export interface WorldDetails {
    id: string;
    name: string;
    authorId: string | null;
    authorName: string | null;
    description: string | null;
    imageUrl: string | null;
    thumbnailImageUrl: string | null;
    releaseStatus: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    version: number | null;
    memo: string | null;
    isFavorite: boolean;
    favoriteGroup: string | null;
    visitCount: number;
    lastVisitedAt: number | null;
    recentVisits: Array<{
        location: string;
        createdAt: string;
    }>;
}

export interface AvatarDetails {
    id: string;
    name: string;
    authorId: string | null;
    authorName: string | null;
    description: string | null;
    imageUrl: string | null;
    thumbnailImageUrl: string | null;
    releaseStatus: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    version: number | null;
    memo: string | null;
    isFavorite: boolean;
    favoriteGroup: string | null;
    tags: Array<{ tag: string; color: string }>;
    usageHistoryCount: number;
    lastUsedAt: string | null;
}

export interface InstanceDetails {
    location: string;
    worldId: string;
    instanceId: string;
    worldName: string;
    accessType: AccessType;
    groupName: string | null;
    ownerId: string | null;
    recordedVisits: number;
    lastVisitedAt: string | null;
    roster: InstanceRoster | null;
}

export interface EntityDetailsResponse {
    type: 'player' | 'world' | 'avatar' | 'instance';
    player?: PlayerDetails;
    world?: WorldDetails;
    avatar?: AvatarDetails;
    instance?: InstanceDetails;
}

/**
 * Registry payloads only ever hold a string (REG_SZ, or binary decoded to text
 * or hex) or a number (REG_DWORD/REG_QWORD). Modelling it as a union rather
 * than `any` forces the `typeof` narrowing that buildWineRegContent already
 * does by hand, so a new branch cannot silently emit an unsupported value.
 */
export type RegistryValue = string | number;

/**
 * Windows registry value types, restricted to the ones VRChat writes.
 * Kept numeric because that is what VRCX stores in its backup JSON.
 */
export const REGISTRY_VALUE_TYPE = {
    string: 1,
    binary: 3,
    dword: 4,
    qword: 11
} as const;

export type RegistryValueType = (typeof REGISTRY_VALUE_TYPE)[keyof typeof REGISTRY_VALUE_TYPE];

const REGISTRY_VALUE_TYPES: readonly number[] = Object.values(REGISTRY_VALUE_TYPE);

export function isRegistryValueType(value: unknown): value is RegistryValueType {
    return typeof value === 'number' && REGISTRY_VALUE_TYPES.includes(value);
}

/**
 * Human label for a value type, used in the registry table's type column.
 *
 * Accepts `number` rather than only RegistryValueType: the point of the
 * fallback is to name a code we do not model yet, which by definition is not
 * in the union.
 */
export function registryValueTypeLabel(type: number | undefined): string {
    switch (type) {
        case REGISTRY_VALUE_TYPE.string:
            return 'STRING';
        case REGISTRY_VALUE_TYPE.binary:
            return 'BINARY';
        case REGISTRY_VALUE_TYPE.dword:
            return 'DWORD';
        case REGISTRY_VALUE_TYPE.qword:
            return 'QWORD';
        default:
            // Show the raw code when there is one, so an unmodelled type is
            // identifiable from a screenshot rather than just "unknown".
            return type === undefined ? 'UNKNOWN' : `UNKNOWN (${type})`;
    }
}

export interface RegistryEntry {
    type: RegistryValueType;
    data: RegistryValue;
}

export interface RegistryBackupSnapshot {
    key: string;
    index: number;
    name: string;
    date: string;
    keyCount: number;
    entries: Record<string, RegistryEntry>;
}

export interface RegistryDefinition {
    keyName: string;
    valueType: string;
    description: string;
    defaultValue: string;
    pattern: string;
    min?: string;
    max?: string;
    possibleValues?: string[];
    options?: string[];
}

export interface VRChatConfigResponse {
    filePath: string;
    exists: boolean;
    config: JsonObject;
    rawText: string;
}

export interface ConfigSchemaProperty {
    type?: string;
    description?: string;
    default?: JsonValue;
    minimum?: number;
    maximum?: number;
    examples?: JsonValue[];
    items?: {
        type?: string;
        enum?: string[];
    };
}

export interface ConfigSchema {
    title?: string;
    description?: string;
    properties?: Record<string, ConfigSchemaProperty>;
}

export interface CompatTool {
    /** Internal name used by Steam config (e.g. "GE-Proton10-34") */
    name: string;
    /** Human-readable label from compatibilitytool.vdf */
    displayName: string;
    /** Path to the tool directory */
    path: string;
    /** Whether it's a user-installed tool vs Steam built-in */
    custom: boolean;
}

export interface LaunchOptionsResponse {
    filePath: string;
    exists: boolean;
    rawLaunchOptions: string;
    steamRunning: boolean;
    /** Name of the currently selected compatibility tool for VRChat (from Steam config.vdf) */
    compatTool: string;
    /** All tools available on this machine */
    availableCompatTools: CompatTool[];
}

export interface CmdLineDefinition {
    keyName: string;
    valueType: string;
    description: string;
    defaultValue: string;
    pattern: string;
}

export interface DefinitionUrls {
    cmdline: string;
    env: string;
    registry: string;
    configSchema: string;
}

export type DefinitionName = keyof DefinitionUrls;

export const DEFINITION_NAMES = ['cmdline', 'env', 'registry', 'configSchema'] as const satisfies readonly DefinitionName[];

/**
 * Guards the :name route param. `satisfies` above ties this list to the
 * DefinitionUrls keys, so adding a definition without listing it here — or
 * listing one that does not exist — fails to compile.
 */
export function isDefinitionName(value: unknown): value is DefinitionName {
    return typeof value === 'string' && (DEFINITION_NAMES as readonly string[]).includes(value);
}

export interface AppPaths {
    steamDir: string;
    wineBin?: string;
}

export interface AppSettings {
    urls: DefinitionUrls;
    paths: AppPaths;
    cacheTtlMinutes: number; // 0 = disabled
}

export interface DiskCacheStatus {
    count: number;
    totalSizeBytes: number;
    files: Array<{ name: string; ageMinutes: number; sizeBytes: number }>;
}

export interface SettingsResponse {
    settings: AppSettings;
    diskCache: DiskCacheStatus;
}

export interface SettingsSaveResponse {
    success: boolean;
    settings: AppSettings;
}

export interface SettingsResetResponse {
    success: boolean;
    message: string;
    settings: AppSettings;
}






