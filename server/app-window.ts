/**
 * Opens the UI in its own desktop window instead of a browser tab.
 *
 * The packaged binary is a plain Node SEA, so there is no Electron runtime to
 * host a window. Instead we drive an already-installed Chromium engine in
 * "app mode" (`--app=<url>`), which gives a standalone window with no tab
 * strip, address bar or bookmarks — the same trick Discord-alikes and PWA
 * installers use. A private profile directory keeps it out of the user's
 * normal browsing session, so no history, extensions or open tabs leak in.
 *
 * If no Chromium engine is present we fall back to the default browser rather
 * than failing: the app is still fully usable, just in a normal tab.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Chromium-family binaries, most preferred first. */
function browserCandidates(): string[] {
    if (process.platform === 'win32') {
        const programFiles = [
            process.env['PROGRAMFILES'],
            process.env['PROGRAMFILES(X86)'],
            process.env['LOCALAPPDATA']
        ].filter((dir): dir is string => Boolean(dir));

        const relative = [
            'Microsoft\\Edge\\Application\\msedge.exe',
            'Google\\Chrome\\Application\\chrome.exe',
            'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            'Chromium\\Application\\chrome.exe'
        ];
        // Edge first: it ships with Windows, so it is the one guaranteed hit.
        return programFiles.flatMap((dir) => relative.map((rel) => path.join(dir, rel)));
    }

    if (process.platform === 'darwin') {
        return [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ];
    }

    return [
        'google-chrome-stable',
        'google-chrome',
        'chromium',
        'chromium-browser',
        'brave-browser',
        'microsoft-edge-stable',
        'microsoft-edge',
        'vivaldi-stable'
    ];
}

/** Resolves a bare command name against PATH; absolute paths are checked directly. */
function resolveExecutable(candidate: string): string | null {
    if (path.isAbsolute(candidate)) {
        return fs.existsSync(candidate) ? candidate : null;
    }
    const dirs = (process.env['PATH'] ?? '').split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
        const full = path.join(dir, candidate);
        if (fs.existsSync(full)) {
            return full;
        }
    }
    return null;
}

function findBrowser(): string | null {
    for (const candidate of browserCandidates()) {
        const resolved = resolveExecutable(candidate);
        if (resolved) {
            return resolved;
        }
    }
    return null;
}

/** Opens `url` with the OS default handler. Used when no Chromium engine exists. */
function openInDefaultBrowser(url: string): void {
    const command =
        process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
    try {
        spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
        console.log(`[*] Opened ${url} in the default browser.`);
    } catch (err) {
        console.warn(`[!] Could not open a browser automatically — visit ${url}`, err);
    }
}

export type AppWindow = {
    /** Resolves when the user closes the window, or never if none was opened. */
    closed: Promise<void>;
    /** Terminates the window process if it is still running. */
    close: () => void;
};

/**
 * Launches the app window. Returns a handle whose `closed` promise settles when
 * the user closes it, so the caller can shut the server down with the window.
 */
export function openAppWindow(url: string): AppWindow {
    const browser = findBrowser();
    if (!browser) {
        console.log('[*] No Chromium-based browser found; falling back to the default browser.');
        openInDefaultBrowser(url);
        return { closed: new Promise<void>(() => {}), close: () => {} };
    }

    // Per-app profile so the window never touches the user's real browser
    // session, and so app mode is not silently downgraded to a normal tab in
    // an existing instance.
    const profileDir = path.join(os.tmpdir(), 'vrcx-extras-window');

    let child: ChildProcess;
    try {
        child = spawn(
            browser,
            [
                `--app=${url}`,
                `--user-data-dir=${profileDir}`,
                '--window-size=1400,900',
                '--no-first-run',
                '--no-default-browser-check'
            ],
            { stdio: 'ignore' }
        );
    } catch (err) {
        console.warn('[!] Failed to launch the app window; falling back to the default browser.', err);
        openInDefaultBrowser(url);
        return { closed: new Promise<void>(() => {}), close: () => {} };
    }

    console.log(`[*] Opened app window via ${path.basename(browser)}.`);

    const closed = new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.once('error', (err) => {
            console.warn('[!] App window process error:', err);
            resolve();
        });
    });

    return {
        closed,
        close: () => {
            if (child.exitCode === null && !child.killed) {
                child.kill();
            }
        }
    };
}
