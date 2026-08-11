import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppSettings, DefinitionUrls, DiskCacheStatus } from '../shared/api.ts';

export const DEFAULT_SETTINGS: AppSettings = {
    urls: {
        cmdline: 'https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/cmdline.csv',
        env: 'https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/env.csv',
        registry: 'https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/registry.csv',
        configSchema: 'https://raw.githubusercontent.com/Bluscream/vrchat-definitions/main/config.schema.json'
    },
    paths: {
        protonPrefix: '/run/media/system/Data/Games/Steam/steamapps/compatdata/438100/pfx',
        wineBin: '',
        vrchatAppData: '/run/media/system/Data/Games/Steam/steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat',
        localConfigVdf: '',
        steamConfigVdf: '',
        compatToolsDir: '/run/media/system/Data/Games/Steam/compatibilitytools.d'
    },
    cacheTtlMinutes: 60
};

export function getAppConfigDir(): string {
    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        return path.join(appData, 'vrcx-extras');
    }
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(configHome, 'vrcx-extras');
}

export function getConfigFile(): string {
    return path.join(getAppConfigDir(), 'config.toml');
}

export function getCacheDir(): string {
    return path.join(getAppConfigDir(), 'cache');
}

function ensureDirsExist() {
    const configDir = getAppConfigDir();
    const cacheDir = getCacheDir();
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
}

/** Simple, robust TOML generator for AppSettings */
function serializeSettingsToToml(settings: AppSettings): string {
    return `# vrcx-extras Configuration File
# Auto-generated. Saved in AppDir: ${getConfigFile()}

[cache]
ttl_minutes = ${settings.cacheTtlMinutes}

[urls]
cmdline = "${settings.urls.cmdline}"
env = "${settings.urls.env}"
registry = "${settings.urls.registry}"
config_schema = "${settings.urls.configSchema}"

[paths]
proton_prefix = "${settings.paths?.protonPrefix || ''}"
wine_bin = "${settings.paths?.wineBin || ''}"
vrchat_appdata = "${settings.paths?.vrchatAppData || ''}"
localconfig_vdf = "${settings.paths?.localConfigVdf || ''}"
steamconfig_vdf = "${settings.paths?.steamConfigVdf || ''}"
compat_tools_dir = "${settings.paths?.compatToolsDir || ''}"
`;
}

/** Simple TOML reader for AppSettings */
function parseTomlSettings(tomlStr: string): AppSettings {
    const settings: AppSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    let currentSection = '';

    for (const rawLine of tomlStr.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.slice(1, -1).trim();
            continue;
        }

        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;

        const key = line.slice(0, eqIdx).trim();
        let valStr = line.slice(eqIdx + 1).trim();
        if (valStr.startsWith('"') && valStr.endsWith('"')) {
            valStr = valStr.slice(1, -1);
        }

        if (currentSection === 'cache' && key === 'ttl_minutes') {
            const num = parseInt(valStr, 10);
            if (!isNaN(num)) settings.cacheTtlMinutes = num;
        } else if (currentSection === 'urls') {
            if (key === 'cmdline') settings.urls.cmdline = valStr;
            if (key === 'env') settings.urls.env = valStr;
            if (key === 'registry') settings.urls.registry = valStr;
            if (key === 'config_schema') settings.urls.configSchema = valStr;
        } else if (currentSection === 'paths') {
            if (!settings.paths) settings.paths = { ...DEFAULT_SETTINGS.paths };
            if (key === 'proton_prefix') settings.paths.protonPrefix = valStr;
            if (key === 'wine_bin') settings.paths.wineBin = valStr;
            if (key === 'vrchat_appdata') settings.paths.vrchatAppData = valStr;
            if (key === 'localconfig_vdf') settings.paths.localConfigVdf = valStr;
            if (key === 'steamconfig_vdf') settings.paths.steamConfigVdf = valStr;
            if (key === 'compat_tools_dir') settings.paths.compatToolsDir = valStr;
        }
    }

    return settings;
}

export function readSettings(): AppSettings {
    ensureDirsExist();
    const file = getConfigFile();
    if (!fs.existsSync(file)) {
        writeSettings(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
    }
    try {
        const content = fs.readFileSync(file, 'utf-8');
        return parseTomlSettings(content);
    } catch (err) {
        console.error('[Settings] Error reading config.toml:', err);
        return DEFAULT_SETTINGS;
    }
}

export function writeSettings(settings: AppSettings): boolean {
    ensureDirsExist();
    const file = getConfigFile();
    try {
        const tomlStr = serializeSettingsToToml(settings);
        fs.writeFileSync(file, tomlStr, 'utf-8');
        console.log(`[Settings] Updated config.toml at ${file}`);
        return true;
    } catch (err) {
        console.error('[Settings] Error writing config.toml:', err);
        return false;
    }
}

export function getDiskCacheStatus(): DiskCacheStatus {
    ensureDirsExist();
    const cacheDir = getCacheDir();
    const filesInfo: Array<{ name: string; ageMinutes: number; sizeBytes: number }> = [];
    let totalSizeBytes = 0;

    try {
        const entries = fs.readdirSync(cacheDir);
        for (const entry of entries) {
            const filePath = path.join(cacheDir, entry);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
                const ageMinutes = Math.floor((Date.now() - stat.mtimeMs) / 60000);
                totalSizeBytes += stat.size;
                filesInfo.push({
                    name: entry,
                    ageMinutes,
                    sizeBytes: stat.size
                });
            }
        }
    } catch {}

    return {
        count: filesInfo.length,
        totalSizeBytes,
        files: filesInfo
    };
}

export function clearDiskCache(): boolean {
    ensureDirsExist();
    const cacheDir = getCacheDir();
    try {
        const entries = fs.readdirSync(cacheDir);
        for (const entry of entries) {
            fs.unlinkSync(path.join(cacheDir, entry));
        }
        console.log('[Settings] Cleared disk cache folder');
        return true;
    } catch (err) {
        console.error('[Settings] Error clearing disk cache:', err);
        return false;
    }
}

export async function fetchDefinitionContent(name: keyof DefinitionUrls, forceRefresh = false): Promise<string> {
    ensureDirsExist();
    const settings = readSettings();
    const url = settings.urls[name];
    const fileName = `${name}.cache`;
    const cacheFile = path.join(getCacheDir(), fileName);

    const ttlMs = settings.cacheTtlMinutes * 60 * 1000;
    const isExpired = fs.existsSync(cacheFile)
        ? (Date.now() - fs.statSync(cacheFile).mtimeMs) > ttlMs
        : true;

    if (!forceRefresh && ttlMs > 0 && fs.existsSync(cacheFile) && !isExpired) {
        try {
            return fs.readFileSync(cacheFile, 'utf-8');
        } catch {}
    }

    console.log(`[Definitions] Fetching ${name} definition from remote URL: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
        // Fallback to disk cache if available even if expired
        if (fs.existsSync(cacheFile)) {
            console.warn(`[Definitions] Remote fetch failed (${response.status}), falling back to disk cache.`);
            return fs.readFileSync(cacheFile, 'utf-8');
        }
        throw new Error(`Failed to fetch ${name} definition: HTTP ${response.status}`);
    }

    const content = await response.text();
    try {
        fs.writeFileSync(cacheFile, content, 'utf-8');
    } catch (err) {
        console.error(`[Definitions] Error writing disk cache for ${name}:`, err);
    }

    return content;
}
