import md5 from 'js-md5';

// js-md5's default export is a callable digest fn at runtime, but its bundled
// types don't expose a call signature — cast to the real shape.
const md5hex = md5 as unknown as (input: Uint8Array) => string;

// (Uint8Array) => lowercase hex — the exact shape ra-core's hashBuffer expects.
// Injecting this into the shared core is what makes the mobile hash identical to
// the desktop's (Node crypto) hash: same rule bytes, same MD5 result.
export function md5Bytes(bytes: Uint8Array): string {
  return md5hex(bytes);
}
