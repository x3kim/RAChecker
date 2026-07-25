// On-disk image cache for RA game icons / box art / system icons.
// Each remote image is fetched once and served locally thereafter.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile, readFile, rename } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { config, RA_MEDIA_BASE, RA_STATIC_BASE } from './config.js';

// Only RetroAchievements image hosts may be fetched. Accepting arbitrary URLs
// would make /api/image an SSRF proxy into the user's LAN (router/NAS admin
// pages) and an unbounded disk-cache filler.
const ALLOWED_HOSTS = new Set([
  new URL(RA_MEDIA_BASE).host,
  new URL(RA_STATIC_BASE).host,
  'retroachievements.org',
  'www.retroachievements.org',
]);

function resolveUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//.test(pathOrUrl)) {
    try {
      return ALLOWED_HOSTS.has(new URL(pathOrUrl).host) ? pathOrUrl : null;
    } catch {
      return null;
    }
  }
  return `${RA_MEDIA_BASE}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

function cacheFileFor(url) {
  const ext = (extname(new URL(url).pathname) || '.png').slice(0, 5);
  const key = createHash('sha1').update(url).digest('hex');
  return join(config.imageCacheDir, `${key}${ext}`);
}

const inflight = new Map();

// Returns a local file path for the given RA image path/URL, downloading and
// caching on first request. Returns null if the image can't be fetched.
export async function getCachedImage(pathOrUrl) {
  const url = resolveUrl(pathOrUrl);
  if (!url) return null;
  const file = cacheFileFor(url);
  if (existsSync(file)) return file;
  if (inflight.has(file)) return inflight.get(file);

  const p = (async () => {
    const res = await fetch(url, { headers: { 'User-Agent': 'RAChecker/0.1' } });
    if (!res.ok) throw new Error(`image ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Write atomically (tmp + rename): a crash mid-write must not leave a
    // truncated file that the existsSync check then serves as "cached" forever.
    const tmp = `${file}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, file);
    return file;
  })().finally(() => inflight.delete(file));

  inflight.set(file, p);
  try { return await p; } catch { return null; }
}

export async function readCachedImage(pathOrUrl) {
  const file = await getCachedImage(pathOrUrl);
  if (!file) return null;
  return { path: file, buffer: await readFile(file) };
}
