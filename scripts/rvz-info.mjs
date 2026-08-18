#!/usr/bin/env node
// Report what is inside every .rvz/.wia below a path: which disc it holds, which
// compression it uses and how big its chunks are.
//
//   npm run rvz:info -- "D:\\ROMs\\GameCube"
//   node scripts/rvz-info.mjs "\\\\NAS\\roms"
//
// Useful when someone reports that a disc image will not hash: the compression
// method is the first thing worth knowing, and it is not visible anywhere else
// without opening the file in Dolphin.
//
// Only the first 0x5c bytes of each file are read, so this is fast even over a
// network share and even for a folder of 40 GB images.
import { readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const COMPRESSION = ['none', 'Purge', 'bzip2', 'LZMA', 'LZMA2', 'Zstandard'];
const DISC_TYPE = ['(none)', 'GameCube', 'Wii'];
// Everything RAChecker's expander implements. Anything outside this list is from
// a newer Dolphin than the format documentation this was written against.
const SUPPORTED = new Set([0, 1, 2, 3, 4, 5]);

const HEAD = 0x5c; // file header (0x48) + enough of wia_disc_t to reach chunk_size

function* walk(path) {
  let entries;
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch (e) {
    console.error(`cannot read ${path}: ${e.message}`);
    return;
  }
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function describe(file) {
  const buf = Buffer.alloc(HEAD);
  const fd = openSync(file, 'r');
  let read;
  try { read = readSync(fd, buf, 0, HEAD, 0); } finally { closeSync(fd); }
  if (read < HEAD) return { error: 'file is too short to be a WIA/RVZ' };

  const magic = buf.toString('latin1', 0, 4);
  if (magic !== 'WIA\x01' && magic !== 'RVZ\x01') return { error: 'not a WIA/RVZ (wrong magic)' };

  return {
    format: magic.slice(0, 3),
    isoSize: Number(buf.readBigUInt64BE(0x24)),
    discType: buf.readUInt32BE(0x48),
    compression: buf.readUInt32BE(0x4c),
    chunkSize: buf.readUInt32BE(0x54),
  };
}

const root = resolve(process.argv[2] ?? '.');
let files;
try {
  files = statSync(root).isDirectory() ? [...walk(root)] : [root];
} catch (e) {
  console.error(`cannot read ${root}: ${e.message}`);
  process.exit(1);
}

const images = files.filter((f) => ['.rvz', '.wia'].includes(extname(f).toLowerCase()));
if (images.length === 0) {
  console.log(`No .rvz or .wia files under ${root}`);
  process.exit(0);
}

const size = (n) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${Math.round(n / 1024 ** 2)} MB`);
const byCompression = new Map();
let unreadable = 0;

console.log(`${'format'.padEnd(7)}${'compression'.padEnd(12)}${'chunk'.padEnd(9)}${'disc'.padEnd(10)}${'size'.padEnd(10)}file`);
for (const file of images) {
  let info;
  try { info = describe(file); } catch (e) { info = { error: e.message }; }
  if (info.error) {
    console.log(`${'?'.padEnd(7)}${info.error.padEnd(41)}${file}`);
    unreadable++;
    continue;
  }
  const name = COMPRESSION[info.compression] ?? `type ${info.compression}`;
  byCompression.set(name, (byCompression.get(name) ?? 0) + 1);
  console.log(
    info.format.padEnd(7) +
    name.padEnd(12) +
    `${info.chunkSize / 1024} KiB`.padEnd(9) +
    (DISC_TYPE[info.discType] ?? `type ${info.discType}`).padEnd(10) +
    size(info.isoSize).padEnd(10) +
    file
  );
}

console.log(`\n${images.length} image(s):`);
for (const [name, count] of [...byCompression].sort((a, b) => b[1] - a[1])) {
  const index = COMPRESSION.indexOf(name);
  const ok = index >= 0 && SUPPORTED.has(index);
  console.log(`  ${String(count).padStart(5)}  ${name}${ok ? '' : '  <- RAChecker cannot read this; please report it'}`);
}
if (unreadable) console.log(`  ${String(unreadable).padStart(5)}  unreadable`);
