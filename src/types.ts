/**
 * The client's view of the API contract. Defined in shared/api.ts so the server
 * and the UI cannot drift apart.
 */
export type {
    AccessType,
    DatabaseStatus,
    OverlappingSession,
    Player,
    SessionParticipant
} from '../shared/api';
