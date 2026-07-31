import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRomTags, rankFilename, rankTokens, tagTokens, langToken,
  packTags, unpackTags, romBasename,
} from '../index.js';

const regions = (n) => parseRomTags(n).regions;
const langs = (n) => parseRomTags(n).languages;

// ---- No-Intro / Redump ----------------------------------------------------

test('No-Intro single region', () => {
  assert.deepEqual(regions('Chrono Trigger (USA).sfc'), ['US']);
  assert.deepEqual(regions('Super Mario World (Europe).sfc'), ['EU']);
  assert.deepEqual(regions('Rockman X (Japan).sfc'), ['JP']);
  assert.deepEqual(regions('Tetris (World).gb'), ['WORLD']);
});

test('No-Intro multi-region tag', () => {
  assert.deepEqual(regions('Sonic (Japan, USA).md'), ['JP', 'US']);
  assert.deepEqual(regions('Golden Axe (USA, Europe).md'), ['US', 'EU']);
});

test('No-Intro language list', () => {
  const p = parseRomTags('Zelda - The Minish Cap (Europe) (En,Fr,De,Es,It).gba');
  assert.deepEqual(p.regions, ['EU']);
  assert.deepEqual(p.languages, ['en', 'fr', 'de', 'es', 'it']);
});

test('a lone capitalised code is a language, not a region', () => {
  assert.deepEqual(parseRomTags('Game (Japan) (En).nes'), { regions: ['JP'], languages: ['en'] });
});

test('non-region parentheses are ignored', () => {
  assert.deepEqual(parseRomTags('Game (USA) (Rev 1) (Beta) (Proto).nes'), { regions: ['US'], languages: [] });
  assert.deepEqual(parseRomTags('Elite (1984) (Firebird) (Unl).tap').regions, []);
});

// ---- GoodTools ------------------------------------------------------------

test('GoodTools single letters and combos', () => {
  assert.deepEqual(regions('Chrono Trigger (U) [!].smc'), ['US']);
  assert.deepEqual(regions('Zelda (JU) [!].gb'), ['JP', 'US']);
  assert.deepEqual(regions('Golden Axe (E).md'), ['EU']);
  assert.deepEqual(regions('Astérix (F).gb'), ['FR']);
});

test('square-bracket flags are never regions', () => {
  // "[a]" is GoodTools for "alternate dump" — uppercasing it must not yield AU.
  assert.deepEqual(regions('Some Game [a1][!].nes'), []);
  assert.deepEqual(regions('Some Game [b].nes'), []);
});

test('translation markers contribute a language', () => {
  assert.deepEqual(parseRomTags('Seiken Densetsu 3 (J) [T+Eng1.0].sfc'), { regions: ['JP'], languages: ['en'] });
  assert.deepEqual(langs('Game (Japan) [T-Ger].sfc'), ['de']);
});

// ---- TOSEC ----------------------------------------------------------------

test('TOSEC all-caps country codes stay regions', () => {
  assert.deepEqual(regions('Elite (1984)(Firebird)(GB).tap'), ['UK']);
  // "(DE)" in caps is TOSEC for Germany; "(De)" capitalised is the language.
  assert.deepEqual(parseRomTags('Game (1990)(Publisher)(DE).tap'), { regions: ['DE'], languages: [] });
  assert.deepEqual(parseRomTags('Game (De).nes'), { regions: [], languages: ['de'] });
});

// ---- misc -----------------------------------------------------------------

test('archive members are judged by their own name', () => {
  assert.equal(romBasename('D:\\ROMs\\pack.zip › Sonic (Japan).md'), 'Sonic (Japan).md');
  assert.deepEqual(regions('D:\\ROMs\\pack.zip › Sonic (Japan).md'), ['JP']);
  assert.deepEqual(regions('/mnt/nas/snes/Chrono Trigger (USA).sfc'), ['US']);
});

test('a dotted title without an extension keeps its tags', () => {
  // RetroAchievements stores disc entries without a file extension. Stripping
  // "everything after the last dot" would eat ". Spy (Europe) (En,Fr,De,Es)"
  // here and report no region at all — which it did, on real data.
  assert.deepEqual(parseRomTags('Spy vs. Spy (Europe) (En,Fr,De,Es)'), {
    regions: ['EU'], languages: ['en', 'fr', 'de', 'es'],
  });
  assert.deepEqual(regions('Dr. Mario (Japan)'), ['JP']);
  // A real extension is still removed, so it can never be read as a tag.
  assert.deepEqual(regions('Rockman X (Japan).sfc'), ['JP']);
  assert.deepEqual(regions('Some Game (USA).iso'), ['US']);
});

test('untagged filenames yield nothing', () => {
  assert.deepEqual(parseRomTags('chrono_trigger.sfc'), { regions: [], languages: [] });
  assert.deepEqual(parseRomTags(''), { regions: [], languages: [] });
});

// ---- priority -------------------------------------------------------------

test('rank picks the best matching token', () => {
  const priority = [langToken('ja'), 'JP', langToken('de'), 'EU', 'US'];
  assert.equal(rankFilename('Game (Japan) (Ja).sfc', priority), 0);   // L:ja
  assert.equal(rankFilename('Game (Japan).sfc', priority), 1);        // JP
  assert.equal(rankFilename('Game (Europe) (En,De).gba', priority), 2); // L:de beats EU
  assert.equal(rankFilename('Game (Europe) (En,Fr).gba', priority), 3); // EU
  assert.equal(rankFilename('Game (USA).sfc', priority), 4);
  assert.equal(rankFilename('Game (Brazil).sfc', priority), Number.MAX_SAFE_INTEGER);
});

test('an empty priority list ranks everything equally', () => {
  assert.equal(rankFilename('Game (Japan).sfc', []), Number.MAX_SAFE_INTEGER);
  assert.equal(rankTokens(['JP'], null), Number.MAX_SAFE_INTEGER);
});

test('tagTokens flattens regions and languages into one vocabulary', () => {
  assert.deepEqual(tagTokens(parseRomTags('Game (Europe) (En,De).gba')), ['EU', 'L:en', 'L:de']);
});

// ---- storage round-trip ---------------------------------------------------

test('pack/unpack round-trips through the SQLite columns', () => {
  const parsed = parseRomTags('Game (Japan, USA) (En,Ja).sfc');
  const packed = packTags(parsed);
  assert.deepEqual(packed, { region: 'JP,US', langs: 'en,ja' });
  assert.deepEqual(unpackTags(packed), parsed);
  // "parsed, nothing found" must survive as empty strings, not null.
  assert.deepEqual(packTags(parseRomTags('game.sfc')), { region: '', langs: '' });
  assert.deepEqual(unpackTags({ region: '', langs: '' }), { regions: [], languages: [] });
});
