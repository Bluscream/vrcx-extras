import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sqlite3 from 'sqlite3';

/** Candidate database locations, most specific first. */
function candidatePaths() {
    return [
        process.env.VRCX_DB_PATH,
        path.join(os.homedir(), '.config', 'VRCX-0', 'VRCX-0.sqlite3'),
        path.join(os.homedir(), '.config', 'VRCX', 'VRCX.sqlite3'),
        path.join(
            os.homedir(),
            'AppData',
            'Roaming',
            'VRCX',
            'VRCX.sqlite3'
        )
    ].filter(Boolean);
}

export function resolveDbPath() {
    const candidates = candidatePaths();
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[1];
}

let connection = null;

/**
 * Opens a single shared read-only handle. The previous implementation opened
 * and closed a connection per request, which reparsed the schema every time.
 */
export function getDb() {
    if (connection) {
        return Promise.resolve(connection);
    }

    const dbPath = resolveDbPath();
    if (!fs.existsSync(dbPath)) {
        return Promise.reject(
            new Error(`VRCX database not found at ${dbPath}`)
        );
    }

    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(err);
                return;
            }
            connection = db;
            resolve(db);
        });
    });
}

export function closeDb() {
    const db = connection;
    connection = null;
    return new Promise((resolve) => {
        if (!db) {
            resolve();
            return;
        }
        db.close(() => resolve());
    });
}

export function queryAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows ?? []);
            }
        });
    });
}

export function queryGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}
