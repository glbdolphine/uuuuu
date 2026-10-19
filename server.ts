import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './server/api';
import { getEdcIndex } from './server/edcIndex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const certPath = process.env.SSL_CERT || path.resolve(__dirname, 'data', 'certs', 'cert.pem');
  const keyPath = process.env.SSL_KEY || path.resolve(__dirname, 'data', 'certs', 'key.pem');
  const useHttps = fs.existsSync(certPath) && fs.existsSync(keyPath);
  if (useHttps) process.env.PACE_HTTPS = '1'; // the session cookie becomes Secure-only
  const PORT = parseInt(process.env.PORT || '3000', 10);

  if (useHttps) app.use((_req, res, next) => { res.setHeader('Strict-Transport-Security', 'max-age=15552000'); next(); });

  // Request size limits: only the routes that carry files (PDFs, backups, logs with an attached form)
  // may be big. Everything else is capped at 2 MB, so a stray or hostile request can't eat the memory.
  const bigJson = express.json({ limit: '50mb' });
  const smallJson = express.json({ limit: '2mb' });
  const BIG_ROUTES = /^\/(pdf\/scan|logs|logs\/batch|logs\/restore|targets\/import|import-requests|logs\/[^/]+\/upac-form)\/?$/;
  app.use('/api', (req, res, next) => {
    const big = req.method === 'POST' && BIG_ROUTES.test(req.path);
    (big ? bigJson : smallJson)(req, res, next);
  });
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // API router
  app.use('/api', apiRouter);

  // Oversized or malformed request bodies get a clear JSON answer instead of an HTML error page
  app.use('/api', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed request.' });
    return next(err);
  });

  // Serve frontend.
  // Default: serve the built app from ./dist (fast, no file watching, no auto-reloads).
  // Development: `npm run dev` starts Vite with hot reload (and never watches ./data).
  const distPath = path.resolve(__dirname, 'dist');
  const wantsDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
  const hasBuild = fs.existsSync(path.join(distPath, 'index.html'));
  const serveBuilt = !wantsDev && (process.env.NODE_ENV === 'production' || hasBuild);

  if (!wantsDev && !hasBuild) {
    console.log('[Pace IT] No build found in ./dist - starting in development mode. Run "npm run build" for the fast production mode.');
  }

  if (serveBuilt) {
    console.log('[Pace IT] Serving the built app from ./dist (run "npm run build" after code changes).');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // The database lives in ./data and changes on every save - it must not trigger reloads.
        watch: { ignored: ['**/data/**', '**/*.sqlite*', '**/dist/**'] },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // HTTPS: put a certificate and key at data/certs/cert.pem + key.pem (or point SSL_CERT / SSL_KEY at
  // them) and the server switches to HTTPS by itself. HOST=127.0.0.1 keeps it reachable from this
  // computer only. Default is 0.0.0.0 so colleagues on the office network can open it.
  const HOST = process.env.HOST || '0.0.0.0';

  let server: http.Server | https.Server;
  if (useHttps) {
    server = https.createServer({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) }, app);
  } else {
    server = http.createServer(app);
  }

  server.listen(PORT, HOST, () => {
    const scheme = useHttps ? 'https' : 'http';
    console.log(`[Pace IT] Running at ${scheme}://localhost:${PORT}`);
    if (HOST === '0.0.0.0') console.log(`[Pace IT] Reachable from the office network on port ${PORT}`);
    // Load the EDC workbook now so the first Form Maker lookup is instant.
    setTimeout(() => { try { getEdcIndex(); } catch (e) { console.error(e); } }, 50);
  });
}

startServer().catch((err) => {
  console.error('[Pace IT] Failed to start server:', err);
  process.exit(1);
});
