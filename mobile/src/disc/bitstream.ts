// Big-endian MSB-first bit reader — port of libchdr's bitstream.c. Used to decode
// the CHD v5 compressed hunk map (Huffman + RLE). 32-bit accumulator like the C
// original; JS bitwise ops are 32-bit so we only need `>>>` on the final extract.
export class BitStream {
  private buffer = 0;
  private bits = 0;
  private doffset = 0;
  constructor(private data: Uint8Array, private dlength: number) {}

  peek(numbits: number): number {
    if (numbits === 0) return 0;
    if (numbits > this.bits) {
      while (this.bits <= 24) {
        if (this.doffset < this.dlength) this.buffer |= this.data[this.doffset] << (24 - this.bits);
        this.doffset++;
        this.bits += 8;
      }
    }
    return this.buffer >>> (32 - numbits);
  }
  remove(numbits: number): void {
    this.buffer <<= numbits;
    this.bits -= numbits;
  }
  read(numbits: number): number {
    const r = this.peek(numbits);
    this.remove(numbits);
    return r;
  }
  overflow(): boolean {
    return (this.doffset - (this.bits >> 3)) > this.dlength;
  }
}
