// Region/language on collection rows: the columns are filled on write, the
// filter matches a single code inside a comma-joined list, the facets count
// every code once per row, and old rows get backfilled.
// RA_DATA_DIR points at a throwaway dir BEFORE importing db.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-region-test-'));
process.env.RA_DATA_DIR = tempDataDir;

let db;
const ROM = (name) => join(tempDataDir, 'rom', name);
before(async () => {
  db = await import('../src/db.js');
  const add = (name, extra = {}) => db.upsertLibraryItem({ path: ROM(name), inner_path: '', status: 'match', ...extra });
  add('Chrono Trigger (USA).sfc');
  add('Rockman X (Japan) (Ja).sfc');
  add('Zelda - Minish Cap (Europe) (En,Fr,De,Es,It).gba');
  add('Sonic (Japan, USA).md');
  add('someunnamedrom.nes');
  // An archive member is judged by its own entry name, not the container's.
  db.upsertLibraryItem({ path: ROM('pack.zip'), inner_path: 'Golden Axe (Europe).md', status: 'match' });
});
after(() => { try { rmSync(tempDataDir, { recursive: true, force: true }); } catch { /* win locks */ } });

test('the columns are filled from the filename on write', () => {
  const row = db.getLibraryItem(ROM('Zelda - Minish Cap (Europe) (En,Fr,De,Es,It).gba'), '');
  assert.equal(row.region, 'EU');
  assert.equal(row.langs, 'en,fr,de,es,it');
  // Untagged files store '' (parsed, nothing found) — never NULL, which would
  // make the backfill pick them up again on every start.
  const plain = db.getLibraryItem(ROM('someunnamedrom.nes'), '');
  assert.equal(plain.region, '');
  assert.equal(plain.langs, '');
});

test('an archive member is tagged by its own entry name', () => {
  const row = db.getLibraryItem(ROM('pack.zip'), 'Golden Axe (Europe).md');
  assert.equal(row.region, 'EU');
});

test('the tag filter matches one code inside a comma-joined list', () => {
  const jp = db.getLibrary({ tag: 'JP', limit: 100 }).map((r) => r.path);
  assert.equal(jp.length, 2, 'Rockman X (Japan) + Sonic (Japan, USA)');
  assert.ok(jp.includes(ROM('Sonic (Japan, USA).md')), 'second entry of a multi-region tag matches');

  // "US" must not also match a hypothetical "AUS"-style substring.
  const us = db.getLibrary({ tag: 'US', limit: 100 }).map((r) => r.path);
  assert.deepEqual(us.sort(), [ROM('Chrono Trigger (USA).sfc'), ROM('Sonic (Japan, USA).md')].sort());

  const de = db.getLibrary({ tag: 'L:de', limit: 100 });
  assert.deepEqual(de.map((r) => r.path), [ROM('Zelda - Minish Cap (Europe) (En,Fr,De,Es,It).gba')]);

  const none = db.getLibrary({ tag: 'NONE', limit: 100 });
  assert.deepEqual(none.map((r) => r.path), [ROM('someunnamedrom.nes')]);

  assert.equal(db.getLibrary({ limit: 100 }).length, 6, 'no tag filter -> everything');
});

test('facets count each code once per row and report the untagged files', () => {
  const f = db.libraryTagFacets({});
  const region = Object.fromEntries(f.regions.map((r) => [r.code, r.n]));
  assert.equal(region.JP, 2);
  assert.equal(region.US, 2);
  assert.equal(region.EU, 2, 'Minish Cap + the zipped Golden Axe');
  const lang = Object.fromEntries(f.languages.map((l) => [l.code, l.n]));
  assert.equal(lang.ja, 1);
  assert.equal(lang.en, 1);
  assert.equal(f.untagged, 1);
});

test('backfill fills rows written before the columns existed', () => {
  const path = ROM('Metroid (Japan).nes');
  db.upsertLibraryItem({ path, inner_path: '', status: 'match' });
  db.db.prepare('UPDATE library SET region = NULL, langs = NULL WHERE path = ?').run(path);

  assert.equal(db.backfillLibraryTags(), 1, 'exactly the one unparsed row');
  assert.equal(db.getLibraryItem(path, '').region, 'JP');
  assert.equal(db.backfillLibraryTags(), 0, 'nothing left to do on the next start');
});
