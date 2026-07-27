// VENDORED COPY of packages/core/hash/rules.js — kept self-contained so EAS
// cloud builds (which upload only mobile/) have the shared core. Source of truth
// is packages/core; keep in sync. The desktop imports the original via the
// ra-core workspace, the mobile app imports this copy.

// ---- byte-order helpers (Nintendo 64) ----
export function byteswap16InPlace(buf) {
  const n = buf.length - (buf.length % 2);
  for (let i = 0; i < n; i += 2) { const t = buf[i]; buf[i] = buf[i + 1]; buf[i + 1] = t; }
}
export function byteswap32InPlace(buf) {
  const n = buf.length - (buf.length % 4);
  for (let i = 0; i < n; i += 4) {
    const a = buf[i], b = buf[i + 1], c = buf[i + 2], d = buf[i + 3];
    buf[i] = d; buf[i + 1] = c; buf[i + 2] = b; buf[i + 3] = a;
  }
}

function startsWith(buf, bytes, offset = 0) {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[offset + i] !== bytes[i]) return false;
  return true;
}

export const MAGIC = {
  NES: [0x4e, 0x45, 0x53, 0x1a],
  FDS: [0x46, 0x44, 0x53, 0x1a],
  LYNX: [0x4c, 0x59, 0x4e, 0x58],
  ATARI7800: [0x41, 0x54, 0x41, 0x52, 0x49, 0x37, 0x38, 0x30, 0x30],
  EMUSCV: [0x45, 0x6d, 0x75, 0x53, 0x43, 0x56],
};

export function n64Mode(firstByte) {
  return firstByte === 0x37 ? 2 : firstByte === 0x40 ? 4 : 1;
}

export function stripBytes(rule, size, head) {
  switch (rule) {
    case 'nes':   return size > 16 && (startsWith(head, MAGIC.NES) || startsWith(head, MAGIC.FDS)) ? 16 : 0;
    case 'snes':  return size - Math.floor(size / 0x2000) * 0x2000 === 512 ? 512 : 0;
    case 'lynx':  return size > 64 && startsWith(head, MAGIC.LYNX) ? 64 : 0;
    case 'a7800': return size > 128 && startsWith(head, MAGIC.ATARI7800, 1) ? 128 : 0;
    case 'pce':   return (size & 512) ? 512 : 0;
    case 'scv':   return size > 32 && startsWith(head, MAGIC.EMUSCV) ? 32 : 0;
    default:      return 0;
  }
}

function normalizeArduboyText(bytes) {
  const text = new TextDecoder().decode(bytes);
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let normalized = '';
  for (const l of lines) normalized += l + '\n';
  return new TextEncoder().encode(normalized);
}

export function applyHeaderRule(bytes, rule) {
  if (!rule) return bytes;
  if (rule === 'arduboy') return normalizeArduboyText(bytes);
  if (rule === 'n64') {
    const out = bytes.slice();
    const mode = n64Mode(out[0]);
    if (mode === 2) byteswap16InPlace(out);
    else if (mode === 4) byteswap32InPlace(out);
    return out;
  }
  const strip = stripBytes(rule, bytes.length, bytes);
  return strip ? bytes.subarray(strip) : bytes;
}

// md5 is injected as (Uint8Array) => hex string.
export function hashBuffer(bytes, rule, md5) {
  return md5(applyHeaderRule(bytes, rule));
}
