import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    DatabaseSync,
    type SQLInputValue,
    type SQLOutputValue
} from 'node:sqlite';

export type Row = Record<string, SQLOutputValue>;

/** Candidate database locations, most specific first. */
function candidatePaths(): string[] {
    const home = os.homedir();
    return [
        process.env.VRCX_DB_PATH,
        path.join(home, '.config', 'VRCX-0', 'VRCX-0.sqlite3'),
        path.join(home, '.config', 'VRCX', 'VRCX.sqlite3'),
        path.join(home, 'AppData', 'Roaming', 'VRCX', 'VRCX.sqlite3')
    ].filter((candidate): candidate is string => Boolean(candidate));
}

export function resolveDbPath(): string {
    const candidates = candidatePaths();
    return (
        candidates.find((candidate) => fs.existsSync(candidate)) ??
        candidates[1]
    );
}

let connection: DatabaseSync | null = null;
let isReadOnlyMode = true;

export function isDbReadOnly(): boolean {
    return isReadOnlyMode;
}

export function setDbReadOnly(readOnly: boolean): boolean {
    if (connection) {
        connection.close();
        connection = null;
    }
    isReadOnlyMode = readOnly;
    const dbPath = resolveDbPath();
    if (!fs.existsSync(dbPath)) {
        throw new Error(`VRCX database not found at ${dbPath}`);
    }
    connection = new DatabaseSync(dbPath, { readOnly });
    console.log(`[DB] Database remounted cleanly: readOnly = ${readOnly}`);
    return isReadOnlyMode;
}

export function getDb(): DatabaseSync {
    if (connection) {
        return connection;
    }
    const dbPath = resolveDbPath();
    if (!fs.existsSync(dbPath)) {
        throw new Error(`VRCX database not found at ${dbPath}`);
    }
    connection = new DatabaseSync(dbPath, { readOnly: isReadOnlyMode });
    return connection;
}

export function closeDb(): void {
    connection?.close();
    connection = null;
}

/**
 * Reads one row's columns with the type the caller expects.
 *
 * The schema belongs to VRCX, not to this app, so no compile-time type can
 * prove a column exists or holds what we assume. Every read goes through here
 * instead, turning a schema change into an error that names the column and the
 * query rather than an `undefined` that propagates into the results.
 */
export class RowReader {
    // Explicit fields rather than constructor parameter properties: the latter
    // are not erasable syntax, so Node could not strip them at runtime.
    readonly #row: Row;
    readonly #sql: string;

    constructor(row: Row, sql: string) {
        this.#row = row;
        this.#sql = sql;
    }

    #fail(column: string, expected: string): never {
        const actual = Object.hasOwn(this.#row, column)
            ? `${typeof this.#row[column]} (${String(this.#row[column])})`
            : 'a missing column';
        throw new Error(
            `Expected column "${column}" to be ${expected}, got ${actual}.\n` +
                `Query: ${this.#sql.replace(/\s+/g, ' ').trim().slice(0, 200)}`
        );
    }

    textOrNull(column: string): string | null {
        const value = this.#row[column];
        if (value === null || value === undefined) {
            return null;
        }
        return typeof value === 'string' ? value : this.#fail(column, 'text');
    }

    text(column: string): string {
        return this.textOrNull(column) ?? this.#fail(column, 'non-null text');
    }

    /** Text that is present but empty is normalised to null. */
    nonEmptyText(column: string): string | null {
        const value = this.textOrNull(column);
        return value ? value : null;
    }

    numberOrNull(column: string): number | null {
        const value = this.#row[column];
        if (value === null || value === undefined) {
            return null;
        }
        if (typeof value === 'number') {
            return value;
        }
        if (typeof value === 'bigint') {
            return Number(value);
        }
        // VRCX stores some integer columns as text, and writes '' for absent.
        if (typeof value === 'string') {
            if (value === '') {
                return null;
            }
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : this.#fail(column, 'a number');
        }
        return this.#fail(column, 'a number');
    }

    number(column: string): number {
        return this.numberOrNull(column) ?? this.#fail(column, 'a non-null number');
    }

    boolean(column: string): boolean {
        return Boolean(this.numberOrNull(column));
    }

    /** Epoch ms from an ISO timestamp column, null when absent or unparsable. */
    timestampOrNull(column: string): number | null {
        const value = this.textOrNull(column);
        if (!value) {
            return null;
        }
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : null;
    }
}

export type Decoder<T> = (row: RowReader) => T;

export function queryAll<T>(
    sql: string,
    params: SQLInputValue[],
    decode: Decoder<T>
): T[] {
    const rows = getDb().prepare(sql).all(...params);
    return rows.map((row) => decode(new RowReader(row, sql)));
}

/**
 * Runs one prepared statement repeatedly, once per parameter set.
 *
 * Preferred over a single query with many OR-ed branches: SQLite handles that
 * as a MULTI-INDEX OR and builds a temporary b-tree to deduplicate row ids
 * across every branch, which measured ~90x slower than looping the same index
 * range scan (658ms vs 7ms across 57 keys).
 */
export function queryEach<T>(
    sql: string,
    paramSets: SQLInputValue[][],
    decode: Decoder<T>
): T[] {
    const statement = getDb().prepare(sql);
    const out: T[] = [];
    for (const params of paramSets) {
        for (const row of statement.all(...params)) {
            out.push(decode(new RowReader(row, sql)));
        }
    }
    return out;
}

export function queryOne<T>(
    sql: string,
    params: SQLInputValue[],
    decode: Decoder<T>
): T | null {
    const row = getDb().prepare(sql).get(...params);
    return row === undefined ? null : decode(new RowReader(row, sql));
}

/** Raw escape hatch for queries whose result is only ever counted. */
export function exists(sql: string, params: SQLInputValue[]): boolean {
    return getDb().prepare(sql).get(...params) !== undefined;
}
