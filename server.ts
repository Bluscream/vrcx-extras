import express, { type ErrorRequestHandler } from 'express';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openAppWindow, type AppWindow } from './server/app-window.ts';
import { closeDb, resolveDbPath } from './server/db.ts';
import { EMBEDDED_FRONTEND } from './server/embedded-frontend.generated.ts';
import { preloadRegistryBackups } from './server/registry.ts';
import { router } from './server/routes.ts';

import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './server/openapi.ts';

/**
 * esbuild bundles this file to CJS for the packaged binary, where `import.meta`
 * is an empty object — reading `.url` yields undefined and `fileURLToPath`
 * throws. Fall back to the executable's own directory in that build; under
 * `node server.ts` the ESM value is present and used as before.
 */
const moduleUrl: string | undefined = import.meta.url;
const __dirname = moduleUrl
    ? path.dirname(fileURLToPath(moduleUrl))
    : path.dirname(process.execPath);
const PORT = Number(process.env.PORT ?? 8990);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json());

// Swagger interactive UI docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.use('/api', router);

// Any /api route that fell through is a client error, not an SPA deep link.
app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown API endpoint' });
});

const apiErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('[!] API error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
};
app.use('/api', apiErrorHandler);

const embeddedPaths = Object.keys(EMBEDDED_FRONTEND);
const distPath = path.join(__dirname, 'dist');

if (embeddedPaths.length > 0) {
    // Packaged binary: the frontend was inlined at build time, so there is no
    // dist/ on disk to read. Decode once at startup rather than per request.
    const assets = new Map(
        embeddedPaths.map((key) => [
            key,
            {
                contentType: EMBEDDED_FRONTEND[key]!.contentType,
                buffer: Buffer.from(EMBEDDED_FRONTEND[key]!.body, 'base64')
            }
        ])
    );
    const indexHtml = assets.get('/index.html');

    app.get('*', (req, res) => {
        const asset = assets.get(req.path);
        if (asset) {
            // Hashed filenames under /assets are immutable; index.html is not.
            res.setHeader(
                'Cache-Control',
                req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
            );
            res.type(asset.contentType).send(asset.buffer);
            return;
        }
        // Client-side routes such as /player-links must fall through to the SPA.
        if (indexHtml) {
            res.setHeader('Cache-Control', 'no-cache');
            res.type(indexHtml.contentType).send(indexHtml.buffer);
            return;
        }
        res.status(404).send('Not found');
    });
    console.log(`[*] Serving embedded frontend (${embeddedPaths.length} files).`);
} else if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // Client-side routes such as /player-links must fall through to the SPA.
    app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
} else {
    console.warn('[!] dist/ not found — run `npm run build` to serve the UI.');
}

/**
 * Binds the first free port at or after `preferred`.
 *
 * The UI and the API share one origin, so the port the server lands on is the
 * one the window must open — leaving it to chance (port 0) would work, but a
 * predictable 8990 keeps bookmarks and the Swagger docs link stable. Only when
 * something already holds it do we walk forward.
 */
function listenOnFreePort(preferred: number, attemptsLeft = 20): Promise<Server> {
    return new Promise((resolve, reject) => {
        const server = app.listen(preferred, HOST);
        server.once('listening', () => resolve(server));
        server.once('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
                console.warn(`[!] Port ${preferred} is in use, trying ${preferred + 1}...`);
                listenOnFreePort(preferred + 1, attemptsLeft - 1).then(resolve, reject);
                return;
            }
            reject(err);
        });
    });
}

let appWindow: AppWindow | null = null;

function shutdown(server: Server): void {
    appWindow?.close();
    server.close(() => {
        closeDb();
        process.exit(0);
    });
    // Don't hang on a wedged keep-alive connection.
    setTimeout(() => process.exit(0), 3000).unref();
}

// Wrapped in a function rather than using top-level await: esbuild cannot emit
// top-level await in the CJS bundle the packaged binary is built from.
async function main(): Promise<void> {
    const server = await listenOnFreePort(PORT);
    const boundPort = (server.address() as AddressInfo).port;
    const appUrl = `http://${HOST}:${boundPort}`;

    console.log(`[*] VRCX-Extras companion on ${appUrl}`);
    console.log(`[*] API at ${appUrl}/api  •  docs at ${appUrl}/docs`);
    console.log(`[*] DB path: ${resolveDbPath()}`);
    // Parse the backup blob now rather than on the first client request.
    preloadRegistryBackups();

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => shutdown(server));
    }

    // Only the packaged build owns a window: `node server.ts` is the dev
    // workflow, where the page is already open against the Vite dev server.
    // --no-window and VRCX_NO_WINDOW opt out for headless or remote use.
    const wantsWindow =
        embeddedPaths.length > 0 &&
        !process.argv.includes('--no-window') &&
        process.env['VRCX_NO_WINDOW'] !== '1';

    if (wantsWindow) {
        appWindow = openAppWindow(appUrl);
        // Closing the window quits the app, the way a desktop app behaves.
        void appWindow.closed.then(() => {
            console.log('[*] App window closed — shutting down.');
            shutdown(server);
        });
    }
}

main().catch((err) => {
    console.error('[!] Failed to start:', err);
    process.exit(1);
});
