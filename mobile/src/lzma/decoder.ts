// LZMA1 / LZMA2 decoder.
//
// Used by two callers: CHD's `lzma`/`cdlz` codecs (raw LZMA1 streams with known
// output size) and the 7z reader (LZMA1 and LZMA2 coders). Adapted from js-lzma
// (MIT, © 2011 Juan Mellado, https://github.com/jcmellado/js-lzma), itself a port
// of Igor Pavlov's LZMA SDK, and extended with:
//   - a sliding window bounded by the dictionary size, flushing decoded bytes to
//     a sink, so multi-gigabyte outputs never need to fit in memory;
//   - LZMA2's chunked framing, where probability state, properties and the
//     dictionary each persist or reset per chunk.

// Sink for decoded bytes. Called with a view that is only valid until it returns,
// so implementations must copy if they keep it.
export type ByteSink = (bytes: Uint8Array) => void;

// Sliding dictionary window. Doubles as the match source: LZMA distances are
// always smaller than the dictionary size, so a window of that size is enough
// even when the total output is far larger.
class OutWindow {
  private buffer: Uint8Array;
  private pos = 0;
  private streamPos = 0;
  /** Absolute number of bytes produced — LZMA's position context. */
  total = 0;

  constructor(windowSize: number, private sink: ByteSink) {
    this.buffer = new Uint8Array(Math.max(windowSize, 4096));
  }

  flush(): void {
    const size = this.pos - this.streamPos;
    if (size !== 0) {
      this.sink(this.buffer.subarray(this.streamPos, this.pos));
      if (this.pos >= this.buffer.length) this.pos = 0;
      this.streamPos = this.pos;
    }
  }
  putByte(b: number): void {
    this.buffer[this.pos++] = b;
    this.total++;
    if (this.pos >= this.buffer.length) this.flush();
  }
  copyBlock(distance: number, len: number): void {
    let pos = this.pos - distance - 1;
    if (pos < 0) pos += this.buffer.length;
    while (len--) {
      if (pos >= this.buffer.length) pos = 0;
      this.buffer[this.pos++] = this.buffer[pos++];
      this.total++;
      if (this.pos >= this.buffer.length) this.flush();
    }
  }
  getByte(distance: number): number {
    let pos = this.pos - distance - 1;
    if (pos < 0) pos += this.buffer.length;
    return this.buffer[pos];
  }
  // Copy raw bytes straight through (LZMA2 uncompressed chunks).
  putBytes(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) this.putByte(bytes[i]);
  }
}

// Pulls the next slice of compressed input, or null at end of stream. Lets a
// large LZMA1 stream be fed in pieces instead of held in memory as one buffer.
export type ByteSource = () => Uint8Array | null;

class InStream {
  private pos = 0;
  constructor(private data: Uint8Array, private more?: ByteSource) {}
  readByte(): number {
    if (this.pos >= this.data.length && this.more) {
      const next = this.more();
      if (next && next.length) { this.data = next; this.pos = 0; }
    }
    return this.pos < this.data.length ? this.data[this.pos++] : 0;
  }
}

class RangeDecoder {
  private code = 0;
  private range = 0;
  constructor(public stream: InStream) {}
  init(): void {
    this.code = 0;
    this.range = -1;
    for (let i = 5; i--; ) this.code = (this.code << 8) | this.stream.readByte();
  }
  decodeDirectBits(numTotalBits: number): number {
    let result = 0;
    for (let i = numTotalBits; i--; ) {
      this.range >>>= 1;
      const t = (this.code - this.range) >>> 31;
      this.code -= this.range & (t - 1);
      result = (result << 1) | (1 - t);
      if ((this.range & 0xff000000) === 0) {
        this.code = (this.code << 8) | this.stream.readByte();
        this.range <<= 8;
      }
    }
    return result;
  }
  decodeBit(probs: Int16Array, index: number): number {
    const prob = probs[index];
    const newBound = (this.range >>> 11) * prob;
    if ((this.code ^ 0x80000000) < (newBound ^ 0x80000000)) {
      this.range = newBound;
      probs[index] = prob + ((2048 - prob) >>> 5);
      if ((this.range & 0xff000000) === 0) {
        this.code = (this.code << 8) | this.stream.readByte();
        this.range <<= 8;
      }
      return 0;
    }
    this.range -= newBound;
    this.code -= newBound;
    probs[index] = prob - (prob >>> 5);
    if ((this.range & 0xff000000) === 0) {
      this.code = (this.code << 8) | this.stream.readByte();
      this.range <<= 8;
    }
    return 1;
  }
}

const initProbs = (len: number): Int16Array => new Int16Array(len).fill(1024);

class BitTreeDecoder {
  models: Int16Array;
  constructor(private numBitLevels: number) { this.models = initProbs(1 << numBitLevels); }
  init(): void { this.models = initProbs(1 << this.numBitLevels); }
  decode(rc: RangeDecoder): number {
    let m = 1;
    for (let i = this.numBitLevels; i--; ) m = (m << 1) | rc.decodeBit(this.models, m);
    return m - (1 << this.numBitLevels);
  }
  reverseDecode(rc: RangeDecoder): number {
    let m = 1, symbol = 0;
    for (let i = 0; i < this.numBitLevels; ++i) {
      const bit = rc.decodeBit(this.models, m);
      m = (m << 1) | bit;
      symbol |= bit << i;
    }
    return symbol;
  }
}

function reverseDecode2(models: Int16Array, startIndex: number, rc: RangeDecoder, numBitLevels: number): number {
  let m = 1, symbol = 0;
  for (let i = 0; i < numBitLevels; ++i) {
    const bit = rc.decodeBit(models, startIndex + m);
    m = (m << 1) | bit;
    symbol |= bit << i;
  }
  return symbol;
}

class LenDecoder {
  private choice = initProbs(2);
  private lowCoder: BitTreeDecoder[] = [];
  private midCoder: BitTreeDecoder[] = [];
  private highCoder = new BitTreeDecoder(8);
  private numPosStates = 0;
  create(numPosStates: number): void {
    for (; this.numPosStates < numPosStates; ++this.numPosStates) {
      this.lowCoder[this.numPosStates] = new BitTreeDecoder(3);
      this.midCoder[this.numPosStates] = new BitTreeDecoder(3);
    }
  }
  init(): void {
    this.choice = initProbs(2);
    for (let i = this.numPosStates; i--; ) { this.lowCoder[i].init(); this.midCoder[i].init(); }
    this.highCoder.init();
  }
  decode(rc: RangeDecoder, posState: number): number {
    if (rc.decodeBit(this.choice, 0) === 0) return this.lowCoder[posState].decode(rc);
    if (rc.decodeBit(this.choice, 1) === 0) return 8 + this.midCoder[posState].decode(rc);
    return 16 + this.highCoder.decode(rc);
  }
}

class LiteralDecoder {
  private coders: Int16Array[] = [];
  private numPrevBits = 0;
  private numPosBits = 0;
  private posMask = 0;
  create(numPosBits: number, numPrevBits: number): void {
    this.numPosBits = numPosBits;
    this.posMask = (1 << numPosBits) - 1;
    this.numPrevBits = numPrevBits;
    this.coders = [];
    for (let i = 1 << (numPrevBits + numPosBits); i--; ) this.coders[i] = initProbs(0x300);
  }
  init(): void { for (let i = 1 << (this.numPrevBits + this.numPosBits); i--; ) this.coders[i] = initProbs(0x300); }
  probsFor(pos: number, prevByte: number): Int16Array {
    return this.coders[((pos & this.posMask) << this.numPrevBits) + ((prevByte & 0xff) >>> (8 - this.numPrevBits))];
  }
}

// Decoder holding the LZMA probability model plus the output window. Kept alive
// across LZMA2 chunks so state, properties and dictionary can persist.
export class LzmaDecoder {
  private isMatch = initProbs(192);
  private isRep = initProbs(12);
  private isRepG0 = initProbs(12);
  private isRepG1 = initProbs(12);
  private isRepG2 = initProbs(12);
  private isRep0Long = initProbs(192);
  private posSlot = [new BitTreeDecoder(6), new BitTreeDecoder(6), new BitTreeDecoder(6), new BitTreeDecoder(6)];
  private posDecoders = initProbs(114);
  private posAlign = new BitTreeDecoder(4);
  private lenDecoder = new LenDecoder();
  private repLenDecoder = new LenDecoder();
  private literalDecoder = new LiteralDecoder();
  private posStateMask = 0;
  private window: OutWindow;

  private state = 0;
  private rep0 = 0; private rep1 = 0; private rep2 = 0; private rep3 = 0;
  private prevByte = 0;
  /** Bytes produced since the last dictionary reset — LZMA's position context. */
  private dictPos = 0;

  constructor(windowSize: number, sink: ByteSink) {
    this.window = new OutWindow(windowSize, sink);
  }

  setProps(lc: number, lp: number, pb: number): void {
    if (lc > 8 || lp > 4 || pb > 4) throw new Error('LZMA: invalid properties');
    this.literalDecoder.create(lp, lc);
    this.lenDecoder.create(1 << pb);
    this.repLenDecoder.create(1 << pb);
    this.posStateMask = (1 << pb) - 1;
  }
  // Properties packed into one byte, as stored by LZMA2 and .lzma headers.
  setPropsByte(b: number): void {
    const lc = b % 9;
    const rem = Math.floor(b / 9);
    this.setProps(lc, rem % 5, Math.floor(rem / 5));
  }

  resetState(): void {
    this.isMatch = initProbs(192);
    this.isRep0Long = initProbs(192);
    this.isRep = initProbs(12);
    this.isRepG0 = initProbs(12);
    this.isRepG1 = initProbs(12);
    this.isRepG2 = initProbs(12);
    this.posDecoders = initProbs(114);
    this.literalDecoder.init();
    for (let i = 4; i--; ) this.posSlot[i].init();
    this.lenDecoder.init();
    this.repLenDecoder.init();
    this.posAlign.init();
    this.state = 0;
    this.rep0 = this.rep1 = this.rep2 = this.rep3 = 0;
    this.prevByte = 0;
  }
  resetDict(): void { this.dictPos = 0; }

  flush(): void { this.window.flush(); }
  putRaw(bytes: Uint8Array): void {
    this.window.putBytes(bytes);
    this.dictPos += bytes.length;
    if (bytes.length) this.prevByte = bytes[bytes.length - 1];
  }

  // Decode exactly `unpackSize` bytes. `src` must start at the range-coder init
  // bytes for this chunk; `more` supplies further input for streams too large to
  // hold in one buffer.
  decodeChunk(src: Uint8Array, unpackSize: number, more?: ByteSource): void {
    const rc = new RangeDecoder(new InStream(src, more));
    rc.init();
    const end = this.dictPos + unpackSize;

    while (this.dictPos < end) {
      const posState = this.dictPos & this.posStateMask;
      if (rc.decodeBit(this.isMatch, (this.state << 4) + posState) === 0) {
        const probs = this.literalDecoder.probsFor(this.dictPos, this.prevByte);
        let symbol = 1;
        if (this.state >= 7) {
          let matchByte = this.window.getByte(this.rep0);
          do {
            const matchBit = (matchByte >> 7) & 1;
            matchByte <<= 1;
            const bit = rc.decodeBit(probs, ((1 + matchBit) << 8) + symbol);
            symbol = (symbol << 1) | bit;
            if (matchBit !== bit) {
              while (symbol < 0x100) symbol = (symbol << 1) | rc.decodeBit(probs, symbol);
              break;
            }
          } while (symbol < 0x100);
        } else {
          do { symbol = (symbol << 1) | rc.decodeBit(probs, symbol); } while (symbol < 0x100);
        }
        this.prevByte = symbol & 0xff;
        this.window.putByte(this.prevByte);
        this.dictPos++;
        this.state = this.state < 4 ? 0 : this.state - (this.state < 10 ? 3 : 6);
        continue;
      }

      let len = 0;
      if (rc.decodeBit(this.isRep, this.state) === 1) {
        if (rc.decodeBit(this.isRepG0, this.state) === 0) {
          if (rc.decodeBit(this.isRep0Long, (this.state << 4) + posState) === 0) {
            this.state = this.state < 7 ? 9 : 11;
            len = 1;
          }
        } else {
          let distance: number;
          if (rc.decodeBit(this.isRepG1, this.state) === 0) {
            distance = this.rep1;
          } else {
            if (rc.decodeBit(this.isRepG2, this.state) === 0) {
              distance = this.rep2;
            } else {
              distance = this.rep3;
              this.rep3 = this.rep2;
            }
            this.rep2 = this.rep1;
          }
          this.rep1 = this.rep0;
          this.rep0 = distance;
        }
        if (len === 0) {
          len = 2 + this.repLenDecoder.decode(rc, posState);
          this.state = this.state < 7 ? 8 : 11;
        }
      } else {
        this.rep3 = this.rep2; this.rep2 = this.rep1; this.rep1 = this.rep0;
        len = 2 + this.lenDecoder.decode(rc, posState);
        this.state = this.state < 7 ? 7 : 10;
        const posSlot = this.posSlot[len <= 5 ? len - 2 : 3].decode(rc);
        if (posSlot >= 4) {
          const numDirectBits = (posSlot >> 1) - 1;
          this.rep0 = (2 | (posSlot & 1)) << numDirectBits;
          if (posSlot < 14) {
            this.rep0 += reverseDecode2(this.posDecoders, this.rep0 - posSlot - 1, rc, numDirectBits);
          } else {
            this.rep0 += rc.decodeDirectBits(numDirectBits - 4) << 4;
            this.rep0 += this.posAlign.reverseDecode(rc);
            if (this.rep0 < 0) {
              if (this.rep0 === -1) return; // end-of-stream marker
              throw new Error('LZMA: corrupt stream');
            }
          }
        } else {
          this.rep0 = posSlot;
        }
      }

      if (this.rep0 >= this.dictPos) throw new Error('LZMA: distance beyond dictionary');
      // Never write past the requested output for this chunk.
      const remaining = end - this.dictPos;
      if (len > remaining) len = remaining;
      this.window.copyBlock(this.rep0, len);
      this.dictPos += len;
      this.prevByte = this.window.getByte(0);
    }
  }
}

// Decode a raw (headerless) LZMA1 stream of known output size — CHD's `lzma` and
// `cdlz` codecs. The dictionary is sized to the output, which is always enough
// because back-references can't point past what has been produced.
export function lzmaRawDecode(src: Uint8Array, lc: number, lp: number, pb: number, _dictSize: number, outSize: number): Uint8Array {
  const out = new Uint8Array(outSize);
  let written = 0;
  const dec = new LzmaDecoder(outSize, (bytes) => {
    const room = Math.min(bytes.length, outSize - written);
    if (room > 0) { out.set(bytes.subarray(0, room), written); written += room; }
  });
  dec.setProps(lc, lp, pb);
  dec.resetState();
  dec.resetDict();
  dec.decodeChunk(src, outSize);
  dec.flush();
  return out;
}

// Decode an LZMA1 stream that carries the 5-byte properties header used by 7z's
// LZMA coder (1 props byte + 4-byte little-endian dictionary size).
// `more` is optional: supply it to stream a large packed block in slices rather
// than passing the whole thing as `src` (a multi-hundred-MB buffer is exactly
// what makes this fall over on a phone).
export function lzma1Decode(props: Uint8Array, src: Uint8Array, outSize: number, sink: ByteSink, more?: ByteSource): void {
  const dictSize = props.length >= 5
    ? (props[1] | (props[2] << 8) | (props[3] << 16) | (props[4] * 0x1000000))
    : outSize;
  const dec = new LzmaDecoder(Math.min(Math.max(dictSize, 4096), outSize + 4096), sink);
  dec.setPropsByte(props[0]);
  dec.resetState();
  dec.resetDict();
  dec.decodeChunk(src, outSize, more);
  dec.flush();
}

// Decode an LZMA2 stream: a sequence of chunks, each either raw bytes or an LZMA
// chunk that may reset the probability state, the properties and/or the dictionary.
// `props` is the single 7z LZMA2 property byte encoding the dictionary size.
export function lzma2Decode(props: Uint8Array, src: Uint8Array, outSize: number, sink: ByteSink): void {
  const dictSize = lzma2DictSize(props[0]);
  const dec = new LzmaDecoder(Math.min(Math.max(dictSize, 4096), outSize + 4096), sink);
  let p = 0;
  let produced = 0;
  let needStateReset = true;

  while (p < src.length) {
    const control = src[p++];
    if (control === 0) break; // end of stream

    if (control === 1 || control === 2) {
      // Uncompressed chunk (control 1 also resets the dictionary).
      const size = ((src[p] << 8) | src[p + 1]) + 1;
      p += 2;
      if (control === 1) dec.resetDict();
      dec.putRaw(src.subarray(p, p + size));
      p += size;
      produced += size;
      needStateReset = true; // spec: the next LZMA chunk must reset state
      continue;
    }
    if (control < 0x80) throw new Error(`LZMA2: bad control byte 0x${control.toString(16)}`);

    const unpackSize = (((control & 0x1f) << 16) | (src[p] << 8) | src[p + 1]) + 1;
    p += 2;
    const packSize = ((src[p] << 8) | src[p + 1]) + 1;
    p += 2;
    const mode = (control >> 5) & 0x3;

    if (mode >= 2) dec.setPropsByte(src[p++]);
    if (mode >= 1 || needStateReset) dec.resetState();
    if (mode === 3) dec.resetDict();
    needStateReset = false;

    dec.decodeChunk(src.subarray(p, p + packSize), unpackSize);
    p += packSize;
    produced += unpackSize;
    if (produced >= outSize) break;
  }
  dec.flush();
}

// LZMA2 encodes its dictionary size in a single byte (LZMA SDK Lzma2Dec).
function lzma2DictSize(b: number): number {
  if (b > 40) throw new Error('LZMA2: invalid dictionary size');
  if (b === 40) return 0xffffffff;
  return (2 | (b & 1)) << (b / 2 + 11);
}
