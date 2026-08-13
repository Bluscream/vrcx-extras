/**
 * The client's view of the API contract. Defined in shared/api.ts so the server
 * and the UI cannot drift apart.
 */
export type {
    AccessType,
    AltCandidate,
    AvatarDetails,
    DatabaseStatus,
    EntityDetailsResponse,
    InstanceDetails,
    InstanceRoster,
    OverlappingSession,
    Player,
    PlayerDetails,
    RegistryBackupSnapshot,
    RegistryDefinition,
    RegistryEntry,
    RegistryValue,
    RegistryValueType,
    SearchCategory,
    SearchResultItem,
    SessionParticipant,
    UnifiedSearchResults,
    WorldDetails,
    VRChatConfigResponse,
    ConfigSchema,
    ConfigSchemaProperty,
    LaunchOptionsResponse,
    CmdLineDefinition,
    CompatTool,
    AppSettings,
    DefinitionUrls,
    DiskCacheStatus,
    SettingsResponse,
    SettingsSaveResponse,
    SettingsResetResponse,
    UserTimelineRow,
    UserTimelineResponse
} from '../shared/api.ts';

// Value exports (not just types): shared runtime helpers for the registry table.
export { REGISTRY_VALUE_TYPE, isRegistryValueType, registryValueTypeLabel } from '../shared/api.ts';
export type { JsonObject, JsonValue } from '../shared/json.ts';
export { isJsonObject, isJsonValue, toErrorMessage as toThrownMessage } from '../shared/json.ts';
