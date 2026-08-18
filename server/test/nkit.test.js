// Tests for NKit detection (server/src/hashing/nkit.js).
//
// An NKit image keeps the original disc header in its first 0x200 bytes, so it
// passes every check RAHasher makes and hashes to something that matches
// nothing. The marker after that header is the only way to tell, which makes the
// offset the thing worth pinning down: read it a few bytes early or late and the
// check silently stops working.
//
// Verified against the two real images this was written for — Super Smash Bros.
// Melee and New Super Mario Bros. Wii, both `NKIT v01` — which cannot be checked
// in at 1.4 GB and 350 MB, hence the fixtures below.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'ra-checker-nkit-'));

let nkit;
before(async () => { nkit = await import('../src/hashing/nkit.js'); });
after(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* windows file locks */ } });

// A GameCube-looking header, then whatever the caller wants at 0x200 — the same
// shape the real files have.
function makeImage(marker, { size = 0x1000, offset = 0x200 } = {}) {
  const buf = Buffer.alloc(size, 0x5a);
  buf.write('GALE01', 0, 'latin1');
  buf.writeUInt32BE(0xc2339f3d, 0x1c);
  if (marker) buf.write(marker, offset, 'latin1');
  return buf;
}

function write(name, buf) {
  const path = join(dir, name);
  writeFileSync(path, buf);
  return path;
}

test('an NKit image is recognised and reports its version', async () => {
  const path = write('nkit.iso', makeImage('NKIT v01'));
  assert.equal(await nkit.readNkitMarker(path), 'NKIT v01');
});

test('the binary data after the version is not included', async () => {
  // The real files carry a hash straight after the version, with no separator.
  const buf = makeImage('NKIT v01');
  Buffer.from([0x53, 0x65, 0xc8, 0x4b]).copy(buf, 0x208);
  assert.equal(await nkit.readNkitMarker(write('nkit-tail.iso', buf)), 'NKIT v01');
});

test('a later NKit version is still recognised', async () => {
  assert.equal(await nkit.readNkitMarker(write('nkit2.iso', makeImage('NKIT v02'))), 'NKIT v02');
});

test('a plain disc image is not mistaken for one', async () => {
  assert.equal(await nkit.readNkitMarker(write('plain.iso', makeImage(null))), null);
});

test('the marker only counts at 0x200', async () => {
  const early = write('early.iso', makeImage('NKIT v01', { offset: 0x1f8 }));
  const late = write('late.iso', makeImage('NKIT v01', { offset: 0x208 }));
  assert.equal(await nkit.readNkitMarker(early), null);
  assert.equal(await nkit.readNkitMarker(late), null);
});

test('a file too short to hold a marker is not one', async () => {
  assert.equal(await nkit.readNkitMarker(write('short.iso', makeImage(null, { size: 0x204 }))), null);
});

test('a file that cannot be read is not one', async () => {
  assert.equal(await nkit.readNkitMarker(join(dir, 'does-not-exist.iso')), null);
});

test('the message names the version and says what to do', () => {
  const message = nkit.nkitMessage('NKIT v01');
  assert.match(message, /NKIT v01/);
  assert.match(message, /NKit tool/);
});
