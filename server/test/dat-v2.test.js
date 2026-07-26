// DAT completeness v2: parser (logiqx / ClrMamePro / MAME <disk>), console
// mapping, combined loose-file hashing, archive-member CRC (zip/7z), and the
// end-to-end matching (crc + md5 + sha1 + name/size fallback, extras).
//
// Opens config.dbPath at import, so RA_DATA_DIR points at a throwaway dir BEFORE
// importing db.js — the real database is never touched.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-dat-test-'));
process.env.RA_DATA_DIR = tempDataDir;
const work = mkdtempSync(join(tmpdir(), 'ra-dat-work-'));

let db, dat, archive;
before(async () => {
  db = await import('../src/db.js');
  dat = await import('../src/dat.js');
  archive = await import('../src/hashing/archive.js');
});
after(() => {
  for (const d of [tempDataDir, work]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* win locks */ } }
});

// ---- CRC32 canon + combined hashing ---------------------------------------
test('crc32File matches the canonical "123456789" vector (cbf43926)', async () => {
  const p = join(work, 'canon.bin');
  writeFileSync(p, Buffer.from('123456789'));
  assert.equal(await dat.crc32File(p), 'cbf43926');
});

test('hashFileAll returns crc+md5+sha1 in one pass', async () => {
  const payload = Buffer.from('The quick brown fox\n');
  const p = join(work, 'fox.bin');
  writeFileSync(p, payload);
  const h = await dat.hashFileAll(p);
  assert.equal(h.crc, '530bbc34');
  assert.equal(h.md5, createHash('md5').update(payload).digest('hex'));
  assert.equal(h.sha1, createHash('sha1').update(payload).digest('hex'));
});

// ---- parser: logiqx XML (No-Intro / Redump style) -------------------------
test('parseDat reads a logiqx XML DAT (crc/md5/sha1, skips nodump)', () => {
  const xml = `<?xml version="1.0"?>
<!DOCTYPE datafile PUBLIC "-//Logiqx//DTD ROM Management Datafile//EN" "http://www.logiqx.com/Dats/datafile.dtd">
<datafile>
  <header>
    <name>Nintendo - Super Nintendo Entertainment System</name>
    <description>Nintendo - Super Nintendo Entertainment System (Parent-Clone)</description>
    <version>20240101-000000</version>
  </header>
  <game name="Super Mario World (USA)">
    <rom name="Super Mario World (USA).sfc" size="524288" crc="b19ed489" md5="cdd3c8c37322978ca8669b34bc89c804" sha1="6b47bb75d16514b6a476aa0c73a683a2a4c18765"/>
  </game>
  <game name="Bad Dump Game">
    <rom name="Bad.sfc" size="0" status="nodump"/>
  </game>
  <game name="Zelda (USA)">
    <rom name="Zelda.sfc" size="1048576" crc="777aac2f"/>
  </game>
</datafile>`;
  const { header, entries } = dat.parseDat(xml);
  assert.equal(header.name, 'Nintendo - Super Nintendo Entertainment System');
  assert.equal(header.version, '20240101-000000');
  assert.equal(entries.length, 2, 'nodump entry dropped');
  const smw = entries.find((e) => e.rom_name.startsWith('Super Mario'));
  assert.equal(smw.crc, 'b19ed489');
  assert.equal(smw.md5, 'cdd3c8c37322978ca8669b34bc89c804');
  assert.equal(smw.sha1, '6b47bb75d16514b6a476aa0c73a683a2a4c18765');
  assert.equal(smw.size, 524288);
});

// ---- parser: MAME <machine> + <disk> (sha1-only) --------------------------
test('parseDat reads MAME <machine> roms and <disk> sha1-only entries', () => {
  const xml = `<?xml version="1.0"?>
<mame build="0.999">
  <machine name="sf2">
    <rom name="sf2.01" size="524288" crc="deadbeef" sha1="da39a3ee5e6b4b0d3255bfef95601890afd80709"/>
    <disk name="sf2 chd" sha1="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"/>
    <disk name="nodump disk" status="nodump"/>
  </machine>
</mame>`;
  const { entries } = dat.parseDat(xml);
  assert.equal(entries.length, 2, 'rom + good disk, nodump disk dropped');
  const disk = entries.find((e) => e.rom_name === 'sf2 chd');
  assert.ok(disk, 'disk entry captured');
  assert.equal(disk.crc, null);
  assert.equal(disk.sha1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});

// ---- parser: ClrMamePro text ----------------------------------------------
test('parseDat reads a ClrMamePro text DAT', () => {
  const cm = `clrmamepro (
	name "Sega - Mega Drive - Genesis"
	description "Sega - Mega Drive - Genesis (20240101)"
	version 20240101
)
game (
	name "Sonic (World)"
	rom ( name "Sonic (World).md" size 524288 crc 1234abcd md5 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa )
)
game (
	name "Altered Beast (World)"
	rom ( name "Altered Beast.md" size 524288 crc 99887766 )
)`;
  const { header, entries } = dat.parseDat(cm);
  assert.equal(header.name, 'Sega - Mega Drive - Genesis');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].crc, '1234abcd');
  assert.equal(entries[0].md5, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});

// ---- console mapping (No-Intro / Redump headers) --------------------------
test('guessConsole maps common No-Intro/Redump headers', () => {
  const cases = [
    ['Nintendo - Nintendo Entertainment System', 7],
    ['Nintendo - Super Nintendo Entertainment System', 3],
    ['Nintendo - Nintendo 64', 2],
    ['Nintendo - Game Boy Advance', 5],
    ['Sony - PlayStation', 12],
    ['Sony - PlayStation Portable', 41],
    ['Sega - Mega Drive - Genesis', 1],
    ['Sega - Dreamcast', 40],
    ['Atari - 2600', 25],
  ];
  for (const [name, id] of cases) {
    assert.equal(dat.guessConsole(name), id, `${name} -> ${id}`);
  }
  assert.equal(dat.guessConsole('Totally Unknown Platform'), null);
});

// ---- archive member CRC (zip + 7z), read without decompression -------------
test('listEntriesWithCrc reads the stored CRC of zip and 7z members', async () => {
  const payload = Buffer.from('The quick brown fox\n');
  const src = join(work, 'rom.nes');
  writeFileSync(src, payload);
  const expected = '530bbc34';

  const sevenZip = await import('7zip-min');
  const cmd = sevenZip.cmd ?? sevenZip.default?.cmd;
  const run = (args) => new Promise((res, rej) => { const r = cmd(args); if (r?.then) r.then(res, rej); else cmd(args, (e) => e ? rej(e) : res()); });

  const zipPath = join(work, 'rom.zip');
  await run(['a', '-tzip', zipPath, src, '-y']);
  const zipList = await archive.listEntriesWithCrc(zipPath);
  assert.equal(zipList.find((e) => e.name.endsWith('rom.nes'))?.crc, expected, 'zip crc');

  const svnPath = join(work, 'rom.7z');
  await run(['a', svnPath, src, '-y']);
  const svnList = await archive.listEntriesWithCrc(svnPath);
  assert.equal(svnList.find((e) => e.name.endsWith('rom.nes'))?.crc, expected, '7z crc');
});

// ---- end-to-end matching + extras -----------------------------------------
test('DAT matching: crc, sha1-only, name/size fallback, and extras', () => {
  // A DAT with four kinds of entry.
  const entries = [
    { game_name: 'CrcGame', rom_name: 'crc.nes', size: 100, crc: 'aaaa1111', md5: null, sha1: null },
    { game_name: 'Sha1Game', rom_name: 'disc.chd', size: 200, crc: null, md5: null, sha1: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
    { game_name: 'NameGame', rom_name: 'byname.rom', size: 300, crc: null, md5: null, sha1: null },
    { game_name: 'MissingGame', rom_name: 'missing.nes', size: 400, crc: 'ffff9999', md5: null, sha1: null },
  ];
  const { id } = db.insertDat({ name: 'Test DAT', description: 'x', version: '1', console_id: 7, entries });

  // Collection: crc hit, sha1 hit, name/size hit, plus one unrelated "extra".
  const base = join(work, 'coll');
  const rows = [
    { path: join(base, 'crc.nes'), size: 100, status: 'match', hashes: { crc: 'aaaa1111' } },
    { path: join(base, 'disc.chd'), size: 200, status: 'no_match', hashes: { sha1: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } },
    { path: join(base, 'byname.rom'), size: 300, status: 'match', hashes: { crc: '00000000' } }, // crc won't match; name+size will
    { path: join(base, 'weird-hack.nes'), size: 999, status: 'no_match', hashes: { crc: 'c0ffee00' } }, // in no DAT -> extra
  ];
  for (const r of rows) {
    db.upsertLibraryItem({ path: r.path, inner_path: '', size: r.size, status: r.status, md5: 'ra-hash-' + r.size });
    db.setLibraryHashes(r.path, '', r.hashes);
  }

  const cov = db.datCoverage(id);
  assert.equal(cov.total, 4);
  assert.equal(cov.have, 3, 'crc + sha1 + name/size matched; one missing');
  assert.deepEqual(cov.missing.map((m) => m.game), ['MissingGame']);

  // library.md5 (RA hash) must be untouched by the raw-hash writes.
  const row = db.getLibraryItem(join(base, 'crc.nes'), '');
  assert.equal(row.md5, 'ra-hash-100', 'RA hash preserved');
  assert.equal(row.crc, 'aaaa1111', 'raw crc stored');

  const list = db.listDats().find((d) => d.id === id);
  assert.equal(list.have, 3);

  const extras = db.datExtras();
  const extraPaths = extras.extras.map((e) => e.path);
  assert.ok(extraPaths.includes(join(base, 'weird-hack.nes')), 'unknown dump flagged as extra');
  assert.ok(!extraPaths.includes(join(base, 'crc.nes')), 'known dump not an extra');
});
