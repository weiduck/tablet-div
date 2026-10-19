/**
 * 產生 PNG 圖示（與 icon.svg 同樣的圖形），只用 Node 內建模組。
 * 執行：node tools/make-icons.js
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const BG = [0xe8, 0xf3, 0xfb];
const GRID = [0xc5, 0xdc, 0xeb];
const NAVY = [0x0b, 0x1f, 0x33];
const YELLOW = [0xff, 0xd4, 0x5e];

function inRoundRect(x, y, x0, y0, w, h, r) {
  const x1 = x0 + w;
  const y1 = y0 + h;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inCircle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** 512×512 座標系中的顏色（與 icon.svg 對應） */
function colorAt(x, y) {
  if (
    inCircle(x, y, 248, 158, 34) ||
    inRoundRect(x, y, 136, 228, 224, 40, 20) ||
    inCircle(x, y, 248, 338, 34)
  ) {
    return NAVY;
  }
  if (inRoundRect(x, y, 82, 82, 332, 332, 56)) return YELLOW;
  if (inRoundRect(x, y, 64, 64, 368, 368, 72)) return NAVY;
  if (inRoundRect(x, y, 80, 80, 368, 368, 72)) return NAVY;
  if (x % 32 < 1.5 || y % 32 < 1.5) return GRID;
  return BG;
}

function render(size) {
  const SS = 4;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let py = 0; py < size; py++) {
    const rowOff = py * (size * 3 + 1);
    raw[rowOff] = 0; // filter: none
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 512;
          const y = ((py + (sy + 0.5) / SS) / size) * 512;
          const c = colorAt(x, y);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = SS * SS;
      const o = rowOff + 1 + px * 3;
      raw[o] = Math.round(r / n);
      raw[o + 1] = Math.round(g / n);
      raw[o + 2] = Math.round(b / n);
    }
  }
  return encodePng(size, size, raw);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, "..");
[
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
].forEach(([name, size]) => {
  fs.writeFileSync(path.join(outDir, name), render(size));
  console.log(`wrote ${name} (${size}×${size})`);
});
