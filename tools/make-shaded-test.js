// Generates a SHADED synthetic test image (smooth gradients + anti-aliased curved edges) —
// the content type flat-fill tracers struggle with and gradient/region engines should win on.
// No dependencies: minimal PNG encoder via Node's zlib. Output: app/assets/shaded-test.png
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const W = 512;
const H = 512;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c0, c1, t) => [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];

function bg(x, y) {
  const t = y / H;
  return mix([238, 240, 245], [120, 135, 160], t);
}

function shadedSphere(x, y, cx, cy, r, base) {
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d > r + 1) return null;
  const coverage = clamp(r - d + 0.5, 0, 1); // anti-aliased edge
  const nx = dx / r;
  const ny = dy / r;
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  // light from top-left-front
  let lx = -0.5; let ly = -0.6; let lz = 0.62;
  const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
  const diff = clamp(nx * lx + ny * ly + nz * lz, 0, 1);
  const spec = Math.pow(diff, 24) * 200; // small highlight
  const shade = 0.2 + 0.8 * diff;
  return {
    color: [
      clamp(base[0] * shade + spec, 0, 255),
      clamp(base[1] * shade + spec, 0, 255),
      clamp(base[2] * shade + spec, 0, 255)
    ],
    coverage
  };
}

function pixel(x, y) {
  let c = bg(x, y);
  // horizontal gradient bar (orange -> red), slight AA on edges
  if (x >= 300 && x <= 470 && y >= 120 && y <= 200) {
    const t = (x - 300) / 170;
    c = mix([250, 185, 45], [205, 40, 45], t);
  }
  // big blue shaded sphere
  const s1 = shadedSphere(x, y, 175, 210, 115, [60, 110, 225]);
  if (s1) c = mix(c, s1.color, s1.coverage);
  // smaller green shaded sphere
  const s2 = shadedSphere(x, y, 380, 360, 78, [70, 180, 90]);
  if (s2) c = mix(c, s2.color, s2.coverage);
  return [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
}

// --- minimal PNG (RGB, 8-bit, color type 2) ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y += 1) {
  const rowStart = y * (1 + W * 3);
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < W; x += 1) {
    const p = pixel(x, y);
    const o = rowStart + 1 + x * 3;
    raw[o] = p[0]; raw[o + 1] = p[1]; raw[o + 2] = p[2];
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type RGB
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);

const out = path.join(__dirname, "..", "app", "assets", "shaded-test.png");
fs.writeFileSync(out, png);
console.log(`Wrote ${out} (${W}x${H}, ${png.length} bytes)`);
