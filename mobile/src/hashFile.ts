// Low-level on-device hashing: read a file's bytes (works for picker file://
// URIs via the new File API and for SAF content:// URIs via the legacy base64
// reader) and compute the RA hash through the shared core.
import { File } from 'expo-file-system';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
// Vendored shared core (source of truth: packages/core).
import { hashBuffer, consoleForExt } from './core';
import { md5Bytes } from './md5';

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function base64ToBytes(b64: string): Uint8Array {
  // React Native / Hermes provides atob.
  const bin = (globalThis as any).atob(b64) as string;
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function readBytes(uri: string): Promise<Uint8Array> {
  try {
    const b = await new File(uri).bytes();
    if (b && b.length) return b;
  } catch {
    /* content:// (SAF) or unsupported — fall back to the legacy base64 reader */
  }
  const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  return base64ToBytes(b64);
}

export type Hashed = { name: string; ext: string; rule: string | null; consoleId: number | null; md5: string };

export async function hashTarget(uri: string, name: string): Promise<Hashed> {
  const ext = extOf(name);
  const meta = consoleForExt(ext);
  const bytes = await readBytes(uri);
  const rule: string | null = meta?.headerRule ?? null;
  return { name, ext, rule, consoleId: meta?.consoleId ?? null, md5: hashBuffer(bytes, rule, md5Bytes) };
}

// Extensions we attempt to hash on-device (cartridge/handheld). Everything else
// (disc images, saves, junk) is skipped during a folder scan.
export const CART_EXTS = new Set([
  '.nes', '.fds', '.unf', '.unif', '.sfc', '.smc', '.swc', '.fig', '.bs',
  '.n64', '.v64', '.z64', '.ndd', '.gb', '.gbc', '.cgb', '.gba', '.agb', '.srl',
  '.md', '.gen', '.smd', '.bin', '.mdx', '.32x', '.sms', '.gg', '.pce', '.sgx',
  '.lnx', '.lyx', '.ngp', '.ngc', '.npc', '.j64', '.jag', '.rom', '.a26', '.a78',
  '.vb', '.vboy', '.min', '.sg', '.sc', '.col', '.cv', '.int', '.itv', '.vec',
  '.gam', '.ws', '.wsc', '.pc2', '.chf', '.sv', '.uze', '.hex', '.arduboy',
  '.wasm', '.mx1', '.mx2', '.rom',
]);
