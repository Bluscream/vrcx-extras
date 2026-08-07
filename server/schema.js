import { queryAll, queryGet } from './db.js';

const SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;

/**
 * VRCX namespaces its per-account tables with a sanitised user id, and sqlite
 * cannot bind an identifier as a parameter — so the prefix is interpolated into
 * SQL. Anything that reaches interpolation must be validated here first.
 */
function assertSafeIdentifier(value) {
    if (!SAFE_IDENTIFIER.test(value)) {
        throw new Error(`Refusing to use unsafe table prefix: ${value}`);
    }
    return value;
}

let cachedPrefix;

export async function getOwnerPrefix(db) {
    if (cachedPrefix !== undefined) {
        return cachedPrefix;
    }

    const owner = await queryGet(
        db,
        'SELECT user_id FROM owners LIMIT 1'
    ).catch(() => null);

    if (owner?.user_id) {
        cachedPrefix = assertSafeIdentifier(
            owner.user_id.replace(/[-_]/g, '')
        );
        return cachedPrefix;
    }

    // Fall back to discovering the prefix from a table VRCX always creates.
    const suffix = '_feed_gps';
    const tables = await queryAll(
        db,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE ?",
        [`%${suffix}`]
    );

    const match = tables.find((table) => table.name.endsWith(suffix));
    cachedPrefix = match
        ? assertSafeIdentifier(match.name.slice(0, -suffix.length))
        : '';
    return cachedPrefix;
}

export async function tableExists(db, name) {
    const row = await queryGet(
        db,
        "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?",
        [name]
    );
    return Boolean(row);
}
