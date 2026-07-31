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

// ---- RetroAchievements' own ROM name beats the filename -------------------

test("a wrongly named file gets its region from RetroAchievements' rom name", () => {
  // The file name says nothing (or something wrong); the hash says everything.
  const path = ROM('random_dump_01.sfc');
  db.upsertLibraryItem({ path, inner_path: '', status: 'match', md5: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  assert.equal(db.getLibraryItem(path, '').region, '', 'filename alone yields nothing');

  db.enrichHash({ md5: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', rom_name: 'Rockman X (Japan) (Ja).sfc', labels: ['nointro'] });

  const row = db.getLibrary({ tag: 'JP', limit: 100 }).find((r) => r.path === path);
  assert.ok(row, 'the JP filter now finds it');
  assert.equal(row.ra_region, 'JP');
  assert.equal(row.ra_langs, 'ja');
  assert.equal(row.ra_rom_name, 'Rockman X (Japan) (Ja).sfc');
});

test('a mislabelled filename is overridden, not merged, per field', () => {
  const path = ROM('Totally Not Zelda (USA).gbc');
  db.upsertLibraryItem({ path, inner_path: '', status: 'match', md5: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
  assert.equal(db.getLibraryItem(path, '').region, 'US', 'filename claims USA');

  db.enrichHash({ md5: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', rom_name: 'Legend of Zelda, The - Oracle of Ages (Europe).gbc' });

  // The US claim is gone — RA says Europe and RA is the one that matched.
  assert.equal(db.getLibrary({ tag: 'US', limit: 100 }).some((r) => r.path === path), false);
  assert.equal(db.getLibrary({ tag: 'EU', limit: 100 }).some((r) => r.path === path), true);
});

test('facets separate verified rows from guessed ones', () => {
  const f = db.libraryTagFacets({});
  assert.equal(f.verified, 2, 'exactly the two enriched rows');
  assert.ok(f.total >= f.verified);
});

test('enriched names survive a console re-sync', () => {
  // replaceConsoleGames() deletes and rebuilds every hash row for the console.
  db.replaceConsoleGames(3, [{
    ID: 9001, Title: 'Rockman X', Points: 100, NumAchievements: 5,
    Hashes: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  }]);
  assert.equal(db.lookupHash('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')[0].rom_name, null, 're-sync wiped the name');

  assert.equal(db.restoreHashNames(), 1, 'one name put back');
  assert.equal(db.lookupHash('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')[0].rom_name, 'Rockman X (Japan) (Ja).sfc');
  // The collection row never lost its region, because that reads from hash_names.
  assert.equal(db.getLibrary({ tag: 'JP', limit: 100 }).some((r) => r.path === ROM('random_dump_01.sfc')), true);
});

test('the enrichment work list is resumable and never repeats a game', () => {
  // The collection scope is driven by which games your files actually matched.
  db.upsertLibraryItem({ path: ROM('random_dump_01.sfc'), inner_path: '', status: 'match', md5: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', match_game_id: 9001 });
  assert.deepEqual(db.gamesNeedingHashNames('collection'), [9001]);

  const before = db.gamesNeedingHashNames('all').length;
  db.markGameHashesFetched(9001, 1);
  assert.equal(db.gamesNeedingHashNames('all').length, before - 1);
  assert.equal(db.gamesNeedingHashNames('all').includes(9001), false);
  assert.deepEqual(db.gamesNeedingHashNames('collection'), [], 'nothing left to do for the collection');
  assert.equal(db.hashNameStats().fetched, 1);
});

test('a parser change re-derives stored values without any network call', () => {
  // Simulate values written by an older parser version.
  db.db.prepare("UPDATE hash_names SET region = 'XX', langs = '' WHERE md5 = ?").run('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  db.db.prepare("UPDATE settings SET value = '0' WHERE key = 'tagParserVersion'").run();
  db.setSetting('tagParserVersion', 0);

  assert.ok(db.reparseHashNames() > 0, 'stale version triggers a re-read');
  const row = db.db.prepare('SELECT region, langs FROM hash_names WHERE md5 = ?').get('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(row.region, 'JP', 're-derived from the stored rom_name');
  assert.equal(row.langs, 'ja');

  db.markTagParserVersion();
  assert.equal(db.reparseHashNames(), 0, 'no work once the version matches');
});

test('backfill fills rows written before the columns existed', () => {
  const path = ROM('Metroid (Japan).nes');
  db.upsertLibraryItem({ path, inner_path: '', status: 'match' });
  db.db.prepare('UPDATE library SET region = NULL, langs = NULL WHERE path = ?').run(path);

  assert.equal(db.backfillLibraryTags(), 1, 'exactly the one unparsed row');
  assert.equal(db.getLibraryItem(path, '').region, 'JP');
  assert.equal(db.backfillLibraryTags(), 0, 'nothing left to do on the next start');
});
