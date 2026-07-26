// "Skip already-collected files" scan option: unchanged loose files and
// unchanged archives must be recognised so the scanner can skip them.
// RA_DATA_DIR points at a throwaway dir BEFORE importing db.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-skip-test-'));
process.env.RA_DATA_DIR = tempDataDir;

let db, ScannerMod;
before(async () => {
  db = await import('../src/db.js');
  ScannerMod = await import('../src/scanner.js');
});
after(() => { try { rmSync(tempDataDir, { recursive: true, force: true }); } catch { /* win locks */ } });

test('looseUnchanged: matches on size+mtime, rejects any change', () => {
  const path = join(tempDataDir, 'rom', 'zelda.nes');
  const mtimeMs = 1_700_000_000_123;
  db.upsertLibraryItem({ path, inner_path: '', size: 262144, mtime: Math.round(mtimeMs), status: 'match' });
  const sc = new ScannerMod.Scanner({ rootPath: join(tempDataDir, 'rom'), skipCollected: true });

  assert.equal(sc.looseUnchanged(path, { size: 262144, mtimeMs }), true, 'unchanged file recognised');
  assert.equal(sc.looseUnchanged(path, { size: 262145, mtimeMs }), false, 'size change -> rescan');
  assert.equal(sc.looseUnchanged(path, { size: 262144, mtimeMs: mtimeMs + 5000 }), false, 'mtime change -> rescan');
  assert.equal(sc.looseUnchanged(join(tempDataDir, 'rom', 'other.nes'), { size: 1, mtimeMs }), false, 'unknown file -> scan');
});

test('looseUnchanged: only PERSISTED statuses count (a "skipped" row still gets scanned)', () => {
  const path = join(tempDataDir, 'rom', 'junk.txt');
  const mtimeMs = 1_700_000_000_000;
  db.upsertLibraryItem({ path, inner_path: '', size: 10, mtime: Math.round(mtimeMs), status: 'skipped' });
  const sc = new ScannerMod.Scanner({ rootPath: join(tempDataDir, 'rom'), skipCollected: true });
  assert.equal(sc.looseUnchanged(path, { size: 10, mtimeMs }), false);
});

test('libraryArchiveUnchanged: an unchanged archive (matching mtime) is detected', () => {
  const zip = join(tempDataDir, 'rom', 'pack.zip');
  const mtimeMs = 1_700_000_001_000;
  db.upsertLibraryItem({ path: zip, inner_path: 'a.nes', size: 100, mtime: Math.round(mtimeMs), status: 'match' });
  db.upsertLibraryItem({ path: zip, inner_path: 'b.nes', size: 200, mtime: Math.round(mtimeMs), status: 'no_match' });

  assert.equal(db.libraryArchiveUnchanged(zip, mtimeMs), true, 'same mtime -> unchanged');
  assert.equal(db.libraryArchiveUnchanged(zip, mtimeMs + 1000), false, 'newer mtime -> re-list');
  assert.equal(db.libraryArchiveUnchanged(join(tempDataDir, 'rom', 'nope.zip'), mtimeMs), false, 'unknown archive');
});
