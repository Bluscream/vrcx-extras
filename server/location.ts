import type { AccessType } from '../shared/api.ts';

/** Feed values that mean "not in a joinable instance". */
const NON_INSTANCE_LOCATIONS = new Set([
    '',
    'offline',
    'traveling',
    'private'
]);

export function isInstanceLocation(location: string | null): location is string {
    return Boolean(location) && !NON_INSTANCE_LOCATIONS.has(location as string);
}

/**
 * Access type is encoded as a `~tag` in the instance segment. Order matters:
 * `~hidden` is Friends+ while `~friends` is Friends-only, and a group instance
 * carries both `~group` and a `~groupAccessType` tag.
 */
function readAccessType(location: string): AccessType {
    if (location.includes('~private')) return 'Private';
    if (location.includes('~group')) return 'Group';
    if (location.includes('~hidden')) return 'Friends+';
    if (location.includes('~friends')) return 'Friends';
    return 'Public';
}

/**
 * Identity of an instance, independent of the tags trailing it. The same
 * instance is recorded with different `~nonce(...)` values (and sometimes
 * different region tags) depending on which source and which user observed it,
 * so the raw location string cannot be used to group co-presence.
 */
export function instanceKey(location: string): string {
    return location.split('~')[0];
}

export interface ParsedLocation {
    worldId: string;
    instanceId: string;
    accessType: AccessType;
}

export function parseLocation(location: string): ParsedLocation {
    if (!isInstanceLocation(location)) {
        return { worldId: '', instanceId: '', accessType: 'Private' };
    }
    const [worldId = '', rest = ''] = location.split(':');
    return {
        worldId,
        instanceId: rest.split('~')[0] ?? '',
        accessType: readAccessType(location)
    };
}
