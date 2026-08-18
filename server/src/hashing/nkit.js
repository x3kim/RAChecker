// NKit image detection.
//
// NKit re-encodes a GameCube or Wii dump to make it smaller: it strips the
// padding the disc was mastered with and, on Wii, stores partitions decrypted.
// The result is not a disc image any more, but it keeps the original disc header
// in its first 0x200 bytes and is usually named `.nkit.iso` — so both the file
// extension and the magic word RAHasher checks look exactly right.
//
// That combination is the problem. RAHasher does not fail on an NKit image, it
// walks it and produces a hash, which then matches nothing. A scan reports "no
// match" for a game RetroAchievements fully supports, with nothing to suggest the
// file is at fault. Verified with the two images this was written against:
//
//   Super Smash Bros. Melee   -> d098c4d278305000df2dfdc0e9c90590  (RA has
//     326d2c2de5c8957637780da332ab9dbb and 8f0b014a1da84167f3f8f8b2145b95cd)
//   New Super Mario Bros. Wii -> 530df2585951b6f0e420dbeee959fb30  (RA has
//     22072114884813d3693de1bf8ab04270 and d989877def8288eb15970fa3e1d398dd)
//
// So the marker is read before hashing and the file is reported for what it is.
// Restoring one needs NKit itself; the format has no published specification.
import { open } from 'node:fs/promises';

// NKit writes "NKIT" and a version right after the copied disc header.
const MARKER_OFFSET = 0x200;
const MARKER = 'NKIT';
const MARKER_LENGTH = 8; // "NKIT v01"

/**
 * Returns the marker string (e.g. "NKIT v01") when the file is an NKit image,
 * or null for anything else — including files too short to hold a marker.
 */
export async function readNkitMarker(filePath) {
  let fh;
  try {
    fh = await open(filePath, 'r');
    const buf = Buffer.alloc(MARKER_LENGTH);
    const { bytesRead } = await fh.read(buf, 0, MARKER_LENGTH, MARKER_OFFSET);
    if (bytesRead < MARKER_LENGTH) return null;
    if (buf.toString('latin1', 0, MARKER.length) !== MARKER) return null;
    // Keep only what is printable: the bytes after the version are binary.
    return buf.toString('latin1').replace(/[^\x20-\x7e]+$/, '').trim();
  } catch {
    return null; // unreadable files are the caller's problem, not this check's
  } finally {
    await fh?.close();
  }
}

export function nkitMessage(marker) {
  return `This is an ${marker} image, not a plain disc dump. NKit strips the padding the ` +
    'disc was mastered with, so its hash can never match RetroAchievements. Convert it back ' +
    'to a full .iso with the NKit tool and scan it again.';
}
