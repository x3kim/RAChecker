// Compressed disc containers RAHasher cannot open on its own.
//
// RAHasher only reads raw images, so a .cso/.zso or .rvz/.wia is expanded into a
// plain .iso in temp first and removed again straight after hashing. Both paths
// return the same shape, so callers only need this one entry point.
import { isCsoPath, expandCso } from './cso.js';
import { isRvzPath, expandRvz } from './rvz.js';
import { isGczPath, expandGcz } from './gcz.js';

export function isCompressedDisc(filePath) {
  return isCsoPath(filePath) || isRvzPath(filePath) || isGczPath(filePath);
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
  if (isCsoPath(name)) return expandCso(filePath, options);
  if (isRvzPath(name)) return expandRvz(filePath, options);
  if (isGczPath(name)) return expandGcz(filePath, options);
  return null;
}
