// bzip2 decompression.
//
// Needed because WIA/RVZ can compress its groups with bzip2 and Node ships no
// decoder for it (deflate, brotli and Zstandard only). Pulling in a package for
// this would be a runtime dependency for a codec that is not even Dolphin's
// default, so it is decoded here — the same call the LZ4 decoder in cso.js makes.
//
// A stream is "BZh" + a digit, then blocks that are *bit* aligned (not byte
// aligned), then an end-of-stream marker:
//
//   'B' 'Z' 'h' '1'..'9'          the digit is the block size in 100k units
//   0x314159265359  block         repeated
//   0x177245385090  u32 crc       end of stream
//
// Each block is a Burrows-Wheeler transform of a run-length-encoded slice of the
// input, move-to-front coded, then Huffman coded with up to six tables that the
// encoder switches between every 50 symbols. Undoing that is the whole file.

const BLOCK_MAGIC_HI = 0x314159;
const BLOCK_MAGIC_LO = 0x265359;
const EOS_MAGIC_HI = 0x177245;
const EOS_MAGIC_LO = 0x385090;

const MAX_GROUPS = 6;
const GROUP_SIZE = 50;
const MAX_ALPHA_SIZE = 258;
const MAX_CODE_LEN = 23;
const RUNA = 0;
const RUNB = 1;

// MSB-first bit reader. Reads of more than 24 bits are composed by the caller so
// the accumulator never has to hold more than 31 bits.
class BitReader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
    this.bits = 0;
    this.count = 0;
  }

  read(n) {
    while (this.count < n) {
      if (this.pos >= this.buf.length) throw new Error('bzip2: input ended mid-symbol');
      this.bits = ((this.bits << 8) | this.buf[this.pos++]) >>> 0;
      this.count += 8;
    }
    this.count -= n;
    const value = (this.bits >>> this.count) & ((1 << n) - 1);
    this.bits &= (1 << this.count) - 1;
    return value >>> 0;
  }

  readBit() {
    return this.read(1);
  }
}

// Canonical Huffman decoding tables, built from the code lengths the way the
// reference implementation does: for each length, the smallest code (`base`) and
// the largest (`limit`), plus the symbols in code order (`perm`).
function buildTables(lengths, alphaSize) {
  let minLen = MAX_CODE_LEN;
  let maxLen = 0;
  for (let i = 0; i < alphaSize; i++) {
    if (lengths[i] > maxLen) maxLen = lengths[i];
    if (lengths[i] < minLen) minLen = lengths[i];
  }

  const perm = new Int32Array(alphaSize);
  let p = 0;
  for (let len = minLen; len <= maxLen; len++) {
    for (let sym = 0; sym < alphaSize; sym++) if (lengths[sym] === len) perm[p++] = sym;
  }

  const count = new Int32Array(MAX_CODE_LEN + 2);
  for (let i = 0; i < alphaSize; i++) count[lengths[i] + 1]++;
  for (let i = 1; i < MAX_CODE_LEN + 2; i++) count[i] += count[i - 1];

  const base = new Int32Array(MAX_CODE_LEN + 2);
  const limit = new Int32Array(MAX_CODE_LEN + 2);
  let vec = 0;
  for (let len = minLen; len <= maxLen; len++) {
    vec += count[len + 1] - count[len];
    limit[len] = vec - 1;
    vec <<= 1;
  }
  for (let len = minLen + 1; len <= maxLen; len++) {
    base[len] = ((limit[len - 1] + 1) << 1) - count[len];
  }

  return { minLen, maxLen, base, limit, perm, count };
}

function decodeSymbol(br, table) {
  let len = table.minLen;
  let code = br.read(len);
  while (len <= table.maxLen && code > table.limit[len]) {
    code = (code << 1) | br.readBit();
    len++;
  }
  if (len > table.maxLen) throw new Error('bzip2: invalid Huffman code');
  const index = code - table.base[len];
  if (index < 0 || index >= table.perm.length) throw new Error('bzip2: Huffman symbol out of range');
  return table.perm[index];
}

// Undo the final run-length layer: four identical bytes are followed by a count
// of how many more of them to emit.
function expandRuns(src, length, out, outPos) {
  let last = -1;
  let run = 0;
  let o = outPos;
  for (let i = 0; i < length; i++) {
    const b = src[i];
    if (run === 4) {
      if (o + b > out.length) throw new Error('bzip2: output longer than expected');
      out.fill(last, o, o + b);
      o += b;
      run = 0;
      last = -1;
      continue;
    }
    if (b === last) run++;
    else { run = 1; last = b; }
    if (o >= out.length) throw new Error('bzip2: output longer than expected');
    out[o++] = b;
  }
  return o;
}

function decodeBlock(br, blockSize, out, outPos) {
  br.read(24); br.read(8); // block CRC, not checked — the caller compares whole images
  if (br.readBit()) throw new Error('bzip2: randomised blocks are not supported');
  const origPtr = br.read(24);

  // Which byte values occur, as a bitmap of 16 groups of 16.
  const used = [];
  const groupsUsed = br.read(16);
  for (let group = 0; group < 16; group++) {
    if ((groupsUsed & (0x8000 >>> group)) === 0) continue;
    const bits = br.read(16);
    for (let bit = 0; bit < 16; bit++) {
      if (bits & (0x8000 >>> bit)) used.push(group * 16 + bit);
    }
  }
  const symbolCount = used.length;
  if (symbolCount === 0) throw new Error('bzip2: block uses no symbols');
  const alphaSize = symbolCount + 2;

  const groupCount = br.read(3);
  if (groupCount < 2 || groupCount > MAX_GROUPS) throw new Error('bzip2: bad table count');
  const selectorCount = br.read(15);

  // Selectors are move-to-front coded over the table numbers.
  const mtfGroups = new Int32Array(MAX_GROUPS);
  for (let i = 0; i < groupCount; i++) mtfGroups[i] = i;
  const selectors = new Int32Array(selectorCount);
  for (let i = 0; i < selectorCount; i++) {
    let j = 0;
    while (br.readBit()) {
      if (++j >= groupCount) throw new Error('bzip2: selector out of range');
    }
    const value = mtfGroups[j];
    for (let k = j; k > 0; k--) mtfGroups[k] = mtfGroups[k - 1];
    mtfGroups[0] = value;
    selectors[i] = value;
  }

  // Code lengths are delta coded, one walk per table.
  const tables = [];
  for (let t = 0; t < groupCount; t++) {
    const lengths = new Int32Array(MAX_ALPHA_SIZE);
    let len = br.read(5);
    for (let sym = 0; sym < alphaSize; sym++) {
      while (br.readBit()) len += br.readBit() ? -1 : 1;
      if (len < 1 || len > MAX_CODE_LEN) throw new Error('bzip2: code length out of range');
      lengths[sym] = len;
    }
    tables.push(buildTables(lengths, alphaSize));
  }

  // Huffman + move-to-front + zero-run decoding, straight into the BWT string.
  const limit = blockSize * 100000;
  const bwt = Buffer.allocUnsafe(limit);
  const byteCount = new Int32Array(256);
  const mtf = Int32Array.from(used);
  const eob = alphaSize - 1;

  let bwtLength = 0;
  let selector = 0;
  let inGroup = 0;
  let table = null;
  let runLength = 0;
  let runBit = 0;

  const flushRun = () => {
    if (runLength === 0) return;
    const value = mtf[0];
    if (bwtLength + runLength > limit) throw new Error('bzip2: block longer than its declared size');
    bwt.fill(value, bwtLength, bwtLength + runLength);
    byteCount[value] += runLength;
    bwtLength += runLength;
    runLength = 0;
    runBit = 0;
  };

  for (;;) {
    if (inGroup === 0) {
      if (selector >= selectorCount) throw new Error('bzip2: ran out of selectors');
      table = tables[selectors[selector++]];
      inGroup = GROUP_SIZE;
    }
    inGroup--;
    const symbol = decodeSymbol(br, table);

    if (symbol === RUNA || symbol === RUNB) {
      // A run of the current front-of-list byte, in bijective base 2.
      runLength += (symbol === RUNA ? 1 : 2) << runBit;
      runBit++;
      continue;
    }
    flushRun();
    if (symbol === eob) break;

    // Any other symbol is a move-to-front index, offset by one because RUNA and
    // RUNB took index 0.
    const index = symbol - 1;
    if (index >= symbolCount) throw new Error('bzip2: MTF index out of range');
    const value = mtf[index];
    for (let k = index; k > 0; k--) mtf[k] = mtf[k - 1];
    mtf[0] = value;
    if (bwtLength >= limit) throw new Error('bzip2: block longer than its declared size');
    bwt[bwtLength++] = value;
    byteCount[value]++;
  }

  if (origPtr >= bwtLength) throw new Error('bzip2: BWT pointer past the end of the block');

  // Inverse Burrows-Wheeler: tt[i] is the position of the character that follows
  // the one at i in the original string, so walking it from origPtr reads the
  // block back out in order.
  const cumulative = new Int32Array(256);
  let total = 0;
  for (let i = 0; i < 256; i++) { cumulative[i] = total; total += byteCount[i]; }
  const tt = new Int32Array(bwtLength);
  for (let i = 0; i < bwtLength; i++) tt[cumulative[bwt[i]]++] = i;

  const plain = Buffer.allocUnsafe(bwtLength);
  let p = tt[origPtr];
  for (let i = 0; i < bwtLength; i++) {
    plain[i] = bwt[p];
    p = tt[p];
  }

  return expandRuns(plain, bwtLength, out, outPos);
}

/**
 * Decompress a complete bzip2 stream. `maxSize` bounds the output — WIA/RVZ
 * always knows how large a group decompresses to, so a corrupt stream cannot be
 * made to allocate without limit.
 */
export function bzip2Decompress(input, maxSize) {
  if (input.length < 4 || input[0] !== 0x42 || input[1] !== 0x5a || input[2] !== 0x68) {
    throw new Error('bzip2: missing BZh signature');
  }
  const blockSize = input[3] - 0x30;
  if (blockSize < 1 || blockSize > 9) throw new Error('bzip2: bad block size');

  const br = new BitReader(input);
  br.pos = 4;
  const out = Buffer.allocUnsafe(maxSize);
  let outPos = 0;

  for (;;) {
    const hi = br.read(24);
    const lo = br.read(24);
    if (hi === EOS_MAGIC_HI && lo === EOS_MAGIC_LO) {
      br.read(24); br.read(8); // combined CRC
      break;
    }
    if (hi !== BLOCK_MAGIC_HI || lo !== BLOCK_MAGIC_LO) throw new Error('bzip2: lost block alignment');
    outPos = decodeBlock(br, blockSize, out, outPos);
  }

  return out.subarray(0, outPos);
}
