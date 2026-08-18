// Tests for the bzip2 and LZMA/LZMA2 decoders (server/src/hashing/bzip2.js and
// lzma.js) and for reading a WIA/RVZ compressed with any of them.
//
// Node has no encoder for these, so the fixtures below were produced by Python's
// `bz2` and `lzma` modules — an implementation with nothing in common with the
// decoders under test — and are checked in base64 encoded. Each one decodes to
// `fixtureIso()`, which is rebuilt here in JavaScript, so the comparison is
// against data this file computes rather than against another blob.
//
// The three .rvz fixtures are complete files: header, both tables and the group
// payload, every one of them compressed with the disc's own codec. Expanding one
// therefore exercises the whole path, not just the codec.
//
// rvz.js writes into config.tempDir, so RA_DATA_DIR points at a throwaway
// directory BEFORE the import.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-checker-codec-'));
process.env.RA_DATA_DIR = tempDataDir;

let bzip2, lzma, rvz;
before(async () => {
  bzip2 = await import('../src/hashing/bzip2.js');
  lzma = await import('../src/hashing/lzma.js');
  rvz = await import('../src/hashing/rvz.js');
});
after(() => { try { rmSync(tempDataDir, { recursive: true, force: true }); } catch { /* windows file locks */ } });

const decode = (b64) => Buffer.from(b64.replace(/\s+/g, ''), 'base64');

// The same generator the Python side used, so the expected bytes are computed
// here instead of being another checked-in blob.
function noise(size, seed) {
  const buf = Buffer.alloc(size);
  let s = seed >>> 0;
  for (let i = 0; i < size; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    buf[i] = (s >>> 16) & 0xff;
  }
  return buf;
}

// A 32 KiB GameCube-shaped image: a header, a long run, repeating text and a
// patch of noise — compressible enough to keep the fixtures small, varied enough
// that literals, matches and repeated distances all get used.
function fixtureIso() {
  const iso = Buffer.alloc(0x8000);
  noise(0x80, 7).copy(iso, 0);
  iso.writeUInt32BE(0xc2339f3d, 0x1c);
  iso.fill(0x41, 0x80, 0x4000);
  Buffer.from('RAChecker RVZ codec fixture. '.repeat(200), 'latin1').copy(iso, 0x4000);
  noise(0x400, 8).copy(iso, 0x7000);
  return iso;
}

// bzip2 at level 1 (the smallest block size, so several blocks) — 1639 bytes
const BZIP2_LEVEL1 = `
  QlpoMTFBWSZTWYxSM5kACsF//////f//f//////////////////+///////3//////7/0AO+y7rdAOPXtJilRoTTCAbQGiaP
  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`;

// raw LZMA1 with lc=0 lp=0 pb=0 — 1273 bytes
const LZMA1_LC0LP0PB0 = `
  ADYUQSi4n/xa5zVo89khgbAfBrrUv43cAD9Q0nyQAyRotshLZ5Yd8CA1hMumClln/iSOBpW0Xrrzf5hLzITRffKYHmxO6eJ4
  rU/mFLiXRBxCkWubNldORsJLResxOfvY0VxwSJQdDhUycuSYWjykWrv8dlCQWR3KwvsCBGsCOj/pjTLqDR4N94Pb07KEPwjx
  FTwQalf31SpyyxoQLI7chkZADsUeL3kFvIXkxlVnA/iWfWg8VuJPOewKTgAYaeD1iND5IAsTaC1AL+Eef+IHpK5YTeNgg9CG
  HHXZz1psKoI3c13KjOtseQhJS6stUxK/ydNg0LLzJT5VnwS9TWtUh53ICXk5g+xuNqbKnFNa9o0RWIFwdSR2zWJveo/NY+WH
  tuMu/8SictKoSZFiSWCmAoo92wo9zIyenEkpWmOnTLxtJnHyhnbSdhDaBS2Q0tR/L85ty5d9i8C7L9u/pksvJ35YxWE0RBD7
  phfhtUprm1jLcDh0yJyANDogEcltp3PDbVMk3K+T4QlpW+z+PMzyEesA2e+ytCc/Dqm/ukBKkRy9X3+y8LCi00VI+SW/wpND
  cRMNp4p9QL/OCEbyNn/qNIfNpz0/cD/8qRNrQW164Oza24OVvVn7lXwoYLAJ7lGc1EfC2NTFdswyWDkJ8oRUK9ZD83y+gvpw
  hCAlVcdIFNDf3N1JvoS9vBGCn+NikW1XbvkyvyGe1T52xgw2LuAsksX/E2/53PXpUUvQgUVhybSjm7o2izGnkTOiOs+3Dj4n
  m4nmctAASnCiAO2uQ4HKUvNeWMA4O5GG6CvWmdrU0UVakw/6zaoU0E0wQwjixngHV/ZoIypMArQWVL+5E4HFrfDH+bkpwPHO
  8T/llYV695536B/5o2EkQETcCMVUYgLr3Vo44rBUO1k0HCLl0ujJnW7kDH3eak/JD+xYWcmeA8/ux4Cvb1PAEyKd0dTj8IBU
  yHh5zDLUkRgvCfLaZbUwekXx1GEQs1yU2Ww6uG+hMgnmbdr0AkdqceIsmOCzk0Haqko5EQGfF3eBn4lcUIzbJia8nDmafjVS
  Y8wQ4w2/xRdPaMH34aKdmMacootJ4Bkw2/I+TxEuMficapl+kFZShjMS99HvBB7FCdK94O0Aw6da2Nqd2+lYC8ocWbXfGHR3
  QMHUDfFUAxAjPbjIUM/Q/7yn96BJOoNXb4L0vXuIxGsZEQ8Lbqir76I6L7F2vQ0rU0s4CIJtdrSXsuFsREnkdUgHxtZ/dT25
  PdE3ch/S1/gpUkeSG9OIasvMrF0s5X1kSekgC+Tp+kiFtMiXN00ZKdvYNtr1D615fD12R5wtgoxAz9YgkvFN+b2gGHpyH3Cg
  //sdZ/3EVfkxXOR6RqQU18On5eL2yI3oLgIXpYFiWOQS5No9P02VfSeZPIGWUdGDH8O02yeDGRldDBqKuZwy+m28wXO16qQX
  qVge6BAC01bJnqJUzONRLHvIsTPGI4jMdvqu4l1gXrbAZsD2HFCATLkObVBIxC6knNPBuDoZG7oBp/qSF+pGQrA4DgHefdo8
  CKXxasu5AXB90zk5xJGKVyI09cFybngewTYzaE6bt5I688V0xWGUjhG/0EoF3FgOv/Q5p2w1O0hHFvdauLC1VpuXcJiCy6cj
  eWykrBGnv7HySADKudcmst1CVVPhZ72IOgjuhybISxQQRj4SdOC+f7ajD3///PdQAA==`;

// raw LZMA1 with lc=0 lp=4 pb=0 — 1267 bytes
const LZMA1_LC0LP4PB0 = `
  ADYUJ+pmUgF280uiYRsFc5ZYI+98uF6WW20/BIe8iQp87/fXgMLj4hud17VC4+MRe/6ikQuYmgNCYlL5Sssr6UYPTTvrQheP
  txGxQXiDelRzv0lrAmVAEEc26hk5jheK9lMSwFCE2bErbon5mFpTNDdu0QkpIoeyJsrU/+cGUzje3PQ4p19eh2RFSG7Bi3x5
  PH/PmxHXdBdTYJ5oFrEp/yXON+q0D/8Hr7gDhPAJGXDJbNlrv14VJO523YP4l/5P22j+S4t7UQPxKYAihp6wKRfrG+ja21JT
  dMT55pHgS3sSFj3VCwtNg5B3kMMgiiIx/Df9p2dT2MQrikNPi+VrUGIqhaQFedfSgtINMKU8lMryaLBMCJKBA2xEUHD0fcZu
  JiKfDQz/TVobrT62f1v24Sty3R2NkGR7FzvePvpOT29OML0H2hzQGmZ0u1G91yruzu/+MBpOKhRwYzs+PXdSzylYrR52el8b
  9hiQkYZDaPw3IhEQXIPZ5tp6gggPZo96FSRmYJKVkF5GLyiF5oxpZFHthcO4vcQ67wU6DoUIj6vtjr0TA0lYMCTO4d3F21q3
  CXNf5B8HFKXVAnGRU/AIpmtq7PHx5tA5aXaNlMSpLSvGP3thn/9PQjMh7fhgNa7IHJzFOSlKnNNKkl4LPDApDbqiQvBjOjiO
  nkCosvzFtNYQmW1zUA0p9tpKDtPLcvgOLo97YqVH39sib5e2xVwmQsPJKbIVxkOR854SC+f49P6MgSfUvqJWcdzf8DNAUQ/V
  gNipDj4mjC4aR+xIkUh/EoeQDmYO2VpMWbPjl7GHx2B2OndFeyZQalgJvy77ssmoS7uQI+150HQ1TM1CkPfjknx2GpxD41Kx
  uNCSj2r93zYXXySUXPhx2NjTVs6QyS6EQxP4uvG0bBRP9LohuwPiE5E32nCyJZ5j/PqO6Vcegw/qNDL5X21O3CoA7HhzshQX
  JcD/WIfL1Yg6GWk3nDYPoC/DlDel2SnEIpYaPL+f1ej7CAw0cHB2QwsjLbWtrQ25i9usyENN0ts48sVaH7IQ5JxbbUHzw6k2
  2PuwpmFBesO6G+KR0KrE5F30UscmAHA8fRQtewgcUKmuEooAlL9ZxRlWSVaxSmrAQhu71y582hodJBjFp6xqee5y7KZurW7I
  xuXfr9mCJv+NM5pzKcyNX0KTwZt7RaWCwAL2qKUe0RH0TJgCbJQPvRSh1G6kLpfzy2ehPumgiljFkRHYeU3FzBgkycORDeeN
  pFkxynz7ldi8fgXbZPbxANXigd9QX7pjj+HFIUoDG5PCRcQVTK4Jo5XeFzDwdzoRS5TziL/0/6/+A8ndYO3pOIPtG/AIUknV
  gr44c1eBH9Wf0x6WXIybt+UUd2yCeCi1ImFj8zpZRQIW9GmUtjZbQ8Fo4L4mSy7UtgWa1yrGQU9W+9QMDiwnd5T+yRTRwwKQ
  QNdoQ6YyvtZ1qpz7Nx2l1VPuPg+W+sjnrVvxsQc/aobVcW1wwgiVq0+6USYm4bmwgdUjZcojwLzAAzlru71KMzixSnRh54aM
  L8bKbiNUIodY3nQazc57EOjGuM1lsukGoYCrUrHYbZ3WrvFXRP2VjWvJ4tmoejh1bvu5q0kTLFtzEKCayonM7OTL3QHbRJpf
  YEZBf5nOVknLFBdsse+ytCLTsiZoTHaw3Tz9QobnF0K7gnFsoP//+2kAAA==`;

// raw LZMA2 at preset 9 — 1288 bytes
const LZMA2_PRESET9 = `
  4H//BQBdADYTiolXmHKZyF9D77aclfGVnsMnoF1rPQ8zIbWiKTptbMN5JaFwVm9imgN+1bF35QN//I8EATeD6PDzW8fu8l8c
  QUvqOP41faSjiLRAT/lsDb4TbizVwKb2lRE+xfcK2i6W2uhCoeMiVmFpWGWuYynQ+mNGnGmDhmSTgLTggA4czYUYiYxI+JJ8
  w3CK6qaCfdxomb+sRxZtZNfBvIuEZTJ2bxNZRguEW4KQkpP7xbY5zVeM2bkLXUjXkfIKXL6n3h8LX6Ev4FXeHtqnVYEQBeoX
  9/zo66nZyZcjtQ7SqaAfE6mPQyLetUoaMkZ5HSh7pCC/RnExe2v/uYSgD9Tj/d5VTDMAHkcJnPVHDZUj/C4FZkhD/QIhURSp
  KPaujgbIdgDRG7tAiW5bKj1KXwsEWa3pBOOuunRbw2Nd15gHgoNsWGFuBHNISVBWGP9zKpNu8apTHCSRn9i+RZpes8d2q2bU
  Jh9RbF/dx7W94FZH+xpw2EhHJtMNPBlDugBKcXoaxlTUN7dAOBCiXqEcTg0+URVHywy8HAfNxUYM5ihPVhtBf7sPUnXgjCf9
  V277DJzIgToBKAcR6ry6czwouBoL3AJjka7XC6/NjarSTcCSe+dR2fottTMII/by7miNSosGOWn+VUpZxFHlz3EaNUsuIOc1
  SizLU6XcZzprUKX+ZnTUnSN5/vEOmetpS15ePDDuUTAyrLFiQq62jY1Ug4BeX0kur5aHV1c1bqfi/QCWsjNUK2WUGxy5usfF
  V6G66XdrMmlfEiB+1GRG54SPfRad+qY12W2AcZvZvJiuTOoRu+T9VoWP/eRf6c3ntFhLG04ta0CThUDVzxCpU2O3i8O7k/9m
  4msts5oDvE9I70+wL+/yczwAzHLPYeq7OhcQTN/7N6NE6il/VxDft4XYuZa0cQA/cetme4AkGIA3jYgFwqfFWG0v3TV5qQIM
  JmJpM7hXP/6aARLM2iha2OXtKK6QgTBm8+9/FSU59McoALF+9BE/h3mdmrQYYVXaePnof5YrhsnSD1xNR2Oq7LkM1EgjJyhD
  pQ17WkASh5rm53MknVVAWI/ELrj1eR/OBWMoTpHYNAviqvhE7V9wy+rs/eAT6/TnpvXBELyOoL2Mr1ZPrOyrD6zlb5/zevul
  TPcSzTVaalwy/XOxBSA2zNi/MXrziuuTEGZXUF1aBQzkweQDVsiTx6EXOKKxEY0d/F208AE5lEH+emIgu2kPwG+kedF+1LgE
  qHryvQCc+WuRxWQB25y/2sjDl4oBG8zo5MEt1yDstkV1+UZMtaplzSPPWKavp36/UpfgWezTlK6bCNj7sNNuURg6pLLRKDLP
  fn4hP4avZJZWyLZOGgI8VzLJU5sHEPEm7g9iU+EsW9jc56ApciA4L7MTLhGFuYRY0s3JiPWX1JLZ9No9kF2O4qjgKwqKVNvd
  41Qdqjry/sZqgNbwN73X6AbD5R1BSlSHGC0KTyI2KyMeCahQdbVdOj0cTYPhz5VJRLsGNYNKPVj/+fqA/3OYImh4AlVjKfah
  i2Lvsgp7E67R24v8VXTSEgFYFw5Hso4Oi5OKxKtRvHis/JrBSi5o3vhFVtSjUz5M5WS0kccOFusyoXDHAPD/DUVC3cA2ilI+
  5QccY87YgzoDw9X2GCpoHqiysUVhFGC7qDCRLS45W9MXnK0o83AphV267nLhprn5v2/E5xlVPXiql4U22aAAAA==`;

// raw LZMA2 over noise, so the encoder emits a stored chunk — 1028 bytes
const LZMA2_STORED = `
  AQP/RDJU7eUyDVHdLp3fBfkKoltCknDUalMv5ya+y9bZuvO6rpeWVnm5IZhLAXXu1/qqT4jIhgRe0bs6jCjkSdO+PsKcRyY7
  2O1W2Zi436JruOaAe/ceFGYiCUDd8e5z/1yZs3N81WxHQar6jNlX+K7bDkaUN3Lce9/RUpIxIStWK7zlrE3bwcBN1FKffRPI
  lv3a+kqguDWUn8rGIgC1Sc/EX7C903ASOKiMOUq8TeoetALyFUkp9ar7rvYGdeKlYr86bCEmzDip64kIBa47NjyYPohuS/72
  tIs0ObWp3xgIswRyTl0mCgquhRVHahaF6ENFE82+bQ+r5hPnqLTmebk5dxi8kbhgVIg2uogJFq4bS9HsqbmvGIalBVhWrS6f
  bOlKuOPauRJ/ElZOQaNzicxImWl6VvzpPWDA5Tit7mUZWzSpPE9g+IHkmynpT2Xu89RU5LmqjFvJr/3lxMxgoLkm70M/Cefr
  VJW+o/kmJLWJhbyz3dCXRCIpdbB1IbopQ+Mx32MghMLwvncV6EDot4bzhzBf3lV+PmfensHFNdmwKbTTIKxxVUz3f9UutOnL
  4bhvs7bt/uAYAfEHINAKh/eSLnnvxOR8YNeMPUSbX8mSaiqSWxTKQqWOZkMLWW8LEbRZKEiBFg8l91ekog2BiZKicSfFbPB9
  36f1q/l5nT31J+s4ofo/55PvmGK+IYnj2Pf8yGwNqme+5FaWYkjM9ZuFnQJ0SZfaoFcH0BPxrq9dAoTPyQ8u2jncQVy/3jQM
  /GQn3DmDVsJHxltEFpInxhhbv5NTibatSChuVYhSDVkPXEEgZ8O0dn3VThhCHy7/AZpmbYOUeLjkYJTZM72PtM0HoyV2H+nO
  PBuXowyu+TIRVjGz0Eiu1AUbbUE7NvL1LfsFQ9+wLaN8Mu497ljBNz8o17+zvI7XofKw5BXXbvQo0R/SGo64zDSwCj9gNb/n
  hKgS6KMJUZuzfRQZPLU7irUgqSue0MIgXC2l/9lcKRjYbZmGGEcw9zBTUzsl65CNzIFapOOPgnntQnXX0eY4pDEQJPGLjWHD
  Eg4jn0qPp9dmjOyXYeMyr96HNB7B6yRiiShqgnT0HddRQz6eI7q3P3rYFluR5AiYKJSYLCCCJSrYTyWPSpScDOSNWpEnhPee
  Af+PSeupPg7CAVpZZsRz1RUbDHKFhBY4w4Iwz84EocrylxG35koK56VlMv4NyUY5OCXWgp7ewzXnu3iwkVTrnUY4Uv/64ab9
  yFjZcYqo1jA6BDwXDLfa2kfQ6ozniQ7u9HsMd6CESCcjdAUMV3pbkRNR94pHKpX/3Fg+vEm+QpX1+PV5UEwpPq9PbybrVww0
  uaS9MchNK32d7CyWLgnAakBHxgA=`;

// A complete RVZ of fixtureIso(), bzip2-compressed throughout — 2027 bytes
const RVZ_BZIP2 = `
  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
  xxdyRThQkDaJPj8=`;

// A complete RVZ of fixtureIso(), lzma-compressed throughout — 1619 bytes
const RVZ_LZMA = `
  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`;

// A complete RVZ of fixtureIso(), lzma2-compressed throughout — 1620 bytes
const RVZ_LZMA2 = `
  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`;


test('bzip2: a multi-block stream decodes byte for byte', () => {
  assert.ok(bzip2.bzip2Decompress(decode(BZIP2_LEVEL1), 0x8000).equals(fixtureIso()));
});

test('bzip2: a corrupt stream is rejected, not mis-decoded', () => {
  const broken = decode(BZIP2_LEVEL1);
  broken[3] = 0x30; // block size digit 0
  assert.throws(() => bzip2.bzip2Decompress(broken, 0x8000), /bzip2/);
});

test('LZMA: raw streams decode byte for byte across property settings', () => {
  const expected = fixtureIso();
  assert.ok(lzma.lzma1Decompress(decode(LZMA1_LC0LP0PB0), 0, 0x8000).equals(expected));
  assert.ok(lzma.lzma1Decompress(decode(LZMA1_LC0LP4PB0), 36, 0x8000).equals(expected));
});

test('LZMA2: a compressed stream decodes byte for byte', () => {
  assert.ok(lzma.lzma2Decompress(decode(LZMA2_PRESET9), 0x8000).equals(fixtureIso()));
});

test('LZMA2: a stored chunk decodes byte for byte', () => {
  assert.ok(lzma.lzma2Decompress(decode(LZMA2_STORED), 0x8000).equals(noise(1024, 21)));
});

test('LZMA: an out-of-range properties byte is rejected', () => {
  assert.throws(() => lzma.lzma1Decompress(decode(LZMA1_LC0LP0PB0), 225, 0x8000), /properties/);
});

// Expanding these covers the tables as well as the group payload: both are
// compressed with the disc's codec, so a broken decoder cannot even get as far
// as reading where the data is.
for (const [name, fixture] of [['bzip2', RVZ_BZIP2], ['LZMA', RVZ_LZMA], ['LZMA2', RVZ_LZMA2]]) {
  test(`RVZ: a ${name}-compressed image expands byte for byte`, async () => {
    const path = join(tempDataDir, `codec-${name}.rvz`);
    writeFileSync(path, decode(fixture));
    const result = await rvz.expandRvz(path);
    assert.equal(result?.error, undefined, `expandRvz failed: ${result?.error}`);
    try {
      assert.ok(readFileSync(result.path).equals(fixtureIso()), 'expanded image differs from the reference');
    } finally {
      await result.cleanup();
    }
  });
}
