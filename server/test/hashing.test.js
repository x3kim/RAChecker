// Correctness tests for the file-based RA hashing rules. We can't ship real
// ROMs, so we verify the algorithm via provable invariants:
//   - whole-file == crypto MD5
//   - header strip == MD5 of the post-header bytes
//   - N64 z64/v64/n64 of the same data must all hash identically
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashBuffer, md5 } from '../src/hashing/file-hash.js';
import { hashArcade } from '../src/hashing/index.js';

const rawMd5 = (b) => createHash('md5').update(b).digest('hex');

test('whole-file rule == raw MD5', () => {
  const buf = Buffer.from('the quick brown fox jumps over the lazy dog');
  assert.equal(hashBuffer(buf, null), rawMd5(buf));
});

test('NES: strips 16-byte iNES header when magic present', () => {
  const payload = Buffer.alloc(2048, 0xab);
  const header = Buffer.alloc(16, 0);
  header.write('NES\x1a', 0, 'binary');
  const file = Buffer.concat([header, payload]);
  assert.equal(hashBuffer(file, 'nes'), rawMd5(payload));
});

test('NES: hashes whole file when magic absent', () => {
  const file = Buffer.alloc(2048, 0x10);
  assert.equal(hashBuffer(file, 'nes'), rawMd5(file));
});

test('SNES: strips 512-byte copier header (size = 0x2000*N + 512)', () => {
  const payload = Buffer.alloc(0x2000 * 2, 0x5a);
  const header = Buffer.alloc(512, 0x00);
  const file = Buffer.concat([header, payload]);
  assert.equal(file.length - Math.floor(file.length / 0x2000) * 0x2000, 512);
  assert.equal(hashBuffer(file, 'snes'), rawMd5(payload));
});

test('SNES: whole-file when no copier header', () => {
  const file = Buffer.alloc(0x2000 * 2, 0x5a);
  assert.equal(hashBuffer(file, 'snes'), rawMd5(file));
});

test('N64: z64/v64/n64 of identical data all hash the same (== md5 of z64)', () => {
  // z64 (big-endian) magic 80 37 12 40 + 28 bytes of data (len % 4 == 0)
  const z64 = Buffer.from([
    0x80, 0x37, 0x12, 0x40,
    ...Array.from({ length: 28 }, (_, i) => (i * 7 + 3) & 0xff),
  ]);
  // v64 = byteswap16 (swap adjacent bytes)
  const v64 = Buffer.from(z64);
  for (let i = 0; i < v64.length; i += 2) { const t = v64[i]; v64[i] = v64[i + 1]; v64[i + 1] = t; }
  // n64 = byteswap32 (reverse each 4 bytes)
  const n64 = Buffer.from(z64);
  for (let i = 0; i < n64.length; i += 4) {
    const a = n64[i], b = n64[i + 1], c = n64[i + 2], d = n64[i + 3];
    n64[i] = d; n64[i + 1] = c; n64[i + 2] = b; n64[i + 3] = a;
  }
  assert.equal(v64[0], 0x37, 'v64 magic');
  assert.equal(n64[0], 0x40, 'n64 magic');
  const target = rawMd5(z64);
  assert.equal(hashBuffer(z64, 'n64'), target, 'z64');
  assert.equal(hashBuffer(v64, 'n64'), target, 'v64');
  assert.equal(hashBuffer(n64, 'n64'), target, 'n64');
});

test('Atari Lynx: strips 64-byte LNX header', () => {
  const payload = Buffer.alloc(256, 0x77);
  const header = Buffer.alloc(64, 0);
  header.write('LYNX', 0, 'binary');
  const file = Buffer.concat([header, payload]);
  assert.equal(hashBuffer(file, 'lynx'), rawMd5(payload));
});

test('Atari 7800: strips 128-byte header when "ATARI7800" at offset 1', () => {
  const payload = Buffer.alloc(512, 0x33);
  const header = Buffer.alloc(128, 0);
  header.write('ATARI7800', 1, 'binary');
  const file = Buffer.concat([header, payload]);
  assert.equal(hashBuffer(file, 'a7800'), rawMd5(payload));
});

test('PC Engine: strips 512 bytes when size & 512', () => {
  const payload = Buffer.alloc(0x2000, 0x9c);
  const header = Buffer.alloc(512, 0);
  const file = Buffer.concat([header, payload]);
  assert.ok(file.length & 512);
  assert.equal(hashBuffer(file, 'pce'), rawMd5(payload));
});

test('Arduboy .hex: normalizes line endings before hashing', () => {
  const crlf = Buffer.from(':10\r\n:20\r\n', 'utf8');
  const lf = Buffer.from(':10\n:20\n', 'utf8');
  assert.equal(hashBuffer(crlf, 'arduboy'), hashBuffer(lf, 'arduboy'));
});

test('Arcade: hash is MD5 of the filename (no extension), contents ignored', () => {
  // mslug.zip -> md5("mslug")
  const expected = md5(Buffer.from('mslug', 'binary'));
  assert.equal(hashArcade('/roms/arcade/mslug.zip'), expected);
});
