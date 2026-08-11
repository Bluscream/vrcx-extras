import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDb } from './db.ts';
import type { RegistryBackupSnapshot, RegistryEntry } from '../shared/api.ts';
import { readSettings } from './settings.ts';

const execFileAsync = promisify(execFile);

export function findProtonPrefix(): string | null {
    console.log('[RegistryService] Searching for VRChat Proton prefix...');
    const settings = readSettings();
    const steamDir = settings.paths?.steamDir;
    const derivedPrefix = steamDir ? path.join(steamDir, 'steamapps/compatdata/438100/pfx') : undefined;

    const candidatePaths = [
        settings.paths?.protonPrefix,
        derivedPrefix,
        process.env.VRC_PROTON_PREFIX,
        '/run/media/system/Data/Games/Steam/steamapps/compatdata/438100/pfx',
        path.join(process.env.HOME || '', '.local/share/Steam/steamapps/compatdata/438100/pfx'),
        path.join(process.env.HOME || '', '.steam/steam/steamapps/compatdata/438100/pfx')
    ].filter((p): p is string => Boolean(p));

    const found = candidatePaths.find((p) => fs.existsSync(p)) ?? null;
    console.log(`[RegistryService] Proton prefix resolved: ${found ?? 'NOT FOUND'}`);
    return found;
}

function findWineBinary(): string | null {
    console.log('[RegistryService] Searching for Wine binary in compatibility tools...');
    const settings = readSettings();
    const candidatePaths = [
        settings.paths?.wineBin,
        process.env.VRC_WINE_BIN,
        path.join(process.env.HOME || '', '.local/share/Steam/compatibilitytools.d/GE-Proton9-25/files/bin/wine'),
        path.join(process.env.HOME || '', '.steam/steam/compatibilitytools.d/GE-Proton9-25/files/bin/wine'),
        '/usr/bin/wine'
    ].filter((p): p is string => Boolean(p));

    for (const compatDir of [
        path.join(process.env.HOME || '', '.local/share/Steam/compatibilitytools.d'),
        path.join(process.env.HOME || '', '.steam/steam/compatibilitytools.d')
    ]) {
        if (fs.existsSync(compatDir)) {
            try {
                const entries = fs.readdirSync(compatDir);
                for (const entry of entries) {
                    const winePath = path.join(compatDir, entry, 'files', 'bin', 'wine');
                    if (fs.existsSync(winePath)) {
                        candidatePaths.push(winePath);
                    }
                }
            } catch {}
        }
    }

    const found = candidatePaths.find((p) => fs.existsSync(p)) ?? null;
    console.log(`[RegistryService] Wine binary resolved: ${found ?? 'NOT FOUND'}`);
    return found;
}

export async function readCurrentProtonRegistry(): Promise<RegistryBackupSnapshot | null> {
    console.log('[RegistryService] Querying current Proton registry via Wine CLI...');
    const prefix = findProtonPrefix();
    if (!prefix) return null;

    const wineBin = findWineBinary();
    const userRegPath = path.join(prefix, 'user.reg');

    // Fallback mtime or current time
    let dateStr = new Date().toISOString();
    if (fs.existsSync(userRegPath)) {
        dateStr = fs.statSync(userRegPath).mtime.toISOString();
    }

    const entries: Record<string, RegistryEntry> = {};

    if (wineBin) {
        try {
            console.log(`[RegistryService] Running: WINEPREFIX="${prefix}" "${wineBin}" reg query "HKCU\\Software\\VRChat\\VRChat"`);
            const { stdout } = await execFileAsync(wineBin, ['reg', 'query', 'HKCU\\Software\\VRChat\\VRChat'], {
                env: {
                    ...process.env,
                    WINEPREFIX: prefix
                }
            });

            const lines = stdout.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('HKEY_')) continue;

                // Output format: KEY_NAME REG_TYPE VALUE_DATA
                const parts = trimmed.split(/\s{4,}|\t+/);
                if (parts.length >= 2) {
                    let rawKey = parts[0].trim();
                    const regType = parts[1].trim();
                    const rawVal = parts[2] ? parts[2].trim() : '';

                    let cleanKey = rawKey;
                    const hashIdx = rawKey.lastIndexOf('_h');
                    const isHashed = hashIdx > 0 && /^\d+$/.test(rawKey.slice(hashIdx + 2));
                    if (isHashed) {
                        cleanKey = rawKey.slice(0, hashIdx);
                    }

                    let vtype = 1;
                    let parsedData: any = rawVal;

                    if (regType === 'REG_DWORD') {
                        vtype = 4;
                        parsedData = parseInt(rawVal.replace('0x', ''), 16) || 0;
                    } else if (regType === 'REG_BINARY') {
                        vtype = 3;
                        try {
                            const buf = Buffer.from(rawVal, 'hex');
                            let str = buf.toString('utf-8');
                            if (str.includes('\0')) {
                                str = str.slice(0, str.indexOf('\0'));
                            }
                            if (/^[\x20-\x7E\s]+$/.test(str) && str.length > 0) {
                                parsedData = str;
                            } else {
                                parsedData = rawVal;
                            }
                        } catch {
                            parsedData = rawVal;
                        }
                    } else if (regType === 'REG_SZ') {
                        vtype = 1;
                        parsedData = rawVal;
                    }

                    // If existing entry is raw unhashed hex (e.g. 15ABE8AE2B5E) but we hit a hashed string key, replace it!
                    const existing = entries[cleanKey];
                    if (!existing || isHashed) {
                        entries[cleanKey] = {
                            type: vtype,
                            data: parsedData
                        };
                    }
                }
            }

            console.log(`[RegistryService] Loaded ${Object.keys(entries).length} registry keys from Wine reg query.`);
            return {
                key: 'current_live',
                index: -1,
                name: 'Current Registry (Live Prefix)',
                date: dateStr,
                keyCount: Object.keys(entries).length,
                entries
            };
        } catch (err: any) {
            console.warn('[RegistryService] Wine reg query failed, falling back to user.reg file parsing:', err?.message);
        }
    }

    // Fallback to text parsing if wine query fails
    if (fs.existsSync(userRegPath)) {
        try {
            const content = fs.readFileSync(userRegPath, 'utf-8');
            const lines = content.split('\n');
            let inVrcBlock = false;
            let index = 0;

            while (index < lines.length) {
                let line = lines[index].trim();
                index++;

                if (line.includes('Software\\\\VRChat\\\\VRChat')) {
                    inVrcBlock = true;
                    continue;
                } else if (inVrcBlock && line.startsWith('[')) {
                    break;
                }

                if (!inVrcBlock || !line.startsWith('"')) continue;

                while (line.endsWith('\\') && index < lines.length) {
                    line = line.slice(0, -1) + lines[index].trim();
                    index++;
                }

                const match = line.match(/^"([^"]+)"=(.+)$/);
                if (match && match[1] && match[2]) {
                    let rawKey = match[1];
                    let rawVal = match[2].trim();

                    let cleanKey = rawKey;
                    const hashIdx = rawKey.lastIndexOf('_h');
                    const isHashed = hashIdx > 0 && /^\d+$/.test(rawKey.slice(hashIdx + 2));
                    if (isHashed) {
                        cleanKey = rawKey.slice(0, hashIdx);
                    }

                    let vtype = 1;
                    let parsedData: any = rawVal;

                    if (rawVal.startsWith('dword:')) {
                        vtype = 4;
                        parsedData = parseInt(rawVal.replace('dword:', ''), 16) || 0;
                    } else if (rawVal.startsWith('hex:')) {
                        vtype = 3;
                        const hexStr = rawVal.replace('hex:', '').replace(/\\/g, '').replace(/,/g, '').trim();
                        try {
                            const buf = Buffer.from(hexStr, 'hex');
                            let str = buf.toString('utf-8');
                            if (str.includes('\0')) {
                                str = str.slice(0, str.indexOf('\0'));
                            }
                            if (/^[\x20-\x7E\s]+$/.test(str) && str.length > 0) {
                                parsedData = str;
                            } else {
                                parsedData = hexStr;
                            }
                        } catch {
                            parsedData = hexStr;
                        }
                    } else if (rawVal.startsWith('"') && rawVal.endsWith('"')) {
                        vtype = 1;
                        parsedData = rawVal.slice(1, -1).replace(/\\\\/g, '\\').replace(/\\"/g, '"');
                    }

                    const existing = entries[cleanKey];
                    if (!existing || isHashed || (typeof parsedData === 'string' && typeof existing.data !== 'string')) {
                        entries[cleanKey] = {
                            type: vtype,
                            data: parsedData
                        };
                    }
                }
            }

            return {
                key: 'current_live',
                index: -1,
                name: 'Current Registry',
                date: dateStr,
                keyCount: Object.keys(entries).length,
                entries
            };
        } catch (err) {
            console.error('[RegistryService] Error reading live user.reg fallback:', err);
        }
    }

    return null;
}

export function readRegistryBackupsFromDb(): RegistryBackupSnapshot[] {
    console.log('[RegistryService] Reading registry backups from SQLite database...');
    const db = getDb();
    const row = db.prepare(`SELECT value FROM configs WHERE key = 'config:vrcx_vrchatregistrybackups'`).get() as { value?: string } | undefined;
    if (!row?.value) {
        console.log('[RegistryService] No config:vrcx_vrchatregistrybackups row found in database.');
        return [];
    }

    try {
        const parsed = JSON.parse(row.value);
        if (!Array.isArray(parsed)) {
            console.warn('[RegistryService] DB registry backups value is not an array.');
            return [];
        }

        console.log(`[RegistryService] Successfully loaded ${parsed.length} registry backups from DB.`);
        const snapshots: RegistryBackupSnapshot[] = parsed.map((item: any, index: number) => {
            const dataObj = typeof item.data === 'object' && item.data ? item.data : {};
            const keyCount = Object.keys(dataObj).length;
            return {
                key: `backup_${index}`,
                index,
                name: item.name || `Backup ${index + 1}`,
                date: item.date || new Date().toISOString(),
                keyCount,
                entries: dataObj
            };
        });

        // Sort newest first by date
        snapshots.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return snapshots;
    } catch (err: any) {
        console.error('[RegistryService] Failed to parse JSON from config:vrcx_vrchatregistrybackups:', err);
        return [];
    }
}

function computeUnityKeyHash(key: string): string {
    let hash = 5381;
    for (let i = 0; i < key.length; i++) {
        const code = key.charCodeAt(i);
        hash = Math.imul(hash, 33) ^ code;
    }
    return `${key}_h${hash >>> 0}`;
}

export function buildWineRegContent(entries: Record<string, RegistryEntry>): string {
    const lines = [
        'Windows Registry Editor Version 5.00',
        '',
        '[HKEY_CURRENT_USER\\Software\\VRChat\\VRChat]'
    ];

    let count = 0;
    for (const [key, val] of Object.entries(entries)) {
        if (!val || val.data === undefined || val.data === null) continue;
        const vtype = val.type;
        const rawVal = val.data;

        // Compute Unity hashed key name (e.g. Wing_Left_Worlds_SortBy_h3229778758)
        const hashedKey = computeUnityKeyHash(key);

        if (vtype === 4) {
            const num = typeof rawVal === 'number' ? rawVal : parseInt(String(rawVal), 10) || 0;
            const dwordHex = (num >>> 0).toString(16).padStart(8, '0');
            lines.push(`"${key}"=dword:${dwordHex}`);
            lines.push(`"${hashedKey}"=dword:${dwordHex}`);
            count += 2;
        } else if (vtype === 1) {
            const str = String(rawVal).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            lines.push(`"${key}"="${str}"`);
            lines.push(`"${hashedKey}"="${str}"`);
            count += 2;
        } else if (vtype === 3) {
            if (typeof rawVal === 'string') {
                // Check if plaintext string or base64
                let buf: Buffer;
                if (/^[A-Za-z0-9+/=]+$/.test(rawVal) && rawVal.length % 4 === 0) {
                    try {
                        buf = Buffer.from(rawVal, 'base64');
                    } catch {
                        buf = Buffer.from(rawVal + '\0', 'utf-8');
                    }
                } else {
                    buf = Buffer.from(rawVal + '\0', 'utf-8');
                }

                const hexStr = Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join(',');
                lines.push(`"${key}"=hex:${hexStr}`);
                lines.push(`"${hashedKey}"=hex:${hexStr}`);
                count += 2;
            } else if (typeof rawVal === 'number') {
                const dwordHex = (rawVal >>> 0).toString(16).padStart(8, '0');
                lines.push(`"${key}"=dword:${dwordHex}`);
                lines.push(`"${hashedKey}"=dword:${dwordHex}`);
                count += 2;
            }
        } else {
            if (typeof rawVal === 'number') {
                const dwordHex = (rawVal >>> 0).toString(16).padStart(8, '0');
                lines.push(`"${key}"=dword:${dwordHex}`);
                lines.push(`"${hashedKey}"=dword:${dwordHex}`);
                count += 2;
            }
        }
    }

    console.log(`[RegistryService] Formatted ${count} registry key entries into REG file format.`);
    return lines.join('\n') + '\n';
}

interface RegistryVerificationResult {
    verifiedCount: number;
    missingKeys: string[];
    extraKeys: string[];
}

function verifyRestoredRegistry(prefix: string, targetEntries: Record<string, RegistryEntry>): RegistryVerificationResult {
    const userRegPath = path.join(prefix, 'user.reg');
    console.log(`[RegistryService] Verifying restored keys against ${userRegPath}...`);

    if (!fs.existsSync(userRegPath)) {
        throw new Error(`Registry file ${userRegPath} not found after regedit import.`);
    }

    const content = fs.readFileSync(userRegPath, 'utf-8');
    const lines = content.split('\n');

    // Parse existing keys in user.reg VRChat block
    const prefixKeys = new Set<string>();
    let inVrcBlock = false;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes('Software\\\\VRChat\\\\VRChat')) {
            inVrcBlock = true;
            continue;
        } else if (inVrcBlock && trimmed.startsWith('[')) {
            break;
        }

        if (inVrcBlock && trimmed.startsWith('"')) {
            const match = trimmed.match(/^"([^"]+)"=/);
            if (match && match[1]) {
                let keyName = match[1];
                // Strip Unity _h123456 hash suffix if present
                const hashIdx = keyName.lastIndexOf('_h');
                if (hashIdx > 0 && /^\d+$/.test(keyName.slice(hashIdx + 2))) {
                    keyName = keyName.slice(0, hashIdx);
                }
                prefixKeys.add(keyName);
            }
        }
    }

    const backupKeySet = new Set(Object.keys(targetEntries));
    const missingKeys: string[] = [];
    let verifiedCount = 0;

    for (const key of backupKeySet) {
        if (!key) continue;
        if (prefixKeys.has(key)) {
            verifiedCount++;
        } else {
            missingKeys.push(key);
        }
    }

    // Keys present in prefix user.reg but NOT present in the backup being restored
    const extraKeys = Array.from(prefixKeys).filter((k) => !backupKeySet.has(k));

    console.log(`[RegistryService] Verification complete. Verified: ${verifiedCount}/${backupKeySet.size} keys.`);
    console.log(`[RegistryService] Missing from prefix: ${missingKeys.length}. Extra in prefix (not in backup): ${extraKeys.length}`);

    if (missingKeys.length > 0) {
        console.warn(`[RegistryService] Missing keys sample: ${missingKeys.slice(0, 5).join(', ')}`);
    }
    if (extraKeys.length > 0) {
        console.log(`[RegistryService] Extra keys sample: ${extraKeys.slice(0, 5).join(', ')}`);
    }

    return { verifiedCount, missingKeys, extraKeys };
}

export async function restoreRegistryBackup(index: number): Promise<{
    success: boolean;
    message: string;
    verifiedCount: number;
    missingKeys: string[];
    extraKeys: string[];
}> {
    console.log(`[RegistryService] Starting restore process for backup index ${index}...`);
    const backups = readRegistryBackupsFromDb();
    const target = backups.find((b) => b.index === index);

    if (!target) {
        console.error(`[RegistryService] Backup with index ${index} not found.`);
        throw new Error(`Backup with index ${index} not found.`);
    }

    const prefix = findProtonPrefix();
    if (!prefix) {
        console.error('[RegistryService] Could not locate VRChat Proton Wine prefix on this Linux system.');
        throw new Error('Could not locate VRChat Proton Wine prefix on this Linux system.');
    }

    const wineBin = findWineBinary();
    if (!wineBin) {
        console.error('[RegistryService] Could not locate Wine binary in Steam compatibility tools.');
        throw new Error('Could not locate Wine binary in Steam compatibility tools.');
    }

    const tempRegPath = path.join('/tmp', `vrcx_restore_${Date.now()}.reg`);
    console.log(`[RegistryService] Writing temporary REG file to ${tempRegPath}...`);
    const regContent = buildWineRegContent(target.entries);
    fs.writeFileSync(tempRegPath, regContent, 'utf-8');

    console.log(`[RegistryService] Executing Wine regedit: WINEPREFIX="${prefix}" "${wineBin}" regedit "${tempRegPath}"`);
    try {
        const { stdout, stderr } = await execFileAsync(wineBin, ['regedit', tempRegPath], {
            env: {
                ...process.env,
                WINEPREFIX: prefix
            }
        });
        if (stdout) console.log(`[RegistryService] regedit stdout: ${stdout}`);
        if (stderr) console.log(`[RegistryService] regedit stderr: ${stderr}`);

        const { verifiedCount, missingKeys, extraKeys } = verifyRestoredRegistry(prefix, target.entries);

        let msg = `Successfully imported and verified ${verifiedCount} backup keys in Wine prefix.`;
        if (missingKeys.length > 0) {
            msg += ` (${missingKeys.length} missing from prefix)`;
        }
        if (extraKeys.length > 0) {
            msg += ` (${extraKeys.length} extra keys in prefix not in backup)`;
        }

        console.log(`[RegistryService] ${msg}`);
        return {
            success: true,
            message: msg,
            verifiedCount,
            missingKeys,
            extraKeys
        };
    } catch (err: any) {
        console.error('[RegistryService] Error executing Wine regedit:', err);
        throw new Error(`Failed to execute regedit: ${err?.message || String(err)}`);
    } finally {
        if (fs.existsSync(tempRegPath)) {
            fs.unlinkSync(tempRegPath);
            console.log(`[RegistryService] Removed temporary file ${tempRegPath}`);
        }
    }
}

export async function wipeProtonRegistry(): Promise<{ success: boolean; message: string }> {
    console.log('[RegistryService] Starting wipe process for live VRChat Proton registry...');
    const prefix = findProtonPrefix();
    if (!prefix) {
        throw new Error('Could not locate VRChat Proton Wine prefix on this Linux system.');
    }

    const wineBin = findWineBinary();
    if (wineBin) {
        try {
            console.log(`[RegistryService] Executing Wine reg delete: WINEPREFIX="${prefix}" "${wineBin}" reg delete "HKCU\\Software\\VRChat\\VRChat" /f`);
            await execFileAsync(wineBin, ['reg', 'delete', 'HKCU\\Software\\VRChat\\VRChat', '/f'], {
                env: {
                    ...process.env,
                    WINEPREFIX: prefix
                }
            });
            console.log('[RegistryService] Wine reg delete command succeeded.');
        } catch (err: any) {
            console.warn('[RegistryService] Wine reg delete failed, falling back to direct user.reg section removal:', err?.message);
        }
    }

    // Direct user.reg section removal fallback
    const userRegPath = path.join(prefix, 'user.reg');
    if (fs.existsSync(userRegPath)) {
        try {
            const content = fs.readFileSync(userRegPath, 'utf-8');
            const lines = content.split('\n');
            const newLines: string[] = [];
            let inVrcBlock = false;
            let removedCount = 0;

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.includes('Software\\\\VRChat\\\\VRChat')) {
                    inVrcBlock = true;
                    removedCount++;
                    continue;
                } else if (inVrcBlock && trimmed.startsWith('[')) {
                    inVrcBlock = false;
                }

                if (inVrcBlock) {
                    removedCount++;
                } else {
                    newLines.push(line);
                }
            }

            fs.writeFileSync(userRegPath, newLines.join('\n'), 'utf-8');
            console.log(`[RegistryService] Successfully wiped ${removedCount} lines of VRChat registry keys from user.reg.`);
        } catch (err: any) {
            console.error('[RegistryService] Failed to wipe user.reg section:', err);
            throw new Error(`Failed to wipe user.reg section: ${err?.message || String(err)}`);
        }
    }

    return {
        success: true,
        message: 'Successfully wiped all VRChat registry keys from Proton prefix!'
    };
}

export async function updateProtonRegistryKey(key: string, value: any, type: number): Promise<{ success: boolean; message: string }> {
    console.log(`[RegistryService] Updating live key "${key}" = ${JSON.stringify(value)} (type ${type})...`);
    const prefix = findProtonPrefix();
    if (!prefix) {
        throw new Error('Could not locate VRChat Proton Wine prefix on this Linux system.');
    }

    const hashedKey = computeUnityKeyHash(key);
    const wineBin = findWineBinary();

    if (wineBin) {
        try {
            let regTypeStr = 'REG_SZ';
            let regValStr = String(value);

            if (type === 4) {
                regTypeStr = 'REG_DWORD';
                regValStr = `0x${((typeof value === 'number' ? value : parseInt(String(value), 10) || 0) >>> 0).toString(16)}`;
            } else if (type === 3) {
                regTypeStr = 'REG_BINARY';
                if (typeof value === 'string') {
                    const buf = Buffer.from(value + '\0', 'utf-8');
                    regValStr = Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
                }
            }

            console.log(`[RegistryService] Executing wine reg add for ${key} and ${hashedKey}...`);
            await execFileAsync(wineBin, ['reg', 'add', 'HKCU\\Software\\VRChat\\VRChat', '/v', key, '/t', regTypeStr, '/d', regValStr, '/f'], {
                env: { ...process.env, WINEPREFIX: prefix }
            });
            await execFileAsync(wineBin, ['reg', 'add', 'HKCU\\Software\\VRChat\\VRChat', '/v', hashedKey, '/t', regTypeStr, '/d', regValStr, '/f'], {
                env: { ...process.env, WINEPREFIX: prefix }
            });
            console.log('[RegistryService] Wine reg add succeeded.');
            return {
                success: true,
                message: `Successfully updated "${key}" in live Proton prefix.`
            };
        } catch (err: any) {
            console.warn('[RegistryService] Wine reg add failed, falling back to regedit file import:', err?.message);
        }
    }

    // Regedit fallback import
    const entries: Record<string, RegistryEntry> = {
        [key]: { type, data: value }
    };
    const regContent = buildWineRegContent(entries);
    const tempRegPath = path.join(os.tmpdir(), `vrchat_key_${Date.now()}.reg`);
    fs.writeFileSync(tempRegPath, regContent, 'utf-8');

    try {
        if (wineBin) {
            await execFileAsync(wineBin, ['regedit', tempRegPath], {
                env: { ...process.env, WINEPREFIX: prefix }
            });
        } else {
            // Append directly to user.reg fallback
            const userRegPath = path.join(prefix, 'user.reg');
            fs.appendFileSync(userRegPath, `\n${regContent}`);
        }
        return {
            success: true,
            message: `Successfully updated "${key}" in live Proton prefix.`
        };
    } finally {
        if (fs.existsSync(tempRegPath)) {
            fs.unlinkSync(tempRegPath);
        }
    }
}
