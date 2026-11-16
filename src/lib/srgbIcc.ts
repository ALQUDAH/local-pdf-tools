/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Generates a compact ICC v2 sRGB display profile (matrix/TRC), used as the PDF/A
// OutputIntent. Built in code so no third-party profile file has to be shipped.

const D50 = [0.9642, 1.0, 0.8249];
// sRGB primaries, chromatically adapted to D50 (Bradford), as used by standard sRGB profiles
const RED = [0.4361, 0.2225, 0.0139];
const GREEN = [0.3851, 0.7169, 0.0971];
const BLUE = [0.1431, 0.0606, 0.7141];

class Writer {
  bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  u16(v: number) {
    this.u8(v >> 8);
    this.u8(v);
  }
  u32(v: number) {
    this.u16(v >>> 16);
    this.u16(v & 0xffff);
  }
  ascii(s: string) {
    for (const c of s) this.u8(c.charCodeAt(0));
  }
  s15f16(v: number) {
    this.u32(Math.round(v * 65536) >>> 0);
  }
  pad4() {
    while (this.bytes.length % 4) this.u8(0);
  }
}

function xyzTag(xyz: number[]): number[] {
  const w = new Writer();
  w.ascii('XYZ ');
  w.u32(0);
  xyz.forEach((v) => w.s15f16(v));
  return w.bytes;
}

function curveTag(gamma: number): number[] {
  const w = new Writer();
  w.ascii('curv');
  w.u32(0);
  w.u32(1); // one entry = pure gamma, u8Fixed8Number
  w.u16(Math.round(gamma * 256));
  w.pad4();
  return w.bytes;
}

function descTag(text: string): number[] {
  const w = new Writer();
  w.ascii('desc');
  w.u32(0);
  w.u32(text.length + 1);
  w.ascii(text);
  w.u8(0);
  w.u32(0); // unicode language code
  w.u32(0); // unicode count
  w.u16(0); // scriptcode code
  w.u8(0); // scriptcode count
  for (let i = 0; i < 67; i++) w.u8(0);
  w.pad4();
  return w.bytes;
}

function textTag(text: string): number[] {
  const w = new Writer();
  w.ascii('text');
  w.u32(0);
  w.ascii(text);
  w.u8(0);
  w.pad4();
  return w.bytes;
}

let cached: Uint8Array | null = null;

export function srgbIccProfile(): Uint8Array {
  if (cached) return cached;
  const trc = curveTag(2.2);
  const tags: Array<[string, number[]]> = [
    ['desc', descTag('sRGB IEC61966-2.1')],
    ['cprt', textTag('No copyright, use freely')],
    ['wtpt', xyzTag(D50)],
    ['rXYZ', xyzTag(RED)],
    ['gXYZ', xyzTag(GREEN)],
    ['bXYZ', xyzTag(BLUE)],
    ['rTRC', trc],
    ['gTRC', trc],
    ['bTRC', trc],
  ];

  // Lay out tag data (identical data is shared, as ICC allows)
  const headerSize = 128;
  const tableSize = 4 + tags.length * 12;
  let offset = headerSize + tableSize;
  const placed = new Map<number[], number>();
  const entries: Array<[string, number, number]> = [];
  const data: number[] = [];
  for (const [sig, bytes] of tags) {
    if (!placed.has(bytes)) {
      placed.set(bytes, offset + data.length);
      data.push(...bytes);
    }
    entries.push([sig, placed.get(bytes)!, bytes.length]);
  }
  const total = offset + data.length;

  const w = new Writer();
  // Header
  w.u32(total);
  w.u32(0); // preferred CMM
  w.u32(0x02100000); // version 2.1
  w.ascii('mntr');
  w.ascii('RGB ');
  w.ascii('XYZ ');
  [2026, 1, 1, 0, 0, 0].forEach((v) => w.u16(v)); // creation date
  w.ascii('acsp');
  w.u32(0); // platform
  w.u32(0); // flags
  w.u32(0); // manufacturer
  w.u32(0); // model
  w.u32(0);
  w.u32(0); // attributes
  w.u32(0); // rendering intent: perceptual
  D50.forEach((v) => w.s15f16(v)); // PCS illuminant
  w.u32(0); // creator
  while (w.bytes.length < headerSize) w.u8(0);
  // Tag table
  w.u32(entries.length);
  for (const [sig, off, size] of entries) {
    w.ascii(sig);
    w.u32(off);
    w.u32(size);
  }
  w.bytes.push(...data);
  cached = new Uint8Array(w.bytes);
  return cached;
}
