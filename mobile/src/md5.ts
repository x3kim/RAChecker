import md5 from 'js-md5';

// (Uint8Array) => lowercase hex — the exact shape ra-core's hashBuffer expects.
// Injecting this into the shared core is what makes the mobile hash identical to
// the desktop's (Node crypto) hash: same rule bytes, same MD5 result.
export function md5Bytes(bytes: Uint8Array): string {
  return md5.hex(bytes);
}
