// Generate a small synthetic raster-logo benchmark pack.
// The images are intentionally original/generated so they are safe to keep in the repo.
// No dependencies: minimal RGBA PNG encoder via Node's zlib.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUT_DIR = path.join(__dirname, "..", "app", "assets", "benchmarks");
const MANIFEST = path.join(OUT_DIR, "manifest.json");
const SS = 3;

fs.mkdirSync(OUT_DIR, { recursive: true });

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
const rgba = (r, g, b, a = 1) => [r, g, b, a];

function over(dst, src) {
  const sa = clamp(src[3]);
  const da = clamp(dst[3]);
  const a = sa + da * (1 - sa);
  if (a <= 0) return [0, 0, 0, 0];
  return [
    (src[0] * sa + dst[0] * da * (1 - sa)) / a,
    (src[1] * sa + dst[1] * da * (1 - sa)) / a,
    (src[2] * sa + dst[2] * da * (1 - sa)) / a,
    a
  ];
}

function rect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function ellipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function poly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const xi = pts[i][0]; const yi = pts[i][1];
    const xj = pts[j][0]; const yj = pts[j][1];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distSeg(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(x - x0, y - y0);
  const t = clamp(((x - x0) * dx + (y - y0) * dy) / l2);
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
}

function stroke(x, y, x0, y0, x1, y1, width) {
  return distSeg(x, y, x0, y0, x1, y1) <= width / 2;
}

const GLYPHS = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  V: ["10001", "10001", "10001", "10001", "01010", "01010", "00100"],
  X: ["10001", "01010", "00100", "00100", "00100", "01010", "10001"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"]
};

function blockTextMask(x, y, text, tx, ty, cell, gap = 1) {
  let cx = tx;
  for (const ch of text) {
    const rows = GLYPHS[ch] || GLYPHS[" "];
    const gw = rows[0].length * cell;
    if (x >= cx && x < cx + gw && y >= ty && y < ty + rows.length * cell) {
      const col = Math.floor((x - cx) / cell);
      const row = Math.floor((y - ty) / cell);
      if (rows[row] && rows[row][col] === "1") return true;
    }
    cx += gw + gap * cell;
  }
  return false;
}

function drawText(c, x, y, text, tx, ty, cell, color, gap = 1) {
  return blockTextMask(x, y, text, tx, ty, cell, gap) ? over(c, color) : c;
}

function pngEncoder(width, height, paint) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      let pr = 0; let pg = 0; let pb = 0; let pa = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const sample = paint(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
          const a = clamp(sample[3]);
          pr += sample[0] * a;
          pg += sample[1] * a;
          pb += sample[2] * a;
          pa += a;
        }
      }
      const samples = SS * SS;
      const a = pa / samples;
      const o = rowStart + 1 + x * 4;
      raw[o] = Math.round(a > 0 ? pr / pa : 0);
      raw[o + 1] = Math.round(a > 0 ? pg / pa : 0);
      raw[o + 2] = Math.round(a > 0 ? pb / pa : 0);
      raw[o + 3] = Math.round(a * 255);
    }
  }

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
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function flatBadge(x, y) {
  let c = rgba(8, 91, 110, 1);
  if (ellipse(x, y, 360, 260, 230, 150)) c = over(c, rgba(245, 249, 250, 1));
  if (ellipse(x, y, 360, 260, 205, 125)) c = over(c, rgba(8, 91, 110, 1));
  if (poly(x, y, [[118, 285], [590, 245], [575, 300], [135, 340]])) c = over(c, rgba(250, 184, 40, 1));
  if (poly(x, y, [[150, 160], [500, 115], [615, 175], [450, 215], [215, 205]])) c = over(c, rgba(245, 249, 250, 1));
  if (poly(x, y, [[176, 170], [493, 132], [565, 172], [435, 197], [230, 190]])) c = over(c, rgba(8, 91, 110, 1));
  c = drawText(c, x, y, "VECTOR", 150, 228, 15, rgba(245, 249, 250, 1), 1);
  c = drawText(c, x, y, "LAB", 320, 322, 8, rgba(245, 249, 250, 1), 1);
  return c;
}

function fineText(x, y) {
  let c = rgba(246, 248, 250, 1);
  if (ellipse(x, y, 165, 245, 82, 82) && !ellipse(x, y, 165, 245, 58, 58)) c = over(c, rgba(10, 20, 28, 1));
  const lines = [[260, 170, 590, 145], [248, 205, 605, 222], [255, 300, 590, 262], [115, 352, 555, 335]];
  for (const l of lines) if (stroke(x, y, l[0], l[1], l[2], l[3], 5)) c = over(c, rgba(9, 112, 145, 1));
  for (let i = 0; i < 16; i += 1) {
    const px = 105 + i * 28;
    if (ellipse(x, y, px, 380 + Math.sin(i) * 4, 4, 4)) c = over(c, rgba(10, 20, 28, 1));
  }
  c = drawText(c, x, y, "FINE EDGE", 246, 235, 8, rgba(10, 20, 28, 1), 1);
  c = drawText(c, x, y, "TEXT TEST", 284, 292, 5, rgba(9, 112, 145, 1), 1);
  return c;
}

function darkGlow(x, y) {
  let c = rgba(2, 4, 8, 1);
  const glow = clamp(1 - Math.hypot((x - 355) / 250, (y - 335) / 80), 0, 1);
  if (glow > 0) c = over(c, rgba(28, 180, 220, 0.28 * glow * glow));
  if (stroke(x, y, 130, 240, 575, 210, 24)) c = over(c, rgba(30, 190, 230, 1));
  if (stroke(x, y, 160, 278, 540, 278, 12)) c = over(c, rgba(210, 235, 230, 1));
  if (poly(x, y, [[190, 190], [335, 145], [500, 190], [420, 205], [315, 170]])) c = over(c, rgba(30, 190, 230, 1));
  if (poly(x, y, [[224, 192], [338, 160], [445, 190], [390, 198], [315, 178]])) c = over(c, rgba(2, 4, 8, 1));
  c = drawText(c, x, y, "NOVA", 240, 245, 20, rgba(230, 240, 238, 1), 1);
  c = drawText(c, x, y, "PRO TOUCH", 265, 335, 7, rgba(30, 190, 230, 1), 1);
  return c;
}

function transparentMark(x, y) {
  let c = rgba(0, 0, 0, 0);
  if (ellipse(x, y, 260, 250, 150, 150) && !ellipse(x, y, 260, 250, 92, 92)) c = over(c, rgba(235, 60, 65, 1));
  if (poly(x, y, [[250, 120], [560, 260], [250, 400], [310, 265]])) c = over(c, rgba(20, 115, 220, 1));
  if (poly(x, y, [[292, 195], [460, 260], [292, 325], [328, 262]])) c = over(c, rgba(0, 0, 0, 0.88));
  c = drawText(c, x, y, "ALPHA", 205, 222, 14, rgba(250, 250, 250, 1), 1);
  return c;
}

function outlineShield(x, y) {
  let c = rgba(24, 31, 41, 1);
  const shield = [[360, 65], [610, 150], [560, 405], [360, 505], [160, 405], [110, 150]];
  const inner = [[360, 95], [575, 170], [530, 382], [360, 470], [190, 382], [145, 170]];
  if (poly(x, y, shield)) c = over(c, rgba(240, 240, 230, 1));
  if (poly(x, y, inner)) c = over(c, rgba(28, 58, 92, 1));
  if (stroke(x, y, 180, 210, 540, 180, 8) || stroke(x, y, 190, 355, 525, 330, 8)) c = over(c, rgba(246, 190, 44, 1));
  c = drawText(c, x, y, "CREST", 216, 232, 18, rgba(240, 240, 230, 1), 1);
  for (let i = 0; i < 9; i += 1) if (ellipse(x, y, 228 + i * 32, 405, 5, 5)) c = over(c, rgba(246, 190, 44, 1));
  return c;
}

function metallicGradient(x, y) {
  let c = rgba(242, 244, 247, 1);
  const bg = mix(rgba(242, 244, 247, 1), rgba(125, 140, 158, 1), y / 520);
  c = bg;
  if (ellipse(x, y, 360, 255, 230, 112)) {
    const shade = clamp((y - 145) / 220);
    c = over(c, mix(rgba(245, 250, 255, 1), rgba(72, 88, 108, 1), shade));
  }
  if (ellipse(x, y, 360, 255, 190, 78)) c = over(c, rgba(18, 25, 34, 1));
  if (poly(x, y, [[145, 335], [585, 295], [520, 365], [165, 390]])) c = over(c, rgba(0, 135, 210, 1));
  c = drawText(c, x, y, "METAL", 210, 222, 20, rgba(236, 240, 244, 1), 1);
  c = drawText(c, x, y, "SHADE", 255, 330, 9, rgba(250, 250, 250, 1), 1);
  return c;
}

const cases = [
  { file: "bench-flat-badge.png", label: "Flat 3-color badge", category: "flat-logo", width: 720, height: 520, paint: flatBadge },
  { file: "bench-fine-text.png", label: "Fine text and hairlines", category: "flat-fine-detail", width: 720, height: 520, paint: fineText },
  { file: "bench-dark-glow.png", label: "Dark logo with glow", category: "glow-shadow", width: 720, height: 520, paint: darkGlow },
  { file: "bench-transparent-mark.png", label: "Transparent alpha mark", category: "transparent-logo", width: 720, height: 520, paint: transparentMark },
  { file: "bench-outline-shield.png", label: "Outline shield and dots", category: "flat-outline", width: 720, height: 520, paint: outlineShield },
  { file: "bench-metal-gradient.png", label: "Metallic gradient logo", category: "shaded-logo", width: 720, height: 520, paint: metallicGradient }
];

const manifest = cases.map((item) => {
  const out = path.join(OUT_DIR, item.file);
  const png = pngEncoder(item.width, item.height, item.paint);
  fs.writeFileSync(out, png);
  console.log(`Wrote ${out} (${item.width}x${item.height}, ${png.length} bytes)`);
  return {
    file: `assets/benchmarks/${item.file}`,
    label: item.label,
    category: item.category,
    width: item.width,
    height: item.height,
    generated: true,
    license: "Generated by project script for internal benchmarking"
  };
});

fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${MANIFEST}`);
