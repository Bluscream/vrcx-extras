/**
 * The HTTP contract between server/ and src/. Both sides import these, so a
 * change to a response shape breaks compilation on whichever side is now wrong
 * instead of surfacing as an undefined field at runtime.
 */

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

export interface RegistryEntry {
    type: number;
    data: any;
}

export interface RegistryBackupSnapshot {
    key: string;
    index: number;
    name: string;
    date: string;
    keyCount: number;
    entries: Record<string, RegistryEntry>;
}




