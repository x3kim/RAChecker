// Random-access byte source for disc containers. Implemented over Expo's file
// range reader (see hashFile.ts) so large .chd/.iso files are read a slice at a
// time instead of loaded whole into memory.
export interface RandomReader {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  /**
   * Synchronous read, present only when the platform can do it (a native file
   * handle). The LZMA decoder is a tight synchronous loop, so this is what lets a
   * huge compressed block be streamed in slices instead of allocated whole.
   */
  readSync?(offset: number, length: number): Uint8Array;
}

// A RandomReader backed by an in-memory Uint8Array (used for tests and for small
// buffers we already hold, e.g. a .cue sheet).
export function bufferReader(bytes: Uint8Array): RandomReader {
  return {
    size: bytes.length,
    async read(offset: number, length: number) {
      return bytes.subarray(offset, Math.min(bytes.length, offset + length));
    },
  };
}
