// Generates the app icon. Preferred: convert the real brand logo
// (branding/RAChecker-Logo-512px.png) into a multi-res build/icon.ico +
// build/icon.png + web/public/icon.png via ImageMagick, if `magick` is on PATH.
// Fallback (no ImageMagick): paint a dependency-free pixel-art trophy by hand
// (zlib is built in). Run: node scripts/make-icon.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Preferred path: convert the brand logo with ImageMagick ---------------
const LOGO = join(ROOT, 'branding', 'RAChecker-Logo-512px.png');
function haveMagick() {
  try { execFileSync('magick', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
}
if (existsSync(LOGO) && haveMagick()) {
  mkdirSync(join(ROOT, 'build'), { recursive: true });
  execFileSync('magick', [LOGO, '-background', 'none', '-define', 'icon:auto-resize=256,128,64,48,32,16', join(ROOT, 'build', 'icon.ico')]);
  execFileSync('magick', [LOGO, '-background', 'none', '-resize', '256x256', join(ROOT, 'build', 'icon.png')]);
  execFileSync('magick', [LOGO, '-background', 'none', '-resize', '256x256', join(ROOT, 'web', 'public', 'icon.png')]);
  console.log('icon.ico + icon.png written from brand logo (ImageMagick)');
  process.exit(0);
}
console.log('ImageMagick or logo not found — falling back to the built-in pixel-art trophy.');

// 16x16 pixel art: retro trophy on a dark tile, 1px rounded corners.
const ART = [
  '................',
  '................',
  '...##########...',
  '.##########oo##.',
  '.#.#+######oo.#.',
  '.#.########oo.#.',
  '..#########oo#..',
  '....######oo....',
  '.....####oo.....',
  '......###o......',
  '.......##.......',
  '.......##.......',
  '.....######.....',
  '....########....',
  '................',
  '................',
];

const COLORS = {
  '#': [0x25, 0xe3, 0xff, 0xff], // cyan
  o: [0x0f, 0xa8, 0xc8, 0xff], // shaded cyan
  '+': [0xd9, 0xfb, 0xff, 0xff], // highlight
  '.': [0x0d, 0x13, 0x1c, 0xff], // dark tile
};
const CORNERS = new Set(['0,0', '15,0', '0,15', '15,15']); // transparent

function pixelAt(x, y) {
  if (CORNERS.has(`${x},${y}`)) return [0, 0, 0, 0];
  return COLORS[ART[y][x]] || COLORS['.'];
}

// --- minimal PNG encoder (RGBA, no filters) --------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size) {
  const scale = size / 16;
  const raw = Buffer.alloc(size * (1 + size * 4));
  let off = 0;
  for (let y = 0; y < size; y++) {
    raw[off++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(Math.floor(x / scale), Math.floor(y / scale));
      raw[off++] = r; raw[off++] = g; raw[off++] = b; raw[off++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- ICO container (PNG entries, valid since Vista) -------------------------
function encodeIco(sizes) {
  const pngs = sizes.map((s) => ({ size: s, png: encodePng(s) }));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.png)]);
}

mkdirSync(join(ROOT, 'build'), { recursive: true });
mkdirSync(join(ROOT, 'web', 'public'), { recursive: true });
writeFileSync(join(ROOT, 'build', 'icon.ico'), encodeIco([16, 32, 48, 64, 256]));
writeFileSync(join(ROOT, 'build', 'icon.png'), encodePng(256));
writeFileSync(join(ROOT, 'web', 'public', 'icon.png'), encodePng(64));
console.log('icon.ico + icon.png written (build/, web/public/)');
