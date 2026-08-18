// Regression tests for two user-reported scan bugs (feedback from Drumcan2077):
//
//   1) ".nds files aren't added to the collection" — extensions that belong
//      only to RAHasher systems but are not disc containers (.nds/.dsi/.wad/…)
//      fell through classifyFile and were reported as "unrecognized", which the
//      scanner then dropped silently when no system folder was in the path.
//   2) "the progress never reaches 100%" — the bar compared recorded results
//      against *all* enumerated files, so every silently skipped non-ROM file
//      (bios, .txt, 3DS data files, …) left a permanent gap.
//
// RA_DATA_DIR points at a throwaway dir BEFORE importing db.js/scanner.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-classify-test-'));
process.env.RA_DATA_DIR = tempDataDir;

let classifyFile, Scanner, EXT_TO_CONSOLES, CONSOLE_BY_ID, ARCHIVE_EXTS;
// Mirrors scanner.js — disc tracks are hashed via their .cue/.chd, never alone.
const DISC_SIDECAR = new Set(['.bin', '.img', '.sub', '.ccd', '.sbi', '.toc']);
before(async () => {
  const mod = await import('../src/scanner.js');
  classifyFile = mod.classifyFile;
  Scanner = mod.Scanner;
  ({ EXT_TO_CONSOLES, CONSOLE_BY_ID, ARCHIVE_EXTS } = await import('../src/consoles.js'));
});
after(() => { try { rmSync(tempDataDir, { recursive: true, force: true }); } catch { /* win locks */ } });

// ---- 1) RAHasher-only cartridge extensions ---------------------------------

test('.nds without a system folder resolves to the DS/DSi candidates, not "unknown"', () => {
  const cls = classifyFile('C:/roms/misc/Some Game.nds', '.nds', null);
  assert.ok(!cls.unknown, 'must not be reported as an unrecognized extension');
  assert.ok(!cls.skip, 'must not be skipped');
  assert.equal(cls.method, 'rahasher');
  assert.deepEqual(cls.candidates, [18, 78], 'both Nintendo DS (18) and DSi (78) are tried');
});

test('.nds inside a recognized DS folder pins the console (no candidate sweep)', () => {
  const cls = classifyFile('C:/roms/Nintendo DS/Some Game.nds', '.nds', 18);
  assert.equal(cls.consoleId, 18);
  assert.equal(cls.method, 'rahasher');
  assert.equal(cls.candidates, undefined, 'a folder hint settles it — hash once');
});

test('the named RAHasher-only extensions all resolve to their console', () => {
  // The formats the bug report and changelog name explicitly, spelled out so a
  // regression in any single one is obvious from the failure message.
  const named = {
    '.nds': [18, 78], '.ids': [18, 78], '.dsi': [78],
    '.wad': [19],
    '.woz': [38], '.po': [38], '.do': [38], '.2mg': [38], '.nib': [38],
    '.sna': [37], '.cpr': [37], '.cdt': [37],
    '.d88': [47], '.d98': [47], '.88d': [47], '.cmt': [47],
  };
  for (const [ext, expected] of Object.entries(named)) {
    const cls = classifyFile(`C:/roms/misc/x${ext}`, ext, null);
    assert.ok(!cls.unknown && !cls.skip, `${ext} must be classified, got ${JSON.stringify(cls)}`);
    assert.equal(cls.method, 'rahasher', `${ext} -> RAHasher`);
    const ids = cls.candidates?.length ? cls.candidates : [cls.consoleId];
    assert.deepEqual(ids, expected, `${ext} -> consoles ${expected}`);
  }
});

test('EVERY RAHasher-only extension is classified — including consoles added later', () => {
  // Derived from the console table rather than a hand-kept list: a system added
  // in the future with an extension only RAHasher can hash is covered the day it
  // is added, which is exactly how .nds slipped through in the first place.
  const missed = [];
  for (const [ext, ids] of EXT_TO_CONSOLES) {
    const consoles = ids.map((id) => CONSOLE_BY_ID.get(id)).filter(Boolean);
    // Extensions any in-process rule can handle take the 'file' path, and disc
    // sidecars/archives are deliberately skipped — neither is this test's business.
    if (consoles.some((c) => c.method !== 'rahasher')) continue;
    if (DISC_SIDECAR.has(ext) || ARCHIVE_EXTS.has(ext)) continue;

    const cls = classifyFile(`C:/roms/misc/x${ext}`, ext, null);
    const got = cls.candidates?.length ? cls.candidates : [cls.consoleId];
    if (cls.unknown || cls.skip || cls.method !== 'rahasher' || got.join() !== ids.join()) {
      missed.push(`${ext} -> expected ${ids}, got ${JSON.stringify(cls)}`);
    }
  }
  assert.deepEqual(missed, [], `every RAHasher-only extension must classify:\n  ${missed.join('\n  ')}`);
});

test('cartridge extensions keep their in-process file rule (no RAHasher regression)', () => {
  assert.equal(classifyFile('a.nes', '.nes', null).method, 'file');
  assert.equal(classifyFile('a.gb', '.gb', null).method, 'file');
  assert.equal(classifyFile('a.sfc', '.sfc', null).headerRule, 'snes');
  // .dsk is shared with MSX (in-process) — the file rule must still win.
  assert.equal(classifyFile('a.dsk', '.dsk', null).method, 'file');
});

test('junk and disc sidecars are still skipped', () => {
  assert.equal(classifyFile('readme.txt', '.txt', null).skip, true);
  assert.equal(classifyFile('track01.bin', '.bin', 12).skip, true); // PS1 folder -> sidecar
  assert.equal(classifyFile('noext', '', null).skip, true);
});

// ---- 2) progress accounting -------------------------------------------------

test('every enumerated file counts as processed, even when nothing is recorded', async () => {
  const root = join(tempDataDir, 'lib');
  mkdirSync(join(root, 'bios'), { recursive: true });
  // 3 files that produce no result row at all: junk ext, ignored name, and a
  // BIOS blob in a folder with no system alias (the reporter's exact case).
  writeFileSync(join(root, 'notes.txt'), 'x');
  writeFileSync(join(root, 'Thumbs.db'), 'x');
  writeFileSync(join(root, 'bios', 'gba_bios.bin'), 'x');

  const sc = new Scanner({ rootPath: root, scanId: null });
  const res = await sc.run({ concurrency: 2 });

  assert.equal(res.totals.files, 2, 'Thumbs.db is filtered during the walk');
  assert.equal(res.totals.processed, res.totals.files, 'processed must reach the enumerated total');
  assert.ok(res.totals.scanned < res.totals.files, 'scanned still counts only real result rows');
});

test('progress events are emitted even while every file is being skipped', async () => {
  const root = join(tempDataDir, 'lib2');
  mkdirSync(root, { recursive: true });
  for (let i = 0; i < 40; i++) writeFileSync(join(root, `junk${i}.txt`), 'x');

  const seen = [];
  const sc = new Scanner({ rootPath: root, scanId: null, emit: (ev, d) => { if (ev === 'progress') seen.push(d); } });
  const res = await sc.run({ concurrency: 4 });

  assert.equal(res.totals.scanned, 0, 'nothing recordable in this folder');
  assert.ok(seen.length > 0, 'progress must still tick — the bar used to freeze at 0');
  assert.equal(seen.at(-1).processed, 40);
});
