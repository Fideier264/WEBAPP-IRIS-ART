import fs from 'fs';
import zlib from 'zlib';

const path = process.argv[2];
if (!path) {
  console.error('Usage: node measureTemplateHoles.mjs <png>');
  process.exit(1);
}

const buf = fs.readFileSync(path);

function readChunks(b) {
  let o = 8;
  const c = [];
  while (o + 8 <= b.length) {
    const len = b.readUInt32BE(o);
    const type = b.slice(o + 4, o + 8).toString('ascii');
    const data = b.slice(o + 8, o + 8 + len);
    c.push({ type, data });
    o += 12 + len;
  }
  return c;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

const chunks = readChunks(buf);
const ihdr = chunks.find((c) => c.type === 'IHDR').data;
const w = ihdr.readUInt32BE(0);
const h = ihdr.readUInt32BE(4);
const color = ihdr[9];
if (color !== 6) {
  console.error('Need RGBA PNG, got color type', color);
  process.exit(1);
}

const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
const raw = zlib.inflateSync(idat);
const bpp = 4;
const stride = w * bpp;
const rows = new Array(h);

let p = 0;
for (let y = 0; y < h; y++) {
  const ft = raw[p++];
  const row = Buffer.allocUnsafe(stride);
  raw.copy(row, 0, p, p + stride);
  p += stride;
  const prev = y ? rows[y - 1] : null;
  if (ft === 1) {
    for (let i = 0; i < stride; i++) row[i] = (row[i] + (i >= bpp ? row[i - bpp] : 0)) & 255;
  } else if (ft === 2) {
    for (let i = 0; i < stride; i++) row[i] = (row[i] + (prev ? prev[i] : 0)) & 255;
  } else if (ft === 3) {
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      row[i] = (row[i] + ((a + b) >> 1)) & 255;
    }
  } else if (ft === 4) {
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      row[i] = (row[i] + paeth(a, b, c)) & 255;
    }
  } else if (ft !== 0) {
    console.error('Unknown filter', ft, 'at row', y);
    process.exit(1);
  }
  rows[y] = row;
}

// Collect near-transparent pixels (holes)
const ALPHA_MAX = 24;
const visited = new Uint8Array(w * h);
const components = [];

function flood(sx, sy) {
  const stack = [[sx, sy]];
  let minX = sx,
    maxX = sx,
    minY = sy,
    maxY = sy,
    n = 0,
    sxSum = 0,
    sySum = 0;
  visited[sy * w + sx] = 1;
  while (stack.length) {
    const [x, y] = stack.pop();
    n++;
    sxSum += x;
    sySum += y;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = ny * w + nx;
      if (visited[i]) continue;
      const a = rows[ny][nx * 4 + 3];
      if (a > ALPHA_MAX) continue;
      visited[i] = 1;
      stack.push([nx, ny]);
    }
  }
  return { minX, maxX, minY, maxY, n, cx: sxSum / n, cy: sySum / n };
}

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (visited[i]) continue;
    const a = rows[y][x * 4 + 3];
    if (a > ALPHA_MAX) continue;
    const comp = flood(x, y);
    if (comp.n > 500) components.push(comp);
  }
}

components.sort((a, b) => b.n - a.n);
console.log(
  JSON.stringify(
    {
      size: `${w}x${h}`,
      aspectRatio: w / h,
      holes: components.slice(0, 6).map((c, idx) => ({
        rank: idx + 1,
        pixels: c.n,
        x: +(c.minX / w).toFixed(4),
        y: +(c.minY / h).toFixed(4),
        ww: +((c.maxX - c.minX + 1) / w).toFixed(4),
        hh: +((c.maxY - c.minY + 1) / h).toFixed(4),
        cx: +(c.cx / w).toFixed(4),
        cy: +(c.cy / h).toFixed(4),
      })),
    },
    null,
    2
  )
);
