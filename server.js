import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDb, resolveDbPath } from './server/db.js';
import { router } from './server/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8990);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = express();
app.disable('x-powered-by');
app.use(express.json());
app.use('/api', router);

// Any /api route that fell through is a client error, not an SPA deep link.
app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Unknown API endpoint' });
});

app.use('/api', (err, _req, res, _next) => {
    console.error('[!] API error:', err);
    res.status(500).json({ error: err.message ?? 'Internal server error' });
});

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
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

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
        server.close(() => closeDb().then(() => process.exit(0)));
    });
}
