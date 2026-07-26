// DAT completeness. Parses No-Intro/Redump/logiqx (XML) and ClrMamePro (text)
// DAT catalogs and computes raw-file CRC32 for matching against the collection.
// This is a SEPARATE dimension from the RetroAchievements hash (which strips
// iNES headers, byte-swaps N64, hashes arcade filenames, …): DATs universally
// carry the CRC32 of the untouched file, so completeness is matched on that.
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { FOLDER_ALIASES, normalizeName } from './consoles.js';

// ---- CRC32 (streaming, table-based; independent of zlib.crc32 availability) --
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function toHex(crc) { return (crc >>> 0).toString(16).padStart(8, '0'); }

// Stream a loose file and return its CRC32 as lowercase 8-char hex.
export function crc32File(filePath, { signal } = {}) {
  return new Promise((resolve, reject) => {
    let crc = 0xFFFFFFFF;
    const rs = createReadStream(filePath);
    const onAbort = () => rs.destroy(new Error('aborted'));
    if (signal) {
      if (signal.aborted) { rs.destroy(); return reject(new Error('aborted')); }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    rs.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ chunk[i]) & 0xFF];
    });
    rs.on('error', (e) => { if (signal) signal.removeEventListener('abort', onAbort); reject(e); });
    rs.on('end', () => { if (signal) signal.removeEventListener('abort', onAbort); resolve(toHex(crc ^ 0xFFFFFFFF)); });
  });
}

// Stream a loose file once and return crc32 + md5 + sha1 together. DATs match
// primarily on CRC, but some (Redump CHD, MAME <disk>) carry only sha1, so the
// completeness pass computes all three for loose files in a single read — the
// I/O dominates, the extra hashes are almost free.
export function hashFileAll(filePath, { signal } = {}) {
  return new Promise((resolve, reject) => {
    let crc = 0xFFFFFFFF;
    const md5 = createHash('md5');
    const sha1 = createHash('sha1');
    const rs = createReadStream(filePath);
    const onAbort = () => rs.destroy(new Error('aborted'));
    if (signal) {
      if (signal.aborted) { rs.destroy(); return reject(new Error('aborted')); }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    rs.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ chunk[i]) & 0xFF];
      md5.update(chunk); sha1.update(chunk);
    });
    rs.on('error', (e) => { if (signal) signal.removeEventListener('abort', onAbort); reject(e); });
    rs.on('end', () => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve({ crc: toHex(crc ^ 0xFFFFFFFF), md5: md5.digest('hex'), sha1: sha1.digest('hex') });
    });
  });
}

// CRC32 of a member inside a .zip — read straight from the central directory,
// no decompression needed (this is what makes matching zip collections cheap).
export async function crc32ZipEntry(filePath, innerName) {
  const { default: StreamZip } = await import('node-stream-zip');
  const zip = new StreamZip.async({ file: filePath });
  try {
    const entries = await zip.entries();
    const entry = entries[innerName] || Object.values(entries).find((e) => e.name === innerName);
    if (!entry || entry.crc == null) return null;
    return toHex(entry.crc);
  } finally {
    await zip.close().catch(() => {});
  }
}

// ---- DAT parsing -----------------------------------------------------------
function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function xmlAttr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i')) || tag.match(new RegExp(name + "\\s*=\\s*'([^']*)'", 'i'));
  return m ? decodeXml(m[1]) : null;
}

function parseXmlDat(text) {
  const header = {};
  const hm = text.match(/<header\b[^>]*>([\s\S]*?)<\/header>/i);
  if (hm) {
    const inner = hm[1];
    const pick = (k) => { const m = inner.match(new RegExp('<' + k + '\\b[^>]*>([\\s\\S]*?)</' + k + '>', 'i')); return m ? decodeXml(m[1]).trim() : null; };
    header.name = pick('name');
    header.description = pick('description');
    header.version = pick('version');
  }
  const entries = [];
  const gameRe = /<(?:game|machine)\b([^>]*)>([\s\S]*?)<\/(?:game|machine)>/gi;
  let g;
  while ((g = gameRe.exec(text))) {
    const gameName = xmlAttr(g[1], 'name');
    const body = g[2];
    // <rom> (cart/disc images) and <disk> (MAME CHDs, sha1-only) both count.
    const romRe = /<(?:rom|disk)\b([^>]*?)\/?>/gi;
    let r;
    while ((r = romRe.exec(body))) {
      const a = r[1];
      if (/status\s*=\s*["'](?:nodump|baddump)["']/i.test(a)) continue; // no usable hash
      const crc = xmlAttr(a, 'crc');
      const md5 = xmlAttr(a, 'md5');
      const sha1 = xmlAttr(a, 'sha1');
      if (!crc && !md5 && !sha1) continue; // e.g. <rom status="nodump"/>
      entries.push({
        game_name: gameName,
        rom_name: xmlAttr(a, 'name'),
        size: Number(xmlAttr(a, 'size')) || null,
        crc, md5, sha1,
      });
    }
  }
  return { header, entries };
}

// Iterate balanced `keyword (...)` blocks in a ClrMamePro DAT, skipping parens
// that live inside quoted strings — ROM/game names routinely contain them, e.g.
// `name "Sonic (World)"`, so naive paren-counting would mis-balance and a
// `[^)]*` rom regex would stop at the first ")".
function* cmBlocks(text, keyword) {
  const re = new RegExp('\\b(?:' + keyword + ')\\s*\\(', 'g');
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length; let depth = 1; let q = false;
    const start = i;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === '"') q = !q;
      else if (!q && ch === '(') depth++;
      else if (!q && ch === ')') depth--;
      i++;
    }
    yield text.slice(start, i - 1);
    re.lastIndex = i;
  }
}
function cmVal(block, key) {
  const m = block.match(new RegExp('\\b' + key + '\\s+"([^"]*)"')) || block.match(new RegExp('\\b' + key + '\\s+([^\\s)]+)'));
  return m ? m[1] : null;
}
function parseClrMameDat(text) {
  const header = {};
  const hm = text.match(/clrmamepro\s*\(([\s\S]*?)\n\)/i) || text.match(/clrmamepro\s*\(([\s\S]*?)\)/i);
  if (hm) {
    header.name = cmVal(hm[1], 'name');
    header.description = cmVal(hm[1], 'description');
    header.version = cmVal(hm[1], 'version');
  }
  const entries = [];
  for (const block of cmBlocks(text, 'game|machine|set')) {
    const firstRom = block.search(/\b(?:rom|disk)\s*\(/);
    const gameHead = firstRom >= 0 ? block.slice(0, firstRom) : block;
    const gameName = cmVal(gameHead, 'name');
    for (const rb of cmBlocks(block, 'rom|disk')) {
      const crc = cmVal(rb, 'crc');
      const md5 = cmVal(rb, 'md5');
      const sha1 = cmVal(rb, 'sha1');
      if (!crc && !md5 && !sha1) continue;
      entries.push({
        game_name: gameName,
        rom_name: cmVal(rb, 'name'),
        size: Number(cmVal(rb, 'size')) || null,
        crc, md5, sha1,
      });
    }
  }
  return { header, entries };
}

export function parseDat(text) {
  const head = text.slice(0, 4000).trimStart();
  const isXml = head.startsWith('<?xml') || head.startsWith('<!DOCTYPE') || /<datafile[\s>]/i.test(head) || /<mame[\s>]/i.test(head);
  return isXml ? parseXmlDat(text) : parseClrMameDat(text);
}

// Best-effort RA console guess from a DAT header name (informational only —
// matching is by hash and does not depend on this). No-Intro/Redump headers
// look like "Nintendo - Super Nintendo Entertainment System" or
// "Sony - PlayStation"; we reuse the curated FOLDER_ALIASES map and pick the
// LONGEST alias phrase that appears as a whole token run (so "super nintendo …"
// beats a bare "nintendo", and short aliases like "ds"/"gg" never match inside
// another word).
const ALIASES_BY_LEN = Object.keys(FOLDER_ALIASES)
  .map((a) => ({ alias: a, tokens: normalizeName(a).split(' ').filter(Boolean) }))
  .sort((x, y) => y.tokens.length - x.tokens.length || y.alias.length - x.alias.length);

function tokensContain(hay, needle) {
  if (!needle.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

export function guessConsole(headerName) {
  const tokens = normalizeName(headerName || '').split(' ').filter(Boolean);
  if (!tokens.length) return null;
  for (const { alias, tokens: at } of ALIASES_BY_LEN) {
    if (tokensContain(tokens, at)) return FOLDER_ALIASES[alias];
  }
  return null;
}
