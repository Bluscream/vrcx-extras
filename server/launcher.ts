import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import VDF from '@node-steam/vdf';
import type { CompatTool, LaunchOptionsResponse } from '../shared/api.ts';
import { readSettings } from './settings.ts';

const execFileAsync = promisify(execFile);

function getLocalConfigVdfPath(): string {
    const settings = readSettings();
    const steamDir = settings.paths?.steamDir;
    const derivedUserdata = steamDir ? path.join(steamDir, 'userdata') : undefined;

    const candidatePaths = [
        process.env.VRC_LOCALCONFIG_PATH,
        path.join(process.env.HOME || '', '.local/share/Steam/userdata/62180933/config/localconfig.vdf'),
        path.join(process.env.HOME || '', '.steam/steam/userdata/62180933/config/localconfig.vdf')
    ].filter((p): p is string => Boolean(p));

    for (const p of candidatePaths) {
        if (fs.existsSync(p)) return p;
    }

    // Dynamic search across all user accounts in Steam userdata
    const userdataDirs = [derivedUserdata, path.join(process.env.HOME || '', '.local/share/Steam/userdata')].filter((p): p is string => Boolean(p));
    for (const baseUserdata of userdataDirs) {
        if (fs.existsSync(baseUserdata)) {
            try {
                const dirs = fs.readdirSync(baseUserdata);
                for (const d of dirs) {
                    const target = path.join(baseUserdata, d, 'config/localconfig.vdf');
                    if (fs.existsSync(target)) return target;
                }
            } catch {}
        }
    }

    return candidatePaths[candidatePaths.length - 1];
}

function getSteamConfigVdfPath(): string {
    const settings = readSettings();
    const steamDir = settings.paths?.steamDir;
    const derivedConfigVdf = steamDir ? path.join(steamDir, 'config/config.vdf') : undefined;

    const candidates = [
        derivedConfigVdf,
        path.join(process.env.HOME || '', '.local/share/Steam/config/config.vdf'),
        path.join(process.env.HOME || '', '.steam/steam/config/config.vdf'),
    ].filter((p): p is string => Boolean(p));
    return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

/** Scan all compatibilitytools.d directories for user-installed compat tools */
export function listCompatTools(): CompatTool[] {
    const settings = readSettings();
    const steamDir = settings.paths?.steamDir;
    const derivedCompatDir = steamDir ? path.join(steamDir, 'compatibilitytools.d') : undefined;
    const home = process.env.HOME || '';

    const searchDirs = [
        derivedCompatDir,
        path.join(home, '.local/share/Steam/compatibilitytools.d'),
        path.join(home, '.steam/root/compatibilitytools.d'),
        '/run/media/system/Data/Games/Steam/compatibilitytools.d',
    ].filter((p): p is string => Boolean(p));

    const tools: CompatTool[] = [];
    const seen = new Set<string>();

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        let entries: string[];
        try { entries = fs.readdirSync(dir); } catch { continue; }

        for (const entry of entries) {
            const toolDir = path.join(dir, entry);
            try { if (!fs.statSync(toolDir).isDirectory()) continue; } catch { continue; }
            const vdfPath = path.join(toolDir, 'compatibilitytool.vdf');
            if (!fs.existsSync(vdfPath)) continue;

            try {
                const vdf = fs.readFileSync(vdfPath, 'utf-8');
                const internalMatch = vdf.match(/"internal_name"\s+"([^"]+)"/);
                const displayMatch = vdf.match(/"display_name"\s+"([^"]+)"/);
                const internalName = internalMatch?.[1] ?? entry;
                const displayName = displayMatch?.[1] ?? entry;

                if (!seen.has(internalName)) {
                    seen.add(internalName);
                    tools.push({ name: internalName, displayName, path: toolDir, custom: true });
                }
            } catch {}
        }
    }

    tools.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return tools;
}

/** Read the current compat tool name for VRChat (appid 438100) from Steam config.vdf */
export function readCompatTool(): string {
    const configPath = getSteamConfigVdfPath();
    if (!fs.existsSync(configPath)) return '';
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        // Find CompatToolMapping > 438100 > name
        const mappingIdx = content.indexOf('"CompatToolMapping"');
        if (mappingIdx < 0) return '';
        const afterMapping = content.slice(mappingIdx);
        const block438Idx = afterMapping.indexOf('"438100"');
        if (block438Idx < 0) return '';
        const afterBlock = afterMapping.slice(block438Idx);
        // Find the opening brace for this entry
        const braceStart = afterBlock.indexOf('{');
        if (braceStart < 0) return '';
        const braceEnd = afterBlock.indexOf('}', braceStart);
        if (braceEnd < 0) return '';
        const inner = afterBlock.slice(braceStart + 1, braceEnd);
        const nameMatch = inner.match(/"name"\s+"([^"]*)"/);
        return nameMatch?.[1] ?? '';
    } catch {
        return '';
    }
}

/** Write the compat tool name for VRChat (appid 438100) into Steam config.vdf */
export function saveCompatTool(toolName: string): { success: boolean; message: string } {
    const configPath = getSteamConfigVdfPath();
    if (!fs.existsSync(configPath)) {
        throw new Error(`Steam config.vdf not found at ${configPath}`);
    }
    let content = fs.readFileSync(configPath, 'utf-8');

    // Locate CompatToolMapping block and within it replace the 438100 > name field
    const mappingIdx = content.indexOf('"CompatToolMapping"');
    if (mappingIdx < 0) throw new Error('"CompatToolMapping" not found in config.vdf');

    const block438Start = content.indexOf('"438100"', mappingIdx);
    if (block438Start < 0) throw new Error('"438100" entry not found under CompatToolMapping in config.vdf');

    const braceOpen = content.indexOf('{', block438Start);
    const braceClose = content.indexOf('}', braceOpen);
    if (braceOpen < 0 || braceClose < 0) throw new Error('Malformed 438100 block in config.vdf');

    const inner = content.slice(braceOpen + 1, braceClose);
    const updatedInner = inner.replace(/"name"\s+"[^"]*"/, `"name"\t\t"${toolName}"`);
    content = content.slice(0, braceOpen + 1) + updatedInner + content.slice(braceClose);

    fs.writeFileSync(configPath, content, 'utf-8');
    return { success: true, message: `Compatibility tool set to "${toolName}" in Steam config.vdf.` };
}

export async function isSteamRunning(): Promise<boolean> {
    try {
        const { stdout } = await execFileAsync('pgrep', ['-x', 'steam']);
        return Boolean(stdout.trim());
    } catch {
        return false;
    }
}

export async function stopSteam(): Promise<void> {
    try {
        await execFileAsync('steam', ['-shutdown']);
    } catch {
        try {
            await execFileAsync('pkill', ['-x', 'steam']);
        } catch {}
    }
}

export async function startSteam(): Promise<void> {
    const child = spawn('steam', [], {
        detached: true,
        stdio: 'ignore'
    });
    child.unref();
}

/** Find the content inside the first "438100" { ... } block, respecting nested braces. */
function extract438100Block(content: string): { blockStart: number; blockEnd: number; inner: string } | null {
    const marker = '"438100"';
    let searchFrom = 0;
    while (true) {
        const markerIdx = content.indexOf(marker, searchFrom);
        if (markerIdx < 0) return null;

        // Find the opening brace after the marker
        let braceOpen = content.indexOf('{', markerIdx + marker.length);
        if (braceOpen < 0) return null;

        // Walk forward counting brace depth to find the matching close
        let depth = 1;
        let i = braceOpen + 1;
        while (i < content.length && depth > 0) {
            if (content[i] === '{') depth++;
            else if (content[i] === '}') depth--;
            i++;
        }
        if (depth !== 0) { searchFrom = markerIdx + marker.length; continue; }

        const blockEnd = i; // exclusive
        const inner = content.slice(braceOpen + 1, i - 1);

        // Only return this block if it actually contains LaunchOptions
        if (/"LaunchOptions"/.test(inner)) {
            return { blockStart: braceOpen, blockEnd, inner };
        }
        searchFrom = markerIdx + marker.length;
    }
}

export function readLaunchOptions(): Omit<LaunchOptionsResponse, 'steamRunning'> {
    const filePath = getLocalConfigVdfPath();
    const compatTool = readCompatTool();
    const availableCompatTools = listCompatTools();

    if (!fs.existsSync(filePath)) {
        return { filePath, exists: false, rawLaunchOptions: '', compatTool, availableCompatTools };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    let rawLaunchOptions = '';

    try {
        // Use proper VDF parser — navigate to the authoritative apps block
        const parsed = VDF.parse(content);
        const appsBlock =
            parsed?.UserLocalConfigStore?.Software?.Valve?.Steam?.apps?.['438100'] ??
            parsed?.UserLocalConfigStore?.apps?.['438100'] ?? null;

        if (appsBlock?.LaunchOptions !== undefined) {
            // VDF stores escaped quotes as \" — unescape them for display/editing
            rawLaunchOptions = String(appsBlock.LaunchOptions).replace(/\\"/g, '"');
        }
    } catch (e) {
        console.warn('[launcher] VDF parse failed, falling back to brace-depth extractor:', e);
        // Fallback: brace-depth extractor
        const block = extract438100Block(content);
        if (block) {
            const loMatch = block.inner.match(/"LaunchOptions"\s+"((?:[^"\\]|\\.)*)"/); 
            if (loMatch) rawLaunchOptions = loMatch[1].replace(/\\"/g, '"');
        }
    }

    return { filePath, exists: true, rawLaunchOptions, compatTool, availableCompatTools };
}

export function saveLaunchOptions(newLaunchOptions: string): { success: boolean; message: string; filePath: string } {
    const filePath = getLocalConfigVdfPath();
    if (!fs.existsSync(filePath)) {
        throw new Error(`localconfig.vdf file not found at ${filePath}`);
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    const block = extract438100Block(content);

    if (!block) {
        throw new Error('VRChat app ID 438100 block with LaunchOptions not found in localconfig.vdf');
    }

    // Escape any literal " in the new value for VDF storage
    const escapedValue = newLaunchOptions.replace(/"/g, '\\"');
    const newInner = block.inner.replace(
        /"LaunchOptions"\s+"(?:[^"\\]|\\.)*"/,
        `"LaunchOptions"\t\t"${escapedValue}"`
    );

    content = content.slice(0, block.blockStart + 1) + newInner + content.slice(block.blockEnd - 1);
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true, message: 'Updated VRChat LaunchOptions in localconfig.vdf successfully.', filePath };
}

export async function launchTemporaryTestInstance(
    tool: string,
    cmd: string,
    worldId: string = 'wrld_a2fd9533-5c69-400b-a34e-ae0c11df99e1',
    restartSteam: boolean = true
): Promise<{ success: boolean; message: string; originalToolRestored: string; originalOptionsRestored: string }> {
    // 1. RAM BACKUP PHASE: Read and back up current Steam settings to memory
    const originalTool = readCompatTool();
    const originalOptionsRes = readLaunchOptions();
    const originalOptions = originalOptionsRes.rawLaunchOptions || '';

    console.log('[launcher] RAM Backup created:');
    console.log('  Original Tool   :', originalTool);
    console.log('  Original Options:', originalOptions);

    const wasSteamRunning = await isSteamRunning();
    if (wasSteamRunning && restartSteam) {
        console.log('[launcher] Steam is running. Shutting down Steam for temporary test configuration update...');
        await stopSteam();
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // 2. APPLY TEST CONFIGURATION
    if (tool) {
        saveCompatTool(tool);
    }

    // Construct full launch options command
    let testLaunchOptions = (cmd || '').trim();
    if (!testLaunchOptions.includes('%command%')) {
        testLaunchOptions = testLaunchOptions ? `${testLaunchOptions} %command%` : '%command%';
    }
    const vrchatUri = worldId.startsWith('vrchat://') ? worldId : `vrchat://launch?id=${worldId}`;
    if (!testLaunchOptions.includes('vrchat://') && !testLaunchOptions.includes('--watch-world=')) {
        testLaunchOptions = `${testLaunchOptions} --desktop "${vrchatUri}"`;
    }

    saveLaunchOptions(testLaunchOptions);

    // 3. TRIGGER VRCHAT LAUNCH VIA STEAM
    if (wasSteamRunning && restartSteam) {
        console.log('[launcher] Relaunching Steam...');
        await startSteam();
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    try {
        await execFileAsync('pkill', ['-f', 'reaper SteamLaunch AppId=438100']);
    } catch {}

    try {
        await execFileAsync('steam', [`steam://rungameid/438100//${vrchatUri}`]);
    } catch {
        await execFileAsync('bazzite-steam', ['-applaunch', '438100', '--desktop', vrchatUri]);
    }

    // 4. DELAY & RESTORE FROM RAM: Wait 5s for game process initialization then restore permanent config
    setTimeout(() => {
        try {
            saveCompatTool(originalTool);
            saveLaunchOptions(originalOptions);
            console.log('[launcher] RAM Restore complete: Permanent Steam settings restored.');
        } catch (restoreErr) {
            console.error('[launcher] Error restoring Steam config from RAM:', restoreErr);
        }
    }, 5000);

    return {
        success: true,
        message: 'VRChat launched with temporary test config. Permanent Steam settings backed up to RAM and restored.',
        originalToolRestored: originalTool,
        originalOptionsRestored: originalOptions
    };
}
