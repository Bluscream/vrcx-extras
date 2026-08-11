import fs from 'node:fs';
import path from 'node:path';
import type { VRChatConfigResponse } from '../shared/api.ts';
import { isJsonObject, type JsonObject } from '../shared/json.ts';
import { findProtonPrefix } from './registry.ts';

export function getVRChatAppDataDir(): string {
    const protonPrefix = findProtonPrefix();
    if (protonPrefix) {
        const derived = path.join(protonPrefix, 'drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat');
        if (fs.existsSync(derived)) return derived;
    }

    const candidatePaths = [
        process.env.VRC_APPDATA_DIR,
        '/run/media/system/Data/Games/Steam/steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat',
        path.join(process.env.HOME || '', '.local/share/Steam/steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat')
    ].filter((p): p is string => Boolean(p));

    const found = candidatePaths.find((p) => fs.existsSync(p));
    return found || candidatePaths[candidatePaths.length - 1];
}

function getConfigFilePath(): string {
    const dir = getVRChatAppDataDir();
    return path.join(dir, 'config.json');
}

// The response shape lives in shared/api.ts; re-exported so existing importers
// of this module keep working while both sides share one definition.
export type { VRChatConfigResponse };

export function readVRChatConfig(): VRChatConfigResponse {
    const filePath = getConfigFilePath();
    if (!fs.existsSync(filePath)) {
        return {
            filePath,
            exists: false,
            config: {},
            rawText: '{}'
        };
    }

    try {
        const rawText = fs.readFileSync(filePath, 'utf-8');
        const parsed: unknown = JSON.parse(rawText || '{}');
        // config.json is edited by VRChat and by hand, so a non-object (or a
        // JSON scalar) must not reach the UI as though it were a settings map.
        return {
            filePath,
            exists: true,
            config: isJsonObject(parsed) ? parsed : {},
            rawText
        };
    } catch (err) {
        console.error('[ConfigService] Error parsing config.json:', err);
        // Re-reading can fail too (permissions, races); the raw text is only
        // ever advisory here, so fall back to an empty document.
        let rawText = '{}';
        try {
            rawText = fs.readFileSync(filePath, 'utf-8');
        } catch {
            /* keep the empty fallback */
        }
        return {
            filePath,
            exists: true,
            config: {},
            rawText
        };
    }
}

export function saveVRChatConfig(newConfig: JsonObject): { success: boolean; message: string; filePath: string } {
    const filePath = getConfigFilePath();
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const formattedJson = JSON.stringify(newConfig, null, 2);
    fs.writeFileSync(filePath, formattedJson, 'utf-8');

    return {
        success: true,
        message: 'Saved config.json successfully.',
        filePath
    };
}
