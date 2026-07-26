import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashBuffer, consoleForExt } from '../index.js';

// MD5 is injected — here we use Node's for the test. Any correct MD5 yields the
// same result, which is exactly why the mobile js-md5 will match.
const md5 = (bytes) => createHash('md5').update(bytes).digest('hex');
const rawMd5 = (bytes) => createHash('md5').update(bytes).digest('hex');

test('no rule -> whole-file md5', () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  assert.equal(hashBuffer(bytes, null, md5), rawMd5(bytes));
});

test('nes -> 16-byte iNES header is stripped', () => {
  const header = new Uint8Array(16); header.set([0x4e, 0x45, 0x53, 0x1a]); // "NES\x1a"
  const body = new Uint8Array([9, 8, 7, 6, 5]);
  const rom = new Uint8Array([...header, ...body]);
  assert.equal(hashBuffer(rom, 'nes', md5), rawMd5(body));
});

test('nes without header -> whole file', () => {
  const rom = new Uint8Array([1, 2, 3, 4, 5]);
  assert.equal(hashBuffer(rom, 'nes', md5), rawMd5(rom));
});

test('snes -> 512-byte copier header stripped when size % 8192 === 512', () => {
  const body = new Uint8Array(0x2000).fill(7);   // one 8 KB bank
  const header = new Uint8Array(512).fill(1);
  const rom = new Uint8Array([...header, ...body]);
  assert.equal(hashBuffer(rom, 'snes', md5), rawMd5(body));
});

test('n64 .v64 (0x37) -> 16-bit byteswap before md5', () => {
  const rom = new Uint8Array([0x37, 0x80, 0x40, 0x12]);
  const swapped = new Uint8Array([0x80, 0x37, 0x12, 0x40]);
  assert.equal(hashBuffer(rom, 'n64', md5), rawMd5(swapped));
});

test('n64 .z64 (0x80 native) -> no swap', () => {
  const rom = new Uint8Array([0x80, 0x37, 0x12, 0x40]);
  assert.equal(hashBuffer(rom, 'n64', md5), rawMd5(rom));
});

test('arduboy .hex -> normalized line endings, trailing empty dropped', () => {
  const text = 'AAA\r\nBBB\r\n';
  const normalized = 'AAA\nBBB\n';
  const rom = new TextEncoder().encode(text);
  assert.equal(hashBuffer(rom, 'arduboy', md5), rawMd5(new TextEncoder().encode(normalized)));
});

test('consoleForExt maps common cartridge extensions', () => {
  assert.equal(consoleForExt('.nes').headerRule, 'nes');
  assert.equal(consoleForExt('.sfc').headerRule, 'snes');
  assert.equal(consoleForExt('.z64').headerRule, 'n64');
  assert.equal(consoleForExt('.gb').headerRule, null);
  assert.equal(consoleForExt('.iso'), null); // disc = out of scope on mobile
});
