// RAChecker backend entry point.
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT } from './config.js';
import { registerRoutes } from './routes.js';
import { ensureTempDir, sweepTempOnStartup } from './hashing/archive.js';
import {
  backfillTitleNorm, backfillLibraryTags, restoreHashNames, seedHashNames,
  reparseHashNames, markTagParserVersion, restoreGameGenres, backfillGenreMajor,
  applySavedCredentials, applySavedConfig, autoBackup, getSetting,
} from './db.js';
import { initWatch } from './watcher.js';
import { initScheduler } from './scheduler.js';
import { initPresence } from './presence.js';

const WEB_DIST = join(ROOT, 'web', 'dist');

async function main() {
  await ensureTempDir();
  applySavedCredentials();
  applySavedConfig();
  try { const b = autoBackup(); if (!b.skipped) console.log(`[db] startup backup -> ${b.file}`); } catch (e) { console.warn('[db] backup failed:', e.message); }
  try { const n = backfillTitleNorm(); if (n) console.log(`[db] backfilled title_norm for ${n} games`); } catch (e) { console.warn('[db] backfill failed:', e.message); }
  // Region/language tags for collections scanned before the feature existed —
  // pure filename parsing, so no re-scan and no file access is needed.
  try { const n = backfillLibraryTags(); if (n) console.log(`[db] parsed region/language tags for ${n} collection entries`); } catch (e) { console.warn('[db] tag backfill failed:', e.message); }
  // Put previously fetched ROM names back onto the hash rows — a console re-sync
  // rebuilds those, and without this every verified region would be lost.
  try { const n = seedHashNames(); if (n) console.log(`[db] adopted ${n} previously fetched ROM names`); } catch (e) { console.warn('[db] hash-name seed failed:', e.message); }
  try { const n = restoreHashNames(); if (n) console.log(`[db] restored ${n} RetroAchievements ROM names`); } catch (e) { console.warn('[db] hash-name restore failed:', e.message); }
  // Same for genres: `games` is rebuilt on every console sync, game_genres isn't.
  try { const n = restoreGameGenres(); if (n) console.log(`[db] restored ${n} game genres`); } catch (e) { console.warn('[db] genre restore failed:', e.message); }
  try { const n = backfillGenreMajor(); if (n) console.log(`[db] classified ${n} games into major genres`); } catch (e) { console.warn('[db] genre classification failed:', e.message); }
  // A parser change invalidates stored region/language values — re-derive them
  // from the names we already have, then remember the version. Both passes are
  // no-ops once the stored version matches.
  try { const n = reparseHashNames(); if (n) console.log(`[db] re-read region/language on ${n} ROM names`); } catch (e) { console.warn('[db] hash-name reparse failed:', e.message); }
  try { markTagParserVersion(); } catch { /* next boot retries */ }

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || 'info', transport: undefined },
    bodyLimit: 8 * 1024 * 1024,
  });

  // CORS: only the app itself (same host) and the Vite dev server may call
  // the API. `origin: true` would reflect ANY origin — a malicious website in
  // the same browser could then read the library or POST destructive actions
  // (classic localhost drive-by).
  await app.register(cors, {
    origin: (origin, cb) => {
      // Same-origin/no-Origin requests (the served UI, curl) carry no Origin
      // header or one matching the server — both are fine.
      if (!origin) return cb(null, true);
      try {
        const { hostname } = new URL(origin);
        const ok = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === config.host;
        return cb(null, ok);
      } catch {
        return cb(null, false);
      }
    },
  });
  await app.register(multipart, { limits: { fileSize: 4 * 1024 * 1024 * 1024, files: 200 } });
  await registerRoutes(app);

  // Serve the built frontend if present (production). In dev, Vite serves it.
  if (existsSync(WEB_DIST)) {
    await app.register(fastifyStatic, { root: WEB_DIST, prefix: '/' });
    // SPA fallback for client-side routes (but never for /api/*).
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && req.raw.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', async () => ({
      ok: true,
      message: 'RAChecker backend running. Frontend not built yet — run "npm run dev" or "npm run build".',
    }));
  }

  await app.listen({ port: config.port, host: config.host });
  const url = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
  app.log.info(`RAChecker ready at ${url}`);
  // Sweep temp only AFTER the port is ours: a second instance must die on
  // EADDRINUSE before it can delete the temp files of a scan running in the
  // first instance.
  try { const n = await sweepTempOnStartup(); if (n) console.log(`[temp] swept ${n} leftover temp item(s)`); } catch { /* non-fatal */ }
  // Resume the folder watcher only if the user previously enabled it.
  try { initWatch(getSetting('romRoot', config.romRoot)); } catch (e) { app.log.warn(`watch init failed: ${e.message}`); }
  // Start the daily-scan scheduler (no-op unless the user enabled it).
  try { initScheduler({ getRoot: () => getSetting('romRoot', config.romRoot) }); } catch (e) { app.log.warn(`scheduler init failed: ${e.message}`); }
  // Resume Rich-Presence polling (opt-in, no-op unless enabled in Settings).
  try { initPresence(); } catch (e) { app.log.warn(`presence init failed: ${e.message}`); }
  if (!existsSync(WEB_DIST)) app.log.info('(frontend dev server: http://localhost:5173)');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
