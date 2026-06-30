// Node-side port of measureSvgDifference (app/app.js renderDifferenceView).
// Goal: produce the SAME edge-weighted-RMSE / MAE / hot-pixel metrics server-side,
// so candidate decisions match the browser. Raster via @resvg/resvg-js (native),
// reference PNG decoded with a minimal inflate-based decoder (no node-canvas).
//
// Exposes: decodePng(buffer) -> {width,height,data(RGBA Uint8ClampedArray)}
//          rasterizeSvg(svg, width, height) -> RGBA Uint8ClampedArray
//          measure(refRgba, vecRgba, width, height, options) -> metrics
// CLI:     node tools/node-measure.js <ref.png> <trace.svg> [bgR,bgG,bgB]

const fs = require("fs");
const zlib = require("zlib");
const { Resvg } = require("@resvg/resvg-js");

// ---- helpers copied verbatim from app/app.js -------------------------------
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function luminance(rgb) { return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114; }
function colorDistanceSq(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}
function matteRgb(data, index, matte = [0, 0, 0]) {
  const alpha = data[index + 3] / 255;
  return [
    data[index] * alpha + matte[0] * (1 - alpha),
    data[index + 1] * alpha + matte[1] * (1 - alpha),
    data[index + 2] * alpha + matte[2] * (1 - alpha)
  ];
}
function buildLumaBuffer(data, width, height) {
  const luma = new Float32Array(width * height);
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    luma[pixel] = luminance(matteRgb(data, index));
  }
  return luma;
}
function buildSobelEdgeWeights(data, width, height) {
  const luma = buildLumaBuffer(data, width, height);
  const weights = new Float32Array(width * height);
  let edgePixels = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const tl = luma[i - width - 1], tc = luma[i - width], tr = luma[i - width + 1];
      const ml = luma[i - 1], mr = luma[i + 1];
      const bl = luma[i + width - 1], bc = luma[i + width], br = luma[i + width + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const strength = clamp(Math.hypot(gx, gy) / 720, 0, 1);
      weights[i] = 1 + strength * 5;
      if (strength > 0.08) edgePixels += 1;
    }
  }
  for (let x = 0; x < width; x += 1) { weights[x] = 1; weights[(height - 1) * width + x] = 1; }
  for (let y = 0; y < height; y += 1) { weights[y * width] = 1; weights[y * width + width - 1] = 1; }
  return { weights, edgePixelRatio: edgePixels / Math.max(1, width * height) };
}

// ---- minimal PNG decoder (8-bit, colorType 2/6, interlace 0) ----------------
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function decodePng(buffer) {
  if (buffer.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG");
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24], colorType = buffer[25], interlace = buffer[28];
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG: depth ${bitDepth} colorType ${colorType} interlace ${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const idat = [];
  let off = 8;
  while (off < buffer.length) {
    const len = buffer.readUInt32BE(off);
    const type = buffer.toString("ascii", off + 4, off + 8);
    if (type === "IDAT") idat.push(buffer.slice(off + 8, off + 8 + len));
    if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8ClampedArray(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[p++];
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[p++];
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let val;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: val = rawByte + paeth(a, b, c); break;
        default: throw new Error("bad filter " + filter);
      }
      cur[x] = val & 0xff;
    }
    for (let x = 0; x < width; x += 1) {
      const si = x * channels, di = (y * width + x) * 4;
      out[di] = cur[si];
      out[di + 1] = cur[si + 1];
      out[di + 2] = cur[si + 2];
      out[di + 3] = channels === 4 ? cur[si + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

// ---- resvg raster -----------------------------------------------------------
function rasterizeSvg(svg, width) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: "rgba(0,0,0,0)"
  });
  const rendered = resvg.render();
  return { width: rendered.width, height: rendered.height, data: new Uint8ClampedArray(rendered.pixels) };
}

// ---- the metric (renderDifferenceView math, no diff-canvas output) ----------
function measure(original, vector, width, height, options = {}) {
  const maxDistance = Math.sqrt(3 * 255 * 255);
  const hotThreshold = 0.08;
  const backgroundColor = options.backgroundColor || [0, 0, 0];
  const backgroundThresholdSq = (options.backgroundThreshold || 26) ** 2;
  const edgeWeightData = buildSobelEdgeWeights(original, width, height);
  const edgeWeights = edgeWeightData.weights;
  let sum = 0, sumSq = 0, edgeWeightedSum = 0, edgeWeightedSumSq = 0, edgeWeightTotal = 0;
  let maxDelta = 0, hotPixels = 0, backgroundPixels = 0, contaminatedBackgroundPixels = 0;
  for (let index = 0; index < original.length; index += 4) {
    const originalRgb = matteRgb(original, index);
    const vectorRgb = matteRgb(vector, index);
    const dr = originalRgb[0] - vectorRgb[0];
    const dg = originalRgb[1] - vectorRgb[1];
    const db = originalRgb[2] - vectorRgb[2];
    const delta = Math.sqrt(dr * dr + dg * dg + db * db) / maxDistance;
    const pixel = index / 4;
    const edgeWeight = edgeWeights[pixel] || 1;
    sum += delta;
    sumSq += delta * delta;
    edgeWeightedSum += delta * edgeWeight;
    edgeWeightedSumSq += delta * delta * edgeWeight;
    edgeWeightTotal += edgeWeight;
    maxDelta = Math.max(maxDelta, delta);
    if (delta > hotThreshold) hotPixels += 1;
    const originalIsBackground = colorDistanceSq(originalRgb, backgroundColor) <= backgroundThresholdSq;
    if (originalIsBackground) {
      backgroundPixels += 1;
      const vectorIsBackground = colorDistanceSq(vectorRgb, backgroundColor) <= (backgroundThresholdSq * 2.2);
      if (!vectorIsBackground && vector[index + 3] > 24) contaminatedBackgroundPixels += 1;
    }
  }
  const pixels = width * height;
  return {
    meanError: sum / pixels,
    rmse: Math.sqrt(sumSq / pixels),
    edgeWeightedMeanError: edgeWeightedSum / Math.max(1, edgeWeightTotal),
    edgeWeightedRmse: Math.sqrt(edgeWeightedSumSq / Math.max(1, edgeWeightTotal)),
    maxError: maxDelta,
    hotPixels,
    hotPixelRatio: hotPixels / pixels,
    edgePixelRatio: edgeWeightData.edgePixelRatio,
    backgroundPixels,
    contaminatedBackgroundPixels,
    backgroundContaminationRatio: contaminatedBackgroundPixels / Math.max(1, backgroundPixels)
  };
}

function measureSvgAgainstPng(pngBuffer, svg, options = {}) {
  const ref = decodePng(pngBuffer);
  const vec = rasterizeSvg(svg, ref.width);
  if (vec.width !== ref.width || vec.height !== ref.height) {
    throw new Error(`raster size ${vec.width}x${vec.height} != ref ${ref.width}x${ref.height}`);
  }
  return measure(ref.data, vec.data, ref.width, ref.height, options);
}

module.exports = { decodePng, rasterizeSvg, measure, measureSvgAgainstPng };

if (require.main === module) {
  const [, , refPath, svgPath, bg] = process.argv;
  if (!refPath || !svgPath) { console.error("usage: node node-measure.js <ref.png> <trace.svg> [bgR,bgG,bgB]"); process.exit(1); }
  const options = {};
  if (bg) options.backgroundColor = bg.split(",").map(Number);
  const m = measureSvgAgainstPng(fs.readFileSync(refPath), fs.readFileSync(svgPath, "utf8"), options);
  const pct = (x) => (x * 100).toFixed(2) + "%";
  console.log(JSON.stringify({
    edge: pct(m.edgeWeightedRmse),
    MAE: pct(m.meanError),
    hot: pct(m.hotPixelRatio),
    edgeWeightedMeanError: pct(m.edgeWeightedMeanError),
    rmse: pct(m.rmse),
    contamination: pct(m.backgroundContaminationRatio),
    raw: m
  }, null, 2));
}
