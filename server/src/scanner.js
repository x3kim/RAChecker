// Recursive ROM library scanner. Walks a folder tree, detects each file's
// console (by extension + sorted-folder name), computes the RetroAchievements
// hash, and matches it against the cached hash database.
import { readdir, stat, unlink, statfs } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join, extname, basename, relative, sep } from 'node:path';
import {
  CONSOLE_BY_ID, EXT_TO_CONSOLES, ARCHIVE_EXTS,
  consoleFromFolderSegments,
} from './consoles.js';
import { hashTarget } from './hashing/index.js';
import { isCsoPath, expandCso } from './hashing/cso.js';
import { listEntries, archiveType } from './hashing/archive.js';
import { config } from './config.js';
import {
  lookupHash, getCachedFileHash, setCachedFileHash, insertScanItem, upsertLibraryItem,
  getLibraryItem, libraryArchiveUnchanged,
} from './db.js';

// Single-file disc containers — safe to copy to local temp before hashing
// because they carry no external sidecars. A .cue/.gdi/.ccd references separate
// tracks, so we must NOT copy just the index file; those hash in place.
const DISC_SELF_CONTAINED = new Set(['.chd', '.iso', '.cso', '.zso', '.ciso', '.pbp', '.rvz', '.gcz', '.wbfs', '.wia', '.nrg']);

// Raw disc tracks / sidecars we skip (the container .cue/.chd/.gdi is hashed).
const DISC_SIDECAR = new Set(['.bin', '.img', '.sub', '.ccd', '.sbi', '.toc']);
const IGNORE_DIRS = new Set([
  '$recycle.bin', 'system volume information', '.git', 'node_modules', '@eadir',
  '.appledouble', '.trashes', '.spotlight-v100', '.fseventsd', 'found.000', 'recycler',
]);
const IGNORE_FILES = new Set(['thumbs.db', 'desktop.ini', '.ds_store']);
// Non-ROM junk that may share a folder; never treat these as ROMs.
const JUNK_EXTS = new Set([
  '.txt', '.nfo', '.dat', '.xml', '.html', '.htm', '.json', '.ini', '.cfg',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.pdf', '.url', '.lnk', '.db',
  '.sav', '.srm', '.state', '.rtc', '.mcr', '.mcd', '.ups', '.ips', '.bps', '.xdelta',
  '.exe', '.dll', '.log', '.bak', '.part', '.tmp', '.torrent',
]);

// Skip Apple resource forks, hidden/dot files, and known junk filenames.
function isIgnoredFile(name) {
  const lower = name.toLowerCase();
  return name.startsWith('._') || name.startsWith('.') || IGNORE_FILES.has(lower);
}

function isArchive(ext) { return ARCHIVE_EXTS.has(ext); }

// Statuses worth persisting into the collection (skip silent/skipped rows).
const PERSISTED_STATUS = new Set(['match', 'no_match', 'needs_rahasher', 'unsupported', 'ambiguous', 'error']);

// Decide which console + hashing rule applies to a plain file.
export function classifyFile(filePath, ext, folderConsoleId) {
  if (!ext || JUNK_EXTS.has(ext)) return { skip: true, reason: 'non-ROM file' };
  const extIds = EXT_TO_CONSOLES.get(ext) || [];
  const folder = folderConsoleId != null ? CONSOLE_BY_ID.get(folderConsoleId) : null;

  // 1) Folder says disc/special system -> RAHasher path.
  if (folder && folder.method === 'rahasher') {
    if (DISC_SIDECAR.has(ext)) return { skip: true, reason: 'disc track (hashed via its .cue/.chd)' };
    return { consoleId: folder.id, method: 'rahasher', headerRule: null };
  }
  // 2) Folder says arcade -> handled at archive level; a loose file here is odd.
  if (folder && folder.method === 'arcade') {
    return { consoleId: folder.id, method: 'arcade', headerRule: null };
  }

  // 3) Header-rule extensions are unique to one console (.nes/.sfc/.n64/.lnx/.a78/.pce/.fds...).
  const headerConsole = extIds.map((id) => CONSOLE_BY_ID.get(id)).find((c) => c && c.method === 'file' && c.headerRule);
  if (headerConsole) return { consoleId: headerConsole.id, method: 'file', headerRule: headerConsole.headerRule };

  // 4) Whole-file extensions: one MD5, DB lookup resolves the console.
  const fileConsole = (folder && folder.method === 'file' && (extIds.includes(folder.id) || extIds.length === 0))
    ? folder
    : extIds.map((id) => CONSOLE_BY_ID.get(id)).find((c) => c && c.method === 'file');
  if (fileConsole) return { consoleId: fileConsole.id, method: 'file', headerRule: fileConsole.headerRule };

  // 5) Anything left that belongs to a RAHasher system: disc containers
  // (.iso/.chd/.cue…) but also cartridge formats only RAHasher can hash
  // (.nds/.dsi -> DS/DSi, .wad -> Wii, .woz/.po -> Apple II, .d88 -> PC-8801…).
  // Gating this on DISC_EXTS used to drop those cartridges as "unrecognized"
  // whenever the path held no system-named folder.
  if (!DISC_SIDECAR.has(ext)) {
    const discIds = extIds.filter((id) => CONSOLE_BY_ID.get(id)?.method === 'rahasher');
    if (discIds.length === 1) return { consoleId: discIds[0], method: 'rahasher', headerRule: null };
    if (discIds.length > 1) {
      // The extension alone can't say which system this is (.iso/.chd/.cue are
      // shared by many). Rather than demanding a system-named folder, hand back
      // every candidate: RAHasher validates each one against the image itself
      // (wrong console -> "Not a Sega CD" and no hash), so the file identifies
      // itself by content. A folder hint, when present, is only used to try the
      // most likely console first.
      const ordered = folder && discIds.includes(folder.id)
        ? [folder.id, ...discIds.filter((id) => id !== folder.id)]
        : discIds;
      return { consoleId: ordered[0], method: 'rahasher', headerRule: null, candidates: ordered };
    }
  }

  if (DISC_SIDECAR.has(ext)) return { skip: true, reason: 'disc track / sidecar' };
  return { unknown: true, reason: 'unrecognized ROM extension' };
}

function fileSig(filePath, size, mtimeMs, inner = '') {
  return `${filePath}|${size}|${Math.round(mtimeMs)}|${inner}`;
}

// Turn a hash + console into a match result by consulting the cached DB.
export function resolveMatch(md5, fallbackConsoleId) {
  const rows = lookupHash(md5);
  if (rows.length) {
    // Prefer a row matching the expected console; else take the first.
    const pick = rows.find((r) => r.console_id === fallbackConsoleId) || rows[0];
    return {
      status: 'match',
      consoleId: pick.console_id,
      matchGameId: pick.game_id,
      message: pick.title,
      matchTitle: pick.title,
      matchImage: pick.image_icon,
      matchAchievements: pick.num_achievements,
      matchPoints: pick.points,
      romName: pick.rom_name,
    };
  }
  return { status: 'no_match', consoleId: fallbackConsoleId, matchGameId: null, message: null };
}

// A single stalled file (dead network share, corrupt disc/archive) must not
// hang the whole scan. Each per-file operation races a timeout; on expiry we
// give up on that file and move on. RAHasher self-limits to ~180 s; this outer
// ceiling also covers plain reads and archive extraction. Configurable.
const TIMED_OUT = Symbol('timeout');
function withTimeout(promise, ms, onTimeout) {
  // Clear the timer once the race settles — otherwise every hashed file leaves
  // a live 10-minute timer behind (thousands per scan) holding memory and the
  // event loop open after the scan ends.
  let timer;
  const timeout = new Promise((r) => { timer = setTimeout(() => r(onTimeout), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
const TIMEOUT_RESULT = { status: 'error', message: 'Zeitüberschreitung — Datei übersprungen (Timeout in Einstellungen erhöhen, z.B. für große Images auf Netzlaufwerken)' };

export class Scanner {
  constructor({ rootPath, scanId, emit = () => {}, signal, onlyConsole = null, fileTimeoutMs = 5 * 60 * 1000, enabledConsoles = null, bigFileCopyBytes = 0, bigFileMaxBytes = 0, skipCollected = false } = {}) {
    this.rootPath = rootPath;
    this.scanId = scanId;
    this.emit = emit;
    this.signal = signal;
    this.onlyConsole = onlyConsole; // restrict scan to a single console id
    this.fileTimeoutMs = fileTimeoutMs;
    // Skip files already in the collection & unchanged — not re-listed, not
    // re-emitted, so a re-scan only surfaces genuinely new/changed files.
    this.skipCollected = !!skipCollected;
    // Set of console ids the user cares about (null = all). Files of any other
    // system are skipped entirely so a scan does no work for them.
    this.enabledConsoles = enabledConsoles instanceof Set ? enabledConsoles : (Array.isArray(enabledConsoles) ? new Set(enabledConsoles) : null);
    // Copy files at/above this byte size to local temp before hashing (0 = off).
    this.bigFileCopyBytes = Number(bigFileCopyBytes) || 0;
    // Never copy files larger than this (0 = no cap) — guards local disk space.
    this.bigFileMaxBytes = Number(bigFileMaxBytes) || 0;
    this.totals = {
      // `files` = everything the walk found. `processed` = files we are done
      // with, whatever the outcome — this is what the progress bar must use, so
      // it still reaches 100% in a library full of BIOS blobs, save states and
      // other non-ROM files. `scanned` only counts files that produced a result
      // row, so it stays the honest denominator for the status counters.
      files: 0, processed: 0, scanned: 0, match: 0, no_match: 0,
      needs_rahasher: 0, unsupported: 0, error: 0, skipped: 0, ambiguous: 0,
    };
    this.bySystem = new Map(); // consoleId -> {match,total}
  }

  get cancelled() { return this.signal?.aborted; }

  // Honour the user's "systems I care about" filter. null id (truly unknown) is
  // always allowed so unrecognized files can still be reported.
  allowedConsole(id) {
    if (!this.enabledConsoles) return true;
    if (id == null) return true;
    return this.enabledConsoles.has(id);
  }

  // Is there enough free space on the temp volume to hold a copy of `size`
  // bytes (plus 15% headroom)? Guards against filling the local disk. If statfs
  // is unsupported we optimistically allow the copy.
  async tempHasRoom(size) {
    try {
      const fs = await statfs(config.tempDir);
      const avail = fs.bavail * fs.bsize;
      return avail >= size * 1.15;
    } catch { return true; }
  }

  // Stream-copy src -> dest with byte progress, cancellation, and an *idle*
  // timeout: it only aborts when NO bytes move for fileTimeoutMs, so a big file
  // copying slowly-but-steadily over a NAS is never wrongly cut off.
  async copyWithProgress(src, dest, size, onProgress) {
    const rs = createReadStream(src);
    const ws = createWriteStream(dest);
    let copied = 0;
    let idle;
    const resetIdle = () => { if (idle) clearTimeout(idle); idle = setTimeout(() => rs.destroy(new Error('copy stalled')), this.fileTimeoutMs); };
    const onAbort = () => rs.destroy(new Error('aborted'));
    if (this.signal) {
      if (this.signal.aborted) { rs.destroy(); throw new Error('aborted'); }
      this.signal.addEventListener('abort', onAbort, { once: true });
    }
    rs.on('data', (c) => { copied += c.length; resetIdle(); onProgress?.(copied, size); });
    resetIdle();
    try {
      await pipeline(rs, ws);
    } finally {
      if (idle) clearTimeout(idle);
      this.signal?.removeEventListener('abort', onAbort);
    }
  }

  // Hash a plain file. For big self-contained disc images destined for RAHasher
  // (which seeks all over the file) we first copy to local temp — that turns a
  // random-access read over the NAS into a fast local one. A streamed sequential
  // MD5 ('file' method) is NOT copied: copying would just double the I/O.
  async hashFile(filePath, ext, consoleId, method, phaseFile, { localCopy = true } = {}) {
    const onPhase = (p, done, total) => this.emit('phase', { file: phaseFile, phase: p, done, total });
    let target = filePath;
    let tmp = null;
    if (localCopy && this.bigFileCopyBytes > 0 && method === 'rahasher' && DISC_SELF_CONTAINED.has(ext)) {
      let size = 0;
      try { size = (await stat(filePath)).size; } catch { /* hashTarget will error */ }
      const underCap = this.bigFileMaxBytes <= 0 || size <= this.bigFileMaxBytes;
      if (size >= this.bigFileCopyBytes && underCap && await this.tempHasRoom(size)) {
        const dest = join(config.tempDir, `bigcopy-${process.pid}-${Date.now()}-${basename(filePath)}`);
        try {
          onPhase('copying', 0, size);
          await this.copyWithProgress(filePath, dest, size, (done, total) => onPhase('copying', done, total));
          tmp = dest;
          target = dest;
        } catch (e) {
          try { await unlink(dest); } catch { /* nothing to clean */ }
          if (this.cancelled) throw e;       // cancelled — stop, don't fall back
          target = filePath;                  // other copy failure → hash in place
        }
      }
    }
    try {
      return await withTimeout(
        hashTarget({ filePath: target, consoleId, signal: this.signal, onPhase, timeoutMs: this.fileTimeoutMs }),
        this.fileTimeoutMs, TIMEOUT_RESULT);
    } finally {
      if (tmp) { try { await unlink(tmp); } catch { /* best effort */ } }
    }
  }

  // Hash a file whose console can't be told from its extension. Each candidate is
  // hashed in turn and looked up: RAHasher only produces a hash when the image
  // really is that system, and a hash present in the local DB settles it for
  // certain. Identification therefore comes from the file's content, not from
  // how the user happens to have named their folders.
  async hashFileResolvingConsole(filePath, ext, cls, phaseFile) {
    const ids = cls.candidates?.length ? cls.candidates : [cls.consoleId];
    if (ids.length <= 1) {
      return { res: await this.hashFile(filePath, ext, ids[0], cls.method, phaseFile), consoleId: ids[0] };
    }

    // A compressed ISO is expanded once and every candidate console is then
    // tried against that same temp image. Left to hashTarget it would be
    // expanded per candidate, repeating minutes of work on a large disc. The
    // expanded file is already local, so the big-file local copy is skipped.
    let target = filePath;
    let targetExt = ext;
    let localCopy = true;
    let cleanup = null;
    if (isCsoPath(filePath)) {
      const onPhase = (p, done, total) => this.emit('phase', { file: phaseFile, phase: p, done, total });
      const expanded = await expandCso(filePath, {
        signal: this.signal,
        onProgress: (done, total) => onPhase('extracting', done, total),
      });
      if (expanded?.error) return { res: { error: expanded.error }, consoleId: ids[0] };
      if (expanded?.path) { target = expanded.path; targetExt = '.iso'; localCopy = false; cleanup = expanded.cleanup; }
    }

    try {
      let firstRes = null;
      let firstId = ids[0];
      for (const id of ids) {
        if (this.cancelled) break;
        let res;
        try { res = await this.hashFile(target, targetExt, id, cls.method, phaseFile, { localCopy }); }
        catch (e) { if (this.cancelled) throw e; continue; }
        if (!res?.md5) continue;
        if (!firstRes) { firstRes = res; firstId = id; }
        // A hash the DB knows identifies the game and its console outright.
        if (lookupHash(res.md5).length) return { res, consoleId: id };
      }
      // Nothing matched the DB. Keep the first hash we managed to produce so the
      // file is reported as a real "no match" rather than "couldn't identify".
      if (firstRes) return { res: firstRes, consoleId: firstId };
      return { res: { error: 'Disc image not recognised as any supported system' }, consoleId: ids[0] };
    } finally {
      await cleanup?.();
    }
  }

  async *walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      this.emit('warn', { message: `Cannot read ${dir}: ${e.message}` });
      return;
    }
    for (const ent of entries) {
      if (this.cancelled) return;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(ent.name.toLowerCase()) || ent.name.startsWith('.')) continue;
        yield* this.walk(full);
      } else if (ent.isFile()) {
        if (isIgnoredFile(ent.name)) continue; // ._*, dotfiles, Thumbs.db, …
        yield full;
      }
    }
  }

  folderConsoleId(filePath) {
    const rel = relative(this.rootPath, filePath);
    const segments = rel.split(sep).slice(0, -1); // drop the filename
    return consoleFromFolderSegments(segments);
  }

  record(item) {
    const status = item.status;
    this.totals.scanned++;
    if (this.totals[status] != null) this.totals[status]++;
    if (item.consoleId != null) {
      const s = this.bySystem.get(item.consoleId) || { match: 0, total: 0 };
      s.total++;
      if (status === 'match') s.match++;
      this.bySystem.set(item.consoleId, s);
    }
    if (this.scanId != null) insertScanItem({ scanId: this.scanId, createdAt: Date.now(), ...item });
    // Persist into the collection (skip throwaway "skipped" rows).
    if (PERSISTED_STATUS.has(status)) {
      upsertLibraryItem({
        path: item.filePath,
        inner_path: item.innerPath ?? '',
        size: item.size,
        mtime: item.mtime ?? null,
        ext: item.ext,
        console_id: item.consoleId ?? null,
        md5: item.md5 ?? null,
        status,
        match_game_id: item.matchGameId ?? null,
        scanned_at: Date.now(),
        message: item.message ?? null,
      });
    }
    this.emit('result', { ...item, ...this.progress() });
  }

  progress() {
    return { totals: this.totals };
  }

  async processArchive(filePath, ext, st) {
    const mtime = Math.round(st.mtimeMs);
    const folderId = this.folderConsoleId(filePath);
    const folder = folderId != null ? CONSOLE_BY_ID.get(folderId) : null;

    if (this.onlyConsole != null && folder?.method === 'arcade' && folder.id !== this.onlyConsole) return;

    // Arcade: the .zip itself is the unit — hash its filename, don't extract.
    if (folder && folder.method === 'arcade') {
      if (!this.allowedConsole(folder.id)) return;
      const res = await hashTarget({ filePath, consoleId: folder.id, signal: this.signal });
      return this.recordHashResult({ filePath, ext, size: st.size, mtime, consoleId: folder.id, res });
    }

    let entries;
    try {
      entries = await withTimeout(listEntries(filePath), this.fileTimeoutMs, TIMED_OUT);
    } catch (e) {
      return this.record({
        filePath, ext, size: st.size, mtime, status: 'error',
        message: `Cannot read archive: ${String(e.message).slice(0, 160)}`, hashMethod: 'archive',
      });
    }
    if (entries === TIMED_OUT) {
      return this.record({
        filePath, ext, size: st.size, mtime, status: 'error',
        message: 'Zeitüberschreitung beim Entpacken — übersprungen (Timeout in Einstellungen erhöhen)', hashMethod: 'archive',
      });
    }
    const romEntries = entries.filter((e) => {
      const base = e.name.split(/[\\/]/).pop() || e.name;
      if (base.startsWith('._') || base.startsWith('.')) return false; // Apple/junk
      const ie = extname(e.name).toLowerCase();
      if (!ie || isArchive(ie) || JUNK_EXTS.has(ie)) return false;
      if (DISC_SIDECAR.has(ie)) return false;
      return EXT_TO_CONSOLES.has(ie) || (folder != null);
    });
    if (!romEntries.length) {
      return this.record({
        filePath, ext, size: st.size, mtime, status: 'skipped',
        message: 'archive has no recognizable ROM entries', hashMethod: 'archive',
      });
    }
    for (const entry of romEntries) {
      if (this.cancelled) return;
      const ie = extname(entry.name).toLowerCase();
      const cls = classifyFile(entry.name, ie, folderId);
      if (this.onlyConsole != null && (cls.consoleId ?? folderId) !== this.onlyConsole) continue;
      if (!this.allowedConsole(cls.consoleId ?? folderId)) continue;
      if (cls.skip || cls.unknown || cls.ambiguous) {
        this.record({
          filePath, innerPath: entry.name, ext: ie, size: entry.size, mtime,
          consoleId: cls.candidates?.[0] ?? folderId ?? null,
          status: cls.ambiguous ? 'ambiguous' : 'skipped',
          message: cls.reason, hashMethod: 'archive',
        });
        continue;
      }
      // Cache archive-member hashes too, keyed by archive sig + inner path.
      const sig = fileSig(filePath, st.size, st.mtimeMs, entry.name);
      const cached = getCachedFileHash(sig);
      let res;
      if (cached?.md5) {
        res = { md5: cached.md5, method: cached.hash_method, cached: true };
      } else {
        res = await withTimeout(
          hashTarget({ filePath, consoleId: cls.consoleId, entry, signal: this.signal, timeoutMs: this.fileTimeoutMs, onPhase: (p, done, total) => this.emit('phase', { file: basename(entry.name), phase: p, done, total }) }),
          this.fileTimeoutMs, TIMEOUT_RESULT);
        if (res.md5) setCachedFileHash({ sig, md5: res.md5, console_id: cls.consoleId, hash_method: res.method, computed_at: Date.now() });
      }
      await this.recordHashResult({
        filePath, innerPath: entry.name, ext: ie, size: entry.size, mtime,
        consoleId: cls.consoleId, res,
      });
    }
  }

  recordHashResult({ filePath, innerPath, ext, size, consoleId, res, durationMs, mtime }) {
    if (res.status === 'needs_rahasher') {
      return this.record({ filePath, innerPath, ext, size, mtime, consoleId, status: 'needs_rahasher', message: res.message, hashMethod: 'rahasher', durationMs });
    }
    if (res.status === 'unsupported') {
      return this.record({ filePath, innerPath, ext, size, mtime, consoleId, status: 'unsupported', message: res.message, durationMs });
    }
    if (res.status === 'error' || !res.md5) {
      return this.record({ filePath, innerPath, ext, size, mtime, consoleId, status: 'error', message: res.message || 'no hash', hashMethod: res.method, durationMs });
    }
    const match = resolveMatch(res.md5, consoleId);
    return this.record({
      filePath, innerPath, ext, size, mtime,
      consoleId: match.consoleId ?? consoleId,
      md5: res.md5, matchGameId: match.matchGameId,
      status: match.status, message: match.message, hashMethod: res.method, durationMs,
      matchTitle: match.matchTitle, matchImage: match.matchImage,
      matchAchievements: match.matchAchievements, matchPoints: match.matchPoints,
      romName: match.romName, cached: res.cached || false,
    });
  }

  // True when skipCollected is on and this loose file is already in the
  // collection at the same size+mtime — nothing to redo, so skip it silently.
  looseUnchanged(filePath, st) {
    const row = getLibraryItem(filePath, '');
    return !!row && row.size === st.size && row.mtime === Math.round(st.mtimeMs) && PERSISTED_STATUS.has(row.status);
  }

  async processFile(filePath) {
    if (this.cancelled) return;
    const ext = extname(filePath).toLowerCase();
    let st;
    try { st = await stat(filePath); } catch { return; }

    // "Skip already-collected files" option: unchanged files (and unchanged
    // archives, without re-listing them) are neither hashed nor reported.
    if (this.skipCollected) {
      if (isArchive(ext)) { if (libraryArchiveUnchanged(filePath, st.mtimeMs)) return; }
      else if (this.looseUnchanged(filePath, st)) return;
    }

    if (isArchive(ext)) return this.processArchive(filePath, ext, st);

    const mtime = Math.round(st.mtimeMs);
    const folderId = this.folderConsoleId(filePath);
    const cls = classifyFile(filePath, ext, folderId);
    if (cls.skip) return; // silent skip (e.g. disc tracks, junk) — not counted
    const cand = cls.consoleId ?? cls.candidates?.[0] ?? folderId;
    // A disc image may still be any of several systems at this point, so the
    // system filters have to pass if ANY candidate qualifies — otherwise a
    // PlayStation disc would be dropped just because PS2 sorts first.
    const cands = cls.candidates?.length ? cls.candidates : [cand];
    // System filter: skip anything not for the requested console.
    if (this.onlyConsole != null && !cands.includes(this.onlyConsole)) return;
    // User "systems I care about" filter: skip uninteresting systems entirely.
    if (!cands.some((id) => this.allowedConsole(id))) return;
    if (cls.unknown) {
      // Only report unknowns that at least live in a recognized system folder.
      if (folderId == null) return;
      return this.record({ filePath, ext, size: st.size, mtime, consoleId: folderId, status: 'unsupported', message: cls.reason });
    }
    if (cls.ambiguous) {
      return this.record({ filePath, ext, size: st.size, mtime, consoleId: cls.candidates?.[0] ?? null, status: 'ambiguous', message: cls.reason });
    }

    // Fast path: reuse cached hash if file unchanged (no re-hashing). The DB
    // lookup still runs so newly-synced matches are reflected.
    const sig = fileSig(filePath, st.size, st.mtimeMs);
    const cached = getCachedFileHash(sig);
    const t0 = Date.now();
    if (cached?.md5) {
      return this.recordHashResult({
        filePath, ext, size: st.size, mtime, consoleId: cls.consoleId,
        res: { md5: cached.md5, method: cached.hash_method, cached: true }, durationMs: 0,
      });
    }
    const { res, consoleId } = await this.hashFileResolvingConsole(filePath, ext, cls, basename(filePath));
    if (res.md5) {
      setCachedFileHash({ sig, md5: res.md5, console_id: consoleId, hash_method: res.method, computed_at: Date.now() });
    }
    return this.recordHashResult({ filePath, ext, size: st.size, mtime, consoleId, res, durationMs: Date.now() - t0 });
  }

  async run({ concurrency = 4 } = {}) {
    this.emit('start', { rootPath: this.rootPath, scanId: this.scanId });

    // 1) enumerate
    const files = [];
    for await (const f of this.walk(this.rootPath)) files.push(f);
    this.totals.files = files.length;
    this.emit('enumerated', { files: files.length });

    // 2) process with a small pool
    let idx = 0;
    const worker = async () => {
      while (idx < files.length && !this.cancelled) {
        const my = idx++;
        this.emit('processing', { file: basename(files[my]), index: my + 1, total: files.length });
        try { await this.processFile(files[my]); }
        catch (e) {
          // A cancelled scan aborts in-flight reads/child processes, which throw —
          // don't log those as file errors.
          if (!this.cancelled) this.record({ filePath: files[my], status: 'error', message: String(e.message).slice(0, 160) });
        }
        // Count the file as done regardless of outcome. Ticking on `processed`
        // (not `scanned`) also keeps progress flowing through long stretches of
        // skipped files, where the old counter never moved and the bar froze.
        this.totals.processed++;
        if ((this.totals.processed & 7) === 0 || this.totals.processed === files.length) {
          this.emit('progress', { processed: this.totals.processed, scanned: this.totals.scanned, files: files.length, totals: this.totals });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

    const status = this.cancelled ? 'cancelled' : 'done';
    this.emit('done', { status, totals: this.totals, bySystem: Object.fromEntries(this.bySystem) });
    return { status, totals: this.totals, bySystem: Object.fromEntries(this.bySystem) };
  }
}

// One-off single file check (used by the "test a single ROM" feature).
export async function checkSingleFile(filePath, { rootForFolder } = {}) {
  const scanner = new Scanner({ rootPath: rootForFolder || basename(filePath), scanId: null });
  const results = [];
  scanner.emit = (ev, data) => { if (ev === 'result') results.push(data); };
  await scanner.processFile(filePath);
  return results;
}
