#!/usr/bin/env node
/**
 * Generates `src/app/favicon.ico` — the AARAGATE mark at 32×32.
 *
 * The previous `favicon.ico` was the stock Next.js icon (third-party branding,
 * left over from the product this app was cloned from). Keeping a raster in sync
 * with `components/logo.tsx` by hand is exactly the drift nobody notices for a
 * year, so the geometry below is the geometry the SVG uses and the file is
 * regenerated rather than edited.
 *
 * Zero dependencies: Node's `zlib` deflates the scanlines into a real PNG, which
 * is wrapped in an ICO container (PNG-in-ICO is supported by every current
 * browser). Quality comes from 4× supersampling per axis, so the 16px browser-tab
 * rendering is clean rather than jagged.
 *
 * Run: node scripts/generate-favicon.mjs
 */
import { deflateSync, inflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "app", "favicon.ico");

const SIZE = 32;
const SS = 4; // subsamples per axis
const TILE = [0x43, 0x38, 0xca];
const AMBER = [0xff, 0xc7, 0x6b];

// Same user units as the SVG (viewBox 0 0 32 32).
const ARCH = { x0: 8.6, x1: 23.4, yTop: 16, yBottom: 25.4, r: 7.4, w: 2.2 };
const ASCENT = [
  [11.5, 23.6],
  [14.4, 19.8],
  [17, 21.4],
  [20, 16.8],
];
const NODE = { x: 20, y: 16.8, r: 1.5 };
const HILIGHT = { x0: 10, x1: 22, y: 1.6, w: 2 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Signed-distance rounded rectangle — exact, not a 9-region approximation. */
function inRoundRect(px, py, x, y, w, h, r) {
  const cx = clamp(px, x + r, x + w - r);
  const cy = clamp(py, y + r, y + h - r);
  return Math.hypot(px - cx, py - cy) <= r;
}

function onArch(px, py) {
  const half = ARCH.w / 2;
  if (segDist(px, py, ARCH.x0, ARCH.yBottom, ARCH.x0, ARCH.yTop) <= half) return true;
  if (segDist(px, py, ARCH.x1, ARCH.yBottom, ARCH.x1, ARCH.yTop) <= half) return true;
  // Upper semicircle centred at (16, 16).
  if (py <= 16 && Math.abs(Math.hypot(px - 16, py - 16) - ARCH.r) <= half) return true;
  return false;
}

function onAscent(px, py) {
  for (let i = 0; i < ASCENT.length - 1; i++) {
    const [ax, ay] = ASCENT[i];
    const [bx, by] = ASCENT[i + 1];
    if (segDist(px, py, ax, ay, bx, by) <= 1) return true;
  }
  return false;
}

/** One supersample: composites the shapes in paint order, sources over dest. */
function pixel(x, y) {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  const paint = ([cr, cg, cb], alpha) => {
    if (alpha <= 0) return;
    r = cr * alpha + r * (1 - alpha);
    g = cg * alpha + g * (1 - alpha);
    b = cb * alpha + b * (1 - alpha);
    a = alpha + a * (1 - alpha);
  };

  if (inRoundRect(x, y, 0, 0, SIZE, SIZE, 9)) paint(TILE, 1);
  if (onArch(x, y)) paint([255, 255, 255], 0.97);
  if (onAscent(x, y)) paint(AMBER, 0.98);
  if (Math.hypot(x - NODE.x, y - NODE.y) <= NODE.r) paint(AMBER, 1);
  if (segDist(x, y, HILIGHT.x0, HILIGHT.y, HILIGHT.x1, HILIGHT.y) <= HILIGHT.w / 2) {
    paint([255, 255, 255], 0.4);
  }

  // Un-premultiply for PNG storage.
  if (a === 0) return [0, 0, 0, 0];
  return [r / a, g / a, b / a, a];
}

/** Supersample every pixel, then downmix (premultiplied, so edges stay clean). */
function renderRgba() {
  const buf = Buffer.alloc(SIZE * SIZE * 4);
  const step = 1 / SS;
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [sr, sg, sb, sa] = pixel(px + (sx + 0.5) * step, py + (sy + 0.5) * step);
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const i = (py * SIZE + px) * 4;
      buf[i] = a === 0 ? 0 : Math.round(r / a);
      buf[i + 1] = a === 0 ? 0 : Math.round(g / a);
      buf[i + 2] = a === 0 ? 0 : Math.round(b / a);
      buf[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return buf;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function toPng(rgba) {
  const stride = SIZE * 4 + 1;
  const raw = Buffer.alloc(stride * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function toIco(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  header[6] = SIZE; // width
  header[7] = SIZE; // height
  header[8] = 0; // palette size
  header[9] = 0; // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // payload offset
  return Buffer.concat([header, png]);
}

const png = toPng(renderRgba());
const ico = toIco(png);
writeFileSync(OUT, ico);
console.log(`wrote ${OUT} — ${ico.length} bytes (PNG payload ${png.length} bytes)`);

/* ---------------------------------------------------------------------------
   Self-check. A binary asset that silently comes out corrupt is worse than no
   asset at all (browsers just fall back to a blank tab), so the generator
   re-parses what it wrote: ICO directory, PNG signature, every chunk CRC, the
   IHDR geometry and the inflated scanline count.
   --------------------------------------------------------------------------- */
function verifyIco(buf) {
  const fail = (msg) => {
    throw new Error(`favicon self-check failed: ${msg}`);
  };
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1 || buf.readUInt16LE(4) !== 1) {
    fail("ICO header is not a single-image icon");
  }
  if (buf[6] !== SIZE || buf[7] !== SIZE || buf.readUInt16LE(12) !== 32) {
    fail("ICO directory entry is not 32×32/32bpp");
  }
  const len = buf.readUInt32LE(14);
  const off = buf.readUInt32LE(18);
  const payload = buf.subarray(off, off + len);
  if (payload.length !== len) fail("ICO payload is truncated");

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!payload.subarray(0, 8).equals(sig)) fail("payload is not a PNG");

  let p = 8;
  let idat = [];
  let sawIhdr = false;
  let sawIend = false;
  while (p < payload.length) {
    const size = payload.readUInt32BE(p);
    const type = payload.subarray(p + 4, p + 8).toString("ascii");
    const data = payload.subarray(p + 8, p + 8 + size);
    const declared = payload.readUInt32BE(p + 8 + size);
    if (declared !== crc32(payload.subarray(p + 4, p + 8 + size))) fail(`${type} CRC mismatch`);
    if (type === "IHDR") {
      sawIhdr = true;
      if (data.readUInt32BE(0) !== SIZE || data.readUInt32BE(4) !== SIZE) fail("IHDR size mismatch");
      if (data[8] !== 8 || data[9] !== 6) fail("IHDR is not 8-bit RGBA");
    }
    if (type === "IDAT") idat.push(data);
    if (type === "IEND") sawIend = true;
    p += 12 + size;
  }
  if (!sawIhdr || !sawIend || idat.length === 0) fail("missing IHDR/IDAT/IEND");
  if (p !== payload.length) fail("trailing bytes after IEND");

  const expected = SIZE * (SIZE * 4 + 1);
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== expected) fail(`inflated ${raw.length} bytes, expected ${expected}`);
  // The tile must actually be opaque somewhere and transparent at the corners.
  const centre = raw[Math.floor(SIZE / 2) * (SIZE * 4 + 1) + 1 + Math.floor(SIZE / 2) * 4 + 3];
  if (centre !== 255) fail("centre pixel is not opaque");
  return { payload: payload.length, inflated: raw.length };
}

const check = verifyIco(ico);
console.log(
  `self-check ok — ICO directory 32×32/32bpp, PNG signature + CRCs valid, ` +
    `${check.inflated} inflated scanline bytes`,
);

// `node scripts/generate-favicon.mjs out.png` also drops a plain PNG, so the mark
// can be eyeballed without decoding an ICO by hand.
const preview = process.argv[2];
if (preview) {
  writeFileSync(preview, png);
  console.log(`wrote preview ${preview} — open it to check the mark`);
}