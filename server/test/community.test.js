// Tests for the v0.9 data modules (free-games catalog, core table) and the
// new DB helpers (coverage, play sessions).
//
// The DB helpers open config.dbPath at import time, so this file points
// RA_DATA_DIR at a throwaway directory BEFORE importing db.js — the user's real
// database must never be touched by a test run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-checker-test-'));
process.env.RA_DATA_DIR = tempDataDir;

let db;
before(async () => { db = await import('../src/db.js'); });
after(() => { try { rmSync(tempDataDir, { recursive: true, force: true }); } catch { /* windows file locks */ } });

// ---- free-games catalog ---------------------------------------------------
test('free-games catalog is well formed', async () => {
  const m = await import('../src/data/free-games.js');
  assert.ok(Array.isArray(m.FREE_GAMES), 'FREE_GAMES is an array');
  assert.ok(m.FREE_GAMES.length > 50, `expected a substantial catalog, got ${m.FREE_GAMES.length}`);
  for (const g of m.FREE_GAMES) {
    assert.equal(typeof g.title, 'string');
    assert.ok(g.title.length > 0, 'title not empty');
    assert.ok(/^https?:\/\//.test(g.url), `url looks absolute: ${g.title} -> ${g.url}`);
    assert.ok(g.consoleId == null || Number.isInteger(g.consoleId), 'consoleId is an int or null');
    assert.equal(typeof g.systemLabel, 'string');
    assert.ok(g.author == null || typeof g.author === 'string');
  }
});

test('free-games entries map onto known consoles', async () => {
  const m = await import('../src/data/free-games.js');
  const { CONSOLE_BY_ID } = await import('../src/consoles.js');
  for (const g of m.FREE_GAMES) {
    if (g.consoleId == null) continue;
    assert.ok(CONSOLE_BY_ID.has(g.consoleId), `console ${g.consoleId} (${g.systemLabel}) is known`);
  }
  // the per-console index must agree with the flat list
  let indexed = 0;
  for (const [, list] of m.FREE_GAMES_BY_CONSOLE) indexed += list.length;
  assert.equal(indexed, m.FREE_GAMES.length);
  const first = m.FREE_GAMES[0];
  assert.ok(m.freeGamesForConsole(first.consoleId).some((g) => g.title === first.title));
  assert.deepEqual(m.freeGamesForConsole(-1), []);
});

// ---- core table -----------------------------------------------------------
test('core table resolves recommended cores', async () => {
  const m = await import('../src/data/cores.js');
  assert.ok(Object.keys(m.CORES_BY_CONSOLE).length > 20);
  const snes = m.recommendedCore(3);
  assert.ok(snes && typeof snes.id === 'string', 'SNES has a recommended core');
  assert.equal(typeof snes.achievements, 'boolean');
  // unknown system must not throw
  const none = m.coresFor(99999);
  assert.deepEqual(none.cores, []);
  assert.deepEqual(none.standalone, []);
  assert.equal(m.coreFileName('snes9x_libretro', 'win32'), 'snes9x_libretro.dll');
  assert.equal(m.coreFileName('snes9x_libretro', 'linux'), 'snes9x_libretro.so');
});

test('every listed core id looks like a libretro core', async () => {
  const m = await import('../src/data/cores.js');
  for (const [id, entry] of Object.entries(m.CORES_BY_CONSOLE)) {
    for (const c of entry.cores) {
      assert.match(c.id, /^[a-z0-9._-]+$/, `core id for console ${id} is filename-safe: ${c.id}`);
      assert.ok(!/\.(dll|so|dylib)$/.test(c.id), `core id carries no suffix: ${c.id}`);
    }
  }
});

// ---- frontend platform table ----------------------------------------------
test('frontend platform table covers known consoles', async () => {
  const m = await import('../src/data/frontends.js');
  const { CONSOLE_BY_ID } = await import('../src/consoles.js');
  for (const key of Object.keys(m.FRONTEND_PLATFORMS)) {
    const id = Number(key);
    assert.ok(CONSOLE_BY_ID.has(id), `frontend entry ${id} is a known console`);
    const p = m.FRONTEND_PLATFORMS[id];
    assert.equal(typeof p.launchbox, 'string');
    assert.ok(p.launchbox.length > 0, `launchbox name set for ${id}`);
    assert.ok(p.esde === null || /^[a-z0-9-]+$/.test(p.esde), `esde dir is a slug or null for ${id}: ${p.esde}`);
  }
  assert.equal(m.esdeSystem(3), 'snes');
  assert.equal(m.esdeSystem(999999), null);
  assert.equal(m.launchboxPlatform(7), 'Nintendo Entertainment System');
  assert.equal(m.launchboxPlatform(999999, 'x'), 'x');
});

// ---- DB: coverage ---------------------------------------------------------
test('coverage stats work on an empty database', () => {
  const s = db.getCoverageStats();
  assert.equal(typeof s.all.games, 'number');
  assert.equal(s.owned.games, 0);
  assert.ok(Array.isArray(s.byConsole));
});

// ---- DB: play sessions ----------------------------------------------------
test('play sessions extend while presence keeps naming the same game', () => {
  const t0 = 1_700_000_000_000;
  const id = db.startSession({ gameId: 42, consoleId: 3, title: 'Test Game', at: t0, rich: 'Level 1' });
  assert.ok(id > 0);

  // A sample within the gap window belongs to the same session.
  const open = db.findOpenSession(42, t0 - 60_000);
  assert.equal(open.id, id);
  db.touchSession(id, t0 + 300_000, 'Level 2');

  const play = db.getPlaytimeByGame(10).find((g) => g.game_id === 42);
  assert.equal(play.ms, 300_000);
  assert.equal(play.sessions, 1);

  // Outside the window a new session starts instead of extending the old one.
  const later = t0 + 10 * 60 * 60 * 1000;
  assert.equal(db.findOpenSession(42, later - 15 * 60 * 1000), undefined);
  db.startSession({ gameId: 42, consoleId: 3, title: 'Test Game', at: later, rich: 'Level 3' });
  db.touchSession(db.findOpenSession(42, later - 60_000).id, later + 60_000, 'Level 3');

  const totals = db.playtimeTotals();
  assert.equal(totals.sessions, 2);
  assert.equal(totals.games, 1);
  assert.equal(totals.ms, 360_000);

  assert.equal(db.getSessionsForGame(42).length, 2);
  assert.equal(db.getRecentSessions(5)[0].rich_presence, 'Level 3');

  db.clearSessions();
  assert.equal(db.playtimeTotals().sessions, 0);
});

test('a session with an unknown game id is still tracked', () => {
  const t0 = 1_700_100_000_000;
  db.startSession({ gameId: null, consoleId: null, title: null, at: t0, rich: 'Playing something' });
  const open = db.findOpenSession(null, t0 - 60_000);
  assert.ok(open, 'null-game session is found again');
  db.touchSession(open.id, t0 + 120_000, 'Still playing');
  assert.equal(db.playtimeTotals().ms, 120_000);
  db.clearSessions();
});
