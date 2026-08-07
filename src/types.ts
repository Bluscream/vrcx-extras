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
}

export type AccessType =
    | 'Public'
    | 'Friends+'
    | 'Friends'
    | 'Group'
    | 'Private';

export interface DatabaseStatus {
    connected: boolean;
    path: string;
    /** Owner-scoped table prefix, empty when no owner row could be resolved. */
    prefix: string;
}
