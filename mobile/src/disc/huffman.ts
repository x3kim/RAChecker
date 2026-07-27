// Static Huffman decoder — port of the decode path of libchdr's huffman.c.
// The CHD v5 map stores its per-hunk compression types as an RLE-encoded Huffman
// tree (create_huffman_decoder(16, 8) + huffman_import_tree_rle), which we replay
// here to rebuild the lookup table and decode symbols.
import { BitStream } from './bitstream';

const MAKE_LOOKUP = (code: number, bits: number) => ((code << 5) | (bits & 0x1f)) >>> 0;

export class HuffmanDecoder {
  private lookup: Uint32Array;
  private numbits: Uint8Array; // per-code bit length
  private codebits: Uint32Array; // per-code canonical code
  constructor(private numcodes: number, private maxbits: number) {
    this.lookup = new Uint32Array(1 << maxbits);
    this.numbits = new Uint8Array(numcodes);
    this.codebits = new Uint32Array(numcodes);
  }

  decodeOne(bitbuf: BitStream): number {
    const bits = bitbuf.peek(this.maxbits);
    const lookup = this.lookup[bits];
    bitbuf.remove(lookup & 0x1f);
    return lookup >>> 5;
  }

  // huffman_import_tree_rle — returns true on success.
  importTreeRle(bitbuf: BitStream): boolean {
    const numbits = this.maxbits >= 16 ? 5 : this.maxbits >= 8 ? 4 : 3;
    let curnode = 0;
    while (curnode < this.numcodes) {
      let nodebits = bitbuf.read(numbits);
      if (nodebits !== 1) {
        this.numbits[curnode++] = nodebits;
      } else {
        nodebits = bitbuf.read(numbits);
        if (nodebits === 1) {
          this.numbits[curnode++] = nodebits;
        } else {
          let repcount = bitbuf.read(numbits) + 3;
          if (repcount + curnode > this.numcodes) return false;
          while (repcount--) this.numbits[curnode++] = nodebits;
        }
      }
    }
    if (curnode !== this.numcodes) return false;
    if (!this.assignCanonicalCodes()) return false;
    if (!this.buildLookupTable()) return false;
    return !bitbuf.overflow();
  }

  private assignCanonicalCodes(): boolean {
    const bithisto = new Uint32Array(33);
    for (let c = 0; c < this.numcodes; c++) {
      const nb = this.numbits[c];
      if (nb > this.maxbits) return false;
      if (nb <= 32) bithisto[nb]++;
    }
    let curstart = 0;
    for (let codelen = 32; codelen > 0; codelen--) {
      const nextstart = (curstart + bithisto[codelen]) >>> 1;
      if (codelen !== 1 && nextstart * 2 !== curstart + bithisto[codelen]) return false;
      bithisto[codelen] = curstart;
      curstart = nextstart;
    }
    for (let c = 0; c < this.numcodes; c++) {
      const nb = this.numbits[c];
      if (nb > 0) this.codebits[c] = bithisto[nb]++;
    }
    return true;
  }

  private buildLookupTable(): boolean {
    const lookupLen = 1 << this.maxbits;
    for (let c = 0; c < this.numcodes; c++) {
      const nb = this.numbits[c];
      if (nb > 0) {
        const value = MAKE_LOOKUP(c, nb);
        const shift = this.maxbits - nb;
        const destStart = this.codebits[c] << shift;
        const destEnd = ((this.codebits[c] + 1) << shift) - 1;
        if (destStart >= lookupLen || destEnd >= lookupLen || destEnd < destStart) return false;
        for (let d = destStart; d <= destEnd; d++) this.lookup[d] = value;
      }
    }
    return true;
  }
}
