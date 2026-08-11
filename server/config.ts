import fs from 'node:fs';
import path from 'node:path';
import { readSettings } from './settings.ts';

function getVRChatAppDataDir(): string {
    const settings = readSettings();
    const customPath = settings.paths?.vrchatAppData;

    const candidatePaths = [
        customPath,
        process.env.VRC_APPDATA_DIR,
        '/run/media/system/Data/Games/Steam/steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat',
        path.join(process.env.HOME || '', '.local/share/Steam/steamapps/compatdata/438100/pfx/drive_c/users/steamuser/AppData/LocalLow/VRChat/VRChat')
    ].filter((p): p is string => Boolean(p));

    const found = candidatePaths.find((p) => fs.existsSync(p));
    if (found) return found;

    return customPath || candidatePaths[candidatePaths.length - 1];
}

function getConfigFilePath(): string {
    const dir = getVRChatAppDataDir();
    return path.join(dir, 'config.json');
}

export interface VRChatConfigResponse {
    filePath: string;
    exists: boolean;
    config: Record<string, any>;
    rawText: string;
}

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
        const config = JSON.parse(rawText || '{}');
        return {
            filePath,
            exists: true,
            config,
            rawText
        };
    } catch (err) {
        console.error('[ConfigService] Error parsing config.json:', err);
        return {
            filePath,
            exists: true,
            config: {},
            rawText: fs.readFileSync(filePath, 'utf-8')
        };
    }
}

export function saveVRChatConfig(newConfig: Record<string, any>): { success: boolean; message: string; filePath: string } {
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
