import type { InstanceRoster } from '../shared/api.ts';
import { queryEach } from './db.ts';
import { tableExists } from './schema.ts';

/** Names carried per instance; the count is always exact. */
const MAX_NAMES = 60;

/** Sorts after every printable character, bounding a key's range scan. */
const RANGE_END = '￿';

/**
 * Everyone ever seen in a given instance, from the local game log.
 *
 * Only `gamelog_join_leave` is used. It records every player who joined an
 * instance the owner was in, which is the only complete roster available — the
 * GPS feed knows about friends alone, so counting from it would report "3
 * players" for a forty-person public lobby. Instances the owner never entered
 * therefore have no roster, and are reported as unknown rather than guessed at.
 */
export function readRosters(
    instanceKeys: string[]
): Map<string, InstanceRoster> {
    const rosters = new Map<string, InstanceRoster>();
    if (instanceKeys.length === 0 || !tableExists('gamelog_join_leave')) {
        return rosters;
    }

    // An instance key is either the whole location or is followed by '~'.
    // Anchoring on that matters: a bare prefix range would let ':2279' swallow
    // ':22794'. Both branches resolve to index range scans.
    const records = queryEach(
        `SELECT DISTINCT user_id, display_name, location
         FROM gamelog_join_leave
         WHERE location = ? OR (location >= ? AND location < ?)`,
        instanceKeys.map((key) => [key, `${key}~`, `${key}~${RANGE_END}`]),
        (row) => ({
            userId: row.nonEmptyText('user_id'),
            displayName: row.nonEmptyText('display_name'),
            location: row.nonEmptyText('location')
        })
    );

    /** userId -> displayName, per instance key. */
    const byKey = new Map<string, Map<string, string>>();

    for (const record of records) {
        if (!record.userId || !record.location) {
            continue;
        }
        const key = record.location.split('~')[0];
        let players = byKey.get(key);
        if (!players) {
            players = new Map();
            byKey.set(key, players);
        }
        // One user id can span several past names; keep the first seen.
        if (!players.has(record.userId)) {
            players.set(record.userId, record.displayName ?? record.userId);
        }
    }

    for (const [key, players] of byKey) {
        const names = [...players.values()].sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: 'base' })
        );
        rosters.set(key, {
            total: players.size,
            names: names.slice(0, MAX_NAMES),
            truncated: Math.max(names.length - MAX_NAMES, 0)
        });
    }

    return rosters;
}
