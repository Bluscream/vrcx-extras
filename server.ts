import express, { type ErrorRequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const server = app.listen(PORT, HOST, () => {
    console.log(`[*] VRCX-Extras companion backend on http://${HOST}:${PORT}`);
    console.log(`[*] DB path: ${resolveDbPath()}`);
    // Parse the backup blob now rather than on the first client request.
    preloadRegistryBackups();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        server.close(() => {
            closeDb();
            process.exit(0);
        });
    });
}
