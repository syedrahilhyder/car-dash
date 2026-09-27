#!/usr/bin/env node
// Generates the PWA icon set from code so the app has no binary assets checked
// in by hand. Run with: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const NAVY = [0x10, 0x17, 0x25];
const GOLD = [0xf2, 0xc1, 0x4e];
const INK = [0xf2, 0xf5, 0xf9];

// Draws a stylised car front on a circular gold badge.
function renderIcon(size, { maskable = false } = {}) {
  const px = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const scale = maskable ? 0.62 : 0.82;
  const badgeR = size * 0.44 * scale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      let color = NAVY;
      // Faint vignette for depth.
      const vignette = 1 - Math.min(0.35, dist / size);

      if (dist < badgeR) {
        color = GOLD;
        const car = carMask(dx, dy, size * scale);
        if (car === 'body') color = NAVY;
        if (car === 'light') color = INK;
        if (car === 'window') color = [0x2c, 0x40, 0x66];
      }

      px[i] = Math.round(color[0] * vignette + NAVY[0] * (1 - vignette));
      px[i + 1] = Math.round(color[1] * vignette + NAVY[1] * (1 - vignette));
      px[i + 2] = Math.round(color[2] * vignette + NAVY[2] * (1 - vignette));
      px[i + 3] = 255;
    }
  }
  return px;
}

// A simple front-on car silhouette in badge-local coordinates.
function carMask(dx, dy, s) {
  const u = dx / (s * 0.44);
  const v = dy / (s * 0.44);

  // Wheels.
  if (Math.abs(v) > 0.1 && Math.abs(v) < 0.62 && Math.abs(Math.abs(u) - 0.78) < 0.2) return 'body';
  // Lower body.
  if (Math.abs(v) < 0.3 && Math.abs(u) < 0.9) return 'body';
  // Cabin.
  if (v <= 0.1 && v > -0.52 && Math.abs(u) < 0.55) {
    if (v > -0.12 && v < 0.02 && Math.abs(u) < 0.42) return 'window';
    return 'body';
  }
  // Headlights.
  if (v > -0.06 && v < 0.08 && Math.abs(Math.abs(u) - 0.62) < 0.16) return 'light';
  return null;
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(pixels.subarray(y * size * 4, (y + 1) * size * 4)).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outputs = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
];

for (const [name, size, opts] of outputs) {
  writeFileSync(join(outDir, name), png(size, renderIcon(size, opts)));
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}
