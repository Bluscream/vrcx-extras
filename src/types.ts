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
    CompatToolSaveResponse
} from '../shared/api.ts';

