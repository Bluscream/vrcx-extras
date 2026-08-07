import { exists, queryAll, queryOne } from './db.ts';

const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;

/**
 * VRCX namespaces its per-account tables with a sanitised user id, and sqlite
 * cannot bind an identifier as a parameter — so the prefix is interpolated into
 * SQL. Anything that reaches interpolation must be validated here first.
 */
function assertSafeIdentifier(value: string): string {
    if (!SAFE_IDENTIFIER.test(value)) {
        throw new Error(`Refusing to use unsafe table prefix: ${value}`);
    }
    return value;
}

let cachedPrefix: string | undefined;

export function getOwnerPrefix(): string {
    if (cachedPrefix !== undefined) {
        return cachedPrefix;
    }

    let ownerId: string | null = null;
    try {
        ownerId = queryOne('SELECT user_id FROM owners LIMIT 1', [], (row) =>
            row.nonEmptyText('user_id')
        );
    } catch {
        // No owners table on some VRCX versions; fall through to discovery.
    }

    if (ownerId) {
        cachedPrefix = assertSafeIdentifier(ownerId.replace(/[-_]/g, ''));
        return cachedPrefix;
    }

    // Fall back to discovering the prefix from a table VRCX always creates.
    const suffix = '_feed_gps';
    const names = queryAll(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE ?",
        [`%${suffix}`],
        (row) => row.text('name')
    );

    const match = names.find((name) => name.endsWith(suffix));
    cachedPrefix = match
        ? assertSafeIdentifier(match.slice(0, -suffix.length))
        : '';
    return cachedPrefix;
}

export function tableExists(name: string): boolean {
    return exists(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        [name]
    );
}
