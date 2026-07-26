import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
// ra-core is resolved via metro.config.js (extraNodeModules) + tsconfig paths.
// @ts-expect-error — no bundled types on the workspace package yet.
import { hashBuffer, consoleForExt } from 'ra-core';
import { md5Bytes } from './md5';

export type HashResult = { name: string; ext: string; rule: string | null; md5: string };

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

// Read the whole file into memory. Cartridge ROMs are <= ~64 MB, so a single
// read is fine (disc systems, which would be huge, are out of scope on mobile).
// Uses the Expo SDK 54+ File API; on older SDKs use
//   import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy'
// and base64-decode instead.
async function readBytes(uri: string): Promise<Uint8Array> {
  return await new File(uri).bytes();
}

export async function pickAndHash(): Promise<HashResult | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  const ext = extOf(asset.name);
  const meta = consoleForExt(ext);
  const bytes = await readBytes(asset.uri);
  const rule: string | null = meta?.headerRule ?? null;
  return { name: asset.name, ext, rule, md5: hashBuffer(bytes, rule, md5Bytes) };
}
