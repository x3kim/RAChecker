import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import jsmd5 from 'js-md5';
import { hashBuffer } from '../index.js';

// Proves the mobile MD5 primitive produces the same hash as Node's over the
// SAME rule output — i.e. desktop and mobile agree. This is the guarantee behind
// "one shared core, identical hashes on both platforms".
test('js-md5 matches node md5 through hashBuffer (nes strip)', () => {
  const rom = new Uint8Array([0x4e, 0x45, 0x53, 0x1a, ...Array(20).fill(3)]);
  const withNode = hashBuffer(rom, 'nes', (b) => createHash('md5').update(b).digest('hex'));
  const withJs = hashBuffer(rom, 'nes', (b) => jsmd5.hex(b));
  assert.equal(withJs, withNode);
});

test('js-md5 matches node md5 through hashBuffer (n64 byteswap + no rule)', () => {
  const rom = new Uint8Array([0x37, 0x80, 0x40, 0x12, 0x99, 0xaa, 0xbb, 0xcc]);
  for (const rule of ['n64', null]) {
    const withNode = hashBuffer(rom, rule, (b) => createHash('md5').update(b).digest('hex'));
    const withJs = hashBuffer(rom, rule, (b) => jsmd5.hex(b));
    assert.equal(withJs, withNode, `rule=${rule}`);
  }
});
