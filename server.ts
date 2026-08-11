import express, { type ErrorRequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDb, resolveDbPath } from './server/db.ts';
import { router } from './server/routes.ts';

import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './server/openapi.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8990);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = express();
app.disable('x-powered-by');
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

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
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
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        server.close(() => {
            closeDb();
            process.exit(0);
        });
    });
}
