// LZMA and LZMA2 decompression.
//
// WIA/RVZ can compress its groups with either, and Node has no decoder for them.
// The published decoders on npm are no help here: the native ones would have to
// be rebuilt against Electron's ABI, and the pure-JavaScript ones only speak the
// ".lzma alone" container — WIA/RVZ stores a *raw* stream with no header at all,
// its lc/lp/pb and dictionary size living in wia_disc_t.compr_data instead. So
// the decoder is written out here, following the reference LzmaSpec.cpp.
//
// LZMA is a range coder over an adaptive bit model. Each step decodes either a
// literal byte or a (length, distance) match reaching back into what has already
// been produced; the last four distances are remembered, so a repeat costs
// almost nothing. LZMA2 wraps that in chunks, each of which may reset the
// probabilities, the properties or the dictionary.

const PROB_INIT = 1 << 10; // half of 1 << 11
const TOP_VALUE = 1 << 24;
const NUM_POS_BITS_MAX = 4;
const NUM_STATES = 12;
const NUM_LEN_TO_POS_STATES = 4;
const NUM_ALIGN_BITS = 4;
const END_POS_MODEL_INDEX = 14;
const NUM_FULL_DISTANCES = 1 << (END_POS_MODEL_INDEX >> 1); // 128
const MATCH_MIN_LEN = 2;

// One length coder packed into a single array: choice, choice2, then the 3-bit
// low and mid trees per position state and the shared 8-bit high tree.
const LEN_CHOICE = 0;
const LEN_CHOICE2 = 1;
const LEN_LOW = 2;
const LEN_MID = LEN_LOW + (1 << NUM_POS_BITS_MAX) * 8; // 130
const LEN_HIGH = LEN_MID + (1 << NUM_POS_BITS_MAX) * 8; // 258
const LEN_SIZE = LEN_HIGH + 256;

class RangeDecoder {
  constructor(buf, start, end) {
    this.buf = buf;
    this.pos = start;
    this.end = end;
    this.range = 0xffffffff;
    this.code = 0;
    // Set once the decoder reads past the end of its slice. From then on it is
    // fed zeroes, which lets a stream with no end marker run to the length the
    // caller asked for instead of failing mid-symbol.
    this.exhausted = false;
    this.nextByte(); // the first byte of a stream is always 0 and is discarded
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.nextByte()) >>> 0;
  }

  nextByte() {
    if (this.pos < this.end) return this.buf[this.pos++];
    this.exhausted = true;
    return 0;
  }

  normalize() {
    if (this.range >>> 0 < TOP_VALUE) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.nextByte()) >>> 0;
    }
  }

  decodeBit(probs, index) {
    const p = probs[index];
    const bound = ((this.range >>> 11) * p) >>> 0;
    let bit;
    if ((this.code >>> 0) < bound) {
      this.range = bound;
      probs[index] = p + ((2048 - p) >>> 5);
      bit = 0;
    } else {
      this.range = (this.range - bound) >>> 0;
      this.code = (this.code - bound) >>> 0;
      probs[index] = p - (p >>> 5);
      bit = 1;
    }
    this.normalize();
    return bit;
  }

  // Bits the coder stores flat, without a probability model.
  decodeDirect(count) {
    let result = 0;
    for (let i = 0; i < count; i++) {
      this.range = this.range >>> 1;
      this.code = (this.code - this.range) >>> 0;
      let bit;
      if (this.code >>> 31) { this.code = (this.code + this.range) >>> 0; bit = 0; }
      else bit = 1;
      this.normalize();
      result = result * 2 + bit;
    }
    return result;
  }

  bitTree(probs, offset, numBits) {
    let m = 1;
    for (let i = 0; i < numBits; i++) m = (m << 1) + this.decodeBit(probs, offset + m);
    return m - (1 << numBits);
  }

  bitTreeReverse(probs, offset, numBits) {
    let m = 1;
    let symbol = 0;
    for (let i = 0; i < numBits; i++) {
      const bit = this.decodeBit(probs, offset + m);
      m = (m << 1) + bit;
      symbol |= bit << i;
    }
    return symbol;
  }

  isFinished() {
    return this.code === 0;
  }
}

class LzmaDecoder {
  constructor() {
    this.isMatch = new Uint16Array(NUM_STATES << NUM_POS_BITS_MAX);
    this.isRep = new Uint16Array(NUM_STATES);
    this.isRepG0 = new Uint16Array(NUM_STATES);
    this.isRepG1 = new Uint16Array(NUM_STATES);
    this.isRepG2 = new Uint16Array(NUM_STATES);
    this.isRep0Long = new Uint16Array(NUM_STATES << NUM_POS_BITS_MAX);
    this.posSlot = new Uint16Array(NUM_LEN_TO_POS_STATES * 64);
    this.posDecoders = new Uint16Array(1 + NUM_FULL_DISTANCES - END_POS_MODEL_INDEX);
    this.align = new Uint16Array(1 << NUM_ALIGN_BITS);
    this.lenCoder = new Uint16Array(LEN_SIZE);
    this.repLenCoder = new Uint16Array(LEN_SIZE);
    this.literal = new Uint16Array(0);
    this.setProps(3, 0, 2);
    this.resetState();
  }

  setProps(lc, lp, pb) {
    if (lc > 8 || lp > 4 || pb > 4) throw new Error('lzma: properties out of range');
    this.lc = lc;
    this.lp = lp;
    this.pb = pb;
    const size = 0x300 << (lc + lp);
    if (this.literal.length !== size) this.literal = new Uint16Array(size);
  }

  setPropsByte(byte) {
    if (byte >= 9 * 5 * 5) throw new Error('lzma: invalid properties byte');
    const lc = byte % 9;
    const rest = (byte - lc) / 9;
    this.setProps(lc, rest % 5, (rest - (rest % 5)) / 5);
  }

  resetState() {
    for (const a of [this.isMatch, this.isRep, this.isRepG0, this.isRepG1, this.isRepG2,
      this.isRep0Long, this.posSlot, this.posDecoders, this.align, this.lenCoder,
      this.repLenCoder, this.literal]) a.fill(PROB_INIT);
    this.state = 0;
    this.rep0 = 0;
    this.rep1 = 0;
    this.rep2 = 0;
    this.rep3 = 0;
  }

  decodeLen(rc, probs, posState) {
    if (rc.decodeBit(probs, LEN_CHOICE) === 0) return rc.bitTree(probs, LEN_LOW + posState * 8, 3);
    if (rc.decodeBit(probs, LEN_CHOICE2) === 0) return 8 + rc.bitTree(probs, LEN_MID + posState * 8, 3);
    return 16 + rc.bitTree(probs, LEN_HIGH, 8);
  }

  decodeDistance(rc, len) {
    const lenState = Math.min(len, NUM_LEN_TO_POS_STATES - 1);
    const slot = rc.bitTree(this.posSlot, lenState * 64, 6);
    if (slot < 4) return slot;
    const numDirect = (slot >> 1) - 1;
    let dist = (2 | (slot & 1)) * Math.pow(2, numDirect);
    if (slot < END_POS_MODEL_INDEX) {
      dist += rc.bitTreeReverse(this.posDecoders, dist - slot, numDirect);
    } else {
      dist += rc.decodeDirect(numDirect - NUM_ALIGN_BITS) * (1 << NUM_ALIGN_BITS);
      dist += rc.bitTreeReverse(this.align, 0, NUM_ALIGN_BITS);
    }
    return dist;
  }

  /**
   * Decode into `out[outPos..outEnd)`, treating `out[dictStart..outPos)` as the
   * dictionary. Returns the new output position. Stops on the end marker, on a
   * full output, or — when `tolerateEnd` is set — as soon as the input runs out,
   * which is how a raw LZMA1 stream with neither an end marker nor a stored
   * length is read.
   */
  decode(rc, out, outPos, outEnd, dictStart, tolerateEnd) {
    const posMask = (1 << this.pb) - 1;
    const litPosMask = (1 << this.lp) - 1;

    while (outPos < outEnd) {
      if (tolerateEnd && rc.exhausted && rc.isFinished()) break;
      const position = outPos - dictStart;
      const posState = position & posMask;

      if (rc.decodeBit(this.isMatch, (this.state << NUM_POS_BITS_MAX) + posState) === 0) {
        const prev = outPos > dictStart ? out[outPos - 1] : 0;
        const litState = ((position & litPosMask) << this.lc) + (prev >>> (8 - this.lc));
        const base = 0x300 * litState;
        let symbol = 1;
        if (this.state >= 7) {
          // After a match, the byte at the same distance is used as a hint.
          let matchByte = out[outPos - this.rep0 - 1];
          do {
            const matchBit = (matchByte >> 7) & 1;
            matchByte = (matchByte << 1) & 0xff;
            const bit = rc.decodeBit(this.literal, base + ((1 + matchBit) << 8) + symbol);
            symbol = (symbol << 1) | bit;
            if (matchBit !== bit) break;
          } while (symbol < 0x100);
        }
        while (symbol < 0x100) symbol = (symbol << 1) | rc.decodeBit(this.literal, base + symbol);
        out[outPos++] = symbol & 0xff;
        this.state = this.state < 4 ? 0 : this.state < 10 ? this.state - 3 : this.state - 6;
        continue;
      }

      let len;
      if (rc.decodeBit(this.isRep, this.state) !== 0) {
        if (outPos === dictStart) throw new Error('lzma: repeat before any output');
        if (rc.decodeBit(this.isRepG0, this.state) === 0) {
          if (rc.decodeBit(this.isRep0Long, (this.state << NUM_POS_BITS_MAX) + posState) === 0) {
            this.state = this.state < 7 ? 9 : 11;
            out[outPos] = out[outPos - this.rep0 - 1];
            outPos++;
            continue;
          }
        } else {
          let dist;
          if (rc.decodeBit(this.isRepG1, this.state) === 0) dist = this.rep1;
          else {
            if (rc.decodeBit(this.isRepG2, this.state) === 0) dist = this.rep2;
            else { dist = this.rep3; this.rep3 = this.rep2; }
            this.rep2 = this.rep1;
          }
          this.rep1 = this.rep0;
          this.rep0 = dist;
        }
        len = this.decodeLen(rc, this.repLenCoder, posState);
        this.state = this.state < 7 ? 8 : 11;
      } else {
        this.rep3 = this.rep2;
        this.rep2 = this.rep1;
        this.rep1 = this.rep0;
        len = this.decodeLen(rc, this.lenCoder, posState);
        this.state = this.state < 7 ? 7 : 10;
        const dist = this.decodeDistance(rc, len);
        if (dist === 0xffffffff) return outPos; // end-of-stream marker
        this.rep0 = dist;
        if (dist >= outPos - dictStart) throw new Error('lzma: match reaches before the dictionary');
      }

      len += MATCH_MIN_LEN;
      // A match may legitimately run past the end of what the caller asked for;
      // the reference decoder truncates it too.
      if (outPos + len > outEnd) len = outEnd - outPos;
      let from = outPos - this.rep0 - 1;
      for (let i = 0; i < len; i++) out[outPos++] = out[from++];
    }
    return outPos;
  }
}

/**
 * Decode a raw LZMA1 stream — no container, no header. `propsByte` carries
 * lc/lp/pb (WIA/RVZ keeps it in wia_disc_t.compr_data). `maxSize` is how much
 * output to produce at most; a stream that ends earlier stops on its own.
 */
export function lzma1Decompress(input, propsByte, maxSize) {
  const decoder = new LzmaDecoder();
  decoder.setPropsByte(propsByte);
  decoder.resetState();
  const out = Buffer.alloc(maxSize);
  const rc = new RangeDecoder(input, 0, input.length);
  let produced = 0;
  try {
    produced = decoder.decode(rc, out, 0, maxSize, 0, true);
  } catch (e) {
    // Without a stored length the decoder can only find the end by running into
    // it. Everything decoded before that point is still valid, and WIA/RVZ never
    // reads further than the group's declared size.
    if (!rc.exhausted) throw e;
  }
  return out.subarray(0, produced);
}

/**
 * Decode a raw LZMA2 stream: a sequence of chunks, each either stored or LZMA
 * coded, with its own flags for resetting the state, the properties and the
 * dictionary. Self-terminating, so `maxSize` is only a bound on the output.
 */
export function lzma2Decompress(input, maxSize) {
  const decoder = new LzmaDecoder();
  const out = Buffer.alloc(maxSize);
  let outPos = 0;
  let dictStart = 0;
  let pos = 0;
  let propsSeen = false;

  while (pos < input.length) {
    const control = input[pos++];
    if (control === 0) break;

    if (control < 3) {
      // A stored chunk. It also drops the coder state, so the next LZMA chunk
      // has to bring its own reset — which the format guarantees.
      if (control === 1) dictStart = outPos;
      if (pos + 2 > input.length) throw new Error('lzma2: truncated chunk header');
      const size = ((input[pos] << 8) | input[pos + 1]) + 1;
      pos += 2;
      if (pos + size > input.length) throw new Error('lzma2: stored chunk runs past the input');
      if (outPos + size > maxSize) throw new Error('lzma2: output longer than expected');
      input.copy(out, outPos, pos, pos + size);
      outPos += size;
      pos += size;
      decoder.resetState();
      continue;
    }

    if (control < 0x80) throw new Error(`lzma2: reserved control byte 0x${control.toString(16)}`);
    if (pos + 4 > input.length) throw new Error('lzma2: truncated chunk header');
    const unpackSize = (((control & 0x1f) << 16) | (input[pos] << 8) | input[pos + 1]) + 1;
    const packSize = ((input[pos + 2] << 8) | input[pos + 3]) + 1;
    pos += 4;

    const reset = (control >> 5) & 3;
    if (reset >= 2) {
      if (pos >= input.length) throw new Error('lzma2: truncated properties');
      decoder.setPropsByte(input[pos++]);
      propsSeen = true;
    }
    if (!propsSeen) throw new Error('lzma2: first chunk carries no properties');
    if (reset >= 1) decoder.resetState();
    if (reset === 3) dictStart = outPos;

    if (pos + packSize > input.length) throw new Error('lzma2: chunk runs past the input');
    if (outPos + unpackSize > maxSize) throw new Error('lzma2: output longer than expected');
    const rc = new RangeDecoder(input, pos, pos + packSize);
    const end = decoder.decode(rc, out, outPos, outPos + unpackSize, dictStart, false);
    if (end !== outPos + unpackSize) throw new Error('lzma2: chunk decoded short');
    outPos = end;
    pos += packSize;
  }

  return out.subarray(0, outPos);
}
