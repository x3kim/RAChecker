// Disc containers RAHasher cannot open on its own.
//
// RAHasher only reads raw images, so a .cso/.zso, .rvz/.wia, .gcz or .wbfs is
// turned back into a plain .iso in temp first and removed again straight after
// hashing. Every path returns the same shape, so callers need this one entry
// point only.
import { isCsoPath, expandCso } from './cso.js';
import { isRvzPath, expandRvz } from './rvz.js';
import { isGczPath, expandGcz } from './gcz.js';
import { isWbfsPath, expandWbfs } from './wbfs.js';
import { expandGameCubeCiso } from './ciso-gc.js';

export function isCompressedDisc(filePath) {
  return isCsoPath(filePath) || isRvzPath(filePath) || isGczPath(filePath) || isWbfsPath(filePath);
}

/**
 * Expand a compressed disc image. `displayPath` decides which format to try —
 * it differs from `filePath` when the image was extracted from an archive into a
 * temp file with a generic name.
 *
 * Returns { path, cleanup } on success, { error } when it cannot be read, or
 * null when the file is not a compressed container at all.
 */
export async function expandDiscImage(filePath, displayPath, options) {
  const name = displayPath ?? filePath;
  if (isCsoPath(name)) {
    // `.ciso` names two unrelated formats. expandCso reads the PSP one and
    // returns null for anything else, which leaves the GameCube/Wii layout.
    return (await expandCso(filePath, options)) ?? expandGameCubeCiso(filePath, options);
  }
  if (isRvzPath(name)) return expandRvz(filePath, options);
  if (isGczPath(name)) return expandGcz(filePath, options);
  if (isWbfsPath(name)) return expandWbfs(filePath, options);
  return null;
}
