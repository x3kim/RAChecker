// Raw LZMA (LZMA1) decoder for CHD's `cdlz`/`lzma` codecs. CHD stores a *headerless*
// LZMA stream: the decoder properties (lc=3, lp=0, pb=2 → props byte 0x5D) and the
// aligned dictionary size are derived from the hunk size, not embedded in the data,
// and the uncompressed length is known up front (no end marker).
//
// Faithful adaptation of js-lzma (MIT, © 2011 Juan Mellado, https://github.com/jcmellado/js-lzma),
// itself a port of Igor Pavlov's LZMA SDK. Reduced to the raw decode path we need
// and driven directly with (lc,lp,pb,dictSize,outSize) instead of a file header.

class OutWindow {
  private buffer!: Uint8Array;
  private windowSize = 0;
  private pos = 0;
  private streamPos = 0;
  private out!: Uint8Array;
  private outPos = 0;

  create(windowSize: number) {
    if (!this.buffer || this.windowSize !== windowSize) this.buffer = new Uint8Array(windowSize);
    this.windowSize = windowSize;
    this.pos = 0;
    this.streamPos = 0;
  }
  setOut(out: Uint8Array) { this.out = out; this.outPos = 0; }
  init() { this.streamPos = 0; this.pos = 0; }

  flush() {
    const size = this.pos - this.streamPos;
    if (size !== 0) {
      this.out.set(this.buffer.subarray(this.streamPos, this.streamPos + size), this.outPos);
      this.outPos += size;
      if (this.pos >= this.windowSize) this.pos = 0;
      this.streamPos = this.pos;
    }
  }
  copyBlock(distance: number, len: number) {
    let pos = this.pos - distance - 1;
    if (pos < 0) pos += this.windowSize;
    while (len--) {
      if (pos >= this.windowSize) pos = 0;
      this.buffer[this.pos++] = this.buffer[pos++];
      if (this.pos >= this.windowSize) this.flush();
    }
  }
  putByte(b: number) {
    this.buffer[this.pos++] = b;
    if (this.pos >= this.windowSize) this.flush();
  }
  getByte(distance: number): number {
    let pos = this.pos - distance - 1;
    if (pos < 0) pos += this.windowSize;
    return this.buffer[pos];
  }
}

class InStream {
  private pos = 0;
  constructor(private data: Uint8Array) {}
  readByte(): number { return this.pos < this.data.length ? this.data[this.pos++] : 0; }
}

class RangeDecoder {
  private code = 0;
  private range = 0;
  constructor(private stream: InStream) {}
  init() {
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
  decodeBit(probs: Int16Array | number[], index: number): number {
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

function initBitModels(len: number): Int16Array {
  const a = new Int16Array(len);
  a.fill(1024);
  return a;
}

class BitTreeDecoder {
  models!: Int16Array;
  constructor(private numBitLevels: number) {}
  init() { this.models = initBitModels(1 << this.numBitLevels); }
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
  private choice = initBitModels(2);
  private lowCoder: BitTreeDecoder[] = [];
  private midCoder: BitTreeDecoder[] = [];
  private highCoder = new BitTreeDecoder(8);
  private numPosStates = 0;
  create(numPosStates: number) {
    for (; this.numPosStates < numPosStates; ++this.numPosStates) {
      this.lowCoder[this.numPosStates] = new BitTreeDecoder(3);
      this.midCoder[this.numPosStates] = new BitTreeDecoder(3);
    }
  }
  init() {
    this.choice = initBitModels(2);
    for (let i = this.numPosStates; i--; ) { this.lowCoder[i].init(); this.midCoder[i].init(); }
    this.highCoder.init();
  }
  decode(rc: RangeDecoder, posState: number): number {
    if (rc.decodeBit(this.choice, 0) === 0) return this.lowCoder[posState].decode(rc);
    if (rc.decodeBit(this.choice, 1) === 0) return 8 + this.midCoder[posState].decode(rc);
    return 16 + this.highCoder.decode(rc);
  }
}

class Decoder2 {
  private decoders = initBitModels(0x300);
  init() { this.decoders = initBitModels(0x300); }
  decodeNormal(rc: RangeDecoder): number {
    let symbol = 1;
    do { symbol = (symbol << 1) | rc.decodeBit(this.decoders, symbol); } while (symbol < 0x100);
    return symbol & 0xff;
  }
  decodeWithMatchByte(rc: RangeDecoder, matchByte: number): number {
    let symbol = 1;
    do {
      const matchBit = (matchByte >> 7) & 1;
      matchByte <<= 1;
      const bit = rc.decodeBit(this.decoders, ((1 + matchBit) << 8) + symbol);
      symbol = (symbol << 1) | bit;
      if (matchBit !== bit) {
        while (symbol < 0x100) symbol = (symbol << 1) | rc.decodeBit(this.decoders, symbol);
        break;
      }
    } while (symbol < 0x100);
    return symbol & 0xff;
  }
}

class LiteralDecoder {
  private coders: Decoder2[] = [];
  private numPrevBits = 0;
  private numPosBits = 0;
  private posMask = 0;
  create(numPosBits: number, numPrevBits: number) {
    this.numPosBits = numPosBits;
    this.posMask = (1 << numPosBits) - 1;
    this.numPrevBits = numPrevBits;
    this.coders = [];
    for (let i = 1 << (numPrevBits + numPosBits); i--; ) this.coders[i] = new Decoder2();
  }
  init() { for (let i = 1 << (this.numPrevBits + this.numPosBits); i--; ) this.coders[i].init(); }
  getDecoder(pos: number, prevByte: number): Decoder2 {
    return this.coders[((pos & this.posMask) << this.numPrevBits) + ((prevByte & 0xff) >>> (8 - this.numPrevBits))];
  }
}

class Decoder {
  private outWindow = new OutWindow();
  private rangeDecoder!: RangeDecoder;
  private isMatch = initBitModels(192);
  private isRep = initBitModels(12);
  private isRepG0 = initBitModels(12);
  private isRepG1 = initBitModels(12);
  private isRepG2 = initBitModels(12);
  private isRep0Long = initBitModels(192);
  private posSlot = [new BitTreeDecoder(6), new BitTreeDecoder(6), new BitTreeDecoder(6), new BitTreeDecoder(6)];
  private posDecoders = initBitModels(114);
  private posAlign = new BitTreeDecoder(4);
  private lenDecoder = new LenDecoder();
  private repLenDecoder = new LenDecoder();
  private literalDecoder = new LiteralDecoder();
  private dictSizeCheck = 1;
  private posStateMask = 0;

  setup(lc: number, lp: number, pb: number, dictSize: number) {
    const numPosStates = 1 << pb;
    this.literalDecoder.create(lp, lc);
    this.lenDecoder.create(numPosStates);
    this.repLenDecoder.create(numPosStates);
    this.posStateMask = numPosStates - 1;
    this.dictSizeCheck = Math.max(dictSize, 1);
    this.outWindow.create(Math.max(this.dictSizeCheck, 4096));
  }

  private init() {
    this.outWindow.init();
    this.isMatch = initBitModels(192);
    this.isRep0Long = initBitModels(192);
    this.isRep = initBitModels(12);
    this.isRepG0 = initBitModels(12);
    this.isRepG1 = initBitModels(12);
    this.isRepG2 = initBitModels(12);
    this.posDecoders = initBitModels(114);
    this.literalDecoder.init();
    for (let i = 4; i--; ) this.posSlot[i].init();
    this.lenDecoder.init();
    this.repLenDecoder.init();
    this.posAlign.init();
    this.rangeDecoder.init();
  }

  decode(src: Uint8Array, out: Uint8Array, maxSize: number): boolean {
    this.rangeDecoder = new RangeDecoder(new InStream(src));
    this.outWindow.setOut(out);
    this.init();

    let state = 0, rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0, nowPos = 0, prevByte = 0;
    while (nowPos < maxSize) {
      const posState = nowPos & this.posStateMask;
      if (this.rangeDecoder.decodeBit(this.isMatch, (state << 4) + posState) === 0) {
        const d2 = this.literalDecoder.getDecoder(nowPos++, prevByte);
        prevByte = state >= 7
          ? d2.decodeWithMatchByte(this.rangeDecoder, this.outWindow.getByte(rep0))
          : d2.decodeNormal(this.rangeDecoder);
        this.outWindow.putByte(prevByte);
        state = state < 4 ? 0 : state - (state < 10 ? 3 : 6);
      } else {
        let len = 0;
        if (this.rangeDecoder.decodeBit(this.isRep, state) === 1) {
          if (this.rangeDecoder.decodeBit(this.isRepG0, state) === 0) {
            if (this.rangeDecoder.decodeBit(this.isRep0Long, (state << 4) + posState) === 0) {
              state = state < 7 ? 9 : 11;
              len = 1;
            }
          } else {
            let distance: number;
            if (this.rangeDecoder.decodeBit(this.isRepG1, state) === 0) {
              distance = rep1;
            } else {
              if (this.rangeDecoder.decodeBit(this.isRepG2, state) === 0) {
                distance = rep2;
              } else {
                distance = rep3;
                rep3 = rep2;
              }
              rep2 = rep1;
            }
            rep1 = rep0;
            rep0 = distance;
          }
          if (len === 0) {
            len = 2 + this.repLenDecoder.decode(this.rangeDecoder, posState);
            state = state < 7 ? 8 : 11;
          }
        } else {
          rep3 = rep2; rep2 = rep1; rep1 = rep0;
          len = 2 + this.lenDecoder.decode(this.rangeDecoder, posState);
          state = state < 7 ? 7 : 10;
          const posSlot = this.posSlot[len <= 5 ? len - 2 : 3].decode(this.rangeDecoder);
          if (posSlot >= 4) {
            const numDirectBits = (posSlot >> 1) - 1;
            rep0 = (2 | (posSlot & 1)) << numDirectBits;
            if (posSlot < 14) {
              rep0 += reverseDecode2(this.posDecoders, rep0 - posSlot - 1, this.rangeDecoder, numDirectBits);
            } else {
              rep0 += this.rangeDecoder.decodeDirectBits(numDirectBits - 4) << 4;
              rep0 += this.posAlign.reverseDecode(this.rangeDecoder);
              if (rep0 < 0) {
                if (rep0 === -1) break; // end marker (shouldn't occur with known size)
                return false;
              }
            }
          } else {
            rep0 = posSlot;
          }
        }
        if (rep0 >= nowPos || rep0 >= this.dictSizeCheck) return false;
        this.outWindow.copyBlock(rep0, len);
        nowPos += len;
        prevByte = this.outWindow.getByte(0);
      }
    }
    this.outWindow.flush();
    return true;
  }
}

// Decode a raw (headerless) LZMA stream into `outSize` bytes.
//
// CHD's LZMA streams are size-terminated (LZMA_FINISH_END, exact known length), so
// `outSize` alone bounds the output. A `dictSize` argument is accepted for API
// symmetry but the window is sized to the output instead: back-references can never
// exceed what's been produced, so an output-sized window is always sufficient and
// far cheaper than CHD's declared multi-hundred-MB dictionary. A small slack past
// `outSize` absorbs a final match that overshoots on end-marker-terminated streams.
export function lzmaRawDecode(src: Uint8Array, lc: number, lp: number, pb: number, _dictSize: number, outSize: number): Uint8Array {
  const SLACK = 512; // max LZMA match length is 273
  const buf = new Uint8Array(outSize + SLACK);
  const dec = new Decoder();
  dec.setup(lc, lp, pb, outSize + SLACK); // window >= all output → never wraps
  if (!dec.decode(src, buf, outSize)) throw new Error('LZMA decode failed');
  return buf.subarray(0, outSize);
}
