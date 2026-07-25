// Regression tests for the rcheevos hash rules — the core of RAChecker. If any
// header-strip / byteswap rule breaks, matching silently breaks, so these guard
// the exact byte behaviour. Pure functions only (no DB), runnable via `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashBuffer, hashFile, md5 } from '../src/hashing/file-hash.js';

const rawMd5 = (buf) => createHash('md5').update(buf).digest('hex');
const pad = (arr, n) => { const b = Buffer.alloc(n); Buffer.from(arr).copy(b); return b; };

test('md5 of empty buffer is the canonical value', () => {
  assert.equal(md5(Buffer.alloc(0)), 'd41d8cd98f00b204e9800998ecf8427e');
});

test('no header rule = whole-file MD5', () => {
  const b = Buffer.from('The Legend of Zelda');
  assert.equal(hashBuffer(b, null), rawMd5(b));
});

test('NES: strips the 16-byte iNES header', () => {
  const body = Buffer.alloc(2048, 0x5a);
  const rom = Buffer.concat([pad([0x4e, 0x45, 0x53, 0x1a], 16), body]);
  assert.equal(hashBuffer(rom, 'nes'), rawMd5(body));
});

test('NES: no header left untouched', () => {
  const rom = Buffer.alloc(2048, 0x11);
  assert.equal(hashBuffer(rom, 'nes'), rawMd5(rom));
});

test('SNES: strips a 512-byte copier header over an 8KB multiple', () => {
  const body = Buffer.alloc(8192, 0x33);
  const rom = Buffer.concat([Buffer.alloc(512, 0xff), body]); // 8704 total
  assert.equal(hashBuffer(rom, 'snes'), rawMd5(body));
});

test('SNES: exact 8KB multiple is not stripped', () => {
  const rom = Buffer.alloc(8192, 0x44);
  assert.equal(hashBuffer(rom, 'snes'), rawMd5(rom));
});

test('Lynx: strips the 64-byte "LYNX" header', () => {
  const body = Buffer.alloc(256, 0x22);
  const rom = Buffer.concat([pad([0x4c, 0x59, 0x4e, 0x58], 64), body]);
  assert.equal(hashBuffer(rom, 'lynx'), rawMd5(body));
});

test('Atari 7800: strips the 128-byte header ("ATARI7800" at offset 1)', () => {
  const body = Buffer.alloc(512, 0x66);
  const head = pad([0x00, 0x41, 0x54, 0x41, 0x52, 0x49, 0x37, 0x38, 0x30, 0x30], 128);
  assert.equal(hashBuffer(Buffer.concat([head, body]), 'a7800'), rawMd5(body));
});

test('SCV: strips the 32-byte "EmuSCV" header', () => {
  const body = Buffer.alloc(128, 0x77);
  const head = pad([0x45, 0x6d, 0x75, 0x53, 0x43, 0x56], 32);
  assert.equal(hashBuffer(Buffer.concat([head, body]), 'scv'), rawMd5(body));
});

test('PC Engine: strips a 512-byte header when (size & 512)', () => {
  const body = Buffer.alloc(8192, 0x88);
  const rom = Buffer.concat([Buffer.alloc(512, 0x00), body]); // 8704 -> 8704 & 512 = 512
  assert.equal(hashBuffer(rom, 'pce'), rawMd5(body));
});

test('N64: .v64 (0x37) is byte-swapped in 2-byte pairs before hashing', () => {
  const src = Buffer.from([0x37, 0x80, 0x11, 0x22, 0x33, 0x44]);
  const swapped = Buffer.from([0x80, 0x37, 0x22, 0x11, 0x44, 0x33]);
  assert.equal(hashBuffer(src, 'n64'), rawMd5(swapped));
});

test('N64: .n64 (0x40) is byte-swapped in 4-byte words', () => {
  const src = Buffer.from([0x40, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde]);
  const swapped = Buffer.from([0x56, 0x34, 0x12, 0x40, 0xde, 0xbc, 0x9a, 0x78]);
  assert.equal(hashBuffer(src, 'n64'), rawMd5(swapped));
});

test('N64: .z64 (0x80 native) is hashed as-is', () => {
  const src = Buffer.from([0x80, 0x37, 0x12, 0x40, 0xab, 0xcd, 0xef, 0x01]);
  assert.equal(hashBuffer(src, 'n64'), rawMd5(src));
});

// The streamed on-disk path must produce the exact same hash as the in-memory
// buffer path for every rule — otherwise big files (streamed) would mismatch.
test('hashFile (streamed) equals hashBuffer for each rule', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ra-hash-'));
  try {
    const cases = [
      { rule: null, buf: Buffer.alloc(5000, 0x01) },
      { rule: 'nes', buf: Buffer.concat([pad([0x4e, 0x45, 0x53, 0x1a], 16), Buffer.alloc(4096, 0x02)]) },
      { rule: 'snes', buf: Buffer.concat([Buffer.alloc(512, 0xff), Buffer.alloc(8192, 0x03)]) },
      { rule: 'lynx', buf: Buffer.concat([pad([0x4c, 0x59, 0x4e, 0x58], 64), Buffer.alloc(4096, 0x04)]) },
      { rule: 'n64', buf: Buffer.from([0x37, 0x80, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66]) },
    ];
    for (const [i, c] of cases.entries()) {
      const p = join(dir, `rom${i}.bin`);
      await writeFile(p, c.buf);
      assert.equal(await hashFile(p, c.rule), hashBuffer(c.buf, c.rule), `rule=${c.rule}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
