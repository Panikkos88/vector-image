const fileInput = document.getElementById("fileInput");
const sampleButton = document.getElementById("sampleButton");
const shadedButton = document.getElementById("shadedButton");
const bocButton = document.getElementById("bocButton");
const traceButton = document.getElementById("traceButton");
const downloadButton = document.getElementById("downloadButton");
const dropZone = document.getElementById("dropZone");
const originalCanvas = document.getElementById("originalCanvas");
const quantizedCanvas = document.getElementById("quantizedCanvas");
const differenceCanvas = document.getElementById("differenceCanvas");
const coverageCanvas = document.getElementById("coverageCanvas");
const coverageMeta = document.getElementById("coverageMeta");
const showCoverageMapInput = document.getElementById("showCoverageMap");
const showSegmentationInput = document.getElementById("showSegmentation");
const svgPreview = document.getElementById("svgPreview");
const paletteEl = document.getElementById("palette");
const logEl = document.getElementById("log");
const originalMeta = document.getElementById("originalMeta");
const quantizedMeta = document.getElementById("quantizedMeta");
const svgMeta = document.getElementById("svgMeta");
const differenceMeta = document.getElementById("differenceMeta");
const benchmarkSummary = document.getElementById("benchmarkSummary");
const benchmarkDelta = document.getElementById("benchmarkDelta");
const benchmarkRunsEl = document.getElementById("benchmarkRuns");
const setBaselineButton = document.getElementById("setBaselineButton");
const compareBaselineButton = document.getElementById("compareBaselineButton");
const exportBenchmarkButton = document.getElementById("exportBenchmarkButton");
const clearBenchmarkButton = document.getElementById("clearBenchmarkButton");
const activeEngineLabel = document.getElementById("activeEngineLabel");
const activeDetailLabel = document.getElementById("activeDetailLabel");
const activeAntiAliasLabel = document.getElementById("activeAntiAliasLabel");
const activeOptimizationLabel = document.getElementById("activeOptimizationLabel");
const colorCountInput = document.getElementById("colorCount");
const maxSizeInput = document.getElementById("maxSize");
const iterationsInput = document.getElementById("iterations");
const removeBackgroundInput = document.getElementById("removeBackground");
const customColorControl = document.getElementById("customColorControl");
const engineButtons = [...document.querySelectorAll("[data-engine]")];
const imageTypeButtons = [...document.querySelectorAll("[data-image-type]")];
const detailButtons = [...document.querySelectorAll("[data-detail]")];
const antiAliasButtons = [...document.querySelectorAll("[data-anti-alias]")];
const subPixelEdgeButtons = [...document.querySelectorAll("[data-sub-pixel-edges]")];
const curveOptimizerButtons = [...document.querySelectorAll("[data-curve-optimizer]")];
const backgroundDetachButtons = [...document.querySelectorAll("[data-background-detach]")];
const colorModeButtons = [...document.querySelectorAll("[data-color-mode]")];
const effectsButtons = [...document.querySelectorAll("[data-effects]")];

let loadedImage = null;
let loadedFileName = "vectorized.svg";
let currentSvg = "";
let currentBenchmarkRun = null;
let benchmarkStore = { version: 1, baselineRunId: "", runs: [] };
let vTracerRuntimePromise = null;
let traceInProgress = false;
const TRANSPARENT_LABEL = 65535;
const VTRACER_CANVAS_ID = "__vectorAccuracyVTracerCanvas";
const VTRACER_SVG_ID = "__vectorAccuracyVTracerSvg";
const BENCHMARK_STORAGE_KEY = "vectorAccuracyStudio.benchmarkRuns.v1";
const MAX_BENCHMARK_RUNS = 80;

const selectorState = {
  engine: "auto",
  imageType: "artwork-aa",
  detail: "medium",
  antiAlias: "smooth",
  subPixelEdges: "balanced",
  curveOptimizer: "balanced",
  backgroundDetach: "off",
  colorMode: "unlimited",
  effects: "preserve"
};

const devOptions = {
  paletteForceK: null,
  paletteOptimize: true
};

const detailPresets = {
  low: { maxSize: 512, iterations: 5, unlimitedColors: 24 },
  medium: { maxSize: 1024, iterations: 8, unlimitedColors: 64 },
  high: { maxSize: 1536, iterations: 12, unlimitedColors: 96 }
};

const imageTypeLabels = {
  photo: "Photo",
  "artwork-aa": "Artwork with blended edges",
  "artwork-hard": "Artwork without blended edges"
};

const engineLabels = {
  auto: "Auto router (Palette/Region)",
  vtracer: "VTracer clustering (experimental)",
  imagetracer: "ImageTracerJS baseline",
  experimental: "Experimental tracer",
  coverage: "Coverage engine (per-loop color)",
  palette: "Palette engine (flat-logo)",
  regions: "Region engine (SLIC + merge)"
};

const antiAliasLabels = {
  off: "Off",
  balanced: "Balanced",
  smooth: "Smooth"
};

const subPixelEdgeLabels = {
  off: "Off",
  balanced: "Balanced",
  strong: "Strong"
};

const curveOptimizerLabels = {
  off: "Off",
  balanced: "Balanced",
  strong: "Strong"
};

const backgroundDetachLabels = {
  off: "Off",
  auto: "Auto",
  force: "Force"
};

const effectLabels = {
  clean: "Clean flat colors",
  balanced: "Balanced",
  preserve: "Preserve glows/shadows"
};

function log(message) {
  logEl.textContent = message;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function activePreset() {
  return detailPresets[selectorState.detail] || detailPresets.medium;
}

function updateSelectedButtons(buttons, attribute, selectedValue) {
  buttons.forEach((button) => {
    button.classList.toggle("selected", button.dataset[attribute] === selectedValue);
  });
}

function applySelectorState({ syncInternals = true } = {}) {
  const preset = activePreset();
  updateSelectedButtons(engineButtons, "engine", selectorState.engine);
  updateSelectedButtons(imageTypeButtons, "imageType", selectorState.imageType);
  updateSelectedButtons(detailButtons, "detail", selectorState.detail);
  updateSelectedButtons(antiAliasButtons, "antiAlias", selectorState.antiAlias);
  updateSelectedButtons(subPixelEdgeButtons, "subPixelEdges", selectorState.subPixelEdges);
  updateSelectedButtons(curveOptimizerButtons, "curveOptimizer", selectorState.curveOptimizer);
  updateSelectedButtons(backgroundDetachButtons, "backgroundDetach", selectorState.backgroundDetach);
  updateSelectedButtons(colorModeButtons, "colorMode", selectorState.colorMode);
  updateSelectedButtons(effectsButtons, "effects", selectorState.effects);
  if (customColorControl) customColorControl.classList.toggle("is-hidden", selectorState.colorMode !== "custom");
  if (activeEngineLabel) activeEngineLabel.textContent = engineLabels[selectorState.engine] || "Auto vector engine";
  if (activeDetailLabel) activeDetailLabel.textContent = selectorState.detail[0].toUpperCase() + selectorState.detail.slice(1);
  if (activeAntiAliasLabel) activeAntiAliasLabel.textContent = antiAliasLabels[selectorState.antiAlias] || selectorState.antiAlias;
  if (activeOptimizationLabel) {
    activeOptimizationLabel.textContent = selectorState.engine === "auto"
      ? "Auto route + metric guard"
      : selectorState.engine === "palette"
      ? "Palette boundary optimizer"
      : selectorState.engine === "regions"
        ? "Guarded region loop"
        : "Metric-guarded trace";
  }

  if (syncInternals) {
    if (maxSizeInput) maxSizeInput.value = preset.maxSize;
    if (iterationsInput) iterationsInput.value = preset.iterations;
    if (colorCountInput && selectorState.colorMode === "unlimited") colorCountInput.value = preset.unlimitedColors;
  }
}

function currentTraceSettings() {
  const preset = activePreset();
  const maxCap = selectorState.engine === "experimental" ? 512 : 1536;
  const maxSize = clamp(Number(maxSizeInput?.value) || preset.maxSize, 64, maxCap);
  const iterations = clamp(Number(iterationsInput?.value) || preset.iterations, 1, 20);
  const antiAliasColorScale = selectorState.antiAlias === "smooth" ? 1.5 : selectorState.antiAlias === "balanced" ? 1.2 : 1;
  const effectColorScale = selectorState.effects === "preserve" ? 1.35 : selectorState.effects === "balanced" ? 1.15 : 1;
  const adaptiveColors = clamp(Math.round(preset.unlimitedColors * antiAliasColorScale * effectColorScale), 2, 256);
  const colors = selectorState.colorMode === "custom"
    ? clamp(Number(colorCountInput?.value) || adaptiveColors, 2, 256)
    : adaptiveColors;

  if (maxSizeInput) maxSizeInput.value = maxSize;
  if (iterationsInput) iterationsInput.value = iterations;
  if (colorCountInput) colorCountInput.value = colors;

  return { maxSize, iterations, colors };
}

function readQueryParam(name) {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch (error) {
    return null;
  }
}

function readQueryNumber(name, min, max) {
  const raw = readQueryParam(name);
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? clamp(Math.round(value), min, max) : null;
}

function rgbToHex(rgb) {
  return `#${rgb.map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function mixRgb(a, b, amount) {
  const t = clamp(amount, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function adjustRgb(rgb, amount) {
  return amount >= 0
    ? mixRgb(rgb, [255, 255, 255], amount)
    : mixRgb(rgb, [0, 0, 0], Math.abs(amount));
}

function colorDistanceSq(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function luminance(rgb) {
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
}

function rgbToLab(r, g, b) {
  let R = r / 255;
  let G = g / 255;
  let B = b / 255;
  R = R > 0.04045 ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
  G = G > 0.04045 ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
  B = B > 0.04045 ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// SLIC superpixels (Achanta et al.): spatially-coherent regions that snap to color edges.
// Returns a per-pixel label map. This is the segmentation primitive for the VM-style engine.
function computeSlicSuperpixels(imageData, options = {}) {
  const { width, height, data } = imageData;
  const regionSize = Math.max(6, options.regionSize || 24);
  const compactness = options.compactness || 12;
  const iterations = options.iterations || 10;
  const n = width * height;
  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const idx = i * 4;
    const l = rgbToLab(data[idx], data[idx + 1], data[idx + 2]);
    lab[i * 3] = l[0];
    lab[i * 3 + 1] = l[1];
    lab[i * 3 + 2] = l[2];
  }
  const centers = [];
  for (let y = Math.floor(regionSize / 2); y < height; y += regionSize) {
    for (let x = Math.floor(regionSize / 2); x < width; x += regionSize) {
      const i = y * width + x;
      centers.push({ l: lab[i * 3], a: lab[i * 3 + 1], b: lab[i * 3 + 2], x, y });
    }
  }
  const k = centers.length;
  const labels = new Int32Array(n).fill(-1);
  const dist = new Float32Array(n);
  const invwt = (compactness / regionSize) ** 2;
  for (let iter = 0; iter < iterations; iter += 1) {
    dist.fill(Infinity);
    for (let c = 0; c < k; c += 1) {
      const ctr = centers[c];
      const x0 = Math.max(0, Math.floor(ctr.x - regionSize));
      const x1 = Math.min(width - 1, Math.ceil(ctr.x + regionSize));
      const y0 = Math.max(0, Math.floor(ctr.y - regionSize));
      const y1 = Math.min(height - 1, Math.ceil(ctr.y + regionSize));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const i = y * width + x;
          const dl = lab[i * 3] - ctr.l;
          const da = lab[i * 3 + 1] - ctr.a;
          const db = lab[i * 3 + 2] - ctr.b;
          const dx = x - ctr.x;
          const dy = y - ctr.y;
          const D = dl * dl + da * da + db * db + (dx * dx + dy * dy) * invwt;
          if (D < dist[i]) { dist[i] = D; labels[i] = c; }
        }
      }
    }
    const sums = new Float64Array(k * 5);
    const counts = new Int32Array(k);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        const c = labels[i];
        if (c < 0) continue;
        sums[c * 5] += lab[i * 3];
        sums[c * 5 + 1] += lab[i * 3 + 1];
        sums[c * 5 + 2] += lab[i * 3 + 2];
        sums[c * 5 + 3] += x;
        sums[c * 5 + 4] += y;
        counts[c] += 1;
      }
    }
    for (let c = 0; c < k; c += 1) {
      if (counts[c] === 0) continue;
      centers[c].l = sums[c * 5] / counts[c];
      centers[c].a = sums[c * 5 + 1] / counts[c];
      centers[c].b = sums[c * 5 + 2] / counts[c];
      centers[c].x = sums[c * 5 + 3] / counts[c];
      centers[c].y = sums[c * 5 + 4] / counts[c];
    }
  }
  return { labels, count: k, width, height };
}

function makeUnionFind(n) {
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i += 1) parent[i] = i;
  const find = (x) => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) { const next = parent[x]; parent[x] = r; x = next; }
    return r;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  return { find, union };
}

// Merge adjacent superpixels with similar mean Lab color into coherent regions.
// Produces a per-pixel region map + per-region mean color/area/bbox (the region adjacency graph).
function mergeSuperpixels(slic, imageData, options = {}) {
  const { labels, count, width, height } = slic;
  const data = imageData.data;
  const k = count;
  const sumR = new Float64Array(k);
  const sumG = new Float64Array(k);
  const sumB = new Float64Array(k);
  const cnt = new Float64Array(k);
  const n = width * height;
  for (let i = 0; i < n; i += 1) {
    const l = labels[i];
    if (l < 0) continue;
    const idx = i * 4;
    sumR[l] += data[idx];
    sumG[l] += data[idx + 1];
    sumB[l] += data[idx + 2];
    cnt[l] += 1;
  }
  const meanLab = [];
  for (let c = 0; c < k; c += 1) {
    const m = cnt[c] || 1;
    meanLab[c] = rgbToLab(sumR[c] / m, sumG[c] / m, sumB[c] / m);
  }
  const uf = makeUnionFind(k);
  const thr = options.mergeThreshold || 12;
  const thr2 = thr * thr;
  const labDist2 = (a, b) => {
    const dl = a[0] - b[0];
    const da = a[1] - b[1];
    const db = a[2] - b[2];
    return dl * dl + da * da + db * db;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const a = labels[i];
      if (a < 0) continue;
      if (x + 1 < width) {
        const b = labels[i + 1];
        if (b >= 0 && a !== b && labDist2(meanLab[a], meanLab[b]) < thr2) uf.union(a, b);
      }
      if (y + 1 < height) {
        const b = labels[i + width];
        if (b >= 0 && a !== b && labDist2(meanLab[a], meanLab[b]) < thr2) uf.union(a, b);
      }
    }
  }
  const rootToRegion = new Map();
  const spRegion = new Int32Array(k);
  let regionCount = 0;
  for (let c = 0; c < k; c += 1) {
    const r = uf.find(c);
    if (!rootToRegion.has(r)) rootToRegion.set(r, regionCount++);
    spRegion[c] = rootToRegion.get(r);
  }
  const regionLabels = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    const l = labels[i];
    regionLabels[i] = l < 0 ? -1 : spRegion[l];
  }
  const rR = new Float64Array(regionCount);
  const rG = new Float64Array(regionCount);
  const rB = new Float64Array(regionCount);
  const rCnt = new Float64Array(regionCount);
  const bbox = [];
  for (let i = 0; i < regionCount; i += 1) bbox[i] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const reg = regionLabels[i];
      if (reg < 0) continue;
      const idx = i * 4;
      rR[reg] += data[idx];
      rG[reg] += data[idx + 1];
      rB[reg] += data[idx + 2];
      rCnt[reg] += 1;
      const bb = bbox[reg];
      if (x < bb.minX) bb.minX = x;
      if (x > bb.maxX) bb.maxX = x;
      if (y < bb.minY) bb.minY = y;
      if (y > bb.maxY) bb.maxY = y;
    }
  }
  const regionColor = [];
  const regionArea = [];
  for (let r = 0; r < regionCount; r += 1) {
    const m = rCnt[r] || 1;
    regionColor[r] = [Math.round(rR[r] / m), Math.round(rG[r] / m), Math.round(rB[r] / m)];
    regionArea[r] = rCnt[r];
  }
  return { regionLabels, regionCount, regionColor, regionArea, bbox, width, height };
}

function drawImageToCanvas(image, canvas, maxSize) {
  const safeMaxSize = clamp(Number(maxSize) || 512, 64, 1536);
  const scale = Math.min(1, safeMaxSize / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return { width, height, scale };
}

function buildColorBuckets(data, bucketBits = 5, options = {}) {
  const buckets = new Map();
  const shift = 8 - bucketBits;
  const downweightMask = options.downweightMask || null;
  const downweight = Number.isFinite(options.downweight) ? options.downweight : 1;
  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    if (data[i + 3] < 12) continue;
    const weight = downweightMask && downweightMask[pixel] ? downweight : 1;
    if (weight <= 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${r >> shift},${g >> shift},${b >> shift}`;
    const bucket = buckets.get(key) || [0, 0, 0, 0];
    bucket[0] += r * weight;
    bucket[1] += g * weight;
    bucket[2] += b * weight;
    bucket[3] += weight;
    buckets.set(key, bucket);
  }

  return [...buckets.values()].map((bucket) => ({
    rgb: [bucket[0] / bucket[3], bucket[1] / bucket[3], bucket[2] / bucket[3]],
    count: bucket[3]
  }));
}

function initializeCenters(buckets, k) {
  if (!buckets.length) return [[255, 255, 255], [0, 0, 0]].slice(0, k);
  const sorted = [...buckets].sort((a, b) => b.count - a.count);
  const centers = [];
  centers.push([...sorted[0].rgb]);

  while (centers.length < k && centers.length < sorted.length) {
    let bestBucket = null;
    let bestScore = -1;
    for (const bucket of sorted) {
      const minDistance = Math.min(...centers.map((center) => colorDistanceSq(bucket.rgb, center)));
      const score = minDistance * Math.log2(bucket.count + 2);
      if (score > bestScore) {
        bestBucket = bucket;
        bestScore = score;
      }
    }
    if (!bestBucket || bestScore <= 0) break;
    centers.push([...bestBucket.rgb]);
  }

  return centers;
}

function nearestCenterIndex(rgb, centers) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < centers.length; i += 1) {
    const center = centers[i];
    const dr = rgb[0] - center[0];
    const dg = rgb[1] - center[1];
    const db = rgb[2] - center[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

function quantizeImage(imageData, k, iterations) {
  const { data, width, height } = imageData;
  const buckets = buildColorBuckets(data);
  const safeK = clamp(Number(k) || 6, 2, Math.max(2, Math.min(256, buckets.length || 2)));
  const safeIterations = clamp(Number(iterations) || 8, 1, 20);
  let centers = initializeCenters(buckets, safeK);

  for (let iteration = 0; iteration < safeIterations; iteration += 1) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const bucket of buckets) {
      const index = nearestCenterIndex(bucket.rgb, centers);
      const weight = Math.sqrt(bucket.count);
      sums[index][0] += bucket.rgb[0] * weight;
      sums[index][1] += bucket.rgb[1] * weight;
      sums[index][2] += bucket.rgb[2] * weight;
      sums[index][3] += weight;
    }
    centers = centers.map((center, index) => {
      const sum = sums[index];
      if (!sum[3]) return center;
      return [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
    });
  }

  const labels = new Uint16Array(width * height);
  const output = new ImageData(width, height);
  const counts = new Array(centers.length).fill(0);
  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    const alpha = data[i + 3];
    const label = alpha < 12 ? TRANSPARENT_LABEL : nearestCenterIndex([data[i], data[i + 1], data[i + 2]], centers);
    labels[pixel] = label;
    if (label !== TRANSPARENT_LABEL) counts[label] += 1;
    output.data[i] = label === TRANSPARENT_LABEL ? 0 : centers[label][0];
    output.data[i + 1] = label === TRANSPARENT_LABEL ? 0 : centers[label][1];
    output.data[i + 2] = label === TRANSPARENT_LABEL ? 0 : centers[label][2];
    output.data[i + 3] = alpha;
  }

  return {
    labels,
    palette: centers.map((center) => center.map(Math.round)),
    counts,
    imageData: output,
    width,
    height
  };
}

function edgeKey(point) {
  return `${point[0]},${point[1]}`;
}

function addEdge(map, from, to) {
  const key = edgeKey(from);
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(to);
}

function buildEdgesForLabel(labels, width, height, target) {
  const edges = new Map();
  const at = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return -1;
    return labels[y * width + x];
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (at(x, y) !== target) continue;
      if (at(x, y - 1) !== target) addEdge(edges, [x, y], [x + 1, y]);
      if (at(x + 1, y) !== target) addEdge(edges, [x + 1, y], [x + 1, y + 1]);
      if (at(x, y + 1) !== target) addEdge(edges, [x + 1, y + 1], [x, y + 1]);
      if (at(x - 1, y) !== target) addEdge(edges, [x, y + 1], [x, y]);
    }
  }

  return edges;
}

function findComponentsForLabel(labels, width, height, target, minArea) {
  const visited = new Uint8Array(width * height);
  const components = [];

  for (let index = 0; index < labels.length; index += 1) {
    if (labels[index] !== target || visited[index]) continue;

    const stack = [index];
    const pixels = [];
    visited[index] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (stack.length) {
      const current = stack.pop();
      const x = current % width;
      const y = (current - x) / width;
      pixels.push(current);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [];
      if (x > 0) neighbors.push(current - 1);
      if (x < width - 1) neighbors.push(current + 1);
      if (y > 0) neighbors.push(current - width);
      if (y < height - 1) neighbors.push(current + width);

      for (const neighbor of neighbors) {
        if (visited[neighbor] || labels[neighbor] !== target) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    if (pixels.length >= minArea) {
      components.push({ pixels, area: pixels.length, bounds: { minX, minY, maxX, maxY } });
    }
  }

  return components;
}

function buildEdgesForComponent(component, width) {
  const edges = new Map();
  const pixelSet = new Set(component.pixels);

  for (const index of component.pixels) {
    const x = index % width;
    const y = (index - x) / width;
    if (!pixelSet.has(index - width)) addEdge(edges, [x, y], [x + 1, y]);
    if (!pixelSet.has(index + 1) || x === width - 1) addEdge(edges, [x + 1, y], [x + 1, y + 1]);
    if (!pixelSet.has(index + width)) addEdge(edges, [x + 1, y + 1], [x, y + 1]);
    if (!pixelSet.has(index - 1) || x === 0) addEdge(edges, [x, y + 1], [x, y]);
  }

  return edges;
}

function popNextEdge(edges) {
  for (const [key, list] of edges) {
    if (list.length) {
      const to = list.pop();
      if (!list.length) edges.delete(key);
      return { from: key.split(",").map(Number), to };
    }
  }
  return null;
}

function takeEdge(edges, from) {
  const key = edgeKey(from);
  const list = edges.get(key);
  if (!list || !list.length) return null;
  const to = list.pop();
  if (!list.length) edges.delete(key);
  return to;
}

function simplifyCollinear(points) {
  if (points.length <= 3) return points;
  const simplified = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length];
    const point = points[i];
    const next = points[(i + 1) % points.length];
    const dx1 = point[0] - prev[0];
    const dy1 = point[1] - prev[1];
    const dx2 = next[0] - point[0];
    const dy2 = next[1] - point[1];
    if (dx1 * dy2 !== dy1 * dx2) simplified.push(point);
  }
  return simplified;
}

function samePoint(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function normalizeClosedLoop(points) {
  const normalized = [...points];
  while (normalized.length > 1 && samePoint(normalized[0], normalized[normalized.length - 1])) {
    normalized.pop();
  }
  return normalized;
}

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const t = clamp(((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy), 0, 1);
  const projected = [start[0] + t * dx, start[1] + t * dy];
  return Math.hypot(point[0] - projected[0], point[1] - projected[1]);
}

function pointDistanceSq(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function simplifyOpenPolyline(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDistance = 0;
  let splitIndex = -1;

  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = pointSegmentDistance(points[i], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = i;
    }
  }

  if (maxDistance <= tolerance || splitIndex === -1) return [points[0], points[points.length - 1]];
  const left = simplifyOpenPolyline(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyOpenPolyline(points.slice(splitIndex), tolerance);
  return left.slice(0, -1).concat(right);
}

function simplifyClosedLoop(points, tolerance) {
  const normalized = normalizeClosedLoop(points);
  if (normalized.length <= 4 || tolerance <= 0) return normalized;

  let farthestIndex = 1;
  let farthestDistance = -1;
  for (let i = 1; i < normalized.length; i += 1) {
    const distance = pointDistanceSq(normalized[i], normalized[0]);
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = i;
    }
  }

  const firstHalf = normalized.slice(0, farthestIndex + 1);
  const secondHalf = normalized.slice(farthestIndex).concat([normalized[0]]);
  const simplified = simplifyOpenPolyline(firstHalf, tolerance).slice(0, -1)
    .concat(simplifyOpenPolyline(secondHalf, tolerance).slice(0, -1));

  return simplified.length >= 3 ? simplified : normalized;
}

function simplifyLoop(points, tolerance) {
  const normalized = normalizeClosedLoop(points);
  const collinear = simplifyCollinear(normalized);
  return simplifyClosedLoop(collinear, tolerance);
}

function stitchEdges(edges, options = {}) {
  const loops = [];
  const tolerance = options.tolerance || 0;
  const minLoopArea = options.minLoopArea || 1;
  let edge = popNextEdge(edges);
  while (edge) {
    const start = edge.from;
    const points = [edge.from, edge.to];
    let current = edge.to;
    let guard = 0;
    let closed = current[0] === start[0] && current[1] === start[1];
    while ((current[0] !== start[0] || current[1] !== start[1]) && guard < 100000) {
      const next = takeEdge(edges, current);
      if (!next) break;
      points.push(next);
      current = next;
      guard += 1;
      closed = current[0] === start[0] && current[1] === start[1];
    }
    if (closed && points.length > 3) {
      const simplified = simplifyLoop(points, tolerance);
      if (simplified.length >= 3 && Math.abs(polygonArea(simplified)) >= minLoopArea) loops.push(simplified);
    }
    edge = popNextEdge(edges);
  }
  return loops;
}

function polygonArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function formatNumber(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function midpoint(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function pointCommand(point) {
  return `${formatNumber(point[0])} ${formatNumber(point[1])}`;
}

function loopToPath(loop, smooth) {
  if (loop.length < 3) return "";
  if (!smooth || loop.length < 8) {
    const parts = [`M ${pointCommand(loop[0])}`];
    for (let i = 1; i < loop.length; i += 1) {
      parts.push(`L ${pointCommand(loop[i])}`);
    }
    parts.push("Z");
    return parts.join(" ");
  }

  const start = midpoint(loop[loop.length - 1], loop[0]);
  const parts = [`M ${pointCommand(start)}`];
  for (let i = 0; i < loop.length; i += 1) {
    const current = loop[i];
    const next = loop[(i + 1) % loop.length];
    parts.push(`Q ${pointCommand(current)} ${pointCommand(midpoint(current, next))}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

function loopsToPath(loops, options = {}) {
  const parts = [];
  for (const loop of loops) {
    if (loop.length < 3) continue;
    parts.push(loopToPath(loop, options.smooth));
  }
  return parts.join(" ");
}

function tracingQualityOptions(width, height, options) {
  const detail = options.detail || "medium";
  const area = width * height;
  const minComponentArea = Math.max(
    detail === "high" ? 3 : detail === "medium" ? 7 : 14,
    Math.round(area * (detail === "high" ? 0.000012 : detail === "medium" ? 0.000035 : 0.00007))
  );
  let tolerance = detail === "high" ? 0.55 : detail === "medium" ? 0.9 : 1.35;
  if (options.imageType === "artwork-hard") tolerance *= 0.75;
  if (options.imageType === "photo") tolerance *= 1.15;

  return {
    minComponentArea,
    minLoopArea: Math.max(1, Math.round(minComponentArea / 3)),
    tolerance,
    smooth: options.imageType !== "artwork-hard"
  };
}

function backgroundLabelSet(palette, counts, order, options) {
  if (!order.length) return new Set();
  const backgroundLabel = order[0];
  const backgroundColor = palette[backgroundLabel];
  const backgroundLum = luminance(backgroundColor);
  const tolerance = options.detail === "high" ? 34 : options.detail === "medium" ? 42 : 52;
  const toleranceSq = tolerance * tolerance;

  return new Set(order.filter((label) => {
    const color = palette[label];
    const distanceSq = colorDistanceSq(color, backgroundColor);
    const lum = luminance(color);

    if (distanceSq <= toleranceSq) return true;
    if (backgroundLum < 36 && lum < 18 && distanceSq <= 80 * 80) return true;
    if (backgroundLum > 220 && lum > 236 && distanceSq <= 70 * 70) return true;
    return false;
  }));
}

function traceToSvg(quantized, options = {}) {
  const { labels, palette, counts, width, height } = quantized;
  const order = palette.map((_, index) => index).filter((index) => counts[index] > 0).sort((a, b) => counts[b] - counts[a]);
  const backgroundLabels = options.removeLargestColor || options.mergeBackground !== false ? backgroundLabelSet(palette, counts, order, options) : new Set();
  const quality = tracingQualityOptions(width, height, options);
  const paths = [];
  let loopCount = 0;
  let componentCount = 0;

  if (!options.removeLargestColor && order.length) {
    paths.push(`<rect width="${width}" height="${height}" fill="${rgbToHex(palette[order[0]])}" />`);
  }

  for (const label of order) {
    if (backgroundLabels.has(label)) continue;
    if (!counts[label]) continue;

    const components = findComponentsForLabel(labels, width, height, label, quality.minComponentArea);
    const loops = [];
    for (const component of components) {
      const edges = buildEdgesForComponent(component, width);
      loops.push(...stitchEdges(edges, { tolerance: quality.tolerance, minLoopArea: quality.minLoopArea }));
    }

    const d = loopsToPath(loops, { smooth: quality.smooth });
    if (!d) continue;
    componentCount += components.length;
    loopCount += loops.length;
    paths.push(`<path d="${d}" fill="${rgbToHex(palette[label])}" fill-rule="evenodd" />`);
  }

  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    ...paths,
    `</svg>`
  ].join("\n");

  return {
    svg,
    pathCount: paths.length,
    loopCount,
    componentCount,
    skippedBackgroundLabels: backgroundLabels.size,
    minComponentArea: quality.minComponentArea,
    tolerance: quality.tolerance,
    smooth: quality.smooth
  };
}

function countSvgElements(svg, tagName) {
  const matches = svg.match(new RegExp(`<${tagName}\\b`, "g"));
  return matches ? matches.length : 0;
}

function cloneImageData(imageData) {
  return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
}

function colorChroma(rgb) {
  return Math.max(...rgb) - Math.min(...rgb);
}

function cleanupProfile(options = {}) {
  const effects = options.effects || "preserve";
  if (effects === "clean") {
    return {
      darkLum: 28,
      darkNeutralLum: 48,
      darkChroma: 24,
      lightLum: 244,
      lightChroma: 20,
      speckleNeighbors: 7
    };
  }
  if (effects === "balanced") {
    return {
      darkLum: 16,
      darkNeutralLum: 32,
      darkChroma: 14,
      lightLum: 250,
      lightChroma: 14,
      speckleNeighbors: 8
    };
  }
  return {
    darkLum: 8,
    darkNeutralLum: 18,
    darkChroma: 8,
    lightLum: 253,
    lightChroma: 10,
    speckleNeighbors: 8
  };
}

function neutralBackgroundKind(data, index, profile = cleanupProfile()) {
  const rgb = [data[index], data[index + 1], data[index + 2]];
  const lum = luminance(rgb);
  const chroma = colorChroma(rgb);
  if (lum < profile.darkLum || (lum < profile.darkNeutralLum && chroma < profile.darkChroma)) return "dark";
  if (lum > profile.lightLum && chroma < profile.lightChroma) return "light";
  return "";
}

function setNeutralPixel(data, index, kind) {
  const value = kind === "light" ? 255 : 0;
  data[index] = value;
  data[index + 1] = value;
  data[index + 2] = value;
}

function cleanupArtworkImageData(imageData, options = {}) {
  if (options.imageType === "photo" || options.antiAlias === "off") {
    return { imageData, flattenedPixels: 0, specklesRemoved: 0 };
  }

  const profile = cleanupProfile(options);
  const cleaned = cloneImageData(imageData);
  const { data, width, height } = cleaned;
  let flattenedPixels = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 12) continue;
    const kind = neutralBackgroundKind(data, index, profile);
    if (!kind) continue;
    const before = `${data[index]},${data[index + 1]},${data[index + 2]}`;
    setNeutralPixel(data, index, kind);
    const after = `${data[index]},${data[index + 1]},${data[index + 2]}`;
    if (before !== after) flattenedPixels += 1;
  }

  const despeckled = cloneImageData(cleaned);
  let specklesRemoved = 0;
  const neighborOffsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 12 || neutralBackgroundKind(data, index, profile)) continue;

      let darkNeighbors = 0;
      let lightNeighbors = 0;
      for (const [dx, dy] of neighborOffsets) {
        const neighborIndex = ((y + dy) * width + (x + dx)) * 4;
        const kind = neutralBackgroundKind(data, neighborIndex, profile);
        if (kind === "dark") darkNeighbors += 1;
        if (kind === "light") lightNeighbors += 1;
      }

      if (darkNeighbors >= profile.speckleNeighbors || lightNeighbors >= profile.speckleNeighbors) {
        setNeutralPixel(despeckled.data, index, darkNeighbors >= lightNeighbors ? "dark" : "light");
        specklesRemoved += 1;
      }
    }
  }

  return { imageData: despeckled, flattenedPixels, specklesRemoved };
}

function edgeFilterProfile(options = {}, pixels = 0) {
  if (options.antiAlias === "off") return { enabled: false };
  if (options.imageType === "artwork-hard" && options.effects === "clean") return { enabled: false };

  const high = options.detail === "high";
  const preserve = options.effects === "preserve";
  const balanced = options.effects === "balanced";
  const largeImage = pixels > 1300000;
  return {
    enabled: true,
    radius: high && preserve && !largeImage ? 2 : 1,
    sigmaColor: preserve ? 42 : balanced ? 32 : 24,
    amount: preserve ? 0.78 : balanced ? 0.62 : 0.45
  };
}

function edgePreservingSmoothImageData(imageData, options = {}) {
  const { width, height, data } = imageData;
  const profile = edgeFilterProfile(options, width * height);
  if (!profile.enabled) {
    return { imageData, enabled: false, radius: 0, sigmaColor: 0, smoothedPixels: 0 };
  }

  const output = cloneImageData(imageData);
  const out = output.data;
  const radius = profile.radius;
  const sigmaSq = profile.sigmaColor * profile.sigmaColor;
  const cutoffSq = sigmaSq * 4;
  const spatial = new Map();
  let smoothedPixels = 0;

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      spatial.set(`${dx},${dy}`, 1 / (1 + dx * dx + dy * dy));
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 12) continue;

      const cr = data[index];
      const cg = data[index + 1];
      const cb = data[index + 2];
      let wr = cr;
      let wg = cg;
      let wb = cb;
      let weightSum = 1;

      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;

        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;

          const neighbor = (yy * width + xx) * 4;
          if (data[neighbor + 3] < 12) continue;

          const dr = data[neighbor] - cr;
          const dg = data[neighbor + 1] - cg;
          const db = data[neighbor + 2] - cb;
          const distanceSq = dr * dr + dg * dg + db * db;
          if (distanceSq > cutoffSq) continue;

          const colorWeight = 1 - distanceSq / cutoffSq;
          const weight = spatial.get(`${dx},${dy}`) * colorWeight;
          wr += data[neighbor] * weight;
          wg += data[neighbor + 1] * weight;
          wb += data[neighbor + 2] * weight;
          weightSum += weight;
        }
      }

      const nr = cr + (wr / weightSum - cr) * profile.amount;
      const ng = cg + (wg / weightSum - cg) * profile.amount;
      const nb = cb + (wb / weightSum - cb) * profile.amount;
      if (Math.abs(nr - cr) + Math.abs(ng - cg) + Math.abs(nb - cb) > 1) smoothedPixels += 1;
      out[index] = Math.round(nr);
      out[index + 1] = Math.round(ng);
      out[index + 2] = Math.round(nb);
    }
  }

  return {
    imageData: output,
    enabled: true,
    radius,
    sigmaColor: profile.sigmaColor,
    smoothedPixels
  };
}

function estimateDominantBackground(imageData) {
  const buckets = buildColorBuckets(imageData.data, 5);
  if (!buckets.length) return [0, 0, 0];
  return buckets.sort((a, b) => b.count - a.count)[0].rgb.map(Math.round);
}

function colorDistanceFromData(data, index, rgb) {
  const dr = data[index] - rgb[0];
  const dg = data[index + 1] - rgb[1];
  const db = data[index + 2] - rgb[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function pixelRgbFromData(data, index) {
  return [data[index], data[index + 1], data[index + 2]];
}

function setPixelRgb(data, index, rgb) {
  data[index] = clamp(Math.round(rgb[0]), 0, 255);
  data[index + 1] = clamp(Math.round(rgb[1]), 0, 255);
  data[index + 2] = clamp(Math.round(rgb[2]), 0, 255);
}

function detailProtectionProfile(options = {}) {
  if (options.imageType === "photo" || options.antiAlias === "off") return { enabled: false };

  const high = options.detail === "high";
  const low = options.detail === "low";
  return {
    enabled: true,
    minArea: high ? 5 : low ? 10 : 7,
    maxArea: high ? 7600 : low ? 2600 : 4400,
    maxBoxArea: high ? 36000 : low ? 12000 : 21000,
    maxTextHeight: high ? 62 : low ? 34 : 46,
    maxLongSide: high ? 560 : low ? 280 : 420,
    thinShortSide: high ? 16 : low ? 8 : 12,
    maxThinArea: high ? 9000 : low ? 3000 : 5600,
    minBackgroundDistance: options.effects === "preserve" ? 38 : 48,
    strongDistance: options.effects === "preserve" ? 82 : 96,
    minLocalContrast: options.effects === "preserve" ? 24 : 32,
    dilation: high ? 1 : 1
  };
}

function localContrastFromData(data, width, height, x, y) {
  const index = (y * width + x) * 4;
  const rgb = pixelRgbFromData(data, index);
  let contrast = 0;
  const neighbors = [
    [0, -1], [-1, 0], [1, 0], [0, 1]
  ];

  for (const [dx, dy] of neighbors) {
    const xx = x + dx;
    const yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
    const neighborIndex = (yy * width + xx) * 4;
    if (data[neighborIndex + 3] < 12) continue;
    contrast = Math.max(contrast, Math.sqrt(colorDistanceSq(rgb, pixelRgbFromData(data, neighborIndex))));
  }

  return contrast;
}

function componentLooksLikeProtectedDetail(component, profile) {
  const width = component.bounds.maxX - component.bounds.minX + 1;
  const height = component.bounds.maxY - component.bounds.minY + 1;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const boxArea = width * height;
  const density = component.area / Math.max(1, boxArea);

  if (component.area < profile.minArea) return false;
  if (component.area > profile.maxArea && !(shortSide <= profile.thinShortSide && component.area <= profile.maxThinArea)) return false;
  if (boxArea > profile.maxBoxArea && shortSide > profile.thinShortSide) return false;
  if (longSide > profile.maxLongSide) return false;
  if (shortSide <= profile.thinShortSide && component.area <= profile.maxThinArea) return true;
  if (height <= profile.maxTextHeight && component.area <= profile.maxArea && density >= 0.08) return true;
  return width <= profile.maxTextHeight && component.area <= profile.maxArea && density >= 0.08;
}

function addDilatedComponentToMask(mask, width, height, component, radius) {
  let added = 0;
  for (const pixel of component.pixels) {
    const x = pixel % width;
    const y = (pixel - x) / width;
    for (let dy = -radius; dy <= radius; dy += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= height) continue;
      for (let dx = -radius; dx <= radius; dx += 1) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        const maskIndex = yy * width + xx;
        if (mask[maskIndex]) continue;
        mask[maskIndex] = 1;
        added += 1;
      }
    }
  }
  return added;
}

function protectSmallDetails(sourceImageData, targetImageData, options = {}, backgroundColor = null) {
  const profile = detailProtectionProfile(options);
  if (!profile.enabled) {
    return {
      imageData: targetImageData,
      enabled: false,
      candidatePixels: 0,
      candidateComponents: 0,
      protectedComponents: 0,
      restoredPixels: 0,
      maskPixels: 0
    };
  }

  const { width, height, data } = sourceImageData;
  const background = backgroundColor || estimateDominantBackground(sourceImageData);
  const candidate = new Uint8Array(width * height);
  let candidatePixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const index = pixel * 4;
      if (data[index + 3] < 12) continue;

      const distance = colorDistanceFromData(data, index, background);
      if (distance < profile.minBackgroundDistance) continue;

      const contrast = localContrastFromData(data, width, height, x, y);
      if (distance < profile.strongDistance && contrast < profile.minLocalContrast) continue;

      candidate[pixel] = 1;
      candidatePixels += 1;
    }
  }

  const visited = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);
  let candidateComponents = 0;
  let protectedComponents = 0;
  let maskPixels = 0;
  const stack = [];

  for (let start = 0; start < candidate.length; start += 1) {
    if (!candidate[start] || visited[start]) continue;

    candidateComponents += 1;
    const pixels = [];
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    visited[start] = 1;
    stack.push(start);

    while (stack.length) {
      const current = stack.pop();
      const x = current % width;
      const y = (current - x) / width;
      pixels.push(current);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [];
      if (x > 0) neighbors.push(current - 1);
      if (x < width - 1) neighbors.push(current + 1);
      if (y > 0) neighbors.push(current - width);
      if (y < height - 1) neighbors.push(current + width);

      for (const neighbor of neighbors) {
        if (!candidate[neighbor] || visited[neighbor]) continue;
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    const component = { pixels, area, bounds: { minX, minY, maxX, maxY } };
    if (!componentLooksLikeProtectedDetail(component, profile)) continue;
    protectedComponents += 1;
    maskPixels += addDilatedComponentToMask(mask, width, height, component, profile.dilation);
  }

  if (!maskPixels) {
    return {
      imageData: targetImageData,
      enabled: true,
      candidatePixels,
      candidateComponents,
      protectedComponents,
      restoredPixels: 0,
      maskPixels: 0
    };
  }

  const output = cloneImageData(targetImageData);
  let restoredPixels = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue;
    const index = pixel * 4;
    if (data[index + 3] < 12) continue;
    output.data[index] = data[index];
    output.data[index + 1] = data[index + 1];
    output.data[index + 2] = data[index + 2];
    output.data[index + 3] = data[index + 3];
    restoredPixels += 1;
  }

  return {
    imageData: output,
    enabled: true,
    candidatePixels,
    candidateComponents,
    protectedComponents,
    restoredPixels,
    maskPixels
  };
}

function recoverAntialiasCoverage(imageData, options = {}) {
  if (options.imageType === "photo" || options.antiAlias === "off") {
    return { imageData, enabled: false, backgroundColor: [0, 0, 0], edgePixels: 0, snappedToBackground: 0, snappedToForeground: 0, coverageField: [], scalarField: null };
  }

  const { width, height, data } = imageData;
  const backgroundColor = estimateDominantBackground(imageData);
  const backgroundLum = luminance(backgroundColor);
  const preserve = options.effects === "preserve";
  const smooth = options.antiAlias === "smooth";
  const bgTolerance = preserve ? 24 : 32;
  const foregroundMinDistance = preserve ? 55 : 44;
  const foregroundStep = smooth ? 16 : 22;
  const coverageThreshold = smooth ? 0.52 : 0.5;
  const output = cloneImageData(imageData);
  let edgePixels = 0;
  let snappedToBackground = 0;
  let snappedToForeground = 0;
  // Step 1 (coverage map): collect true sub-pixel coverage per edge pixel.
  // Additive only — the snapping below is unchanged so existing engines behave identically.
  const coverageField = [];
  const neighborOffsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];

  const isBackgroundPixel = (index) => {
    if (data[index + 3] < 12) return true;
    const distance = colorDistanceFromData(data, index, backgroundColor);
    if (distance <= bgTolerance) return true;

    const lum = luminance(pixelRgbFromData(data, index));
    if (backgroundLum < 36 && lum < 18 && distance < 70) return true;
    if (backgroundLum > 220 && lum > 236 && distance < 70) return true;
    return false;
  };

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 12) continue;

      const currentDistance = colorDistanceFromData(data, index, backgroundColor);
      if (currentDistance <= bgTolerance * 0.75) continue;

      let hasBackgroundNeighbor = false;
      let bestForegroundIndex = -1;
      let bestForegroundDistance = -1;

      for (const [dx, dy] of neighborOffsets) {
        const neighborIndex = ((y + dy) * width + (x + dx)) * 4;
        if (isBackgroundPixel(neighborIndex)) {
          hasBackgroundNeighbor = true;
          continue;
        }

        const distance = colorDistanceFromData(data, neighborIndex, backgroundColor);
        if (distance > bestForegroundDistance) {
          bestForegroundDistance = distance;
          bestForegroundIndex = neighborIndex;
        }
      }

      if (!hasBackgroundNeighbor) continue;
      if (bestForegroundIndex < 0 || bestForegroundDistance < foregroundMinDistance) continue;
      if (bestForegroundDistance < currentDistance + foregroundStep) continue;

      const foreground = pixelRgbFromData(data, bestForegroundIndex);
      const direction = [
        foreground[0] - backgroundColor[0],
        foreground[1] - backgroundColor[1],
        foreground[2] - backgroundColor[2]
      ];
      const lengthSq = direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2];
      if (lengthSq < foregroundMinDistance * foregroundMinDistance) continue;

      const current = pixelRgbFromData(data, index);
      const coverage = (
        (current[0] - backgroundColor[0]) * direction[0] +
        (current[1] - backgroundColor[1]) * direction[1] +
        (current[2] - backgroundColor[2]) * direction[2]
      ) / lengthSq;

      if (coverage < -0.08 || coverage > 1.08) continue;

      edgePixels += 1;

      // Record the sub-pixel coverage (alpha) + the foreground/background color pair and a
      // spatial edge normal (gradient of distance-to-background, pointing bg -> fg).
      // Step 2 will fit a boundary to this; step 1 only captures and visualizes it.
      const distRight = colorDistanceFromData(data, (y * width + (x + 1)) * 4, backgroundColor);
      const distLeft = colorDistanceFromData(data, (y * width + (x - 1)) * 4, backgroundColor);
      const distDown = colorDistanceFromData(data, ((y + 1) * width + x) * 4, backgroundColor);
      const distUp = colorDistanceFromData(data, ((y - 1) * width + x) * 4, backgroundColor);
      const gradX = distRight - distLeft;
      const gradY = distDown - distUp;
      const gradLen = Math.hypot(gradX, gradY) || 1;
      coverageField.push({
        x,
        y,
        alpha: clamp(coverage, 0, 1),
        foreground: [foreground[0], foreground[1], foreground[2]],
        background: [backgroundColor[0], backgroundColor[1], backgroundColor[2]],
        normal: [gradX / gradLen, gradY / gradLen]
      });

      if (coverage < coverageThreshold) {
        setPixelRgb(output.data, index, backgroundColor);
        snappedToBackground += 1;
      } else {
        setPixelRgb(output.data, index, foreground);
        snappedToForeground += 1;
      }
    }
  }

  // Step 2a: dense foreground-probability field (0 = background, 1 = foreground),
  // with edge pixels carrying their fractional alpha. A marching-squares 0.5 iso-contour
  // of this field is the sub-pixel boundary the new engine will fit curves to.
  const scalarField = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      scalarField[i] = isBackgroundPixel(i * 4) ? 0 : 1;
    }
  }
  for (const sample of coverageField) {
    scalarField[sample.y * width + sample.x] = sample.alpha;
  }

  return {
    imageData: output,
    enabled: true,
    backgroundColor,
    edgePixels,
    snappedToBackground,
    snappedToForeground,
    coverageField,
    scalarField
  };
}

function imageDataWithTransparentBackground(imageData, quantized, options) {
  const order = quantized.palette
    .map((_, index) => index)
    .filter((index) => quantized.counts[index] > 0)
    .sort((a, b) => quantized.counts[b] - quantized.counts[a]);
  const backgroundLabels = backgroundLabelSet(quantized.palette, quantized.counts, order, options);
  const masked = cloneImageData(imageData);

  for (let pixel = 0, dataIndex = 0; pixel < quantized.labels.length; pixel += 1, dataIndex += 4) {
    if (!backgroundLabels.has(quantized.labels[pixel])) continue;
    masked.data[dataIndex] = 0;
    masked.data[dataIndex + 1] = 0;
    masked.data[dataIndex + 2] = 0;
    masked.data[dataIndex + 3] = 0;
  }

  return { imageData: masked, skippedBackgroundLabels: backgroundLabels.size };
}

function imageTracerOptions(colors, options) {
  const detail = options.detail || "medium";
  const high = detail === "high";
  const low = detail === "low";
  const artworkHard = options.imageType === "artwork-hard";
  const photo = options.imageType === "photo";
  const antiAlias = options.antiAlias || "smooth";
  const effects = options.effects || "preserve";
  const detachedForeground = Boolean(options.detachedForeground);
  const antiAliasPresetMap = {
    off: { thresholdScale: 0.75, pathomitAdd: 0, blurradius: 0, blurdelta: 20, strokewidth: 0.35, linefilter: false },
    balanced: { thresholdScale: 1.35, pathomitAdd: 1, blurradius: 0, blurdelta: 48, strokewidth: 0.55, linefilter: !artworkHard },
    smooth: { thresholdScale: 2.0, pathomitAdd: 3, blurradius: 0, blurdelta: 96, strokewidth: 0.7, linefilter: true }
  };
  const effectTraceMap = {
    clean: { thresholdScale: 1.2, pathomitAdd: 3, cyclesAdd: 0, strokeScale: 1 },
    balanced: { thresholdScale: 1, pathomitAdd: 0, cyclesAdd: 0, strokeScale: 1 },
    preserve: { thresholdScale: 0.72, pathomitAdd: -3, cyclesAdd: 1, strokeScale: 0.85 }
  };
  const antiAliasSettings = antiAliasPresetMap[antiAlias] || antiAliasPresetMap.smooth;
  const effectTrace = effectTraceMap[effects] || effectTraceMap.preserve;
  const baseThreshold = high ? 0.35 : low ? 1.25 : 0.7;
  const detachedThresholdScale = detachedForeground && !photo ? 0.82 : 1;
  const threshold = Math.round(baseThreshold * antiAliasSettings.thresholdScale * effectTrace.thresholdScale * detachedThresholdScale * 100) / 100;
  const pathomitBase = (high ? 1 : low ? 12 : 4) + antiAliasSettings.pathomitAdd + effectTrace.pathomitAdd;
  const detachedPathomitBoost = detachedForeground && !photo ? 0 : 0;
  const colorCycleBoost = detachedForeground && effects === "preserve" ? 1 : 0;

  return {
    ltres: threshold,
    qtres: threshold,
    pathomit: Math.max(0, pathomitBase - detachedPathomitBoost),
    rightangleenhance: artworkHard,
    colorsampling: 2,
    numberofcolors: colors,
    mincolorratio: 0,
    colorquantcycles: (high ? 4 : 3) + effectTrace.cyclesAdd + colorCycleBoost,
    layering: 0,
    strokewidth: Math.round(antiAliasSettings.strokewidth * effectTrace.strokeScale * 100) / 100,
    linefilter: detachedForeground ? false : antiAliasSettings.linefilter,
    scale: 1,
    roundcoords: high ? 2 : 1,
    viewbox: true,
    desc: false,
    blurradius: antiAliasSettings.blurradius,
    blurdelta: antiAliasSettings.blurdelta
  };
}

function enhanceSvgForAntialiasing(svg, antiAlias) {
  if (antiAlias === "off") return svg;
  let enhanced = svg.replace("<svg ", "<svg shape-rendering=\"geometricPrecision\" color-rendering=\"optimizeQuality\" ");
  if (!enhanced.includes("<style>")) {
    enhanced = enhanced.replace(
      /(<svg\b[^>]*>)/,
      `$1<style>path{stroke-linejoin:round;stroke-linecap:round;shape-rendering:geometricPrecision;}</style>`
    );
  }
  return enhanced;
}

function pathRefinementOptions(options = {}) {
  const detail = options.detail || "medium";
  return {
    enabled: options.antiAlias !== "off" && options.imageType !== "photo",
    tolerance: detail === "high" ? 0.38 : detail === "low" ? 0.85 : 0.56,
    cornerAngle: options.imageType === "artwork-hard" ? 158 : 148,
    minPoints: detail === "high" ? 10 : 8,
    minArea: detail === "high" ? 7 : detail === "low" ? 18 : 10,
    minCurveLength: detail === "high" ? 2.2 : detail === "low" ? 4.2 : 3,
    tension: 1 / 6
  };
}

function pathDataTokens(d) {
  return d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) || [];
}

function parsePathData(d) {
  const tokens = pathDataTokens(d);
  const commands = [];
  let index = 0;
  let command = "";
  let firstMove = false;
  const argCounts = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };

  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[a-zA-Z]$/.test(token)) {
      command = token;
      index += 1;
      firstMove = command === "M";
    }

    if (!command || command !== command.toUpperCase() || !(command in argCounts)) return null;

    if (command === "Z") {
      commands.push({ cmd: "Z", values: [] });
      command = "";
      continue;
    }

    const argCount = argCounts[command];
    while (index + argCount <= tokens.length && !/^[a-zA-Z]$/.test(tokens[index])) {
      const values = tokens.slice(index, index + argCount).map(Number);
      if (values.some((value) => !Number.isFinite(value))) return null;
      const outputCommand = firstMove ? "M" : command;
      commands.push({ cmd: outputCommand, values });
      index += argCount;

      if (firstMove) {
        command = "L";
        firstMove = false;
      }
    }
  }

  return commands;
}

function commandToPath(command) {
  if (command.cmd === "Z") return "Z";
  return `${command.cmd} ${command.values.map(formatNumber).join(" ")}`;
}

function commandsToPath(commands) {
  return commands.map(commandToPath).join(" ");
}

function splitPathSubpaths(commands) {
  const subpaths = [];
  let current = [];

  for (const command of commands) {
    if (command.cmd === "M" && current.length) {
      subpaths.push(current);
      current = [];
    }
    current.push(command);
    if (command.cmd === "Z") {
      subpaths.push(current);
      current = [];
    }
  }

  if (current.length) subpaths.push(current);
  return subpaths;
}

function turnAngleDegrees(prev, point, next) {
  const ax = prev[0] - point[0];
  const ay = prev[1] - point[1];
  const bx = next[0] - point[0];
  const by = next[1] - point[1];
  const lenA = Math.hypot(ax, ay);
  const lenB = Math.hypot(bx, by);
  if (lenA < 0.001 || lenB < 0.001) return 180;
  const cosine = clamp((ax * bx + ay * by) / (lenA * lenB), -1, 1);
  return Math.acos(cosine) * 180 / Math.PI;
}

function loopCornerFlags(points, cornerAngle) {
  return points.map((point, index) => {
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return turnAngleDegrees(prev, point, next) < cornerAngle;
  });
}

function cubicPathFromLoop(points, options, stats) {
  const corners = loopCornerFlags(points, options.cornerAngle);
  const parts = [`M ${pointCommand(points[0])}`];
  let cubicSegments = 0;
  let lineSegments = 0;

  for (let index = 0; index < points.length; index += 1) {
    const p0 = points[(index - 1 + points.length) % points.length];
    const p1 = points[index];
    const p2 = points[(index + 1) % points.length];
    const p3 = points[(index + 2) % points.length];
    const segmentLength = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const touchesCorner = corners[index] || corners[(index + 1) % points.length];

    if (touchesCorner || segmentLength < options.minCurveLength) {
      parts.push(`L ${pointCommand(p2)}`);
      lineSegments += 1;
      continue;
    }

    const c1 = [
      p1[0] + (p2[0] - p0[0]) * options.tension,
      p1[1] + (p2[1] - p0[1]) * options.tension
    ];
    const c2 = [
      p2[0] - (p3[0] - p1[0]) * options.tension,
      p2[1] - (p3[1] - p1[1]) * options.tension
    ];
    parts.push(`C ${pointCommand(c1)} ${pointCommand(c2)} ${pointCommand(p2)}`);
    cubicSegments += 1;
  }

  parts.push("Z");
  stats.cubicSegments += cubicSegments;
  stats.lineSegments += lineSegments;
  return parts.join(" ");
}

function refineLineSubpath(subpath, options, stats) {
  if (subpath.length < options.minPoints + 2) {
    stats.skippedSubpaths += 1;
    return commandsToPath(subpath);
  }

  const first = subpath[0];
  const last = subpath[subpath.length - 1];
  if (first.cmd !== "M" || last.cmd !== "Z") {
    stats.skippedSubpaths += 1;
    return commandsToPath(subpath);
  }

  const lineCommands = subpath.slice(1, -1);
  if (!lineCommands.length || lineCommands.some((command) => command.cmd !== "L")) {
    stats.skippedSubpaths += 1;
    return commandsToPath(subpath);
  }

  const rawPoints = [[first.values[0], first.values[1]], ...lineCommands.map((command) => [command.values[0], command.values[1]])];
  const points = normalizeClosedLoop(rawPoints).filter((point, index, list) => (
    index === 0 || pointDistanceSq(point, list[index - 1]) > 0.01
  ));

  if (points.length < options.minPoints || Math.abs(polygonArea(points)) < options.minArea) {
    stats.skippedSubpaths += 1;
    return commandsToPath(subpath);
  }

  const simplified = simplifyClosedLoop(points, options.tolerance);
  if (simplified.length < 4) {
    stats.skippedSubpaths += 1;
    return commandsToPath(subpath);
  }

  stats.refinedSubpaths += 1;
  stats.pointsBefore += points.length;
  stats.pointsAfter += simplified.length;
  return cubicPathFromLoop(simplified, options, stats);
}

function refinePathData(d, options, stats) {
  const commands = parsePathData(d);
  if (!commands) {
    stats.unsupportedPaths += 1;
    return d;
  }

  const subpaths = splitPathSubpaths(commands);
  return subpaths.map((subpath) => refineLineSubpath(subpath, options, stats)).join(" ");
}

function refineSvgPaths(svg, options = {}) {
  const refineOptions = pathRefinementOptions(options);
  const stats = {
    enabled: refineOptions.enabled,
    pathsVisited: 0,
    refinedSubpaths: 0,
    skippedSubpaths: 0,
    unsupportedPaths: 0,
    pointsBefore: 0,
    pointsAfter: 0,
    cubicSegments: 0,
    lineSegments: 0,
    tolerance: refineOptions.tolerance,
    cornerAngle: refineOptions.cornerAngle
  };

  if (!refineOptions.enabled) return { svg, stats };

  const refined = svg.replace(/(<path\b[^>]*\sd=")([^"]*)(")/g, (match, prefix, d, suffix) => {
    stats.pathsVisited += 1;
    return `${prefix}${refinePathData(d, refineOptions, stats)}${suffix}`;
  });

  return { svg: refined, stats };
}

function traceWithImageTracer(imageData, quantized, colors, options = {}) {
  if (!window.ImageTracer) {
    throw new Error("ImageTracerJS is not loaded.");
  }

  const backgroundMask = options.removeLargestColor
    ? imageDataWithTransparentBackground(imageData, quantized, options)
    : { imageData, skippedBackgroundLabels: 0 };
  const tracerOptions = imageTracerOptions(colors, options);
  const baseSvg = enhanceSvgForAntialiasing(
    window.ImageTracer.imagedataToSVG(backgroundMask.imageData, tracerOptions),
    options.antiAlias
  );
  const refined = refineSvgPaths(baseSvg, options);
  const svg = refined.svg;
  const pathCount = countSvgElements(svg, "path");

  return {
    svg,
    pathCount,
    loopCount: 0,
    componentCount: 0,
    skippedBackgroundLabels: backgroundMask.skippedBackgroundLabels,
    minComponentArea: 0,
    tolerance: tracerOptions.qtres,
    smooth: true,
    engineName: engineLabels.imagetracer,
    tracerOptions,
    pathRefinement: refined.stats
  };
}

function nextFrame() {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 50);
  });
}

async function loadVTracerRuntime() {
  if (!vTracerRuntimePromise) {
    vTracerRuntimePromise = import("./vendor/vtracer/loader.js").then((module) => module.loadVTracerRuntime());
  }
  return vTracerRuntimePromise;
}

function ensureVTracerDom(width, height, imageData) {
  let host = document.getElementById("__vectorAccuracyVTracerHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "__vectorAccuracyVTracerHost";
    host.hidden = true;
    document.body.appendChild(host);
  }

  let canvas = document.getElementById(VTRACER_CANVAS_ID);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = VTRACER_CANVAS_ID;
    host.appendChild(canvas);
  }

  let svg = document.getElementById(VTRACER_SVG_ID);
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = VTRACER_SVG_ID;
    host.appendChild(svg);
  }

  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d", { willReadFrequently: true }).putImageData(imageData, 0, 0);

  while (svg.firstChild) svg.removeChild(svg.firstChild);
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  return { canvas, svg };
}

function vTracerOptions(options = {}) {
  const detail = options.detail || "medium";
  const high = detail === "high";
  const low = detail === "low";
  const preserve = options.effects === "preserve";
  const clean = options.effects === "clean";
  const hardArtwork = options.imageType === "artwork-hard";

  return {
    canvas_id: VTRACER_CANVAS_ID,
    svg_id: VTRACER_SVG_ID,
    mode: hardArtwork ? "polygon" : "spline",
    hierarchical: clean ? "cutout" : "stacked",
    corner_threshold: hardArtwork ? 70 : high ? 52 : low ? 68 : 60,
    length_threshold: high ? 3.5 : low ? 6 : 3.5,
    max_iterations: high ? 16 : low ? 8 : 12,
    splice_threshold: hardArtwork ? 35 : high ? 42 : 45,
    filter_speckle: high ? 4 : low ? 18 : 8,
    color_precision: preserve ? 6 : clean ? 5 : 6,
    layer_difference: preserve ? (high ? 8 : 10) : clean ? 20 : 12,
    path_precision: high ? 3 : 2
  };
}

function serializeSvg(svgElement, width, height) {
  const clone = svgElement.cloneNode(true);
  clone.removeAttribute("id");
  clone.removeAttribute("hidden");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const body = new XMLSerializer().serializeToString(clone);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

async function traceWithVTracer(imageData, quantized, options = {}) {
  const runtime = await loadVTracerRuntime();
  const backgroundMask = options.removeLargestColor
    ? imageDataWithTransparentBackground(imageData, quantized, options)
    : { imageData, skippedBackgroundLabels: 0 };
  const { svg } = ensureVTracerDom(backgroundMask.imageData.width, backgroundMask.imageData.height, backgroundMask.imageData);
  const tracerOptions = vTracerOptions(options);
  const converter = runtime.ColorImageConverter.new_with_string(JSON.stringify(tracerOptions));
  let ticks = 0;
  let done = false;

  try {
    converter.init();
    while (!done) {
      done = converter.tick();
      ticks += 1;
      if (ticks > 300000) throw new Error("VTracer exceeded the safety tick limit.");
      if (ticks % 16 === 0) await nextFrame();
    }
  } finally {
    converter.free();
  }

  const rawSvg = serializeSvg(svg, backgroundMask.imageData.width, backgroundMask.imageData.height);
  const outputSvg = enhanceSvgForAntialiasing(rawSvg, options.antiAlias);

  return {
    svg: outputSvg,
    pathCount: countSvgElements(outputSvg, "path"),
    loopCount: 0,
    componentCount: 0,
    skippedBackgroundLabels: backgroundMask.skippedBackgroundLabels,
    minComponentArea: tracerOptions.filter_speckle,
    tolerance: tracerOptions.length_threshold,
    smooth: tracerOptions.mode === "spline",
    engineName: engineLabels.vtracer,
    vtracerOptions: tracerOptions,
    vtracerTicks: ticks
  };
}

function softEffectCandidateLabels(quantized, options = {}) {
  if (options.effects !== "preserve" || options.antiAlias === "off") return [];

  const { palette, counts } = quantized;
  const order = palette
    .map((_, index) => index)
    .filter((index) => counts[index] > 0)
    .sort((a, b) => counts[b] - counts[a]);
  const backgroundLabels = backgroundLabelSet(palette, counts, order, options);
  const backgroundColor = palette[order[0]] || [0, 0, 0];
  const backgroundLum = luminance(backgroundColor);
  const darkBackground = backgroundLum < 96;
  const minCount = Math.max(6, Math.round((quantized.width * quantized.height) * 0.00001));

  return order.filter((label) => {
    if (backgroundLabels.has(label) || counts[label] < minCount) return false;
    const color = palette[label];
    const lum = luminance(color);
    const chroma = colorChroma(color);
    const distance = Math.sqrt(colorDistanceSq(color, backgroundColor));

    if (darkBackground) {
      return lum > backgroundLum + 5 && lum < 170 && distance < 190 && chroma < 150;
    }

    return lum < backgroundLum - 8 && lum > 18 && distance < 180 && chroma < 150;
  });
}

function buildSoftEffectLayer(quantized, options = {}) {
  const labels = softEffectCandidateLabels(quantized, options);
  if (!labels.length) {
    return { fragment: "", pathCount: 0, labelCount: 0, componentCount: 0 };
  }

  const detail = options.detail || "medium";
  const maxPaths = detail === "high" ? 260 : detail === "medium" ? 150 : 70;
  const blur = detail === "high" ? 0.85 : detail === "medium" ? 1.1 : 1.4;
  const minArea = Math.max(8, Math.round((quantized.width * quantized.height) * (detail === "high" ? 0.000008 : 0.000018)));
  const tolerance = detail === "high" ? 0.9 : detail === "medium" ? 1.25 : 1.7;
  const candidates = [];
  let componentCount = 0;

  for (const label of labels) {
    const components = findComponentsForLabel(quantized.labels, quantized.width, quantized.height, label, minArea);
    componentCount += components.length;

    for (const component of components) {
      const width = component.bounds.maxX - component.bounds.minX + 1;
      const height = component.bounds.maxY - component.bounds.minY + 1;
      if (component.area < minArea || width < 2 || height < 2) continue;

      const edges = buildEdgesForComponent(component, quantized.width);
      const loops = stitchEdges(edges, { tolerance, minLoopArea: Math.max(3, Math.round(minArea / 4)) });
      const d = loopsToPath(loops, { smooth: true });
      if (!d) continue;

      candidates.push({
        area: component.area,
        color: quantized.palette[label],
        d
      });
    }
  }

  const paths = candidates
    .sort((a, b) => b.area - a.area)
    .slice(0, maxPaths)
    .map((candidate) => `<path d="${candidate.d}" fill="${rgbToHex(candidate.color)}" opacity="0.58" />`);

  if (!paths.length) {
    return { fragment: "", pathCount: 0, labelCount: labels.length, componentCount };
  }

  const fragment = [
    `<defs><filter id="soft-effect-blur" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${blur}" /></filter></defs>`,
    `<g class="soft-effect-layer" filter="url(#soft-effect-blur)">`,
    ...paths,
    `</g>`
  ].join("");

  return {
    fragment,
    pathCount: paths.length,
    labelCount: labels.length,
    componentCount
  };
}

function injectSvgFragment(svg, fragment) {
  if (!fragment) return svg;
  return svg.replace(/<\/svg>\s*$/i, `${fragment}</svg>`);
}

function injectDetachedBackgroundLayer(svg, backgroundLayer) {
  if (!backgroundLayer) return svg;
  const parser = new DOMParser();
  const documentRef = parser.parseFromString(svg, "image/svg+xml");
  const parserError = documentRef.querySelector("parsererror");
  const root = documentRef.documentElement;
  if (parserError || !root || root.tagName.toLowerCase() !== "svg") return svg;

  const wrapper = documentRef.createElementNS("http://www.w3.org/2000/svg", "g");
  wrapper.innerHTML = backgroundLayer;
  const layer = wrapper.firstElementChild;
  if (!layer) return svg;

  const firstGraphic = Array.from(root.childNodes).find((child) => (
    child.nodeType === 1 && !["defs", "style", "metadata"].includes(child.tagName.toLowerCase())
  ));
  root.insertBefore(layer, firstGraphic || null);
  root.setAttribute("data-detached-background", "true");

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`;
}

function parseHexColor(value) {
  if (!value) return null;
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1].length === 3
    ? match[1].split("").map((char) => char + char).join("")
    : match[1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ];
}

function parseSvgColor(value) {
  if (!value) return null;
  const color = value.trim();
  if (!color || color.toLowerCase() === "none") return null;

  const hex = parseHexColor(color);
  if (hex) return hex;

  const rgbMatch = color.match(/^rgba?\((.+)\)$/i);
  if (!rgbMatch) return null;

  const channels = rgbMatch[1]
    .replace(/\s*\/\s*[\d.]+%?\s*$/, "")
    .split(/[,\s]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => {
      if (part.endsWith("%")) return Math.round(clamp(Number(part.slice(0, -1)), 0, 100) * 2.55);
      return Math.round(clamp(Number(part), 0, 255));
    });

  return channels.length === 3 && channels.every(Number.isFinite) ? channels : null;
}

function svgElementFillRgb(element) {
  const fill = element.getAttribute("fill");
  const fillRgb = parseSvgColor(fill);
  if (fillRgb) return fillRgb;

  const style = element.getAttribute("style") || "";
  const styleMatch = style.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i);
  return styleMatch ? parseSvgColor(styleMatch[1]) : null;
}

function elementLooksLikeBackground(element, backgroundColor, viewWidth, viewHeight) {
  const rgb = svgElementFillRgb(element);
  if (!rgb || colorDistanceSq(rgb, backgroundColor) > 34 * 34) return false;

  if (element.tagName.toLowerCase() === "rect") {
    const width = Number(element.getAttribute("width"));
    const height = Number(element.getAttribute("height"));
    return width >= viewWidth * 0.9 && height >= viewHeight * 0.9;
  }

  const d = element.getAttribute("d") || "";
  return /M\s*[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+/i.test(d)
    && d.length > 80
    && (d.includes(String(Math.round(viewWidth))) || d.includes(String(Math.round(viewHeight))));
}

function classifySvgLayer(rgb, backgroundColor) {
  if (!rgb) return "solid-shape";
  const distanceSq = colorDistanceSq(rgb, backgroundColor);
  const lum = luminance(rgb);
  const chroma = colorChroma(rgb);
  const backgroundLum = luminance(backgroundColor);

  if (distanceSq < 30 * 30 || (backgroundLum < 44 && lum < 18)) return "background";
  if (backgroundLum < 64 && lum < 58 && chroma < 42) return "shadow";
  if (lum > 188 && chroma < 86) return "highlight";
  if (chroma < 48 && lum > 92 && lum < 235) return "highlight";
  return "solid-shape";
}

function createLayerGroup(documentRef, id, label) {
  const group = documentRef.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("id", id);
  group.setAttribute("data-layer", label);
  group.setAttribute("class", label);
  return group;
}

function tagSvgElementLayer(element, layer) {
  element.setAttribute("data-layer", layer);
  const existingClass = element.getAttribute("class");
  const layerClass = `layer-${layer}`;
  element.setAttribute("class", existingClass ? `${existingClass} ${layerClass}` : layerClass);
}

function organizeSvgLayers(svg, options = {}) {
  const stats = {
    enabled: true,
    background: 0,
    solid: 0,
    highlight: 0,
    shadow: 0,
    softEffect: 0,
    orderedTrace: 0,
    parserError: ""
  };

  const parser = new DOMParser();
  const documentRef = parser.parseFromString(svg, "image/svg+xml");
  const parserError = documentRef.querySelector("parsererror");
  const root = documentRef.documentElement;
  if (parserError || !root || root.tagName.toLowerCase() !== "svg") {
    stats.enabled = false;
    stats.parserError = parserError ? parserError.textContent.trim().slice(0, 160) : "No SVG root.";
    return { svg, stats };
  }

  const backgroundColor = options.backgroundColor || [0, 0, 0];
  const viewBox = (root.getAttribute("viewBox") || "").split(/\s+/).map(Number);
  const viewWidth = Number(root.getAttribute("width")) || viewBox[2] || 0;
  const viewHeight = Number(root.getAttribute("height")) || viewBox[3] || 0;
  const children = Array.from(root.childNodes);
  const kept = [];
  const graphics = [];
  let softEffectGroup = null;

  for (const child of children) {
    if (child.nodeType !== 1) {
      kept.push(child);
      continue;
    }

    const tag = child.tagName.toLowerCase();
    if (tag === "style" || tag === "defs" || tag === "metadata") {
      kept.push(child);
      continue;
    }
    if (child.classList && child.classList.contains("soft-effect-layer")) {
      softEffectGroup = child;
      continue;
    }
    graphics.push(child);
  }

  const backgroundGroup = createLayerGroup(documentRef, "layer-background", "background");
  const traceGroup = createLayerGroup(documentRef, "layer-ordered-trace", "ordered-trace");
  traceGroup.setAttribute("data-note", "Children keep rendering order; individual paths are tagged as solid-shape, highlight, or shadow.");
  let leadingBackgroundOpen = true;

  for (const element of graphics) {
    const tag = element.tagName.toLowerCase();
    const rgb = svgElementFillRgb(element);
    const layer = classifySvgLayer(rgb, backgroundColor);
    const isGraphic = tag === "path" || tag === "rect" || tag === "polygon" || tag === "polyline" || tag === "circle" || tag === "ellipse";

    if (isGraphic) tagSvgElementLayer(element, layer);

    if (leadingBackgroundOpen && isGraphic && layer === "background" && elementLooksLikeBackground(element, backgroundColor, viewWidth, viewHeight)) {
      backgroundGroup.appendChild(element);
      stats.background += 1;
      continue;
    }

    leadingBackgroundOpen = false;
    traceGroup.appendChild(element);
    stats.orderedTrace += 1;
    if (layer === "highlight") stats.highlight += 1;
    else if (layer === "shadow") stats.shadow += 1;
    else if (layer === "background") stats.background += 1;
    else stats.solid += 1;
  }

  if (softEffectGroup) {
    softEffectGroup.setAttribute("id", "layer-soft-effects");
    softEffectGroup.setAttribute("data-layer", "soft-effect");
    softEffectGroup.setAttribute("data-note", "Blurred glow/shadow paths derived from near-background color labels.");
    for (const path of Array.from(softEffectGroup.querySelectorAll("path"))) {
      tagSvgElementLayer(path, "soft-effect");
      stats.softEffect += 1;
    }
  }

  while (root.firstChild) root.removeChild(root.firstChild);
  for (const child of kept) root.appendChild(child);
  if (backgroundGroup.childNodes.length) root.appendChild(backgroundGroup);
  if (traceGroup.childNodes.length) root.appendChild(traceGroup);
  if (softEffectGroup) root.appendChild(softEffectGroup);
  root.setAttribute("data-layered", "true");
  root.setAttribute("data-layer-model", "background ordered-trace soft-effect");

  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`,
    stats
  };
}

function pathDataBounds(d) {
  const commands = parsePathData(d || "");
  if (!commands) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const command of commands) {
    if (command.cmd === "Z") continue;
    for (let index = 0; index < command.values.length; index += 2) {
      const x = command.values[index];
      const y = command.values[index + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    area: Math.max(0, maxX - minX) * Math.max(0, maxY - minY)
  };
}

function ensureDefs(documentRef, root) {
  let defs = root.querySelector("defs");
  if (defs) return defs;

  defs = documentRef.createElementNS("http://www.w3.org/2000/svg", "defs");
  const firstElement = Array.from(root.childNodes).find((child) => child.nodeType === 1);
  root.insertBefore(defs, firstElement || root.firstChild);
  return defs;
}

function addGradientStop(documentRef, gradient, offset, color, opacity = 1) {
  const stop = documentRef.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop.setAttribute("offset", offset);
  stop.setAttribute("stop-color", rgbToHex(color));
  if (opacity < 1) stop.setAttribute("stop-opacity", formatNumber(opacity));
  gradient.appendChild(stop);
}

function createEffectGradient(documentRef, type, id, rgb) {
  const isSoft = type === "soft-effect";
  const gradient = documentRef.createElementNS(
    "http://www.w3.org/2000/svg",
    isSoft ? "radialGradient" : "linearGradient"
  );
  gradient.setAttribute("id", id);
  gradient.setAttribute("gradientUnits", "objectBoundingBox");

  if (isSoft) {
    gradient.setAttribute("cx", "50%");
    gradient.setAttribute("cy", "50%");
    gradient.setAttribute("r", "64%");
    addGradientStop(documentRef, gradient, "0%", adjustRgb(rgb, 0.06));
    addGradientStop(documentRef, gradient, "58%", rgb, 0.94);
    addGradientStop(documentRef, gradient, "100%", adjustRgb(rgb, -0.05), 0.74);
    return gradient;
  }

  gradient.setAttribute("x1", "0%");
  gradient.setAttribute("y1", "0%");
  gradient.setAttribute("x2", "100%");
  gradient.setAttribute("y2", "100%");

  if (type === "shadow") {
    addGradientStop(documentRef, gradient, "0%", adjustRgb(rgb, 0.05));
    addGradientStop(documentRef, gradient, "58%", rgb);
    addGradientStop(documentRef, gradient, "100%", adjustRgb(rgb, -0.08));
  } else {
    addGradientStop(documentRef, gradient, "0%", adjustRgb(rgb, 0.06));
    addGradientStop(documentRef, gradient, "46%", rgb);
    addGradientStop(documentRef, gradient, "100%", adjustRgb(rgb, -0.04));
  }

  return gradient;
}

function removeInlineFillStyle(element) {
  const style = element.getAttribute("style");
  if (!style) return;

  const nextStyle = style
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !/^fill\s*:/i.test(part))
    .join("; ");

  if (nextStyle) element.setAttribute("style", nextStyle);
  else element.removeAttribute("style");
}

function gradientPathMinArea(layer, detail) {
  if (layer === "soft-effect") return detail === "high" ? 6 : detail === "low" ? 18 : 10;
  if (layer === "shadow") return detail === "high" ? 10 : detail === "low" ? 28 : 16;
  return detail === "high" ? 14 : detail === "low" ? 34 : 20;
}

function convertEffectLayersToGradients(svg, options = {}) {
  const stats = {
    enabled: options.effects === "preserve" && options.antiAlias !== "off",
    gradientsAdded: 0,
    pathsConverted: 0,
    highlight: 0,
    shadow: 0,
    softEffect: 0,
    skippedSmall: 0,
    skippedUnsupported: 0,
    parserError: ""
  };

  if (!stats.enabled) return { svg, stats };

  const parser = new DOMParser();
  const documentRef = parser.parseFromString(svg, "image/svg+xml");
  const parserError = documentRef.querySelector("parsererror");
  const root = documentRef.documentElement;
  if (parserError || !root || root.tagName.toLowerCase() !== "svg") {
    stats.enabled = false;
    stats.parserError = parserError ? parserError.textContent.trim().slice(0, 160) : "No SVG root.";
    return { svg, stats };
  }

  const defs = ensureDefs(documentRef, root);
  const gradientsByKey = new Map();
  const detail = options.detail || "medium";
  const eligibleLayers = new Set(["highlight", "shadow", "soft-effect"]);

  for (const path of Array.from(root.querySelectorAll("path[data-layer]"))) {
    const layer = path.getAttribute("data-layer");
    if (!eligibleLayers.has(layer)) continue;

    const rgb = svgElementFillRgb(path);
    if (!rgb) {
      stats.skippedUnsupported += 1;
      continue;
    }

    const bounds = pathDataBounds(path.getAttribute("d"));
    if (!bounds) {
      stats.skippedUnsupported += 1;
      continue;
    }
    if (bounds.width < 1.5 || bounds.height < 1.5 || bounds.area < gradientPathMinArea(layer, detail)) {
      stats.skippedSmall += 1;
      continue;
    }

    const colorKey = rgbToHex(rgb).slice(1);
    const key = `${layer}-${colorKey}`;
    let gradientId = gradientsByKey.get(key);
    if (!gradientId) {
      gradientId = `effect-gradient-${key}`;
      if (!documentRef.getElementById(gradientId)) {
        defs.appendChild(createEffectGradient(documentRef, layer, gradientId, rgb));
        stats.gradientsAdded += 1;
      }
      gradientsByKey.set(key, gradientId);
    }

    const originalFill = path.getAttribute("fill") || "";
    if (originalFill) path.setAttribute("data-original-fill", originalFill);
    removeInlineFillStyle(path);
    path.setAttribute("fill", `url(#${gradientId})`);
    path.setAttribute("data-gradient-fill", layer);
    stats.pathsConverted += 1;
    if (layer === "highlight") stats.highlight += 1;
    else if (layer === "shadow") stats.shadow += 1;
    else stats.softEffect += 1;
  }

  if (stats.pathsConverted) {
    root.setAttribute("data-effect-gradients", "true");
    root.setAttribute("data-effect-gradient-model", "highlight shadow soft-effect");
  }

  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`,
    stats
  };
}

function subPixelEdgeOptions(options = {}) {
  const mode = options.subPixelEdges || "balanced";
  const detail = options.detail || "medium";
  const high = detail === "high";
  const low = detail === "low";
  return {
    enabled: mode !== "off" && options.antiAlias !== "off" && options.imageType !== "photo",
    mode,
    maxOffset: mode === "off" ? 0 : mode === "strong" ? 0.75 : 0.45,
    sampleRadius: mode === "strong" ? 1.45 : 1.2,
    sampleStep: 0.25,
    minPoints: high ? 14 : low ? 10 : 12,
    minArea: high ? 22 : low ? 12 : 16,
    maxDetailHeight: high ? 20 : low ? 10 : 14,
    maxDetailArea: high ? 260 : low ? 90 : 150,
    cornerAngle: options.imageType === "artwork-hard" ? 160 : 150,
    minColorSeparationSq: 18 * 18,
    minShift: 0.035
  };
}

function curveOptimizerOptions(options = {}) {
  const mode = options.curveOptimizer || "balanced";
  return {
    enabled: mode !== "off" && options.antiAlias !== "off" && options.imageType !== "photo",
    mode,
    minImprovement: mode === "strong" ? 0.000025 : 0.00005,
    hotPixelSlack: mode === "strong" ? 0.0008 : 0.0005,
    maxPathGrowth: 1.1
  };
}

function curveOptimizerCandidates(options = {}) {
  const optimizer = curveOptimizerOptions(options);
  const base = [
    { name: "base", label: "Current edge polish", variant: {} }
  ];
  if (!optimizer.enabled) return base;

  const balanced = [
    { name: "crisper", label: "Crisper corners", variant: { toleranceScale: 0.86, cornerAngleAdd: 5, minCurveLengthScale: 1.08, tension: 1 / 6.8 } },
    { name: "smoother", label: "Smoother curves", variant: { toleranceScale: 1.08, cornerAngleAdd: -4, minCurveLengthScale: 0.92, tension: 1 / 5.5 } }
  ];

  if (optimizer.mode === "balanced") return base.concat(balanced);

  return base.concat(balanced, [
    { name: "precise", label: "Tighter fit", variant: { toleranceScale: 0.72, cornerAngleAdd: 8, minCurveLengthScale: 1.16, tension: 1 / 7.4 } },
    { name: "flow", label: "Longer flow", variant: { toleranceScale: 1.18, cornerAngleAdd: -8, minCurveLengthScale: 0.82, tension: 1 / 5.1 } }
  ]);
}

function sampleImageDataRgb(imageData, x, y) {
  const { width, height, data } = imageData;
  const safeX = clamp(x, 0, width - 1);
  const safeY = clamp(y, 0, height - 1);
  const x0 = Math.floor(safeX);
  const y0 = Math.floor(safeY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = safeX - x0;
  const ty = safeY - y0;

  const read = (px, py) => {
    const index = (py * width + px) * 4;
    return matteRgb(data, index);
  };

  const top = mixRgb(read(x0, y0), read(x1, y0), tx);
  const bottom = mixRgb(read(x0, y1), read(x1, y1), tx);
  return mixRgb(top, bottom, ty);
}

function projectedCoverage(sample, outsideColor, insideColor) {
  const vx = insideColor[0] - outsideColor[0];
  const vy = insideColor[1] - outsideColor[1];
  const vz = insideColor[2] - outsideColor[2];
  const denom = vx * vx + vy * vy + vz * vz;
  if (denom < 1) return null;
  const dot = (sample[0] - outsideColor[0]) * vx
    + (sample[1] - outsideColor[1]) * vy
    + (sample[2] - outsideColor[2]) * vz;
  return clamp(dot / denom, 0, 1);
}

function estimateCoverageCrossing(point, signedNormal, insideColor, outsideColor, imageData, options) {
  const samples = [];
  for (let offset = -options.sampleRadius; offset <= options.sampleRadius + 0.001; offset += options.sampleStep) {
    const rgb = sampleImageDataRgb(
      imageData,
      point[0] + signedNormal[0] * offset,
      point[1] + signedNormal[1] * offset
    );
    const coverage = projectedCoverage(rgb, outsideColor, insideColor);
    if (coverage === null) return null;
    samples.push({ offset, coverage });
  }

  let nearest = samples[0];
  for (let index = 1; index < samples.length; index += 1) {
    const prev = samples[index - 1];
    const current = samples[index];
    if ((prev.coverage <= 0.5 && current.coverage >= 0.5) || (prev.coverage >= 0.5 && current.coverage <= 0.5)) {
      const span = current.coverage - prev.coverage;
      const t = Math.abs(span) < 0.0001 ? 0 : (0.5 - prev.coverage) / span;
      return prev.offset + (current.offset - prev.offset) * clamp(t, 0, 1);
    }
    if (Math.abs(current.coverage - 0.5) < Math.abs(nearest.coverage - 0.5)) nearest = current;
  }

  return nearest ? nearest.offset : null;
}

function estimateSubPixelShift(point, normal, fillRgb, imageData, options) {
  const plusRgb = sampleImageDataRgb(imageData, point[0] + normal[0] * 0.9, point[1] + normal[1] * 0.9);
  const minusRgb = sampleImageDataRgb(imageData, point[0] - normal[0] * 0.9, point[1] - normal[1] * 0.9);
  const plusDistance = colorDistanceSq(plusRgb, fillRgb);
  const minusDistance = colorDistanceSq(minusRgb, fillRgb);
  const insideSign = plusDistance <= minusDistance ? 1 : -1;
  const signedNormal = [normal[0] * insideSign, normal[1] * insideSign];
  const insideProbe = sampleImageDataRgb(
    imageData,
    point[0] + signedNormal[0] * options.sampleRadius,
    point[1] + signedNormal[1] * options.sampleRadius
  );
  const outsideProbe = sampleImageDataRgb(
    imageData,
    point[0] - signedNormal[0] * options.sampleRadius,
    point[1] - signedNormal[1] * options.sampleRadius
  );
  const insideColor = colorDistanceSq(insideProbe, fillRgb) <= colorDistanceSq(outsideProbe, fillRgb)
    ? mixRgb(fillRgb, insideProbe, 0.25)
    : fillRgb;
  const outsideColor = outsideProbe;

  if (colorDistanceSq(insideColor, outsideColor) < options.minColorSeparationSq) return null;

  const crossing = estimateCoverageCrossing(point, signedNormal, insideColor, outsideColor, imageData, options);
  if (!Number.isFinite(crossing)) return null;
  return {
    normal: signedNormal,
    shift: clamp(crossing, -options.maxOffset, options.maxOffset)
  };
}

function smoothSubPixelShifts(samples, corners) {
  return samples.map((sample, index) => {
    if (!sample || corners[index]) return sample;
    const prev = samples[(index - 1 + samples.length) % samples.length];
    const next = samples[(index + 1) % samples.length];
    let shift = sample.shift * 2;
    let weight = 2;
    if (prev && !corners[(index - 1 + samples.length) % samples.length]) {
      shift += prev.shift;
      weight += 1;
    }
    if (next && !corners[(index + 1) % samples.length]) {
      shift += next.shift;
      weight += 1;
    }
    return { ...sample, shift: shift / weight };
  });
}

function subPixelFitLoop(points, fillRgb, imageData, options, stats) {
  const area = Math.abs(polygonArea(points));
  if (points.length < options.minPoints || area < options.minArea || subpathLooksLikeTinyDetail(points, options)) {
    stats.skippedSmall += 1;
    return null;
  }

  const corners = loopCornerFlags(points, options.cornerAngle);
  const samples = points.map((point, index) => {
    if (corners[index]) return null;
    const prev = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const tangent = [next[0] - prev[0], next[1] - prev[1]];
    const length = Math.hypot(tangent[0], tangent[1]);
    if (length < 0.001) return null;
    const normal = [-tangent[1] / length, tangent[0] / length];
    return estimateSubPixelShift(point, normal, fillRgb, imageData, options);
  });

  const smoothed = smoothSubPixelShifts(samples, corners);
  let adjustedCount = 0;
  let totalShift = 0;
  let maxShift = 0;
  const adjusted = points.map((point, index) => {
    const sample = smoothed[index];
    if (!sample || Math.abs(sample.shift) < options.minShift) return point;
    adjustedCount += 1;
    totalShift += Math.abs(sample.shift);
    maxShift = Math.max(maxShift, Math.abs(sample.shift));
    return [
      point[0] + sample.normal[0] * sample.shift,
      point[1] + sample.normal[1] * sample.shift
    ];
  });

  stats.pointsVisited += points.length;
  stats.pointsAdjusted += adjustedCount;
  stats.totalShift += totalShift;
  stats.maxShift = Math.max(stats.maxShift, maxShift);
  if (!adjustedCount) {
    stats.skippedLowConfidence += 1;
    return null;
  }

  return adjusted;
}

function subPixelFitSubpath(subpath, fillRgb, imageData, options, stats) {
  const points = subpathToEndpointLoop(subpath);
  if (!points) {
    stats.skippedUnsupported += 1;
    return commandsToPath(subpath);
  }

  const adjusted = subPixelFitLoop(points, fillRgb, imageData, options, stats);
  if (!adjusted) return commandsToPath(subpath);

  stats.adjustedSubpaths += 1;
  return loopToPath(adjusted, false);
}

function subPixelFitPathData(d, fillRgb, imageData, options, stats) {
  const commands = parsePathData(d);
  if (!commands) {
    stats.unsupportedPaths += 1;
    return d;
  }

  const subpaths = splitPathSubpaths(commands);
  return subpaths.map((subpath) => subPixelFitSubpath(subpath, fillRgb, imageData, options, stats)).join(" ");
}

function fitSvgSubPixelEdges(svg, imageData, options = {}) {
  const fitOptions = subPixelEdgeOptions(options);
  const stats = {
    enabled: fitOptions.enabled,
    mode: fitOptions.mode,
    pathsVisited: 0,
    adjustedSubpaths: 0,
    skippedSmall: 0,
    skippedLowConfidence: 0,
    skippedUnsupported: 0,
    skippedColor: 0,
    unsupportedPaths: 0,
    pointsVisited: 0,
    pointsAdjusted: 0,
    totalShift: 0,
    averageShift: 0,
    maxShift: 0,
    maxOffset: fitOptions.maxOffset,
    parserError: ""
  };

  if (!stats.enabled) return { svg, stats };

  const parser = new DOMParser();
  const documentRef = parser.parseFromString(svg, "image/svg+xml");
  const parserError = documentRef.querySelector("parsererror");
  const root = documentRef.documentElement;
  if (parserError || !root || root.tagName.toLowerCase() !== "svg") {
    stats.enabled = false;
    stats.parserError = parserError ? parserError.textContent.trim().slice(0, 160) : "No SVG root.";
    return { svg, stats };
  }

  const eligibleLayers = new Set(["background", "solid-shape"]);
  for (const path of Array.from(root.querySelectorAll("path[data-layer]"))) {
    if (!eligibleLayers.has(path.getAttribute("data-layer"))) continue;
    if (path.getAttribute("filter") || path.hasAttribute("data-gradient-fill")) continue;

    const fillRgb = svgElementFillRgb(path);
    if (!fillRgb) {
      stats.skippedColor += 1;
      continue;
    }

    const d = path.getAttribute("d");
    if (!d) continue;
    stats.pathsVisited += 1;
    path.setAttribute("d", subPixelFitPathData(d, fillRgb, imageData, fitOptions, stats));
  }

  stats.averageShift = stats.pointsAdjusted ? stats.totalShift / stats.pointsAdjusted : 0;
  if (stats.adjustedSubpaths) {
    root.setAttribute("data-sub-pixel-edges", fitOptions.mode);
    root.setAttribute("data-sub-pixel-edge-model", "coverage-crossing-v1");
  }

  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`,
    stats
  };
}

function skippedSubPixelStats(options = {}, reason = "off") {
  const fitOptions = subPixelEdgeOptions(options);
  return {
    enabled: false,
    mode: fitOptions.mode,
    selected: false,
    guardReason: reason,
    pathsVisited: 0,
    adjustedSubpaths: 0,
    skippedSmall: 0,
    skippedLowConfidence: 0,
    skippedUnsupported: 0,
    skippedColor: 0,
    unsupportedPaths: 0,
    pointsVisited: 0,
    pointsAdjusted: 0,
    totalShift: 0,
    averageShift: 0,
    maxShift: 0,
    maxOffset: fitOptions.maxOffset,
    parserError: ""
  };
}

function skippedCurveOptimizationStats(options = {}, reason = "off") {
  const optimizer = curveOptimizerOptions(options);
  return {
    enabled: false,
    mode: optimizer.mode,
    selected: false,
    guardReason: reason,
    candidatesTested: 0,
    selectedCandidate: "base",
    selectedLabel: "Current edge polish",
    baselineEdgeRmse: null,
    selectedEdgeRmse: null,
    baselineHotPixelRatio: null,
    selectedHotPixelRatio: null,
    baselinePaths: null,
    selectedPaths: null
  };
}

function finalizeLayeredSvg(svg, imageData, options = {}, applySubPixel = false) {
  const subPixelResult = applySubPixel
    ? fitSvgSubPixelEdges(svg, imageData, options)
    : { svg, stats: skippedSubPixelStats(options, "bypassed") };
  const edgePolished = polishSvgEdges(subPixelResult.svg, options);
  const gradientConverted = convertEffectLayersToGradients(edgePolished.svg, options);
  const exportOptimized = optimizeSvgForExport(gradientConverted.svg, {
    ...options,
    backgroundColor: options.backgroundColor
  });

  return {
    svg: exportOptimized.svg,
    subPixelEdges: subPixelResult.stats,
    edgePolish: edgePolished.stats,
    gradientConversion: gradientConverted.stats,
    exportOptimization: exportOptimized.stats,
    curveOptimization: skippedCurveOptimizationStats(options, "not evaluated")
  };
}

async function measureSvgDifference(imageData, svg, options = {}) {
  const scratchCanvas = document.createElement("canvas");
  return renderDifferenceView(imageData, svg, scratchCanvas, options);
}

function candidateBeatsCurrent(candidateDifference, bestDifference, candidatePaths, basePaths, optimizer) {
  const edgeDelta = candidateDifference.edgeWeightedRmse - bestDifference.edgeWeightedRmse;
  const hotDelta = candidateDifference.hotPixelRatio - bestDifference.hotPixelRatio;
  const complexityOk = candidatePaths <= Math.ceil(basePaths * optimizer.maxPathGrowth);
  return edgeDelta < -optimizer.minImprovement && hotDelta <= optimizer.hotPixelSlack && complexityOk;
}

async function optimizeCurvesForFinalSvg(svg, imageData, options = {}, applySubPixel = false) {
  const optimizer = curveOptimizerOptions(options);
  const candidates = curveOptimizerCandidates(options);
  const guardOptions = { backgroundColor: options.backgroundColor };
  const results = [];

  for (const candidate of candidates) {
    const final = finalizeLayeredSvg(svg, imageData, {
      ...options,
      edgePolishVariantName: candidate.name,
      edgePolishVariant: candidate.variant
    }, applySubPixel);
    const difference = await measureSvgDifference(imageData, final.svg, guardOptions);
    results.push({
      candidate,
      final,
      difference,
      paths: countSvgElements(final.svg, "path")
    });
    if (!optimizer.enabled) break;
    await nextFrame();
  }

  const baseResult = results[0];
  let best = baseResult;
  for (const result of results.slice(1)) {
    if (candidateBeatsCurrent(result.difference, best.difference, result.paths, baseResult.paths, optimizer)) best = result;
  }

  const selected = best.candidate.name !== "base";
  const curveOptimization = {
    enabled: optimizer.enabled,
    mode: optimizer.mode,
    selected,
    guardReason: optimizer.enabled
      ? selected ? "edge metric improved" : "metric guard kept base curve fit"
      : "off",
    candidatesTested: results.length,
    selectedCandidate: best.candidate.name,
    selectedLabel: best.candidate.label,
    baselineEdgeRmse: baseResult.difference.edgeWeightedRmse,
    selectedEdgeRmse: best.difference.edgeWeightedRmse,
    baselineHotPixelRatio: baseResult.difference.hotPixelRatio,
    selectedHotPixelRatio: best.difference.hotPixelRatio,
    baselinePaths: baseResult.paths,
    selectedPaths: best.paths,
    candidateSummaries: results.map((result) => ({
      name: result.candidate.name,
      edgeWeightedRmse: result.difference.edgeWeightedRmse,
      hotPixelRatio: result.difference.hotPixelRatio,
      paths: result.paths
    }))
  };

  return {
    ...best.final,
    curveOptimization
  };
}

async function chooseFinalSvg(layeredSvg, imageData, options = {}) {
  if (options.subPixelEdges === "off") {
    const final = await optimizeCurvesForFinalSvg(layeredSvg, imageData, { ...options, subPixelEdges: "off" }, false);
    final.subPixelEdges = skippedSubPixelStats({ ...options, subPixelEdges: "off" }, "off");
    return final;
  }

  const guardOptions = { backgroundColor: options.backgroundColor };
  const baseline = await optimizeCurvesForFinalSvg(layeredSvg, imageData, { ...options, subPixelEdges: "off" }, false);
  const candidate = await optimizeCurvesForFinalSvg(layeredSvg, imageData, options, true);
  const baselineDifference = await measureSvgDifference(imageData, baseline.svg, guardOptions);
  const candidateDifference = await measureSvgDifference(imageData, candidate.svg, guardOptions);
  const baselinePaths = countSvgElements(baseline.svg, "path");
  const candidatePaths = countSvgElements(candidate.svg, "path");
  const edgeDelta = candidateDifference.edgeWeightedRmse - baselineDifference.edgeWeightedRmse;
  const hotDelta = candidateDifference.hotPixelRatio - baselineDifference.hotPixelRatio;
  const complexityOk = candidatePaths <= Math.ceil(baselinePaths * 1.1);
  const selected = edgeDelta < -0.00005 && hotDelta <= 0.0005 && complexityOk;
  const final = selected ? candidate : baseline;

  final.subPixelEdges = {
    ...candidate.subPixelEdges,
    selected,
    guardReason: selected ? "edge metric improved" : "metric guard kept no-subpixel output",
    guardBaselineEdgeRmse: baselineDifference.edgeWeightedRmse,
    guardCandidateEdgeRmse: candidateDifference.edgeWeightedRmse,
    guardBaselineHotPixelRatio: baselineDifference.hotPixelRatio,
    guardCandidateHotPixelRatio: candidateDifference.hotPixelRatio,
    guardBaselinePaths: baselinePaths,
    guardCandidatePaths: candidatePaths
  };

  return final;
}

function edgePolishOptions(options = {}) {
  const detail = options.detail || "medium";
  const high = detail === "high";
  const low = detail === "low";
  const variant = options.edgePolishVariant || {};
  const baseTolerance = high ? 0.72 : low ? 0.95 : 0.78;
  const baseCornerAngle = options.imageType === "artwork-hard" ? 160 : 150;
  const baseMinCurveLength = high ? 2.4 : low ? 4 : 3;
  const baseShortRatio = high ? 0.34 : low ? 0.42 : 0.38;
  return {
    enabled: options.antiAlias !== "off" && options.imageType !== "photo",
    tolerance: Math.max(0.24, baseTolerance * (variant.toleranceScale || 1) + (variant.toleranceAdd || 0)),
    cornerAngle: clamp(baseCornerAngle + (variant.cornerAngleAdd || 0), 124, 172),
    minPoints: high ? 14 : low ? 10 : 12,
    minArea: high ? 18 : low ? 8 : 12,
    minCurveLength: Math.max(1.2, baseMinCurveLength * (variant.minCurveLengthScale || 1) + (variant.minCurveLengthAdd || 0)),
    tension: variant.tension || 1 / 6,
    minShortSegmentRatio: clamp(baseShortRatio + (variant.minShortSegmentRatioAdd || 0), 0.2, 0.66),
    maxDetailHeight: high ? 20 : low ? 10 : 14,
    maxDetailArea: high ? 260 : low ? 90 : 150,
    variantName: options.edgePolishVariantName || "base"
  };
}

function commandEndPoint(command) {
  if (command.cmd === "M" || command.cmd === "L") return [command.values[0], command.values[1]];
  if (command.cmd === "Q") return [command.values[2], command.values[3]];
  if (command.cmd === "C") return [command.values[4], command.values[5]];
  return null;
}

function subpathToEndpointLoop(subpath) {
  const first = subpath[0];
  const last = subpath[subpath.length - 1];
  if (!first || first.cmd !== "M" || !last || last.cmd !== "Z") return null;

  const points = [[first.values[0], first.values[1]]];
  for (const command of subpath.slice(1, -1)) {
    const point = commandEndPoint(command);
    if (!point) return null;
    points.push(point);
  }

  return normalizeClosedLoop(points).filter((point, index, list) => (
    index === 0 || pointDistanceSq(point, list[index - 1]) > 0.01
  ));
}

function pointsBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    area: Math.max(0, maxX - minX) * Math.max(0, maxY - minY)
  };
}

function shortSegmentRatio(points) {
  if (points.length < 2) return 0;
  let shortSegments = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const length = Math.hypot(next[0] - current[0], next[1] - current[1]);
    if (length <= 3.2) shortSegments += 1;
  }

  return shortSegments / points.length;
}

function subpathLooksLikeTinyDetail(points, options) {
  const bounds = pointsBounds(points);
  return Math.min(bounds.width, bounds.height) <= options.maxDetailHeight
    && bounds.area <= options.maxDetailArea;
}

function polishEdgeSubpath(subpath, options, stats) {
  const points = subpathToEndpointLoop(subpath);
  if (!points) {
    stats.skippedUnsupported += 1;
    return commandsToPath(subpath);
  }

  const area = Math.abs(polygonArea(points));
  if (points.length < options.minPoints || area < options.minArea || subpathLooksLikeTinyDetail(points, options)) {
    stats.skippedSmall += 1;
    return commandsToPath(subpath);
  }

  const stairRatio = shortSegmentRatio(points);
  if (stairRatio < options.minShortSegmentRatio && points.length < options.minPoints * 2) {
    stats.skippedSmooth += 1;
    return commandsToPath(subpath);
  }

  const simplified = simplifyClosedLoop(points, options.tolerance);
  if (simplified.length < 4 || simplified.length > points.length) {
    stats.skippedSmall += 1;
    return commandsToPath(subpath);
  }

  stats.polishedSubpaths += 1;
  stats.pointsBefore += points.length;
  stats.pointsAfter += simplified.length;
  return cubicPathFromLoop(simplified, options, stats);
}

function polishPathDataEdges(d, options, stats) {
  const commands = parsePathData(d);
  if (!commands) {
    stats.unsupportedPaths += 1;
    return d;
  }

  const subpaths = splitPathSubpaths(commands);
  return subpaths.map((subpath) => polishEdgeSubpath(subpath, options, stats)).join(" ");
}

function polishSvgEdges(svg, options = {}) {
  const polishOptions = edgePolishOptions(options);
  const stats = {
    enabled: polishOptions.enabled,
    pathsVisited: 0,
    polishedSubpaths: 0,
    skippedSmall: 0,
    skippedSmooth: 0,
    skippedUnsupported: 0,
    unsupportedPaths: 0,
    pointsBefore: 0,
    pointsAfter: 0,
    cubicSegments: 0,
    lineSegments: 0,
    tolerance: polishOptions.tolerance,
    cornerAngle: polishOptions.cornerAngle,
    variantName: polishOptions.variantName,
    parserError: ""
  };

  if (!stats.enabled) return { svg, stats };

  const parser = new DOMParser();
  const documentRef = parser.parseFromString(svg, "image/svg+xml");
  const parserError = documentRef.querySelector("parsererror");
  const root = documentRef.documentElement;
  if (parserError || !root || root.tagName.toLowerCase() !== "svg") {
    stats.enabled = false;
    stats.parserError = parserError ? parserError.textContent.trim().slice(0, 160) : "No SVG root.";
    return { svg, stats };
  }

  const eligibleLayers = new Set(["background", "solid-shape"]);
  for (const path of Array.from(root.querySelectorAll("path[data-layer]"))) {
    if (!eligibleLayers.has(path.getAttribute("data-layer"))) continue;
    if (path.getAttribute("filter") || path.hasAttribute("data-gradient-fill")) continue;

    const d = path.getAttribute("d");
    if (!d) continue;
    stats.pathsVisited += 1;
    path.setAttribute("d", polishPathDataEdges(d, polishOptions, stats));
  }

  if (stats.polishedSubpaths) {
    root.setAttribute("data-edge-polished", "true");
    root.setAttribute("data-edge-polish", "stair-step cubic refit");
  }

  return {
    svg: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`,
    stats
  };
}

function isUrlPaint(value) {
  return /^url\(/i.test((value || "").trim());
}

function elementOpacityIsOpaque(element) {
  const opacity = Number(element.getAttribute("opacity") || "1");
  const fillOpacity = Number(element.getAttribute("fill-opacity") || "1");
  return Number.isFinite(opacity) && Number.isFinite(fillOpacity) && opacity >= 0.999 && fillOpacity >= 0.999;
}

function exportOptimizationOptions(options = {}) {
  const detail = options.detail || "medium";
  const preserve = options.effects === "preserve";
  const detached = Boolean(options.detachedForeground);
  return {
    enabled: true,
    colorMergeDistanceSq: (preserve ? 6 : 8) ** 2,
    tinyBackgroundArea: detail === "high" ? 1.6 : detail === "low" ? 0.8 : 1.1,
    tinyBackgroundLongSide: detail === "high" ? 3.2 : detail === "low" ? 2.1 : 2.6,
    detachedMicroPrune: detached,
    detachedMicroArea: detail === "high" ? 2.2 : detail === "low" ? 0.9 : 1.4,
    detachedMicroLongSide: detail === "high" ? 6.2 : detail === "low" ? 3.2 : 4.6,
    detachedNeedleArea: detail === "high" ? 0.32 : detail === "low" ? 0.18 : 0.26,
    detachedMicroBackgroundArea: detail === "high" ? 5.2 : detail === "low" ? 2.4 : 3.6,
    detachedMicroBackgroundLongSide: detail === "high" ? 12 : detail === "low" ? 6.2 : 8.6
  };
}

function pathDuplicateKey(path) {
  if (!elementOpacityIsOpaque(path)) return "";
  const fill = path.getAttribute("fill") || "";
  const layer = path.getAttribute("data-layer") || "";
  const filter = path.getAttribute("filter") || "";
  const fillRule = path.getAttribute("fill-rule") || "";
  const stroke = path.getAttribute("stroke") || "";
  const strokeWidth = path.getAttribute("stroke-width") || "";
  if (stroke && stroke.toLowerCase() !== "none") return "";
  return [
    path.getAttribute("d") || "",
    fill,
    layer,
    filter,
    fillRule,
    strokeWidth
  ].join("|");
}

function pathLooksLikeTinyBackground(path, backgroundColor, options) {
  if (path.getAttribute("data-layer") !== "background") return false;
  if (!elementOpacityIsOpaque(path)) return false;

  const fill = path.getAttribute("fill") || "";
  if (isUrlPaint(fill)) return false;

  const rgb = svgElementFillRgb(path);
  if (!rgb || colorDistanceSq(rgb, backgroundColor) > 24 * 24) return false;

  const bounds = pathDataBounds(path.getAttribute("d"));
  if (!bounds) return false;
  const longSide = Math.max(bounds.width, bounds.height);
  return bounds.area <= options.tinyBackgroundArea && longSide <= options.tinyBackgroundLongSide;
}

function pathLooksLikeDetachedMicroPath(path, backgroundColor, options) {
  if (!options.detachedMicroPrune) return false;
  if (path.getAttribute("filter")) return false;

  const layer = path.getAttribute("data-layer") || "";
  if (!["background", "solid-shape", "highlight", "shadow"].includes(layer)) return false;

  const bounds = pathDataBounds(path.getAttribute("d"));
  if (!bounds) return false;
  const longSide = Math.max(bounds.width, bounds.height);

  if (layer === "background") {
    const fill = path.getAttribute("fill") || "";
    if (!fill || isUrlPaint(fill)) return false;

    const rgb = svgElementFillRgb(path);
    if (!rgb || colorDistanceSq(rgb, backgroundColor) > 34 * 34) return false;
    return bounds.area <= options.detachedMicroBackgroundArea
      && longSide <= options.detachedMicroBackgroundLongSide;
  }

  if (bounds.area <= options.detachedNeedleArea) return true;

  return bounds.area <= options.detachedMicroArea
    && longSide <= options.detachedMicroLongSide;
}

function createPathSizeHistogram() {
  return {
    le1: 0,
    le4: 0,
    le16: 0,
    le64: 0,
    le256: 0,
    gt256: 0,
    unsupported: 0
  };
}

function createPathLayerHistogram() {
  return {
    background: 0,
    solidShape: 0,
    highlight: 0,
    shadow: 0,
    softEffect: 0,
    orderedTrace: 0,
    none: 0,
    other: 0
  };
}

function addPathLayerHistogramEntry(histogram, path) {
  const layer = path.getAttribute("data-layer") || "";
  if (layer === "solid-shape") histogram.solidShape += 1;
  else if (layer === "soft-effect") histogram.softEffect += 1;
  else if (layer === "ordered-trace") histogram.orderedTrace += 1;
  else if (layer && Object.prototype.hasOwnProperty.call(histogram, layer)) histogram[layer] += 1;
  else if (!layer) histogram.none += 1;
  else histogram.other += 1;
}

function addPathSizeHistogramEntry(histogram, path) {
  const bounds = pathDataBounds(path.getAttribute("d"));
  if (!bounds) {
    histogram.unsupported += 1;
    return;
  }
  if (bounds.area <= 1) histogram.le1 += 1;
  else if (bounds.area <= 4) histogram.le4 += 1;
  else if (bounds.area <= 16) histogram.le16 += 1;
  else if (bounds.area <= 64) histogram.le64 += 1;
  else if (bounds.area <= 256) histogram.le256 += 1;
  else histogram.gt256 += 1;
}

function mergeSimilarFlatFills(root, options) {
  const stats = {
    colorsBefore: 0,
    colorsAfter: 0,
    pathsChanged: 0
  };
  const representativesByLayer = new Map();
  const beforeColors = new Set();
  const afterColors = new Set();
  const mergeLayers = new Set(["solid-shape", "highlight", "shadow"]);

  for (const path of Array.from(root.querySelectorAll("path"))) {
    const layer = path.getAttribute("data-layer") || "";
    if (!mergeLayers.has(layer)) continue;
    if (path.hasAttribute("data-gradient-fill")) continue;
    if (!elementOpacityIsOpaque(path)) continue;

    const fill = path.getAttribute("fill") || "";
    if (!fill || isUrlPaint(fill)) continue;

    const rgb = svgElementFillRgb(path);
    if (!rgb) continue;

    const colorKey = `${layer}:${rgbToHex(rgb)}`;
    beforeColors.add(colorKey);

    if (!representativesByLayer.has(layer)) representativesByLayer.set(layer, []);
    const representatives = representativesByLayer.get(layer);
    let representative = representatives.find((color) => colorDistanceSq(color, rgb) <= options.colorMergeDistanceSq);
    if (!representative) {
      representative = rgb;
      representatives.push(representative);
    }

    const nextFill = rgbToHex(representative);
    afterColors.add(`${layer}:${nextFill}`);
    if ((path.getAttribute("fill") || "").toLowerCase() !== nextFill) {
      path.setAttribute("fill", nextFill);
      stats.pathsChanged += 1;
    }
  }

  stats.colorsBefore = beforeColors.size;
  stats.colorsAfter = afterColors.size;
  return stats;
}

function elementIsInsideDefs(element) {
  let current = element.parentNode;
  while (current && current.nodeType === 1) {
    if (current.tagName && current.tagName.toLowerCase() === "defs") return true;
    current = current.parentNode;
  }
  return false;
}

function collectUsedDefinitionIds(root) {
  const used = new Set();
  const urlRefPattern = /url\(#([^)]+)\)/g;

  for (const element of Array.from(root.querySelectorAll("*"))) {
    if (elementIsInsideDefs(element)) continue;
    for (const attribute of Array.from(element.attributes || [])) {
      let match;
      while ((match = urlRefPattern.exec(attribute.value))) used.add(match[1]);
      if ((attribute.name === "href" || attribute.name === "xlink:href") && attribute.value.startsWith("#")) {
        used.add(attribute.value.slice(1));
      }
    }
  }

  return used;
}

function pruneUnusedDefinitions(root) {
  const usedIds = collectUsedDefinitionIds(root);
  let removed = 0;

  for (const defs of Array.from(root.querySelectorAll("defs"))) {
    for (const child of Array.from(defs.children)) {
      const id = child.getAttribute("id");
      if (id && !usedIds.has(id)) {
        child.remove();
        removed += 1;
      }
    }
    if (!defs.children.length && !defs.textContent.trim()) {
      defs.remove();
      removed += 1;
    }
  }

  return removed;
}

function optimizeSvgForExport(svg, options = {}) {
  const optimizeOptions = exportOptimizationOptions(options);
  const stats = {
    enabled: optimizeOptions.enabled,
    pathsBefore: countSvgElements(svg, "path"),
    pathsAfter: countSvgElements(svg, "path"),
    bytesBefore: svg.length,
    bytesAfter: svg.length,
    duplicatePathsRemoved: 0,
    tinyBackgroundPathsRemoved: 0,
    detachedMicroPathsRemoved: 0,
    colorMergePathsChanged: 0,
    flatColorsBefore: 0,
    flatColorsAfter: 0,
    unusedDefsRemoved: 0,
    detachedPathSizeHistogram: createPathSizeHistogram(),
    detachedPathLayerHistogram: createPathLayerHistogram(),
    parserError: ""
  };

  if (!stats.enabled) return { svg, stats };

  const parser = new DOMParser();
  const documentRef = parser.parseFromString(svg, "image/svg+xml");
  const parserError = documentRef.querySelector("parsererror");
  const root = documentRef.documentElement;
  if (parserError || !root || root.tagName.toLowerCase() !== "svg") {
    stats.enabled = false;
    stats.parserError = parserError ? parserError.textContent.trim().slice(0, 160) : "No SVG root.";
    return { svg, stats };
  }

  const backgroundColor = options.backgroundColor || [0, 0, 0];
  const seenPaths = new Set();
  for (const path of Array.from(root.querySelectorAll("path"))) {
    if (optimizeOptions.detachedMicroPrune) {
      addPathSizeHistogramEntry(stats.detachedPathSizeHistogram, path);
      addPathLayerHistogramEntry(stats.detachedPathLayerHistogram, path);
    }

    const duplicateKey = pathDuplicateKey(path);
    if (duplicateKey && seenPaths.has(duplicateKey)) {
      path.remove();
      stats.duplicatePathsRemoved += 1;
      continue;
    }
    if (duplicateKey) seenPaths.add(duplicateKey);

    if (pathLooksLikeTinyBackground(path, backgroundColor, optimizeOptions)) {
      path.remove();
      stats.tinyBackgroundPathsRemoved += 1;
      continue;
    }

    if (pathLooksLikeDetachedMicroPath(path, backgroundColor, optimizeOptions)) {
      path.remove();
      stats.detachedMicroPathsRemoved += 1;
    }
  }

  const colorStats = mergeSimilarFlatFills(root, optimizeOptions);
  stats.colorMergePathsChanged = colorStats.pathsChanged;
  stats.flatColorsBefore = colorStats.colorsBefore;
  stats.flatColorsAfter = colorStats.colorsAfter;
  stats.unusedDefsRemoved = pruneUnusedDefinitions(root);
  root.setAttribute("data-export-optimized", "true");
  root.setAttribute("data-export-optimization", "dedupe tiny-bg color-merge prune-defs");

  const optimizedSvg = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(root)}`;
  stats.pathsAfter = countSvgElements(optimizedSvg, "path");
  stats.bytesAfter = optimizedSvg.length;

  return { svg: optimizedSvg, stats };
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not rasterize SVG for difference view."));
    };
    image.src = url;
  });
}

function matteRgb(data, index, matte = [0, 0, 0]) {
  const alpha = data[index + 3] / 255;
  return [
    data[index] * alpha + matte[0] * (1 - alpha),
    data[index + 1] * alpha + matte[1] * (1 - alpha),
    data[index + 2] * alpha + matte[2] * (1 - alpha)
  ];
}

function buildLumaBuffer(imageData) {
  const luma = new Float32Array(imageData.width * imageData.height);
  const data = imageData.data;
  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    luma[pixel] = luminance(matteRgb(data, index));
  }
  return luma;
}

function buildSobelEdgeWeights(imageData) {
  const { width, height } = imageData;
  const luma = buildLumaBuffer(imageData);
  const weights = new Float32Array(width * height);
  let edgePixels = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const tl = luma[i - width - 1];
      const tc = luma[i - width];
      const tr = luma[i - width + 1];
      const ml = luma[i - 1];
      const mr = luma[i + 1];
      const bl = luma[i + width - 1];
      const bc = luma[i + width];
      const br = luma[i + width + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const strength = clamp(Math.hypot(gx, gy) / 720, 0, 1);
      weights[i] = 1 + strength * 5;
      if (strength > 0.08) edgePixels += 1;
    }
  }

  for (let x = 0; x < width; x += 1) {
    weights[x] = 1;
    weights[(height - 1) * width + x] = 1;
  }
  for (let y = 0; y < height; y += 1) {
    weights[y * width] = 1;
    weights[y * width + width - 1] = 1;
  }

  return {
    weights,
    edgePixelRatio: edgePixels / Math.max(1, width * height)
  };
}

function differenceColor(heat) {
  const value = clamp(heat, 0, 1);
  if (value < 0.02) return [0, 0, 0];
  return [
    Math.round(255 * value),
    Math.round(210 * Math.max(0, 1 - Math.abs(value - 0.55) / 0.55) * value),
    Math.round(70 * (1 - value))
  ];
}

async function renderDifferenceView(originalImageData, svg, canvas, options = {}) {
  const { width, height } = originalImageData;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, width, height);

  const rasterCanvas = document.createElement("canvas");
  rasterCanvas.width = width;
  rasterCanvas.height = height;
  const rasterCtx = rasterCanvas.getContext("2d", { willReadFrequently: true });
  rasterCtx.clearRect(0, 0, width, height);

  const svgImage = await loadImageFromBlob(new Blob([svg], { type: "image/svg+xml" }));
  rasterCtx.drawImage(svgImage, 0, 0, width, height);

  const vectorImageData = rasterCtx.getImageData(0, 0, width, height);
  const diffImageData = new ImageData(width, height);
  const original = originalImageData.data;
  const vector = vectorImageData.data;
  const diff = diffImageData.data;
  const edgeWeightData = buildSobelEdgeWeights(originalImageData);
  const edgeWeights = edgeWeightData.weights;
  const maxDistance = Math.sqrt(3 * 255 * 255);
  const hotThreshold = 0.08;
  const backgroundColor = options.backgroundColor || [0, 0, 0];
  const backgroundThresholdSq = (options.backgroundThreshold || 26) ** 2;
  let sum = 0;
  let sumSq = 0;
  let edgeWeightedSum = 0;
  let edgeWeightedSumSq = 0;
  let edgeWeightTotal = 0;
  let maxDelta = 0;
  let hotPixels = 0;
  let backgroundPixels = 0;
  let contaminatedBackgroundPixels = 0;

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

    const [r, g, b] = differenceColor(delta * 5.5);
    diff[index] = r;
    diff[index + 1] = g;
    diff[index + 2] = b;
    diff[index + 3] = delta < 0.01 ? 180 : 255;

    if (pixel % width === 0 || pixel % width === width - 1 || pixel < width || pixel >= width * (height - 1)) {
      diff[index] = 25;
      diff[index + 1] = 32;
      diff[index + 2] = 45;
      diff[index + 3] = 255;
    }
  }

  ctx.putImageData(diffImageData, 0, 0);

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

function extractIsoSegments(field, width, height, iso) {
  const segments = [];
  const at = (x, y) => field[y * width + x];
  const interp = (ax, ay, av, bx, by, bv) => {
    const denom = bv - av;
    const t = Math.abs(denom) < 1e-6 ? 0.5 : (iso - av) / denom;
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  };
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      let code = 0;
      if (tl >= iso) code |= 8;
      if (tr >= iso) code |= 4;
      if (br >= iso) code |= 2;
      if (bl >= iso) code |= 1;
      if (code === 0 || code === 15) continue;

      const T = () => interp(x, y, tl, x + 1, y, tr);
      const R = () => interp(x + 1, y, tr, x + 1, y + 1, br);
      const B = () => interp(x, y + 1, bl, x + 1, y + 1, br);
      const L = () => interp(x, y, tl, x, y + 1, bl);

      switch (code) {
        case 1: case 14: segments.push([L(), B()]); break;
        case 2: case 13: segments.push([B(), R()]); break;
        case 3: case 12: segments.push([L(), R()]); break;
        case 4: case 11: segments.push([T(), R()]); break;
        case 6: case 9: segments.push([T(), B()]); break;
        case 7: case 8: segments.push([L(), T()]); break;
        // Saddle cells: asymptotic decider uses the cell-center value so the two contour
        // lines never cross, guaranteeing every vertex has degree 2 (clean closed loops).
        case 5:
          if ((tl + tr + br + bl) / 4 >= iso) { segments.push([L(), T()]); segments.push([B(), R()]); }
          else { segments.push([T(), R()]); segments.push([L(), B()]); }
          break;
        case 10:
          if ((tl + tr + br + bl) / 4 >= iso) { segments.push([T(), R()]); segments.push([L(), B()]); }
          else { segments.push([L(), T()]); segments.push([B(), R()]); }
          break;
        default: break;
      }
    }
  }
  return segments;
}

function linkSegmentsIntoLoops(segments, width, height) {
  const round = (v) => Math.round(v * 100) / 100;
  const key = (p) => `${round(p[0])},${round(p[1])}`;
  const onBorder = (p) => p[0] <= 0.6 || p[1] <= 0.6 || p[0] >= width - 1.6 || p[1] >= height - 1.6;
  const endpoints = new Map();
  for (let i = 0; i < segments.length; i += 1) {
    for (const p of segments[i]) {
      const k = key(p);
      if (!endpoints.has(k)) endpoints.set(k, []);
      endpoints.get(k).push(i);
    }
  }
  const used = new Array(segments.length).fill(false);
  const loops = [];
  let closedCount = 0;
  let borderCount = 0;
  let openCount = 0;
  const extend = (points, fromTail) => {
    let extended = true;
    while (extended) {
      extended = false;
      const tip = fromTail ? points[points.length - 1] : points[0];
      const candidates = endpoints.get(key(tip)) || [];
      for (const segIdx of candidates) {
        if (used[segIdx]) continue;
        const [a, b] = segments[segIdx];
        const next = key(a) === key(tip) ? b.slice() : a.slice();
        if (fromTail) points.push(next); else points.unshift(next);
        used[segIdx] = true;
        extended = true;
        break;
      }
    }
  };
  for (let i = 0; i < segments.length; i += 1) {
    if (used[i]) continue;
    used[i] = true;
    const points = [segments[i][0].slice(), segments[i][1].slice()];
    extend(points, true);
    extend(points, false);
    const closed = points.length > 2 && key(points[0]) === key(points[points.length - 1]);
    let kind;
    if (closed) { kind = "closed"; closedCount += 1; }
    else if (onBorder(points[0]) && onBorder(points[points.length - 1])) { kind = "border"; borderCount += 1; }
    else { kind = "open"; openCount += 1; }
    loops.push({ points, closed, kind });
  }
  return { loops, closedCount, borderCount, openCount };
}

function renderCoverageField(coverageField, width, height, canvas, scalarField = null) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = new ImageData(width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 18;
    d[i + 1] = 22;
    d[i + 2] = 30;
    d[i + 3] = 255;
  }
  for (const sample of coverageField) {
    if (sample.x < 0 || sample.y < 0 || sample.x >= width || sample.y >= height) continue;
    const idx = (sample.y * width + sample.x) * 4;
    const v = Math.round(clamp(sample.alpha, 0, 1) * 255);
    d[idx] = Math.round(v * 0.45);
    d[idx + 1] = Math.round(v * 0.5);
    d[idx + 2] = Math.round(v * 0.55);
    d[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  let segmentCount = 0;
  let closedLoops = 0;
  let borderLoops = 0;
  let openLoops = 0;
  if (scalarField) {
    const segments = extractIsoSegments(scalarField, width, height, 0.5);
    segmentCount = segments.length;
    const linked = linkSegmentsIntoLoops(segments, width, height);
    closedLoops = linked.closedCount;
    borderLoops = linked.borderCount;
    openLoops = linked.openCount;
    const loopColor = { closed: "rgba(255, 70, 200, 0.95)", border: "rgba(60, 210, 255, 0.95)", open: "rgba(255, 220, 60, 0.95)" };
    ctx.lineWidth = 0.8;
    for (const loop of linked.loops) {
      ctx.strokeStyle = loopColor[loop.kind] || loopColor.open;
      ctx.beginPath();
      const pts = loop.points;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i][0], pts[i][1]);
      if (loop.closed) ctx.closePath();
      ctx.stroke();
    }
  }
  return { segmentCount, closedLoops, borderLoops, openLoops };
}

function renderSegmentationDebug(slic, sourceImageData, canvas) {
  const { labels, width, height } = slic;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const img = new ImageData(width, height);
  const out = img.data;
  const src = sourceImageData.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const idx = i * 4;
      const here = labels[i];
      const boundary =
        (x + 1 < width && labels[i + 1] !== here) ||
        (y + 1 < height && labels[i + width] !== here);
      if (boundary) {
        out[idx] = 255;
        out[idx + 1] = 60;
        out[idx + 2] = 200;
        out[idx + 3] = 255;
      } else {
        out[idx] = Math.round(src[idx] * 0.5 + 9);
        out[idx + 1] = Math.round(src[idx + 1] * 0.5 + 11);
        out[idx + 2] = Math.round(src[idx + 2] * 0.5 + 15);
        out[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function coverageFieldStats(coverageField) {
  if (!coverageField || !coverageField.length) {
    return { count: 0, mean: 0, min: 0, max: 0 };
  }
  let sum = 0;
  let min = 1;
  let max = 0;
  for (const sample of coverageField) {
    sum += sample.alpha;
    if (sample.alpha < min) min = sample.alpha;
    if (sample.alpha > max) max = sample.alpha;
  }
  return { count: coverageField.length, mean: sum / coverageField.length, min, max };
}

function renderPalette(palette, counts) {
  paletteEl.innerHTML = "";
  palette.forEach((color, index) => {
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.background = rgbToHex(color);
    swatch.title = `${rgbToHex(color)} - ${counts[index]} pixels`;
    paletteEl.appendChild(swatch);
  });
}

function loadBenchmarkStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BENCHMARK_STORAGE_KEY) || "");
    if (parsed && parsed.version === 1 && Array.isArray(parsed.runs)) {
      benchmarkStore = {
        version: 1,
        baselineRunId: parsed.baselineRunId || "",
        runs: parsed.runs.slice(0, MAX_BENCHMARK_RUNS)
      };
    }
  } catch (error) {
    benchmarkStore = { version: 1, baselineRunId: "", runs: [] };
  }
}

function saveBenchmarkStore() {
  try {
    localStorage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(benchmarkStore));
  } catch (error) {
    benchmarkSummary.textContent = `Benchmark storage unavailable: ${error.message}`;
  }
}

function imageFingerprint(imageData) {
  const data = imageData.data;
  let hash = 2166136261;
  const stride = Math.max(4, Math.floor(data.length / 4096));
  for (let index = 0; index < data.length; index += stride) {
    hash ^= data[index];
    hash = Math.imul(hash, 16777619);
    hash ^= data[Math.min(index + 1, data.length - 1)];
    hash = Math.imul(hash, 16777619);
    hash ^= data[Math.min(index + 2, data.length - 1)];
    hash = Math.imul(hash, 16777619);
  }
  return `${imageData.width}x${imageData.height}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function estimateSvgPointCount(svg) {
  let total = 0;
  const pathMatches = svg.matchAll(/<path\b[^>]*\sd="([^"]*)"/g);
  for (const match of pathMatches) {
    const commands = parsePathData(match[1]);
    if (commands) {
      total += commands.reduce((sum, command) => sum + Math.floor(command.values.length / 2), 0);
    } else {
      total += Math.floor((match[1].match(/[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) || []).length / 2);
    }
  }

  const rects = countSvgElements(svg, "rect");
  const circles = countSvgElements(svg, "circle");
  const ellipses = countSvgElements(svg, "ellipse");
  return total + rects * 4 + circles * 4 + ellipses * 4;
}

function compactObject(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(compactObject);
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "function" || entry === undefined) continue;
    output[key] = compactObject(entry);
  }
  return output;
}

function buildBenchmarkRun(context) {
  const {
    imageData,
    settings,
    elapsed,
    quantized,
    traced,
    differenceStats,
    gradientCount,
    filterCount,
    svg
  } = context;

  return {
    id: `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    imageName: loadedFileName,
    imageFingerprint: imageFingerprint(imageData),
    settings: {
      engine: selectorState.engine,
      imageType: selectorState.imageType,
      detail: selectorState.detail,
      antiAlias: selectorState.antiAlias,
      subPixelEdges: selectorState.subPixelEdges,
      curveOptimizer: selectorState.curveOptimizer,
      backgroundDetach: selectorState.backgroundDetach,
      colorMode: selectorState.colorMode,
      effects: selectorState.effects,
      paletteForceK: devOptions.paletteForceK,
      paletteOptimize: devOptions.paletteOptimize,
      removeBackground: settings.removeLargestColor,
      maxSize: settings.maxSize,
      colors: settings.colors,
      iterations: settings.iterations
    },
    runtimeMs: elapsed,
    canvas: { width: quantized.width, height: quantized.height },
    complexity: {
      paletteColors: quantized.palette.length,
      pathCount: traced.pathCount,
      nodeEstimate: estimateSvgPointCount(svg),
      svgBytes: svg.length,
      gradients: gradientCount,
      filters: filterCount
    },
    difference: compactObject(differenceStats),
    routerDecision: compactObject(traced.routerDecision),
    layers: compactObject(traced.layerSeparation),
    backgroundDetach: compactObject(traced.backgroundDetach),
    paletteInfo: compactObject(traced.paletteInfo),
    paletteOptimization: compactObject(traced.paletteOptimization),
    regionEngine: compactObject(traced.regionEngine),
    regionOptimization: compactObject(traced.regionOptimization),
    subPixelEdges: compactObject(traced.subPixelEdges),
    curveOptimization: compactObject(traced.curveOptimization),
    edgePolish: compactObject(traced.edgePolish),
    exportOptimization: compactObject(traced.exportOptimization)
  };
}

function recordBenchmarkRun(run) {
  currentBenchmarkRun = run;
  benchmarkStore.runs = [run, ...benchmarkStore.runs.filter((entry) => entry.id !== run.id)].slice(0, MAX_BENCHMARK_RUNS);
  if (benchmarkStore.baselineRunId && !benchmarkStore.runs.some((entry) => entry.id === benchmarkStore.baselineRunId)) {
    benchmarkStore.baselineRunId = "";
  }
  saveBenchmarkStore();
  renderBenchmarkLedger();
}

function benchmarkBaselineRun() {
  return benchmarkStore.runs.find((run) => run.id === benchmarkStore.baselineRunId) || null;
}

function formatPercentMetric(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "n/a";
  if (value > 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function getMetricValue(run, path) {
  return path.split(".").reduce((value, key) => (value && value[key] !== undefined ? value[key] : undefined), run);
}

function metricDisplayValue(value, type) {
  if (type === "percent") return formatPercentMetric(value);
  if (type === "bytes") return formatBytes(value);
  if (!Number.isFinite(value)) return "n/a";
  return Math.round(value).toLocaleString();
}

function metricDeltaText(value, baseline, type) {
  if (!Number.isFinite(value) || !Number.isFinite(baseline)) return "n/a";
  const delta = value - baseline;
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const absDelta = Math.abs(delta);
  if (type === "percent") return `${sign}${(absDelta * 100).toFixed(absDelta < 0.01 ? 2 : 1)} pts`;
  if (type === "bytes") return `${sign}${formatBytes(Math.abs(delta))}`;
  return `${sign}${Math.round(absDelta).toLocaleString()}`;
}

function renderBenchmarkDeltas(run, baseline) {
  benchmarkDelta.innerHTML = "";
  if (!run || !baseline) return;

  const specs = [
    { label: "MAE", path: "difference.meanError", type: "percent" },
    { label: "RMSE", path: "difference.rmse", type: "percent" },
    { label: "Edge RMSE", path: "difference.edgeWeightedRmse", type: "percent" },
    { label: "Hot Pixels", path: "difference.hotPixelRatio", type: "percent" },
    { label: "Bg Contam.", path: "difference.backgroundContaminationRatio", type: "percent" },
    { label: "Paths", path: "complexity.pathCount", type: "count" },
    { label: "Points", path: "complexity.nodeEstimate", type: "count" },
    { label: "SVG Size", path: "complexity.svgBytes", type: "bytes" }
  ];

  for (const spec of specs) {
    const value = getMetricValue(run, spec.path);
    const base = getMetricValue(baseline, spec.path);
    const delta = Number.isFinite(value) && Number.isFinite(base) ? value - base : 0;
    const epsilon = spec.type === "percent" ? 0.00015 : spec.type === "bytes" ? 256 : 1;
    const className = Math.abs(delta) <= epsilon ? "neutral" : delta < 0 ? "good" : "bad";
    const pill = document.createElement("div");
    pill.className = `delta-pill ${className}`;
    const title = document.createElement("strong");
    title.textContent = spec.label;
    const body = document.createElement("span");
    body.textContent = `${metricDisplayValue(value, spec.type)} (${metricDeltaText(value, base, spec.type)})`;
    pill.append(title, body);
    benchmarkDelta.appendChild(pill);
  }
}

function renderBenchmarkLedger() {
  const runCount = benchmarkStore.runs.length;
  const baseline = benchmarkBaselineRun();
  benchmarkRunsEl.innerHTML = "";
  setBaselineButton.disabled = !currentBenchmarkRun;
  compareBaselineButton.disabled = !currentBenchmarkRun || !baseline;
  exportBenchmarkButton.disabled = runCount === 0;
  clearBenchmarkButton.disabled = runCount === 0;

  if (!runCount) {
    benchmarkSummary.textContent = "No benchmark runs yet.";
    benchmarkDelta.innerHTML = "";
    return;
  }

  const current = currentBenchmarkRun || benchmarkStore.runs[0];
  const currentStats = current.difference || {};
  const currentComplexity = current.complexity || {};
  benchmarkSummary.textContent = [
    `${runCount} stored run${runCount === 1 ? "" : "s"}.`,
    baseline ? `Baseline: bg ${baseline.settings.backgroundDetach || "off"}, ${baseline.settings.subPixelEdges}+${baseline.settings.curveOptimizer || "off"} / ${formatPercentMetric(baseline.difference.edgeWeightedRmse)} edge RMSE.` : "No baseline selected.",
    `Current: bg ${current.settings.backgroundDetach || "off"}, ${current.settings.subPixelEdges}+${current.settings.curveOptimizer || "off"} / ${formatPercentMetric(currentStats.edgeWeightedRmse)} edge RMSE, ${currentComplexity.pathCount || 0} paths.`
  ].join(" ");

  renderBenchmarkDeltas(currentBenchmarkRun, baseline);

  for (const run of benchmarkStore.runs.slice(0, 12)) {
    const item = document.createElement("li");
    if (run.id === benchmarkStore.baselineRunId) item.className = "baseline-run";
    const when = new Date(run.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    item.textContent = `${when} - bg ${run.settings.backgroundDetach || "off"}, ${run.settings.subPixelEdges}+${run.settings.curveOptimizer || "off"} - edge ${formatPercentMetric(run.difference.edgeWeightedRmse)}, hot ${formatPercentMetric(run.difference.hotPixelRatio)}, ${run.complexity.pathCount} paths`;
    benchmarkRunsEl.appendChild(item);
  }
}

function setCurrentBenchmarkAsBaseline() {
  if (!currentBenchmarkRun) return;
  benchmarkStore.baselineRunId = currentBenchmarkRun.id;
  saveBenchmarkStore();
  renderBenchmarkLedger();
}

function exportBenchmarkJson() {
  if (!benchmarkStore.runs.length) return;
  const blob = new Blob([JSON.stringify(benchmarkStore, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vector-accuracy-benchmark-runs.json";
  link.click();
  URL.revokeObjectURL(url);
}

function clearBenchmarkRuns() {
  if (!benchmarkStore.runs.length) return;
  if (!confirm("Clear all benchmark runs and the selected baseline?")) return;
  benchmarkStore = { version: 1, baselineRunId: "", runs: [] };
  currentBenchmarkRun = null;
  saveBenchmarkStore();
  renderBenchmarkLedger();
}

async function loadFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    loadedImage = image;
    loadedFileName = file.name.replace(/\.[^.]+$/, "") || "vectorized";
    const maxSize = Number(maxSizeInput?.value) || activePreset().maxSize;
    const result = drawImageToCanvas(image, originalCanvas, maxSize);
    originalMeta.textContent = `${image.naturalWidth} x ${image.naturalHeight} to ${result.width} x ${result.height}`;
    quantizedMeta.textContent = "Ready";
    svgMeta.textContent = "Ready";
    differenceMeta.textContent = "Waiting";
    svgPreview.innerHTML = "";
    differenceCanvas.width = result.width;
    differenceCanvas.height = result.height;
    differenceCanvas.getContext("2d").clearRect(0, 0, differenceCanvas.width, differenceCanvas.height);
    paletteEl.innerHTML = "";
    currentSvg = "";
    currentBenchmarkRun = null;
    renderBenchmarkLedger();
    traceButton.disabled = false;
    downloadButton.disabled = true;
    log(`Loaded ${file.name}\nClick Trace to create a local SVG.`);
    URL.revokeObjectURL(url);
  };
  image.onerror = () => {
    log("Could not load that image.");
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

function loadImageUrl(url, name) {
  const image = new Image();
  image.onload = () => {
    loadedImage = image;
    loadedFileName = name.replace(/\.[^.]+$/, "") || "vectorized";
    const maxSize = clamp(Number(maxSizeInput?.value) || activePreset().maxSize, 64, 1536);
    const result = drawImageToCanvas(image, originalCanvas, maxSize);
    originalMeta.textContent = `${image.naturalWidth} x ${image.naturalHeight} to ${result.width} x ${result.height}`;
    quantizedMeta.textContent = "Ready";
    svgMeta.textContent = "Ready";
    differenceMeta.textContent = "Waiting";
    svgPreview.innerHTML = "";
    differenceCanvas.width = result.width;
    differenceCanvas.height = result.height;
    differenceCanvas.getContext("2d").clearRect(0, 0, differenceCanvas.width, differenceCanvas.height);
    paletteEl.innerHTML = "";
    currentSvg = "";
    currentBenchmarkRun = null;
    renderBenchmarkLedger();
    traceButton.disabled = false;
    downloadButton.disabled = true;
    log(`Loaded ${name}\nClick Trace to create a local SVG.`);
  };
  image.onerror = () => log(`Could not load ${name}.`);
  image.src = url;
}

function loadQueryAsset() {
  const asset = readQueryParam("asset");
  if (!asset) return;
  const normalized = asset.replace(/^\.?\//, "");
  if (!/^assets\/[-\w./]+?\.(png|jpe?g|webp)$/i.test(normalized) || normalized.includes("..")) {
    log(`Ignored invalid benchmark asset path: ${asset}`);
    return;
  }
  const name = normalized.split("/").pop() || "benchmark.png";
  loadImageUrl(`./${normalized}`, name);
}

function backgroundDetachNoOp(imageData, mode = "off", reason = "off") {
  return {
    imageData,
    applied: false,
    selected: false,
    mode,
    reason,
    confidence: 0,
    backgroundColor: [0, 0, 0],
    foregroundPixels: imageData.width * imageData.height,
    sureBackgroundPixels: 0,
    unknownPixels: 0,
    matteEdgePixels: 0,
    backgroundPathsAvoided: 0,
    svgBackgroundLayer: "",
    stats: {
      mode,
      applied: false,
      selected: false,
      reason,
      confidence: 0,
      backgroundColor: "#000000",
      foregroundPixels: imageData.width * imageData.height,
      sureBackgroundPixels: 0,
      unknownPixels: 0,
      matteEdgePixels: 0,
      backgroundPathsAvoided: 0
    }
  };
}

function turnAngleDeviation(a, b, c) {
  const v1x = b[0] - a[0];
  const v1y = b[1] - a[1];
  const v2x = c[0] - b[0];
  const v2y = c[1] - b[1];
  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;
  return Math.abs(Math.atan2(cross, dot));
}

function loopGeometryStats(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let perimeter = 0;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const next = points[(i + 1) % n];
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
    const dx = next[0] - p[0];
    const dy = next[1] - p[1];
    perimeter += Math.hypot(dx, dy);
  }
  const width = Math.max(0, maxX - minX);
  const height = Math.max(0, maxY - minY);
  const area = Math.abs(polygonArea(points));
  const compactness = area > 0 ? (perimeter * perimeter) / (4 * Math.PI * area) : Infinity;
  return { width, height, span: Math.max(width, height), minSpan: Math.min(width, height), area, perimeter, compactness };
}

function adaptiveLoopSimplifyTolerance(points, options) {
  const baseTolerance = Math.max(0, options.simplifyTolerance || 0);
  if (!options.adaptiveSimplify || points.length < 4 || baseTolerance <= 0) return baseTolerance;
  const stats = loopGeometryStats(points);
  const detailTolerance = Math.max(0, Number.isFinite(options.detailSimplifyTolerance)
    ? options.detailSimplifyTolerance
    : baseTolerance * 0.7);
  const largeTolerance = Math.max(baseTolerance, Number.isFinite(options.largeSimplifyTolerance)
    ? options.largeSimplifyTolerance
    : baseTolerance);
  const detailArea = Number.isFinite(options.detailSimplifyArea) ? options.detailSimplifyArea : 900;
  const detailSpan = Number.isFinite(options.detailSimplifySpan) ? options.detailSimplifySpan : 72;
  const thinSpan = Number.isFinite(options.detailThinSpan) ? options.detailThinSpan : 10;
  const complexRatio = Number.isFinite(options.detailComplexityRatio) ? options.detailComplexityRatio : 5.5;
  const largeSpan = Number.isFinite(options.largeSimplifySpan) ? options.largeSimplifySpan : 220;
  const detailLoop =
    stats.area <= detailArea ||
    stats.span <= detailSpan ||
    stats.minSpan <= thinSpan ||
    stats.compactness >= complexRatio;
  if (detailLoop) return Math.min(baseTolerance, detailTolerance);
  if (stats.span >= largeSpan && stats.compactness < 2.8) return largeTolerance;
  return baseTolerance;
}

// Fit a closed loop of points to a smooth cubic-Bezier subpath. Smooth spans use a
// Catmull-Rom -> Bezier conversion; detected corners (sharp turn) stay as line joins.
function loopToSmoothSubpath(points, options) {
  let pts = points.slice();
  if (pts.length > 1 && samePoint(pts[0], pts[pts.length - 1])) pts.pop();
  pts = simplifyClosedLoop(pts, adaptiveLoopSimplifyTolerance(pts, options));
  const n = pts.length;
  if (n < 3) return null;
  const corner = pts.map((p, i) => turnAngleDeviation(pts[(i - 1 + n) % n], p, pts[(i + 1) % n]) > options.cornerAngle);
  const f = (p) => `${formatNumber(p[0])} ${formatNumber(p[1])}`;
  let d = `M ${f(pts[0])}`;
  for (let i = 0; i < n; i += 1) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    if (corner[i] || corner[(i + 1) % n]) {
      d += ` L ${f(p2)}`;
    } else {
      const p0 = pts[(i - 1 + n) % n];
      const p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C ${f(c1)} ${f(c2)} ${f(p2)}`;
    }
  }
  return `${d} Z`;
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// Most common quantized color among interior pixels of a loop (grid-sampled within bbox).
function sampleLoopColor(loop, quantized) {
  const w = quantized.width;
  const h = quantized.height;
  const data = quantized.imageData.data;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of loop) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const stride = Math.max(1, Math.round(Math.min(maxX - minX, maxY - minY) / 12));
  const tally = new Map();
  let bestKey = -1;
  let bestCount = 0;
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(h - 1, Math.ceil(maxY)); y += stride) {
    for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(w - 1, Math.ceil(maxX)); x += stride) {
      if (!pointInPolygon(x + 0.5, y + 0.5, loop)) continue;
      const idx = (y * w + x) * 4;
      const key = (data[idx] << 16) | (data[idx + 1] << 8) | data[idx + 2];
      const count = (tally.get(key) || 0) + 1;
      tally.set(key, count);
      if (count > bestCount) { bestCount = count; bestKey = key; }
    }
  }
  if (bestKey < 0) return null;
  return [(bestKey >> 16) & 255, (bestKey >> 8) & 255, bestKey & 255];
}

function dominantForegroundColor(quantized, backgroundColor) {
  let bestIndex = -1;
  let bestCount = -1;
  for (let i = 0; i < quantized.palette.length; i += 1) {
    if (quantized.counts[i] <= 0) continue;
    if (colorDistanceSq(quantized.palette[i], backgroundColor) < 900) continue;
    if (quantized.counts[i] > bestCount) {
      bestCount = quantized.counts[i];
      bestIndex = i;
    }
  }
  return bestIndex >= 0 ? quantized.palette[bestIndex] : [20, 20, 20];
}

// Coverage engine v0: build the SVG straight from the sub-pixel iso-contour of the
// foreground-probability field. One even-odd path (holes work), single foreground color.
// This is the fg/bg proof; per-region color + true segmentation are the next iterations.
function traceWithCoverageEngine(coverageRecovered, quantized, backgroundColor, options = {}) {
  const width = quantized.width;
  const height = quantized.height;
  const scalarField = coverageRecovered.scalarField;
  const fit = {
    simplifyTolerance: options.detail === "high" ? 0.5 : options.detail === "low" ? 1.0 : 0.75,
    cornerAngle: 1.0,
    minArea: options.detail === "low" ? 6 : 4
  };
  if (!scalarField) {
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"></svg>`, pathCount: 0, loopCount: 0, engineName: "Coverage engine (no field)", skippedBackgroundLabels: 0 };
  }
  const segments = extractIsoSegments(scalarField, width, height, 0.5);
  const linked = linkSegmentsIntoLoops(segments, width, height);
  const fallbackColor = dominantForegroundColor(quantized, backgroundColor);
  const drawable = [];
  let droppedTiny = 0;
  for (const loop of linked.loops) {
    if (loop.kind === "open") { droppedTiny += 1; continue; }
    const area = Math.abs(polygonArea(loop.points));
    if (area < fit.minArea) { droppedTiny += 1; continue; }
    drawable.push({ points: loop.points, area });
  }
  // Painter's order: largest first, so smaller shapes/holes paint on top. A hole loop
  // samples the background color and repaints it over the parent -> holes + multi-color
  // both work without even-odd.
  drawable.sort((a, b) => b.area - a.area);
  let paths = "";
  let usedLoops = 0;
  for (const item of drawable) {
    const d = loopToSmoothSubpath(item.points, fit);
    if (!d) { droppedTiny += 1; continue; }
    const color = sampleLoopColor(item.points, quantized) || fallbackColor;
    paths += `<path d="${d}" fill="${rgbToHex(color)}"/>`;
    usedLoops += 1;
  }
  const bgRect = `<rect width="${width}" height="${height}" fill="${rgbToHex(backgroundColor)}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${bgRect}${paths}</svg>`;
  return {
    svg,
    pathCount: usedLoops,
    loopCount: usedLoops,
    engineName: "Coverage engine (per-loop color)",
    skippedBackgroundLabels: 0,
    coverageEngine: {
      loops: usedLoops,
      droppedTiny,
      totalSegments: segments.length,
      closed: linked.closedCount,
      border: linked.borderCount,
      open: linked.openCount,
      background: rgbToHex(backgroundColor)
    }
  };
}

// Sub-pixel coverage of region r at a pixel, from its anti-aliased original color:
// project the pixel color onto the line between region r's mean color (cr) and the
// neighbouring region's mean color (cs). 1 = fully r, 0 = fully the neighbour, ~0.5 = the edge.
function regionCoverageProjection(src, idx, cr, cs) {
  if (!cs) return 1; // neighbour is an unassigned (-1) pixel -> treat as fully this region
  const dr = cr[0] - cs[0];
  const dg = cr[1] - cs[1];
  const db = cr[2] - cs[2];
  const len2 = dr * dr + dg * dg + db * db;
  if (len2 < 1) return 1;
  const t = ((src[idx] - cs[0]) * dr + (src[idx + 1] - cs[1]) * dg + (src[idx + 2] - cs[2]) * db) / len2;
  return clamp(t, 0, 1);
}

// Sub-sample a region's interior pixels: [x, y, r, g, b].
function sampleRegionPixels(regionLabels, src, width, r, x0, y0, x1, y1) {
  const stride = Math.max(1, Math.round(Math.min(x1 - x0, y1 - y0) / 48));
  const pts = [];
  for (let y = y0; y <= y1; y += stride) {
    for (let x = x0; x <= x1; x += stride) {
      const i = y * width + x;
      if (regionLabels[i] !== r) continue;
      const idx = i * 4;
      pts.push([x, y, src[idx], src[idx + 1], src[idx + 2]]);
    }
  }
  return pts;
}

// Content-adaptive fill: pick the cheapest model that explains a region's color —
// flat, LINEAR gradient, or RADIAL gradient — by comparing fit residual (SSE).
// Radial is what lets shaded spheres/glows be represented (linear can't).
function fitRegionAdaptive(pts) {
  const n = pts.length;
  if (n < 8) return null;
  let mr = 0; let mg = 0; let mb = 0;
  for (const p of pts) { mr += p[2]; mg += p[3]; mb += p[4]; }
  mr /= n; mg /= n; mb /= n;
  let flatSSE = 0;
  for (const p of pts) { const dr = p[2] - mr; const dg = p[3] - mg; const db = p[4] - mb; flatSSE += dr * dr + dg * dg + db * db; }
  const flat = { kind: "flat", color: [mr, mg, mb], sse: flatSSE };
  if (flatSSE / n < 14) return flat; // nearly uniform -> flat

  let best = flat;

  // --- linear plane fit per channel ---
  let Sx = 0; let Sy = 0; let Sxx = 0; let Sxy = 0; let Syy = 0;
  for (const p of pts) { Sx += p[0]; Sy += p[1]; Sxx += p[0] * p[0]; Sxy += p[0] * p[1]; Syy += p[1] * p[1]; }
  const cx = Sx / n; const cy = Sy / n;
  const cxx = Sxx - (Sx * Sx) / n; const cxy = Sxy - (Sx * Sy) / n; const cyy = Syy - (Sy * Sy) / n;
  const det = cxx * cyy - cxy * cxy;
  if (Math.abs(det) > 1e-6) {
    const a = [0, 0, 0]; const b = [0, 0, 0]; const mean = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) {
      let Sv = 0; let Sxv = 0; let Syv = 0;
      for (const p of pts) { const v = p[2 + c]; Sv += v; Sxv += p[0] * v; Syv += p[1] * v; }
      mean[c] = Sv / n;
      const cxv = Sxv - (Sx * Sv) / n; const cyv = Syv - (Sy * Sv) / n;
      a[c] = (cxv * cyy - cyv * cxy) / det;
      b[c] = (cyv * cxx - cxv * cxy) / det;
    }
    let sse = 0;
    for (const p of pts) for (let c = 0; c < 3; c += 1) { const f = mean[c] + a[c] * (p[0] - cx) + b[c] * (p[1] - cy); const d = p[2 + c] - f; sse += d * d; }
    const gx = 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2];
    const gy = 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2];
    const glen = Math.hypot(gx, gy);
    if (glen > 1e-4) {
      const dx = gx / glen; const dy = gy / glen;
      let tmin = Infinity; let tmax = -Infinity;
      for (const p of pts) { const t = (p[0] - cx) * dx + (p[1] - cy) * dy; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
      const slope = [a[0] * dx + b[0] * dy, a[1] * dx + b[1] * dy, a[2] * dx + b[2] * dy];
      const at = (t) => [clamp(Math.round(mean[0] + slope[0] * t), 0, 255), clamp(Math.round(mean[1] + slope[1] * t), 0, 255), clamp(Math.round(mean[2] + slope[2] * t), 0, 255)];
      if (tmax - tmin >= 3) best = pickBetterFit(best, { kind: "linear", sse, x1: cx + dx * tmin, y1: cy + dy * tmin, x2: cx + dx * tmax, y2: cy + dy * tmax, c0: at(tmin), c1: at(tmax) });
    }
  }

  // --- radial fit: center at extreme-luminance pixel, color linear in radius ---
  const meanLuma = 0.299 * mr + 0.587 * mg + 0.114 * mb;
  let ext = pts[0]; let extDev = -1;
  for (const p of pts) { const l = 0.299 * p[2] + 0.587 * p[3] + 0.114 * p[4]; const dv = Math.abs(l - meanLuma); if (dv > extDev) { extDev = dv; ext = p; } }
  const rcx = ext[0]; const rcy = ext[1];
  let Sr = 0; let Srr = 0; let rmax = 0;
  const SrV = [0, 0, 0]; const SV = [0, 0, 0];
  for (const p of pts) { const rad = Math.hypot(p[0] - rcx, p[1] - rcy); Sr += rad; Srr += rad * rad; if (rad > rmax) rmax = rad; for (let c = 0; c < 3; c += 1) { SrV[c] += rad * p[2 + c]; SV[c] += p[2 + c]; } }
  const rden = Srr - (Sr * Sr) / n;
  if (rden > 1e-6 && rmax > 2) {
    const k = [0, 0, 0]; const q = [0, 0, 0];
    for (let c = 0; c < 3; c += 1) { k[c] = (SrV[c] - (Sr * SV[c]) / n) / rden; q[c] = SV[c] / n - k[c] * (Sr / n); }
    let sse = 0;
    for (const p of pts) { const rad = Math.hypot(p[0] - rcx, p[1] - rcy); for (let c = 0; c < 3; c += 1) { const f = q[c] + k[c] * rad; const d = p[2 + c] - f; sse += d * d; } }
    const at = (rad) => [clamp(Math.round(q[0] + k[0] * rad), 0, 255), clamp(Math.round(q[1] + k[1] * rad), 0, 255), clamp(Math.round(q[2] + k[2] * rad), 0, 255)];
    best = pickBetterFit(best, { kind: "radial", sse, cx: rcx, cy: rcy, r: rmax, c0: at(0), c1: at(rmax) });
  }

  // Only commit to a gradient if it clearly beats flat and the stops differ enough.
  if (best.kind !== "flat") {
    if (best.sse > flat.sse * 0.8 || colorDistanceSq(best.c0, best.c1) < 24 * 24) return flat;
  }
  return best;
}

function pickBetterFit(a, b) {
  return b && b.sse < a.sse ? b : a;
}

function regionFillMarkup(fit, id) {
  if (!fit || fit.kind === "flat") return { fill: rgbToHex(fit ? fit.color : [0, 0, 0]), def: "" };
  if (fit.kind === "radial") {
    const def = `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${formatNumber(fit.cx)}" cy="${formatNumber(fit.cy)}" r="${formatNumber(Math.max(1, fit.r))}"><stop offset="0" stop-color="${rgbToHex(fit.c0)}"/><stop offset="1" stop-color="${rgbToHex(fit.c1)}"/></radialGradient>`;
    return { fill: `url(#${id})`, def };
  }
  const def = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${formatNumber(fit.x1)}" y1="${formatNumber(fit.y1)}" x2="${formatNumber(fit.x2)}" y2="${formatNumber(fit.y2)}"><stop offset="0" stop-color="${rgbToHex(fit.c0)}"/><stop offset="1" stop-color="${rgbToHex(fit.c1)}"/></linearGradient>`;
  return { fill: `url(#${id})`, def };
}

// Vectorize a merged region map: each region -> marching-squares iso-contour over its bbox ->
// Bezier-fit loops -> one even-odd path filled with the region's mean color, painter's order.
// When sourceImageData is given, region edges use a SOFT (sub-pixel) membership field so
// boundaries sit at the true anti-aliased crossing instead of on pixel cells (roadmap #3).
function traceRegionsToSvg(regions, options = {}, sourceImageData = null) {
  const { regionLabels, regionCount, regionColor, regionArea, bbox, width, height } = regions;
  const boundary = options.regionBoundary || {};
  const defaultSimplifyTolerance = options.detail === "high" ? 0.5 : options.detail === "low" ? 1.0 : 0.75;
  const fit = {
    simplifyTolerance: Number.isFinite(boundary.simplifyTolerance) ? Math.max(0, boundary.simplifyTolerance) : defaultSimplifyTolerance,
    cornerAngle: Number.isFinite(boundary.cornerAngle) ? boundary.cornerAngle : 1.0,
    minArea: Number.isFinite(boundary.minArea) ? Math.max(1, boundary.minArea) : options.detail === "low" ? 6 : 4,
    iso: Number.isFinite(boundary.iso) ? clamp(boundary.iso, 0.05, 0.95) : 0.5,
    coordinateOffsetX: Number.isFinite(boundary.coordinateOffsetX)
      ? boundary.coordinateOffsetX
      : Number.isFinite(boundary.coordinateOffset)
        ? boundary.coordinateOffset
        : 0,
    coordinateOffsetY: Number.isFinite(boundary.coordinateOffsetY)
      ? boundary.coordinateOffsetY
      : Number.isFinite(boundary.coordinateOffset)
        ? boundary.coordinateOffset
        : 0,
    variantName: boundary.name || "base"
  };
  const order = [];
  for (let r = 0; r < regionCount; r += 1) order.push(r);
  order.sort((a, b) => regionArea[b] - regionArea[a]);
  const bgColor = regionColor[order[0]] || [0, 0, 0];
  let paths = "";
  let defs = "";
  let baseFill = "";
  let used = 0;
  let gradientsUsed = 0;
  let droppedTiny = 0;
  for (const r of order) {
    if (regionArea[r] < fit.minArea) { droppedTiny += 1; continue; }
    const bb = bbox[r];
    const x0 = Math.max(0, bb.minX - 1);
    const y0 = Math.max(0, bb.minY - 1);
    const x1 = Math.min(width - 1, bb.maxX + 1);
    const y1 = Math.min(height - 1, bb.maxY + 1);
    // +1 offset each side so the field ALWAYS has a 0-ring, even when the region touches the
    // image border (e.g. a perimeter frame). Without it the contour can't close at the edge and
    // the even-odd fill floods the interior. (Fix 2026-06-26 [claude]: KOINO logo white-flood bug.)
    const fw = x1 - x0 + 3;
    const fh = y1 - y0 + 3;
    const field = new Float32Array(fw * fh);
    const src = sourceImageData ? sourceImageData.data : null;
    const cr = regionColor[r];
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const i = y * width + x;
        const own = regionLabels[i];
        const fi = (y - y0 + 1) * fw + (x - x0 + 1);
        if (!src) {
          if (own === r) field[fi] = 1;
          continue;
        }
        if (own === r) {
          // edge of r if any 4-neighbour belongs to another region
          let s = -1;
          if (x > 0 && regionLabels[i - 1] !== r) s = regionLabels[i - 1];
          else if (x < width - 1 && regionLabels[i + 1] !== r) s = regionLabels[i + 1];
          else if (y > 0 && regionLabels[i - width] !== r) s = regionLabels[i - width];
          else if (y < height - 1 && regionLabels[i + width] !== r) s = regionLabels[i + width];
          field[fi] = s < 0 ? 1 : regionCoverageProjection(src, i * 4, cr, regionColor[s]);
        } else {
          const adjacent =
            (x > 0 && regionLabels[i - 1] === r) ||
            (x < width - 1 && regionLabels[i + 1] === r) ||
            (y > 0 && regionLabels[i - width] === r) ||
            (y < height - 1 && regionLabels[i + width] === r);
          field[fi] = adjacent ? regionCoverageProjection(src, i * 4, cr, regionColor[own]) : 0;
        }
      }
    }
    const segs = extractIsoSegments(field, fw, fh, fit.iso);
    if (!segs.length) { droppedTiny += 1; continue; }
    const linked = linkSegmentsIntoLoops(segs, fw, fh);
    const subpaths = [];
    for (const loop of linked.loops) {
      if (Math.abs(polygonArea(loop.points)) < fit.minArea) continue;
      const pts = loop.points.map((p) => [p[0] + x0 - 1 + fit.coordinateOffsetX, p[1] + y0 - 1 + fit.coordinateOffsetY]);
      const d = loopToSmoothSubpath(pts, fit);
      if (d) subpaths.push(d);
    }
    if (!subpaths.length) { droppedTiny += 1; continue; }
    let fill = rgbToHex(regionColor[r]);
    if (src) {
      const fit = fitRegionAdaptive(sampleRegionPixels(regionLabels, src, width, r, x0, y0, x1, y1));
      const markup = regionFillMarkup(fit, `rg${r}`);
      fill = markup.fill;
      if (markup.def) { defs += markup.def; gradientsUsed += 1; }
    }
    const d = subpaths.join(" ");
    if (r === order[0]) baseFill = fill; // largest region also paints full-canvas base (kills tiling gaps)
    paths += `<path d="${d}" fill="${fill}" fill-rule="evenodd"/>`;
    used += 1;
  }
  const defsBlock = defs ? `<defs>${defs}</defs>` : "";
  // Base = the largest region's own fill across the whole canvas, so any sub-pixel tiling
  // gaps between regions reveal the real background instead of a flat grey rect.
  const bgRect = `<rect width="${width}" height="${height}" fill="${baseFill || rgbToHex(bgColor)}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defsBlock}${bgRect}${paths}</svg>`;
  return {
    svg,
    pathCount: used,
    loopCount: used,
    engineName: "Region engine (SLIC + merge + adaptive gradients)",
    skippedBackgroundLabels: 0,
    regionEngine: {
      regions: regionCount,
      drawn: used,
      gradients: gradientsUsed,
      droppedTiny,
      boundary: {
        variant: fit.variantName,
        iso: fit.iso,
        simplifyTolerance: fit.simplifyTolerance,
        cornerAngle: fit.cornerAngle,
        coordinateOffsetX: fit.coordinateOffsetX,
        coordinateOffsetY: fit.coordinateOffsetY
      }
    }
  };
}

function regionEngineBaseSettings(imageData, options = {}) {
  const minDim = Math.min(imageData.width, imageData.height);
  const baseRegionSize = clamp(Math.round(minDim / 26), 8, 36);
  const baseMergeThreshold = options.detail === "high" ? 8 : options.detail === "low" ? 16 : 12;
  return {
    regionSize: baseRegionSize,
    mergeThreshold: baseMergeThreshold,
    compactness: 12,
    iterations: 10
  };
}

function regionEngineCandidates(imageData, options = {}) {
  const base = regionEngineBaseSettings(imageData, options);
  const candidate = (name, label, variant = {}) => ({
    name,
    label,
    regionSize: clamp(Math.round(base.regionSize * (variant.regionScale || 1)), 6, 42),
    mergeThreshold: clamp(Math.round(base.mergeThreshold * (variant.mergeScale || 1)), 4, 24),
    compactness: clamp(Math.round(base.compactness * (variant.compactnessScale || 1)), 6, 18),
    iterations: clamp(Math.round(base.iterations + (variant.iterationAdd || 0)), 6, 14)
  });

  const candidates = [
    candidate("base", "Current region settings"),
    candidate("edge-tight", "Tighter boundaries", { regionScale: 0.88, mergeScale: 0.85, compactnessScale: 0.9, iterationAdd: 2 }),
    candidate("color-loose", "More color merging", { regionScale: 1, mergeScale: 1.18, compactnessScale: 1.05 })
  ];

  if (options.detail === "high") {
    candidates.push(candidate("fine-detail", "Fine detail recovery", { regionScale: 0.76, mergeScale: 0.78, compactnessScale: 0.85, iterationAdd: 2 }));
  }

  return candidates;
}

function traceRegionCandidate(segSource, pipelineOptions, candidate) {
  const slic = computeSlicSuperpixels(segSource, {
    regionSize: candidate.regionSize,
    compactness: candidate.compactness,
    iterations: candidate.iterations
  });
  const regions = mergeSuperpixels(slic, segSource, { mergeThreshold: candidate.mergeThreshold });
  const regionTraced = traceRegionsToSvg(regions, pipelineOptions, segSource);
  regionTraced.pathCount = countSvgElements(regionTraced.svg, "path");
  regionTraced.regionEngine = {
    ...regionTraced.regionEngine,
    superpixels: slic.count,
    regionSize: candidate.regionSize,
    mergeThreshold: candidate.mergeThreshold,
    compactness: candidate.compactness,
    iterations: candidate.iterations,
    candidate: candidate.name
  };
  return regionTraced;
}

function regionCandidateBeatsCurrent(candidate, best, base, optimizer) {
  if (!candidate.difference || candidate.difference.error || !best.difference || best.difference.error) return false;
  const edgeDelta = candidate.difference.edgeWeightedRmse - best.difference.edgeWeightedRmse;
  const meanDelta = candidate.difference.meanError - best.difference.meanError;
  const hotDelta = candidate.difference.hotPixelRatio - best.difference.hotPixelRatio;
  const contaminationDelta = candidate.difference.backgroundContaminationRatio - best.difference.backgroundContaminationRatio;
  const complexityOk = candidate.paths <= Math.ceil(base.paths * optimizer.maxPathGrowth);
  const primaryWin = edgeDelta < -optimizer.minEdgeImprovement;
  const tieBreakWin = Math.abs(edgeDelta) <= optimizer.minEdgeImprovement && meanDelta < -optimizer.minMeanImprovement;
  return complexityOk &&
    hotDelta <= optimizer.hotPixelSlack &&
    contaminationDelta <= optimizer.contaminationSlack &&
    (primaryWin || tieBreakWin);
}

// Recompute per-region color/area/bbox after a label map changes (e.g. after splitting).
function computeRegionStats(regionLabels, imageData, regionCount) {
  const { width, height, data } = imageData;
  const rR = new Float64Array(regionCount);
  const rG = new Float64Array(regionCount);
  const rB = new Float64Array(regionCount);
  const rCnt = new Float64Array(regionCount);
  const bbox = [];
  for (let i = 0; i < regionCount; i += 1) bbox[i] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      const reg = regionLabels[i];
      if (reg < 0 || reg >= regionCount) continue;
      const idx = i * 4;
      rR[reg] += data[idx]; rG[reg] += data[idx + 1]; rB[reg] += data[idx + 2]; rCnt[reg] += 1;
      const bb = bbox[reg];
      if (x < bb.minX) bb.minX = x;
      if (x > bb.maxX) bb.maxX = x;
      if (y < bb.minY) bb.minY = y;
      if (y > bb.maxY) bb.maxY = y;
    }
  }
  const regionColor = [];
  const regionArea = [];
  for (let r = 0; r < regionCount; r += 1) {
    const m = rCnt[r] || 1;
    regionColor[r] = [Math.round(rR[r] / m), Math.round(rG[r] / m), Math.round(rB[r] / m)];
    regionArea[r] = rCnt[r];
  }
  return { regionLabels, regionCount, regionColor, regionArea, bbox, width, height };
}

// Split one high-error region into two by 2-means on Lab color. Cluster 1 gets a fresh label.
// Returns the next free label id (unchanged if the split was degenerate / not worthwhile).
function splitRegionInPlace(labels, src, width, r, nextId, bb) {
  const idxs = [];
  for (let y = bb.minY; y <= bb.maxY; y += 1) for (let x = bb.minX; x <= bb.maxX; x += 1) { const i = y * width + x; if (labels[i] === r) idxs.push(i); }
  if (idxs.length < 24) return nextId;
  const lab = new Float32Array(idxs.length * 3);
  let lo = 0; let hi = 0; let loL = 1e9; let hiL = -1;
  for (let j = 0; j < idxs.length; j += 1) {
    const o = idxs[j] * 4;
    const L = rgbToLab(src[o], src[o + 1], src[o + 2]);
    lab[j * 3] = L[0]; lab[j * 3 + 1] = L[1]; lab[j * 3 + 2] = L[2];
    if (L[0] < loL) { loL = L[0]; lo = j; }
    if (L[0] > hiL) { hiL = L[0]; hi = j; }
  }
  let c0 = [lab[lo * 3], lab[lo * 3 + 1], lab[lo * 3 + 2]];
  let c1 = [lab[hi * 3], lab[hi * 3 + 1], lab[hi * 3 + 2]];
  const assign = new Int8Array(idxs.length);
  for (let iter = 0; iter < 6; iter += 1) {
    let s0r = 0; let s0a = 0; let s0b = 0; let n0 = 0; let s1r = 0; let s1a = 0; let s1b = 0; let n1 = 0;
    for (let j = 0; j < idxs.length; j += 1) {
      const L = lab[j * 3]; const A = lab[j * 3 + 1]; const B = lab[j * 3 + 2];
      const d0 = (L - c0[0]) ** 2 + (A - c0[1]) ** 2 + (B - c0[2]) ** 2;
      const d1 = (L - c1[0]) ** 2 + (A - c1[1]) ** 2 + (B - c1[2]) ** 2;
      const a = d1 < d0 ? 1 : 0;
      assign[j] = a;
      if (a) { s1r += L; s1a += A; s1b += B; n1 += 1; } else { s0r += L; s0a += A; s0b += B; n0 += 1; }
    }
    if (!n0 || !n1) return nextId;
    c0 = [s0r / n0, s0a / n0, s0b / n0];
    c1 = [s1r / n1, s1a / n1, s1b / n1];
  }
  const sep = (c0[0] - c1[0]) ** 2 + (c0[1] - c1[1]) ** 2 + (c0[2] - c1[2]) ** 2;
  if (sep < 100) return nextId; // clusters too similar (~<10 deltaE) -> not worth splitting
  let any1 = false;
  for (let j = 0; j < idxs.length; j += 1) if (assign[j] === 1) { labels[idxs[j]] = nextId; any1 = true; }
  return any1 ? nextId + 1 : nextId;
}

// Find high-error regions (by fit residual) and split them; return a refined region map or null.
function refineRegions(regions, segSource, options) {
  const { regionLabels, regionCount, regionArea, bbox, width } = regions;
  const src = segSource.data;
  const minSplitArea = options.detail === "high" ? 160 : options.detail === "low" ? 320 : 240;
  const splitThreshold = 90; // mean squared per-channel residual; above this a single fill is poor
  const maxSplits = 8;
  const errs = [];
  for (let r = 0; r < regionCount; r += 1) {
    if (regionArea[r] < minSplitArea) continue;
    const bb = bbox[r];
    const pts = sampleRegionPixels(regionLabels, src, width, r, bb.minX, bb.minY, bb.maxX, bb.maxY);
    const fit = fitRegionAdaptive(pts);
    if (!fit) continue;
    const spp = fit.sse / Math.max(1, pts.length * 3);
    if (spp > splitThreshold) errs.push({ r, score: spp * Math.log(regionArea[r] + 1) });
  }
  if (!errs.length) return null;
  errs.sort((a, b) => b.score - a.score);
  const newLabels = Int32Array.from(regionLabels);
  let nextId = regionCount;
  let splitCount = 0;
  for (const e of errs.slice(0, maxSplits)) {
    const before = nextId;
    nextId = splitRegionInPlace(newLabels, src, width, e.r, nextId, bbox[e.r]);
    if (nextId > before) splitCount += 1;
  }
  if (!splitCount) return null;
  const refined = computeRegionStats(newLabels, segSource, nextId);
  refined.splitCount = splitCount;
  return refined;
}

// Refinement guard: accept the split only if edge error clearly improves vs current best,
// hot pixels don't worsen materially, and path count stays bounded (looser than the global
// guard because adding detail where it's needed is the whole point).
function refinementBeatsCurrent(refResult, best, base) {
  if (!refResult.difference || refResult.difference.error || !best.difference || best.difference.error) return false;
  const edgeDelta = refResult.difference.edgeWeightedRmse - best.difference.edgeWeightedRmse;
  const hotDelta = refResult.difference.hotPixelRatio - best.difference.hotPixelRatio;
  const pathRatio = refResult.paths / Math.max(1, base.paths);
  return edgeDelta < -0.001 && hotDelta <= 0.005 && pathRatio <= 2.2;
}

// Downscale an ImageData to a max dimension via canvas (high-quality), for fast optimizer eval.
function downscaleImageData(imageData, maxDim) {
  const { width, height } = imageData;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  if (scale >= 1) return imageData;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = width;
  srcCanvas.height = height;
  srcCanvas.getContext("2d").putImageData(imageData, 0, 0);
  const dstCanvas = document.createElement("canvas");
  dstCanvas.width = w;
  dstCanvas.height = h;
  const ctx = dstCanvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(srcCanvas, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

async function optimizeRegionTrace(segSource, referenceImageData, pipelineOptions, backgroundColor) {
  const optimizer = {
    enabled: true,
    minEdgeImprovement: 0.00005,
    minMeanImprovement: 0.00004,
    hotPixelSlack: 0.0005,
    contaminationSlack: 0.0005,
    maxPathGrowth: 1.1
  };
  const guardOptions = { backgroundColor };

  // Downscale-eval: explore candidates on a small copy (fast), trace the winner at full res.
  // regionSize is in pixels so it's scaled by the downscale factor for the eval traces; the
  // ORIGINAL full-res settings are kept on each candidate for the final trace.
  const maxEvalDim = 400;
  const downscaled = Math.max(segSource.width, segSource.height) > maxEvalDim;
  const evalSource = downscaled ? downscaleImageData(segSource, maxEvalDim) : segSource;
  const evalReference = downscaled ? downscaleImageData(referenceImageData, maxEvalDim) : referenceImageData;
  const evalScale = downscaled ? evalSource.width / segSource.width : 1;
  const evalC = (c) => (downscaled ? { ...c, regionSize: clamp(Math.round(c.regionSize * evalScale), 6, 42) } : c);
  const evalTrace = async (candidate) => {
    const traced = traceRegionCandidate(evalSource, pipelineOptions, evalC(candidate));
    let difference = null;
    try { difference = await measureSvgDifference(evalReference, traced.svg, guardOptions); }
    catch (error) { difference = { error: error.message }; }
    return { candidate, traced, difference, paths: traced.pathCount };
  };

  const candidates = regionEngineCandidates(segSource, pipelineOptions);
  const results = [];
  for (const candidate of candidates) { results.push(await evalTrace(candidate)); await nextFrame(); }

  const base = results[0];
  let best = base;
  for (const result of results.slice(1)) {
    if (regionCandidateBeatsCurrent(result, best, base, optimizer)) best = result;
  }

  // Local search (resume of #5, 2026-06-26 [claude]): hill-climb in the neighbourhood of the
  // winning candidate. Perturb regionSize/mergeThreshold/compactness by small steps and keep
  // moving while a neighbour beats current best within the same guards. Bounded by maxEvals.
  const keyOf = (c) => `${c.regionSize}|${c.mergeThreshold}|${c.compactness}|${c.iterations}`;
  const evaluated = new Map();
  for (const result of results) evaluated.set(keyOf(result.candidate), result);
  const maxEvals = 9; // budget: most of the gain comes from the first few neighbours
  const maxRounds = 2;
  let localRounds = 0;
  // Only refine when the global sweep already found a winner worth climbing around. If base
  // won, it's the unperturbed centre — neighbours rarely beat it and it isn't worth the extra
  // candidate traces. This keeps the common case fast and spends compute only when promising.
  let improved = best.candidate.name !== "base";
  while (improved && localRounds < maxRounds && evaluated.size < maxEvals) {
    improved = false;
    localRounds += 1;
    const c = best.candidate;
    const mk = (tag, dRegion, dMerge, dCompact) => ({
      name: `local-${tag}`,
      label: `Local search ${tag}`,
      regionSize: clamp(c.regionSize + dRegion, 6, 42),
      mergeThreshold: clamp(c.mergeThreshold + dMerge, 4, 24),
      compactness: clamp(c.compactness + dCompact, 6, 18),
      iterations: c.iterations
    });
    const neighbours = [
      mk("rs-", -2, 0, 0), mk("rs+", 2, 0, 0),
      mk("mt-", 0, -2, 0), mk("mt+", 0, 2, 0),
      mk("cp-", 0, 0, -2), mk("cp+", 0, 0, 2)
    ];
    for (const nb of neighbours) {
      if (evaluated.size >= maxEvals) break;
      const k = keyOf(nb);
      if (evaluated.has(k)) continue;
      const result = await evalTrace(nb);
      evaluated.set(k, result);
      results.push(result);
      if (regionCandidateBeatsCurrent(result, best, base, optimizer)) { best = result; improved = true; }
      await nextFrame();
    }
  }

  // Per-region micro-candidates (#5 real lever, 2026-06-26 [claude]): split the winner's
  // high-error regions and keep the split only if it clearly improves edge accuracy.
  const refinementInfo = { applied: false, attempted: false, splitRegions: 0 };
  try {
    const s = best.candidate;
    const slicR = computeSlicSuperpixels(evalSource, { regionSize: evalC(s).regionSize, compactness: s.compactness, iterations: s.iterations });
    const regionsR = mergeSuperpixels(slicR, evalSource, { mergeThreshold: s.mergeThreshold });
    const refined = refineRegions(regionsR, evalSource, pipelineOptions);
    if (refined) {
      refinementInfo.attempted = true;
      refinementInfo.splitRegions = refined.splitCount;
      const refinedTraced = traceRegionsToSvg(refined, pipelineOptions, evalSource);
      refinedTraced.pathCount = countSvgElements(refinedTraced.svg, "path");
      let diff = null;
      try { diff = await measureSvgDifference(evalReference, refinedTraced.svg, guardOptions); } catch (error) { diff = { error: error.message }; }
      const refResult = { candidate: { name: "region-split", label: `Per-region split (${refined.splitCount})`, regionSize: s.regionSize, mergeThreshold: s.mergeThreshold, compactness: s.compactness, iterations: s.iterations, split: true }, traced: refinedTraced, difference: diff, paths: refinedTraced.pathCount };
      results.push(refResult);
      refinementInfo.refinedPaths = refResult.paths;
      refinementInfo.refinedEdgeRmse = diff && !diff.error ? diff.edgeWeightedRmse : null;
      refinementInfo.baseEdgeRmse = base.difference && !base.difference.error ? base.difference.edgeWeightedRmse : null;
      if (refinementBeatsCurrent(refResult, best, base)) { best = refResult; refinementInfo.applied = true; }
    }
    await nextFrame();
  } catch (error) {
    refinementInfo.error = error.message;
  }

  const selected = best.candidate.name !== "base";
  const stats = {
    refinement: refinementInfo,
    enabled: optimizer.enabled,
    selected,
    guardReason: selected ? "difference guard selected better region candidate" : "difference guard kept base region candidate",
    candidatesTested: results.length,
    localSearchRounds: localRounds,
    evalDownscaled: downscaled,
    evalDims: downscaled ? `${evalSource.width}x${evalSource.height}` : "full",
    selectedCandidate: best.candidate.name,
    selectedLabel: best.candidate.label,
    baselineEdgeRmse: base.difference?.edgeWeightedRmse,
    selectedEdgeRmse: best.difference?.edgeWeightedRmse,
    baselineMeanError: base.difference?.meanError,
    selectedMeanError: best.difference?.meanError,
    baselineHotPixelRatio: base.difference?.hotPixelRatio,
    selectedHotPixelRatio: best.difference?.hotPixelRatio,
    baselineBackgroundContaminationRatio: base.difference?.backgroundContaminationRatio,
    selectedBackgroundContaminationRatio: best.difference?.backgroundContaminationRatio,
    baselinePaths: base.paths,
    selectedPaths: best.paths,
    maxAllowedPaths: Math.ceil(base.paths * optimizer.maxPathGrowth),
    candidateSummaries: results.map((result) => ({
      name: result.candidate.name,
      label: result.candidate.label,
      regionSize: result.candidate.regionSize,
      mergeThreshold: result.candidate.mergeThreshold,
      compactness: result.candidate.compactness,
      iterations: result.candidate.iterations,
      edgeWeightedRmse: result.difference?.edgeWeightedRmse,
      meanError: result.difference?.meanError,
      hotPixelRatio: result.difference?.hotPixelRatio,
      backgroundContaminationRatio: result.difference?.backgroundContaminationRatio,
      paths: result.paths,
      error: result.difference?.error
    }))
  };

  if (!downscaled) {
    best.traced.regionOptimization = stats;
    return best.traced;
  }

  // Coarse-to-fine: 400px ranking doesn't perfectly predict full-res quality, so promote the
  // top eval candidates (plus base) to FULL resolution and make the final decision there. The
  // full-res base is the floor, so this can only improve on base, never regress it.
  const fullTraceOf = async (cand) => {
    const slicF = computeSlicSuperpixels(segSource, { regionSize: cand.regionSize, compactness: cand.compactness, iterations: cand.iterations });
    let regF = mergeSuperpixels(slicF, segSource, { mergeThreshold: cand.mergeThreshold });
    if (cand.split) { const rf = refineRegions(regF, segSource, pipelineOptions); if (rf) regF = rf; }
    const tr = traceRegionsToSvg(regF, pipelineOptions, segSource);
    tr.pathCount = countSvgElements(tr.svg, "path");
    let diff = null;
    try { diff = await measureSvgDifference(referenceImageData, tr.svg, guardOptions); } catch (error) { diff = { error: error.message }; }
    return { candidate: cand, traced: tr, difference: diff, paths: tr.pathCount };
  };
  const validEval = results.filter((r) => r.difference && !r.difference.error);
  validEval.sort((a, b) => a.difference.edgeWeightedRmse - b.difference.edgeWeightedRmse);
  const promote = [];
  const seenP = new Set();
  const addP = (cand) => {
    const k = `${cand.regionSize}|${cand.mergeThreshold}|${cand.compactness}|${cand.iterations}|${cand.split ? "s" : ""}`;
    if (seenP.has(k)) return;
    seenP.add(k);
    promote.push(cand);
  };
  addP(base.candidate);
  for (const r of validEval) { if (promote.length >= 6) break; addP(r.candidate); }

  const fullResults = [];
  for (const cand of promote) { fullResults.push(await fullTraceOf(cand)); await nextFrame(); }
  const fullBase = fullResults[0];
  let fullBest = fullBase;
  for (const r of fullResults.slice(1)) {
    const beats = r.candidate.split ? refinementBeatsCurrent(r, fullBest, fullBase) : regionCandidateBeatsCurrent(r, fullBest, fullBase, optimizer);
    if (beats) fullBest = r;
  }
  stats.fullResPromoted = promote.length;
  stats.fullResSelectedCandidate = fullBest.candidate.name;
  stats.fullResBaseEdgeRmse = fullBase.difference?.edgeWeightedRmse;
  stats.fullResSelectedEdgeRmse = fullBest.difference?.edgeWeightedRmse;
  stats.fullResSelectedPaths = fullBest.paths;
  fullBest.traced.regionOptimization = stats;
  return fullBest.traced;
}

// === PALETTE ENGINE (flat-logo path, mirrors Vector Magic) ===
function markPaletteTransition(mask, width, height, x, y, radius) {
  for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
    for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
      mask[yy * width + xx] = 1;
    }
  }
}

function buildPaletteTransitionMask(imageData, coverageField = [], options = {}) {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  const coverageRadius = Number.isFinite(options.coverageRadius) ? options.coverageRadius : 1;
  const contrastRadius = Number.isFinite(options.contrastRadius) ? options.contrastRadius : 0;
  const contrastThreshold = Number.isFinite(options.contrastThreshold) ? options.contrastThreshold : 34;
  let coverageMarked = 0;
  let contrastMarked = 0;

  if (Array.isArray(coverageField)) {
    for (const sample of coverageField) {
      if (!sample) continue;
      const x = Math.round(sample.x);
      const y = Math.round(sample.y);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      markPaletteTransition(mask, width, height, x, y, coverageRadius);
      coverageMarked += 1;
    }
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 12) continue;
      if (localContrastFromData(data, width, height, x, y) < contrastThreshold) continue;
      markPaletteTransition(mask, width, height, x, y, contrastRadius);
      contrastMarked += 1;
    }
  }

  let pixels = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) pixels += 1;
  }

  return {
    mask,
    pixels,
    pixelRatio: pixels / Math.max(1, width * height),
    coverageMarked,
    contrastMarked,
    coverageRadius,
    contrastRadius,
    contrastThreshold
  };
}

function selectPaletteLadderEntry(ladder, options = {}) {
  const residualKey = "selectionResidual";
  const aaAware = Boolean(options.aaAware);
  const threshold = options.residualThreshold || (aaAware ? 12 : 9);
  let thresholdChoice = ladder[ladder.length - 1];
  for (const entry of ladder) {
    if (entry[residualKey] <= threshold) {
      thresholdChoice = entry;
      break;
    }
  }

  if (!aaAware || ladder.length < 3) return thresholdChoice;

  const elbowResidual = options.elbowResidualThreshold || 16;
  const elbowRatio = options.elbowRatio || 0.42;
  for (let i = 1; i < ladder.length - 1; i += 1) {
    const prev = ladder[i - 1];
    const curr = ladder[i];
    const next = ladder[i + 1];
    const prevDrop = prev[residualKey] - curr[residualKey];
    const nextDrop = curr[residualKey] - next[residualKey];
    if (curr[residualKey] > elbowResidual) continue;
    if (prevDrop <= 0) continue;
    if (nextDrop <= Math.max(0.75, prevDrop * elbowRatio)) return curr;
  }

  return thresholdChoice;
}

// Weighted mean nearest-center distance of color buckets to a palette (quantization residual).
function paletteResidual(buckets, centers) {
  let sum = 0;
  let wsum = 0;
  for (const b of buckets) {
    let bd = Infinity;
    for (const c of centers) {
      const dr = b.rgb[0] - c[0];
      const dg = b.rgb[1] - c[1];
      const db = b.rgb[2] - c[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) bd = d;
    }
    sum += Math.sqrt(bd) * b.count;
    wsum += b.count;
  }
  return wsum ? sum / wsum : 0;
}

function kmeansPalette(buckets, k, iters) {
  let centers = initializeCenters(buckets, k);
  for (let it = 0; it < iters; it += 1) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const b of buckets) {
      const idx = nearestCenterIndex(b.rgb, centers);
      const w = Math.sqrt(b.count);
      sums[idx][0] += b.rgb[0] * w;
      sums[idx][1] += b.rgb[1] * w;
      sums[idx][2] += b.rgb[2] * w;
      sums[idx][3] += w;
    }
    centers = centers.map((ctr, idx) => {
      const s = sums[idx];
      return s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : ctr;
    });
  }
  return centers.map((c) => c.map(Math.round));
}

// STEP 1: palette ladder — best palette per k, pick the elbow (smallest k that explains the image).
function computePaletteLadder(imageData, options = {}) {
  const fullBuckets = buildColorBuckets(imageData.data);
  const transition = options.aaAware === false
    ? null
    : buildPaletteTransitionMask(imageData, options.coverageField || [], options);
  const transitionOk = transition &&
    transition.pixels > Math.max(32, imageData.width * imageData.height * 0.001) &&
    transition.pixelRatio < 0.45;
  const selectionBuckets = transitionOk
    ? buildColorBuckets(imageData.data, 5, {
        downweightMask: transition.mask,
        downweight: Number.isFinite(options.transitionWeight) ? options.transitionWeight : 0.08
      })
    : fullBuckets;
  const buckets = selectionBuckets.length >= 2 ? selectionBuckets : fullBuckets;
  const aaAware = buckets !== fullBuckets;
  const maxK = Math.min(options.maxK || 16, Math.max(2, buckets.length));
  const ladder = [];
  for (let k = 2; k <= maxK; k += 1) {
    const palette = kmeansPalette(buckets, k, 8);
    const fullResidual = paletteResidual(fullBuckets, palette);
    const coreResidual = paletteResidual(buckets, palette);
    ladder.push({
      k,
      palette,
      residual: fullResidual,
      fullResidual,
      coreResidual,
      selectionResidual: aaAware ? coreResidual : fullResidual
    });
  }
  let chosen = selectPaletteLadderEntry(ladder, { ...options, aaAware });
  if (options.forceK) { const f = ladder.find((e) => e.k === options.forceK); if (f) chosen = f; }
  return {
    ladder,
    chosen,
    selection: {
      aaAware,
      mode: aaAware ? "aa-aware-core" : "full-image",
      transitionPixels: transition?.pixels || 0,
      transitionPixelRatio: transition?.pixelRatio || 0,
      coverageMarked: transition?.coverageMarked || 0,
      contrastMarked: transition?.contrastMarked || 0,
      transitionWeight: aaAware ? Number.isFinite(options.transitionWeight) ? options.transitionWeight : 0.08 : 1,
      residualThreshold: options.residualThreshold || (aaAware ? 12 : 9),
      elbowResidualThreshold: options.elbowResidualThreshold || 16,
      elbowRatio: options.elbowRatio || 0.42,
      bucketCount: fullBuckets.length,
      selectionBucketCount: buckets.length
    }
  };
}

function paletteLadderOptions(coverageField) {
  return {
    maxK: 16,
    forceK: devOptions.paletteForceK,
    coverageField,
    transitionWeight: 0.08
  };
}

function autoRouteFromPaletteLadder(ladder) {
  const chosen = ladder.chosen || {};
  const selection = ladder.selection || {};
  const transitionRatio = selection.transitionPixelRatio || 0;
  const selectedResidual = Number.isFinite(chosen.selectionResidual) ? chosen.selectionResidual : Infinity;
  const fullResidual = Number.isFinite(chosen.fullResidual) ? chosen.fullResidual : Infinity;
  const smallPalette = chosen.k <= 4;
  const coreFits = selectedResidual <= 12.5;
  const fullFits = fullResidual <= 18;
  const edgeSignal = transitionRatio >= 0.006 && transitionRatio <= 0.22;
  const paletteLikely = smallPalette && coreFits && fullFits && edgeSignal;
  const selectedEngine = paletteLikely ? "palette" : "regions";
  const failed = [];
  if (!smallPalette) failed.push(`k ${chosen.k || "n/a"} > 4`);
  if (!coreFits) failed.push(`core residual ${formatNumber(selectedResidual)} > 12.5`);
  if (!fullFits) failed.push(`full residual ${formatNumber(fullResidual)} > 18`);
  if (!edgeSignal) failed.push(`transition ${(transitionRatio * 100).toFixed(1)}% outside flat-logo band`);

  return {
    mode: "auto",
    selectedEngine,
    selectedEngineLabel: engineLabels[selectedEngine],
    reason: paletteLikely ? "small clean palette with strong edge signal" : `palette guard failed: ${failed.join(", ") || "not flat-logo-like"}`,
    paletteK: chosen.k,
    selectionResidual: chosen.selectionResidual,
    coreResidual: chosen.coreResidual,
    fullResidual: chosen.fullResidual,
    transitionPixelRatio: transitionRatio,
    transitionPixels: selection.transitionPixels || 0,
    bucketCount: selection.bucketCount || 0,
    selectionBucketCount: selection.selectionBucketCount || 0,
    colors: Array.isArray(chosen.palette) ? chosen.palette.map(rgbToHex) : []
  };
}

function forcedRouteDecision(engine) {
  return {
    mode: "forced",
    selectedEngine: engine,
    selectedEngineLabel: engineLabels[engine] || engineLabels.experimental,
    reason: "hidden engine override"
  };
}

function quantizeToPalette(imageData, palette) {
  const { data, width, height } = imageData;
  const labels = new Int32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    let best = 0;
    let bd = Infinity;
    for (let c = 0; c < palette.length; c += 1) {
      const pc = palette[c];
      const dr = data[i] - pc[0];
      const dg = data[i + 1] - pc[1];
      const db = data[i + 2] - pc[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; best = c; }
    }
    labels[p] = best;
  }
  return labels;
}

// STEP 2+3: quantize to palette, then per-color connected components -> regions object
// (compatible with traceRegionsToSvg, which supplies the sub-pixel boundary + Bezier finish).
function buildPaletteRegions(imageData, palette, options = {}) {
  const { width, height } = imageData;
  const minArea = options.minArea || 6;
  const palLabels = quantizeToPalette(imageData, palette);
  const regionLabels = new Int32Array(width * height).fill(-1);
  const regionColor = [];
  const regionArea = [];
  const bbox = [];
  let rid = 0;
  for (let c = 0; c < palette.length; c += 1) {
    const comps = findComponentsForLabel(palLabels, width, height, c, minArea);
    for (const comp of comps) {
      for (const idx of comp.pixels) regionLabels[idx] = rid;
      regionColor[rid] = palette[c];
      regionArea[rid] = comp.area;
      bbox[rid] = { minX: comp.bounds.minX, minY: comp.bounds.minY, maxX: comp.bounds.maxX, maxY: comp.bounds.maxY };
      rid += 1;
    }
  }
  return { regionLabels, regionCount: rid, regionColor, regionArea, bbox, width, height };
}

function paletteBoundaryCandidates(options = {}) {
  const baseTolerance = options.detail === "high" ? 0.5 : options.detail === "low" ? 1.0 : 0.75;
  const fineTolerance = Math.min(0.25, baseTolerance);
  const rawTolerance = 0.05;
  return [
    { name: "base", label: "Current placement", variant: { name: "base" } },
    { name: "fine-simplify", label: "Finer simplification", variant: { name: "fine-simplify", simplifyTolerance: fineTolerance } },
    { name: "raw-loop", label: "Near-raw loop", variant: { name: "raw-loop", simplifyTolerance: rawTolerance } },
    { name: "centered", label: "Pixel-center +0.5", variant: { name: "centered", coordinateOffset: 0.5 } },
    { name: "centered-fine", label: "Pixel-center + fine simplify", variant: { name: "centered-fine", coordinateOffset: 0.5, simplifyTolerance: fineTolerance } },
    { name: "centered-raw", label: "Pixel-center + raw loop", variant: { name: "centered-raw", coordinateOffset: 0.5, simplifyTolerance: rawTolerance } },
    { name: "centered-s08", label: "Pixel-center simplify 0.08", variant: { name: "centered-s08", coordinateOffset: 0.5, simplifyTolerance: 0.08 } },
    { name: "centered-s10", label: "Pixel-center simplify 0.10", variant: { name: "centered-s10", coordinateOffset: 0.5, simplifyTolerance: 0.10 } },
    { name: "centered-s12", label: "Pixel-center simplify 0.12", variant: { name: "centered-s12", coordinateOffset: 0.5, simplifyTolerance: 0.12 } },
    { name: "centered-s15", label: "Pixel-center simplify 0.15", variant: { name: "centered-s15", coordinateOffset: 0.5, simplifyTolerance: 0.15 } },
    { name: "centered-s18", label: "Pixel-center simplify 0.18", variant: { name: "centered-s18", coordinateOffset: 0.5, simplifyTolerance: 0.18 } },
    { name: "centered-s20", label: "Pixel-center simplify 0.20", variant: { name: "centered-s20", coordinateOffset: 0.5, simplifyTolerance: 0.20 } },
    { name: "centered-iso45", label: "Pixel-center iso 0.45", variant: { name: "centered-iso45", coordinateOffset: 0.5, simplifyTolerance: fineTolerance, iso: 0.45 } },
    { name: "centered-iso55", label: "Pixel-center iso 0.55", variant: { name: "centered-iso55", coordinateOffset: 0.5, simplifyTolerance: fineTolerance, iso: 0.55 } },
    { name: "tight-corners", label: "Tighter corners", variant: { name: "tight-corners", coordinateOffset: 0.5, simplifyTolerance: fineTolerance, cornerAngle: 0.75 } },
    { name: "tight-corners-s12", label: "Tighter corners simplify 0.12", variant: { name: "tight-corners-s12", coordinateOffset: 0.5, simplifyTolerance: 0.12, cornerAngle: 0.75 } },
    { name: "tight-corners-s12-c065", label: "Tighter corners simplify 0.12 / corner 0.65", variant: { name: "tight-corners-s12-c065", coordinateOffset: 0.5, simplifyTolerance: 0.12, cornerAngle: 0.65 } },
    { name: "tight-corners-s15", label: "Tighter corners simplify 0.15", variant: { name: "tight-corners-s15", coordinateOffset: 0.5, simplifyTolerance: 0.15, cornerAngle: 0.75 } },
    { name: "tight-corners-s15-c065", label: "Tighter corners simplify 0.15 / corner 0.65", variant: { name: "tight-corners-s15-c065", coordinateOffset: 0.5, simplifyTolerance: 0.15, cornerAngle: 0.65 } },
    { name: "tight-corners-s16-c065", label: "Tighter corners simplify 0.16 / corner 0.65", variant: { name: "tight-corners-s16-c065", coordinateOffset: 0.5, simplifyTolerance: 0.16, cornerAngle: 0.65 } },
    { name: "tight-corners-s17-c065", label: "Tighter corners simplify 0.17 / corner 0.65", variant: { name: "tight-corners-s17-c065", coordinateOffset: 0.5, simplifyTolerance: 0.17, cornerAngle: 0.65 } },
    { name: "tight-corners-s18", label: "Tighter corners simplify 0.18", variant: { name: "tight-corners-s18", coordinateOffset: 0.5, simplifyTolerance: 0.18, cornerAngle: 0.75 } },
    { name: "tight-corners-s18-c065", label: "Tighter corners simplify 0.18 / corner 0.65", variant: { name: "tight-corners-s18-c065", coordinateOffset: 0.5, simplifyTolerance: 0.18, cornerAngle: 0.65 } },
    { name: "tight-corners-s18-c060", label: "Tighter corners simplify 0.18 / corner 0.60", variant: { name: "tight-corners-s18-c060", coordinateOffset: 0.5, simplifyTolerance: 0.18, cornerAngle: 0.60 } },
    { name: "tight-corners-s18-c055", label: "Tighter corners simplify 0.18 / corner 0.55", variant: { name: "tight-corners-s18-c055", coordinateOffset: 0.5, simplifyTolerance: 0.18, cornerAngle: 0.55 } },
    { name: "tight-corners-s18-c050", label: "Tighter corners simplify 0.18 / corner 0.50", variant: { name: "tight-corners-s18-c050", coordinateOffset: 0.5, simplifyTolerance: 0.18, cornerAngle: 0.50 } },
    {
      name: "tight-corners-adaptive-s12s18",
      label: "Adaptive detail simplify 0.12/0.18",
      variant: {
        name: "tight-corners-adaptive-s12s18",
        coordinateOffset: 0.5,
        simplifyTolerance: 0.18,
        cornerAngle: 0.75,
        adaptiveSimplify: true,
        detailSimplifyTolerance: 0.12,
        largeSimplifyTolerance: 0.21
      }
    },
    {
      name: "tight-corners-adaptive-s10s18",
      label: "Adaptive detail simplify 0.10/0.18",
      variant: {
        name: "tight-corners-adaptive-s10s18",
        coordinateOffset: 0.5,
        simplifyTolerance: 0.18,
        cornerAngle: 0.75,
        adaptiveSimplify: true,
        detailSimplifyTolerance: 0.10,
        largeSimplifyTolerance: 0.21
      }
    },
    {
      name: "tight-corners-adaptive-c065",
      label: "Adaptive detail simplify / corner 0.65",
      variant: {
        name: "tight-corners-adaptive-c065",
        coordinateOffset: 0.5,
        simplifyTolerance: 0.18,
        cornerAngle: 0.65,
        adaptiveSimplify: true,
        detailSimplifyTolerance: 0.12,
        largeSimplifyTolerance: 0.21
      }
    },
    {
      name: "tight-corners-adaptive-wide-c065",
      label: "Adaptive wide detail simplify / corner 0.65",
      variant: {
        name: "tight-corners-adaptive-wide-c065",
        coordinateOffset: 0.5,
        simplifyTolerance: 0.18,
        cornerAngle: 0.65,
        adaptiveSimplify: true,
        detailSimplifyTolerance: 0.12,
        largeSimplifyTolerance: 0.21,
        detailSimplifySpan: 140,
        detailThinSpan: 18,
        detailComplexityRatio: 3.4
      }
    },
    { name: "tight-corners-s20", label: "Tighter corners simplify 0.20", variant: { name: "tight-corners-s20", coordinateOffset: 0.5, simplifyTolerance: 0.20, cornerAngle: 0.75 } },
    { name: "tight-corners-s21", label: "Tighter corners simplify 0.21", variant: { name: "tight-corners-s21", coordinateOffset: 0.5, simplifyTolerance: 0.21, cornerAngle: 0.75 } },
    { name: "tight-corners-s22", label: "Tighter corners simplify 0.22", variant: { name: "tight-corners-s22", coordinateOffset: 0.5, simplifyTolerance: 0.22, cornerAngle: 0.75 } },
    { name: "tight-corners-s23", label: "Tighter corners simplify 0.23", variant: { name: "tight-corners-s23", coordinateOffset: 0.5, simplifyTolerance: 0.23, cornerAngle: 0.75 } },
    { name: "tight-corners-s24", label: "Tighter corners simplify 0.24", variant: { name: "tight-corners-s24", coordinateOffset: 0.5, simplifyTolerance: 0.24, cornerAngle: 0.75 } },
    { name: "tight-corners-s25", label: "Tighter corners simplify 0.25", variant: { name: "tight-corners-s25", coordinateOffset: 0.5, simplifyTolerance: 0.25, cornerAngle: 0.75 } }
  ];
}

function paletteBoundaryCandidatePassesGuard(candidate, base, optimizer) {
  if (!candidate.difference || candidate.difference.error || !base.difference || base.difference.error) return false;
  const edgeDelta = candidate.difference.edgeWeightedRmse - base.difference.edgeWeightedRmse;
  const meanDelta = candidate.difference.meanError - base.difference.meanError;
  const hotDelta = candidate.difference.hotPixelRatio - base.difference.hotPixelRatio;
  const contaminationDelta = candidate.difference.backgroundContaminationRatio - base.difference.backgroundContaminationRatio;
  const strongVisualWin = candidate.difference.edgeWeightedRmse <= optimizer.strongEdgeThreshold &&
    candidate.difference.edgeWeightedRmse < base.difference.edgeWeightedRmse - optimizer.strongEdgeImprovement;
  const pathOk = candidate.paths <= Math.ceil(base.paths * optimizer.maxPathGrowth);
  const nodeOk = candidate.nodes <= Math.ceil(base.nodes * (strongVisualWin ? optimizer.maxNodeGrowthStrong : optimizer.maxNodeGrowth));
  const primaryWin = edgeDelta < -optimizer.minEdgeImprovement || strongVisualWin;
  const tieBreakWin = Math.abs(edgeDelta) <= optimizer.minEdgeImprovement && meanDelta < -optimizer.minMeanImprovement;
  return pathOk &&
    nodeOk &&
    hotDelta <= optimizer.hotPixelSlack &&
    contaminationDelta <= optimizer.contaminationSlack &&
    (primaryWin || tieBreakWin);
}

function selectPaletteBoundaryResult(results, optimizer) {
  const base = results[0];
  const eligible = results.filter((result, index) => index === 0 || paletteBoundaryCandidatePassesGuard(result, base, optimizer));
  const measured = eligible.filter((result) => result.difference && !result.difference.error);
  if (!optimizer.enabled || measured.length <= 1) return { best: base, bestEdge: base, edgeBandLimit: base.difference?.edgeWeightedRmse || Infinity };

  let bestEdge = measured[0];
  for (const result of measured.slice(1)) {
    if (result.difference.edgeWeightedRmse < bestEdge.difference.edgeWeightedRmse) bestEdge = result;
  }

  const edgeBandLimit = bestEdge.difference.edgeWeightedRmse + optimizer.nodePreferenceEdgeBand;
  const compactEligible = measured.filter((result) =>
    result.difference.edgeWeightedRmse <= edgeBandLimit &&
    result.difference.hotPixelRatio <= bestEdge.difference.hotPixelRatio + optimizer.nodePreferenceHotSlack
  );
  let best = compactEligible[0] || bestEdge;
  for (const result of compactEligible.slice(1)) {
    if (result.nodes < best.nodes || (result.nodes === best.nodes && result.difference.edgeWeightedRmse < best.difference.edgeWeightedRmse)) best = result;
  }
  return { best, bestEdge, edgeBandLimit };
}

async function optimizePaletteTrace(segSource, referenceImageData, pipelineOptions, ladder) {
  const regions = buildPaletteRegions(segSource, ladder.chosen.palette, { minArea: 6 });
  const optimizer = {
    enabled: devOptions.paletteOptimize,
    minEdgeImprovement: 0.00005,
    minMeanImprovement: 0.00003,
    strongEdgeThreshold: 0.035,
    strongEdgeImprovement: 0.03,
    nodePreferenceEdgeBand: 0.0018,
    nodePreferenceHotSlack: 0.001,
    hotPixelSlack: 0.001,
    contaminationSlack: 0.001,
    maxPathGrowth: 1.1,
    maxNodeGrowth: 2.5,
    maxNodeGrowthStrong: 8
  };
  const guardOptions = { backgroundColor: pipelineOptions.backgroundColor };
  const candidates = optimizer.enabled
    ? paletteBoundaryCandidates(pipelineOptions)
    : paletteBoundaryCandidates(pipelineOptions).slice(0, 1);
  const results = [];

  for (const candidate of candidates) {
    const traced = traceRegionsToSvg(regions, {
      ...pipelineOptions,
      regionBoundary: candidate.variant
    }, segSource);
    traced.pathCount = countSvgElements(traced.svg, "path");
    let difference = null;
    try {
      difference = await measureSvgDifference(referenceImageData, traced.svg, guardOptions);
    } catch (error) {
      difference = { error: error.message };
    }
    results.push({
      candidate,
      traced,
      difference,
      paths: traced.pathCount,
      nodes: estimateSvgPointCount(traced.svg)
    });
    if (!optimizer.enabled) break;
    await nextFrame();
  }

  const base = results[0];
  const selection = selectPaletteBoundaryResult(results, optimizer);
  const best = selection.best;
  const bestEdge = selection.bestEdge;

  const selected = best.candidate.name !== "base";
  const stats = {
    enabled: optimizer.enabled,
    selected,
    guardReason: optimizer.enabled
      ? selected ? "edge metric improved" : "metric guard kept base palette boundary"
      : "off",
    candidatesTested: results.length,
    selectedCandidate: best.candidate.name,
    selectedLabel: best.candidate.label,
    bestEdgeCandidate: bestEdge.candidate.name,
    edgeBandLimit: selection.edgeBandLimit,
    nodePreferenceEdgeBand: optimizer.nodePreferenceEdgeBand,
    forcedK: devOptions.paletteForceK,
    selectedK: ladder.chosen.k,
    selectedResidual: ladder.chosen.residual,
    selectedFullResidual: ladder.chosen.fullResidual,
    selectedCoreResidual: ladder.chosen.coreResidual,
    selectedSelectionResidual: ladder.chosen.selectionResidual,
    paletteSelection: ladder.selection,
    regions: regions.regionCount,
    baselineEdgeRmse: base.difference?.edgeWeightedRmse,
    selectedEdgeRmse: best.difference?.edgeWeightedRmse,
    baselineMeanError: base.difference?.meanError,
    selectedMeanError: best.difference?.meanError,
    baselineHotPixelRatio: base.difference?.hotPixelRatio,
    selectedHotPixelRatio: best.difference?.hotPixelRatio,
    baselinePaths: base.paths,
    selectedPaths: best.paths,
    baselineNodes: base.nodes,
    selectedNodes: best.nodes,
    maxAllowedPaths: Math.ceil(base.paths * optimizer.maxPathGrowth),
    maxAllowedNodes: Math.ceil(base.nodes * optimizer.maxNodeGrowth),
    maxAllowedNodesStrong: Math.ceil(base.nodes * optimizer.maxNodeGrowthStrong),
    candidateSummaries: results.map((result) => ({
      name: result.candidate.name,
      label: result.candidate.label,
      edgeWeightedRmse: result.difference?.edgeWeightedRmse,
      meanError: result.difference?.meanError,
      hotPixelRatio: result.difference?.hotPixelRatio,
      backgroundContaminationRatio: result.difference?.backgroundContaminationRatio,
      paths: result.paths,
      nodes: result.nodes,
      error: result.difference?.error
    }))
  };

  best.traced.paletteOptimization = stats;
  return best.traced;
}

function runBackgroundDetach(imageData, options = {}) {
  const mode = options.backgroundDetach || "off";
  if (mode === "off") return backgroundDetachNoOp(imageData, mode, "off");
  if (!window.BackgroundDetach || typeof window.BackgroundDetach.detach !== "function") {
    return backgroundDetachNoOp(imageData, mode, "module unavailable");
  }
  return window.BackgroundDetach.detach(imageData, { mode, removeBackground: options.removeLargestColor });
}

async function runTracePipeline(inputImageData, referenceImageData, traceOptions, colors, iterations, backgroundDetach = null) {
  const pipelineOptions = backgroundDetach?.applied
    ? { ...traceOptions, detachedForeground: true }
    : traceOptions;
  const cleaned = cleanupArtworkImageData(inputImageData, pipelineOptions);
  const filtered = edgePreservingSmoothImageData(cleaned.imageData, pipelineOptions);
  const activeBackgroundColor = backgroundDetach?.applied
    ? backgroundDetach.backgroundColor
    : null;
  const coverageRecovered = recoverAntialiasCoverage(filtered.imageData, pipelineOptions);
  const traceBackgroundColor = activeBackgroundColor || coverageRecovered.backgroundColor;
  const detailProtected = protectSmallDetails(inputImageData, coverageRecovered.imageData, pipelineOptions, traceBackgroundColor);
  const traceImageData = detailProtected.imageData;
  const quantized = quantizeImage(traceImageData, colors, iterations);
  const effectQuantized = coverageRecovered.enabled && pipelineOptions.effects === "preserve"
    ? quantizeImage(filtered.imageData, colors, Math.min(iterations, 8))
    : quantized;
  const segSource = filtered.imageData;
  let paletteLadder = null;
  let routerDecision = null;
  let effectiveEngine = selectorState.engine;

  if (selectorState.engine === "auto") {
    paletteLadder = computePaletteLadder(segSource, paletteLadderOptions(coverageRecovered.coverageField));
    routerDecision = autoRouteFromPaletteLadder(paletteLadder);
    effectiveEngine = routerDecision.selectedEngine;
  } else {
    routerDecision = forcedRouteDecision(selectorState.engine);
  }

  if (effectiveEngine === "coverage") {
    const coverageTraced = traceWithCoverageEngine(coverageRecovered, quantized, traceBackgroundColor, pipelineOptions);
    coverageTraced.pathCount = countSvgElements(coverageTraced.svg, "path");
    coverageTraced.routerDecision = routerDecision;
    return {
      traced: coverageTraced,
      cleaned,
      filtered,
      coverageRecovered: { ...coverageRecovered, backgroundColor: traceBackgroundColor },
      detailProtected,
      quantized,
      effectQuantized,
      softEffects: { fragment: null, pathCount: 0, labelCount: 0 },
      backgroundDetach
    };
  }

  if (effectiveEngine === "palette") {
    const ladder = paletteLadder || computePaletteLadder(segSource, paletteLadderOptions(coverageRecovered.coverageField));
    const paletteTraced = await optimizePaletteTrace(segSource, referenceImageData, {
      ...pipelineOptions,
      backgroundColor: traceBackgroundColor
    }, ladder);
    paletteTraced.pathCount = countSvgElements(paletteTraced.svg, "path");
    paletteTraced.engineName = "Palette engine";
    paletteTraced.routerDecision = routerDecision;
    paletteTraced.paletteInfo = {
      k: ladder.chosen.k,
      residual: ladder.chosen.residual,
      fullResidual: ladder.chosen.fullResidual,
      coreResidual: ladder.chosen.coreResidual,
      selectionResidual: ladder.chosen.selectionResidual,
      colors: ladder.chosen.palette.map(rgbToHex),
      forcedK: devOptions.paletteForceK,
      selection: ladder.selection,
      ladder: ladder.ladder.map((entry) => ({
        k: entry.k,
        residual: entry.residual,
        fullResidual: entry.fullResidual,
        coreResidual: entry.coreResidual,
        selectionResidual: entry.selectionResidual,
        colors: entry.palette.map(rgbToHex)
      }))
    };
    return {
      traced: paletteTraced,
      cleaned,
      filtered,
      coverageRecovered: { ...coverageRecovered, backgroundColor: traceBackgroundColor },
      detailProtected,
      quantized,
      effectQuantized,
      softEffects: { fragment: null, pathCount: 0, labelCount: 0 },
      backgroundDetach
    };
  }

  if (effectiveEngine === "regions") {
    const regionTraced = await optimizeRegionTrace(segSource, referenceImageData, pipelineOptions, traceBackgroundColor);
    regionTraced.routerDecision = routerDecision;
    return {
      traced: regionTraced,
      cleaned,
      filtered,
      coverageRecovered: { ...coverageRecovered, backgroundColor: traceBackgroundColor },
      detailProtected,
      quantized,
      effectQuantized,
      softEffects: { fragment: null, pathCount: 0, labelCount: 0 },
      backgroundDetach
    };
  }

  let traced;
  try {
    if (effectiveEngine === "vtracer") {
      traced = await traceWithVTracer(traceImageData, quantized, pipelineOptions);
    } else if (effectiveEngine === "imagetracer") {
      traced = traceWithImageTracer(traceImageData, quantized, colors, pipelineOptions);
    } else {
      traced = traceToSvg(quantized, pipelineOptions);
    }
  } catch (error) {
    traced = traceToSvg(quantized, pipelineOptions);
    traced.engineName = `${engineLabels[effectiveEngine] || "Selected engine"} failed; ${engineLabels.experimental} fallback`;
    traced.error = error.message;
  }

  traced.engineName ||= engineLabels.experimental;
  traced.routerDecision = routerDecision;
  const softEffects = buildSoftEffectLayer(effectQuantized, pipelineOptions);
  if (softEffects.fragment) {
    traced.svg = injectSvgFragment(traced.svg, softEffects.fragment);
    traced.pathCount += softEffects.pathCount;
  }
  traced.softEffects = softEffects;

  const layered = organizeSvgLayers(traced.svg, { backgroundColor: traceBackgroundColor });
  traced.svg = layered.svg;
  traced.layerSeparation = layered.stats;
  const finalized = await chooseFinalSvg(traced.svg, referenceImageData, {
    ...pipelineOptions,
    backgroundColor: traceBackgroundColor
  });
  traced.svg = finalized.svg;
  if (backgroundDetach?.applied && !pipelineOptions.removeLargestColor) {
    traced.svg = injectDetachedBackgroundLayer(traced.svg, backgroundDetach.svgBackgroundLayer);
  }
  traced.subPixelEdges = finalized.subPixelEdges;
  traced.curveOptimization = finalized.curveOptimization;
  traced.edgePolish = finalized.edgePolish;
  traced.gradientConversion = finalized.gradientConversion;
  traced.exportOptimization = finalized.exportOptimization;
  traced.pathCount = countSvgElements(traced.svg, "path");
  traced.backgroundDetach = backgroundDetach ? compactObject(backgroundDetach.stats || backgroundDetach) : null;

  return {
    traced,
    cleaned,
    filtered,
    coverageRecovered: {
      ...coverageRecovered,
      backgroundColor: traceBackgroundColor
    },
    detailProtected,
    quantized,
    effectQuantized,
    softEffects,
    backgroundDetach
  };
}

function backgroundDetachCandidateSelected(detachedStats, baselineStats, detachedPathCount, baselinePathCount, mode) {
  return backgroundDetachCandidateEvaluation(detachedStats, baselineStats, detachedPathCount, baselinePathCount, mode).selected;
}

function backgroundDetachCandidateEvaluation(detachedStats, baselineStats, detachedPathCount, baselinePathCount, mode) {
  if (!detachedStats || detachedStats.error || !baselineStats || baselineStats.error) {
    return {
      selected: false,
      failures: ["difference unavailable"],
      maxPaths: Math.ceil(baselinePathCount * 1.08) || 0,
      edgeSlack: 0,
      hotSlack: 0,
      contaminationSlack: 0
    };
  }
  const edgeSlack = mode === "force" ? 0.0009 : 0.00035;
  const hotSlack = mode === "force" ? 0.0012 : 0.0006;
  const contaminationSlack = 0.0005;
  const maxPaths = Math.ceil(baselinePathCount * 1.08);
  const pathOk = detachedPathCount <= maxPaths;
  const edgeOk = detachedStats.edgeWeightedRmse <= baselineStats.edgeWeightedRmse + edgeSlack;
  const hotOk = detachedStats.hotPixelRatio <= baselineStats.hotPixelRatio + hotSlack;
  const contaminationOk = detachedStats.backgroundContaminationRatio <= baselineStats.backgroundContaminationRatio + contaminationSlack;
  const failures = [];
  if (!pathOk) failures.push("path growth");
  if (!edgeOk) failures.push("edge RMSE");
  if (!hotOk) failures.push("hot pixels");
  if (!contaminationOk) failures.push("background contamination");
  return {
    selected: pathOk && edgeOk && hotOk && contaminationOk,
    failures,
    maxPaths,
    edgeSlack,
    hotSlack,
    contaminationSlack
  };
}

async function traceCurrentImage() {
  if (!loadedImage || traceInProgress) return;
  traceInProgress = true;
  traceButton.disabled = true;
  downloadButton.disabled = true;
  const start = performance.now();
  const { maxSize, colors, iterations } = currentTraceSettings();
  const original = drawImageToCanvas(loadedImage, originalCanvas, maxSize);
  originalMeta.textContent = `${loadedImage.naturalWidth} x ${loadedImage.naturalHeight} to ${original.width} x ${original.height}`;
  const ctx = originalCanvas.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, original.width, original.height);
  const removeLargestColor = removeBackgroundInput ? removeBackgroundInput.checked : false;
  const traceOptions = {
    removeLargestColor,
    maxSize,
    colors,
    iterations,
    detail: selectorState.detail,
    imageType: selectorState.imageType,
    antiAlias: selectorState.antiAlias,
    subPixelEdges: selectorState.subPixelEdges,
    curveOptimizer: selectorState.curveOptimizer,
    backgroundDetach: selectorState.backgroundDetach,
    effects: selectorState.effects
  };
  log(`Tracing with ${engineLabels[selectorState.engine]}...\nThis can take a few seconds on high-detail artwork.`);
  await nextFrame();
  const backgroundDetach = runBackgroundDetach(imageData, traceOptions);
  let selectedPipeline = null;
  let baselinePipeline = null;
  let detachedPipeline = null;
  let backgroundDetachGuard = null;

  if (backgroundDetach.applied) {
    log(`Background detach ${backgroundDetach.mode} detected ${rgbToHex(backgroundDetach.backgroundColor)} at ${(backgroundDetach.confidence * 100).toFixed(0)}% confidence.\nTracing detached and baseline candidates...`);
    await nextFrame();
    detachedPipeline = await runTracePipeline(backgroundDetach.imageData, imageData, traceOptions, colors, iterations, backgroundDetach);
    baselinePipeline = await runTracePipeline(imageData, imageData, { ...traceOptions, backgroundDetach: "off" }, colors, iterations, backgroundDetachNoOp(imageData, "off", "guard baseline"));

    const detachedDifference = await measureSvgDifference(imageData, detachedPipeline.traced.svg, {
      backgroundColor: backgroundDetach.backgroundColor
    });
    const baselineDifference = await measureSvgDifference(imageData, baselinePipeline.traced.svg, {
      backgroundColor: baselinePipeline.coverageRecovered.backgroundColor
    });
    const detachEvaluation = backgroundDetachCandidateEvaluation(
      detachedDifference,
      baselineDifference,
      detachedPipeline.traced.pathCount,
      baselinePipeline.traced.pathCount,
      backgroundDetach.mode
    );
    const selected = detachEvaluation.selected;
    const detachedTracerOptions = detachedPipeline.traced.tracerOptions || detachedPipeline.traced.vtracerOptions || {};

    backgroundDetachGuard = {
      selected,
      guardReason: selected
        ? "metric guard accepted detached foreground"
        : `metric guard kept original background path: ${detachEvaluation.failures.join(", ")}`,
      guardFailures: detachEvaluation.failures,
      baselineEdgeRmse: baselineDifference.edgeWeightedRmse,
      detachedEdgeRmse: detachedDifference.edgeWeightedRmse,
      baselineHotPixelRatio: baselineDifference.hotPixelRatio,
      detachedHotPixelRatio: detachedDifference.hotPixelRatio,
      baselineBackgroundContaminationRatio: baselineDifference.backgroundContaminationRatio,
      detachedBackgroundContaminationRatio: detachedDifference.backgroundContaminationRatio,
      baselinePaths: baselinePipeline.traced.pathCount,
      detachedPaths: detachedPipeline.traced.pathCount,
      maxAllowedPaths: detachEvaluation.maxPaths,
      detachedTraceProfile: {
        ltres: detachedTracerOptions.ltres,
        qtres: detachedTracerOptions.qtres,
        pathomit: detachedTracerOptions.pathomit,
        linefilter: detachedTracerOptions.linefilter,
        colorquantcycles: detachedTracerOptions.colorquantcycles
      },
      detachedExportOptimization: compactObject(detachedPipeline.traced.exportOptimization)
    };
    selectedPipeline = selected ? detachedPipeline : baselinePipeline;
    selectedPipeline.traced.backgroundDetach = {
      ...(backgroundDetach.stats || {}),
      selected,
      guardReason: backgroundDetachGuard.guardReason,
      guardBaselineEdgeRmse: baselineDifference.edgeWeightedRmse,
      guardDetachedEdgeRmse: detachedDifference.edgeWeightedRmse,
      guardBaselineHotPixelRatio: baselineDifference.hotPixelRatio,
      guardDetachedHotPixelRatio: detachedDifference.hotPixelRatio,
      guardBaselinePaths: baselinePipeline.traced.pathCount,
      guardDetachedPaths: detachedPipeline.traced.pathCount,
      guardMaxAllowedPaths: detachEvaluation.maxPaths,
      guardFailures: detachEvaluation.failures,
      detachedTraceProfile: compactObject(backgroundDetachGuard.detachedTraceProfile),
      detachedExportOptimization: compactObject(backgroundDetachGuard.detachedExportOptimization)
    };
  } else {
    selectedPipeline = await runTracePipeline(imageData, imageData, traceOptions, colors, iterations, backgroundDetach);
    selectedPipeline.traced.backgroundDetach = {
      ...(backgroundDetach.stats || {}),
      selected: false
    };
  }

  const {
    traced,
    cleaned,
    filtered,
    coverageRecovered,
    detailProtected,
    quantized,
    softEffects
  } = selectedPipeline;

  quantizedCanvas.width = quantized.width;
  quantizedCanvas.height = quantized.height;
  quantizedCanvas.getContext("2d").putImageData(quantized.imageData, 0, 0);
  currentSvg = traced.svg;
  svgPreview.innerHTML = currentSvg;
  renderPalette(quantized.palette, quantized.counts);
  let differenceStats = null;
  try {
    differenceStats = await renderDifferenceView(imageData, currentSvg, differenceCanvas, {
      backgroundColor: coverageRecovered.backgroundColor
    });
    differenceMeta.textContent = `MAE ${(differenceStats.meanError * 100).toFixed(2)}%, edge ${(differenceStats.edgeWeightedRmse * 100).toFixed(2)}%, hot ${(differenceStats.hotPixelRatio * 100).toFixed(1)}%`;
  } catch (error) {
    differenceMeta.textContent = "Unavailable";
    differenceStats = { error: error.message };
  }

  // Step 1/2a (coverage map + sub-pixel boundary): debug visualization.
  const coverageField = coverageRecovered.coverageField || [];
  const coverageStats = coverageFieldStats(coverageField);
  let boundarySegmentCount = 0;
  let boundaryClosedLoops = 0;
  let boundaryBorderLoops = 0;
  let boundaryOpenLoops = 0;
  let segmentationCount = 0;
  if (showSegmentationInput && showSegmentationInput.checked) {
    const regionSize = Math.max(6, Math.round(Math.min(quantized.width, quantized.height) / 22));
    const slic = computeSlicSuperpixels(imageData, { regionSize, compactness: 12, iterations: 10 });
    segmentationCount = slic.count;
    renderSegmentationDebug(slic, imageData, coverageCanvas);
    coverageMeta.textContent = `Segmentation: ${slic.count} SLIC superpixels (region ~${regionSize}px)`;
  } else if (showCoverageMapInput && showCoverageMapInput.checked && coverageField.length) {
    const coverageRender = renderCoverageField(coverageField, quantized.width, quantized.height, coverageCanvas, coverageRecovered.scalarField);
    boundarySegmentCount = coverageRender.segmentCount;
    boundaryClosedLoops = coverageRender.closedLoops;
    boundaryBorderLoops = coverageRender.borderLoops;
    boundaryOpenLoops = coverageRender.openLoops;
    coverageMeta.textContent = `${coverageStats.count} samples | ${boundaryClosedLoops} closed, ${boundaryBorderLoops} border, ${boundaryOpenLoops} open`;
  } else if (coverageCanvas) {
    coverageCanvas.getContext("2d").clearRect(0, 0, coverageCanvas.width, coverageCanvas.height);
    coverageMeta.textContent = coverageField.length
      ? `${coverageStats.count} samples captured (debug overlay hidden in focused UI)`
      : "Off (needs blended-edge artwork, anti-aliasing on)";
  }

  const elapsed = Math.round(performance.now() - start);
  const gradientCount = countSvgElements(currentSvg, "linearGradient") + countSvgElements(currentSvg, "radialGradient");
  const filterCount = countSvgElements(currentSvg, "filter");
  quantizedMeta.textContent = `${quantized.palette.length} colors`;
  svgMeta.textContent = traced.componentCount
    ? `${traced.pathCount} paths, ${traced.componentCount} components, ${traced.loopCount} loops`
    : `${traced.pathCount} paths`;
  downloadButton.disabled = false;
  const benchmarkRun = buildBenchmarkRun({
    imageData,
    settings: traceOptions,
    elapsed,
    quantized,
    traced,
    differenceStats,
    gradientCount,
    filterCount,
    svg: currentSvg
  });
  recordBenchmarkRun(benchmarkRun);
  const logLines = [
    `Trace completed in ${elapsed} ms`,
    `Engine: ${traced.engineName}`,
    `Image type: ${imageTypeLabels[selectorState.imageType]}`,
    `Detail level: ${selectorState.detail}`,
    `Anti-aliasing: ${antiAliasLabels[selectorState.antiAlias]}`,
    `Sub-pixel edges: ${subPixelEdgeLabels[selectorState.subPixelEdges]}`,
    `Curve optimizer: ${curveOptimizerLabels[selectorState.curveOptimizer]}`,
    `Background detach: ${backgroundDetachLabels[selectorState.backgroundDetach]}`,
    `Color effects: ${effectLabels[selectorState.effects]}`,
    `Colors mode: ${selectorState.colorMode}${selectorState.colorMode === "unlimited" ? ` (adaptive V0 palette: ${colors})` : ""}`,
    `Canvas: ${quantized.width} x ${quantized.height}`,
    `Colors: ${quantized.palette.length}`,
    `Artwork cleanup: ${cleaned.flattenedPixels} neutral pixels, ${cleaned.specklesRemoved} isolated speckles`,
    `Edge-preserving filter: ${filtered.enabled ? `${filtered.smoothedPixels} pixels, radius ${filtered.radius}, color sigma ${filtered.sigmaColor}` : "off"}`,
    `Coverage edge recovery: ${coverageRecovered.enabled ? `${coverageRecovered.edgePixels} edge pixels (${coverageRecovered.snappedToBackground} to bg, ${coverageRecovered.snappedToForeground} to fg), bg ${rgbToHex(coverageRecovered.backgroundColor)}` : "off"}`,
    `Coverage map (step 1): ${coverageStats.count} sub-pixel samples captured${coverageStats.count ? `, alpha mean ${coverageStats.mean.toFixed(2)} (min ${coverageStats.min.toFixed(2)}, max ${coverageStats.max.toFixed(2)})` : ""}`,
    `Sub-pixel boundary (step 2a/2b): ${boundarySegmentCount ? `${boundarySegmentCount} segments -> ${boundaryClosedLoops} closed, ${boundaryBorderLoops} border, ${boundaryOpenLoops} open` : "debug overlay hidden in focused UI"}`,
    `Segmentation (step 1 of VM roadmap): ${segmentationCount ? `${segmentationCount} SLIC superpixels (Lab)` : "Region engine uses SLIC internally"}`,
    `Small detail protection: ${detailProtected.enabled ? `${detailProtected.restoredPixels} pixels restored across ${detailProtected.protectedComponents} protected components (${detailProtected.candidateComponents} candidates)` : "off"}`,
    `Background mode: ${removeLargestColor ? "transparent, clustered" : "solid rect, clustered"}`,
    `Background labels merged/skipped: ${traced.skippedBackgroundLabels}`,
    `SVG paths: ${traced.pathCount}`,
    `SVG gradients: ${gradientCount}`,
    `SVG filters: ${filterCount}`,
    `Soft effect layer: ${softEffects.pathCount} blurred paths from ${softEffects.labelCount} near-background color labels`,
  ];
  if (traced.backgroundDetach) {
    const detach = traced.backgroundDetach;
    const detachDecision = detach.guardReason || detach.reason || "no reason";
    const detachStatus = detach.applied ? detach.selected ? "applied, selected" : "applied, rejected" : "skipped";
    logLines.push(
      `Background detach result: ${detachStatus} (${detachDecision})`,
      `Background detach stats: confidence ${Number.isFinite(detach.confidence) ? (detach.confidence * 100).toFixed(0) : "n/a"}%, bg ${detach.backgroundColor || "n/a"}, foreground ${detach.foregroundPixels || 0}, unknown ${detach.unknownPixels || 0} (${detach.backgroundUnknownPixels || 0} bg-side / ${detach.foregroundUnknownPixels || 0} fg-side), matte edge ${detach.matteEdgePixels || 0}, avoided ${detach.backgroundPathsAvoided || 0} bg paths`,
      `Background detach matte: ${detach.matteMethod || "n/a"}, local ${(Number.isFinite(detach.matteSampleRatio) ? detach.matteSampleRatio * 100 : 0).toFixed(0)}%, solid fg-side ${detach.foregroundSideSolidPixels || 0} (${detach.foregroundSideSolidPreservedPixels || 0} preserved), samples ${detach.localForegroundSamples || 0}, fallback ${detach.fallbackForegroundSamples || 0}, recon RMSE ${(Number.isFinite(detach.matteReconstructionRmse) ? detach.matteReconstructionRmse * 100 : 0).toFixed(2)}%`
    );
    if (Number.isFinite(detach.guardBaselineEdgeRmse) && Number.isFinite(detach.guardDetachedEdgeRmse)) {
      logLines.push(
        `Background detach guard: edge RMSE baseline ${(detach.guardBaselineEdgeRmse * 100).toFixed(2)}%, detached ${(detach.guardDetachedEdgeRmse * 100).toFixed(2)}%; hot baseline ${(detach.guardBaselineHotPixelRatio * 100).toFixed(1)}%, detached ${(detach.guardDetachedHotPixelRatio * 100).toFixed(1)}%; paths ${detach.guardBaselinePaths} -> ${detach.guardDetachedPaths}${detach.guardMaxAllowedPaths ? ` (max ${detach.guardMaxAllowedPaths})` : ""}`,
        `Background detach guard failures: ${Array.isArray(detach.guardFailures) && detach.guardFailures.length ? detach.guardFailures.join(", ") : "none"}`
      );
    }
    if (detach.detachedTraceProfile) {
      logLines.push(
        `Background detach trace profile: threshold ${formatNumber(detach.detachedTraceProfile.ltres || 0)}, path omit ${detach.detachedTraceProfile.pathomit ?? "n/a"}, line filter ${detach.detachedTraceProfile.linefilter ? "on" : "off"}, color cycles ${detach.detachedTraceProfile.colorquantcycles ?? "n/a"}`
      );
    }
    if (detach.detachedExportOptimization) {
      const candidateExport = detach.detachedExportOptimization;
      const histogram = candidateExport.detachedPathSizeHistogram || {};
      const layerHistogram = candidateExport.detachedPathLayerHistogram || {};
      logLines.push(
        `Background detach export cleanup: ${candidateExport.pathsBefore || 0} -> ${candidateExport.pathsAfter || 0} paths, detached micro removed ${candidateExport.detachedMicroPathsRemoved || 0}`,
        `Background detach path sizes: <=1 ${histogram.le1 || 0}, <=4 ${histogram.le4 || 0}, <=16 ${histogram.le16 || 0}, <=64 ${histogram.le64 || 0}, <=256 ${histogram.le256 || 0}, >256 ${histogram.gt256 || 0}, unsupported ${histogram.unsupported || 0}`,
        `Background detach path layers: bg ${layerHistogram.background || 0}, solid ${layerHistogram.solidShape || 0}, highlight ${layerHistogram.highlight || 0}, shadow ${layerHistogram.shadow || 0}, soft ${layerHistogram.softEffect || 0}, ordered ${layerHistogram.orderedTrace || 0}, none ${layerHistogram.none || 0}, other ${layerHistogram.other || 0}`
      );
    }
  }
  if (traced.routerDecision) {
    const route = traced.routerDecision;
    const autoDetail = route.mode === "auto"
      ? `; k=${route.paletteK || "n/a"}, core ${formatNumber(route.coreResidual)}, full ${formatNumber(route.fullResidual)}, transition ${((route.transitionPixelRatio || 0) * 100).toFixed(1)}%`
      : "";
    logLines.push(
      `Auto router: ${route.mode === "auto" ? "selected" : "forced"} ${route.selectedEngineLabel || route.selectedEngine || "engine"} (${route.reason || "no reason"}${autoDetail})`
    );
  }
  if (traced.regionOptimization) {
    const region = traced.regionOptimization;
    logLines.push(
      `Region optimizer: ${region.selected ? `selected ${region.selectedCandidate}` : "kept base"} after ${region.candidatesTested || 0} candidates (${region.guardReason || "no guard reason"})`,
      `Region optimizer metrics: edge ${(Number.isFinite(region.baselineEdgeRmse) ? region.baselineEdgeRmse * 100 : 0).toFixed(2)}% -> ${(Number.isFinite(region.selectedEdgeRmse) ? region.selectedEdgeRmse * 100 : 0).toFixed(2)}%, hot ${(Number.isFinite(region.baselineHotPixelRatio) ? region.baselineHotPixelRatio * 100 : 0).toFixed(1)}% -> ${(Number.isFinite(region.selectedHotPixelRatio) ? region.selectedHotPixelRatio * 100 : 0).toFixed(1)}%, paths ${region.baselinePaths || 0} -> ${region.selectedPaths || 0} (max ${region.maxAllowedPaths || 0})`
    );
    if (Array.isArray(region.candidateSummaries)) {
      logLines.push(`Region candidates: ${region.candidateSummaries.map((candidate) => `${candidate.name} edge ${(Number.isFinite(candidate.edgeWeightedRmse) ? candidate.edgeWeightedRmse * 100 : 0).toFixed(2)}%, hot ${(Number.isFinite(candidate.hotPixelRatio) ? candidate.hotPixelRatio * 100 : 0).toFixed(1)}%, paths ${candidate.paths}`).join("; ")}`);
    }
  }
  if (traced.paletteInfo) {
    const palette = traced.paletteInfo;
    const selectionMode = palette.selection?.mode || "full-image";
    const residualNote = Number.isFinite(palette.coreResidual)
      ? `, core residual ${formatNumber(palette.coreResidual)}, full residual ${formatNumber(palette.fullResidual)}`
      : "";
    logLines.push(
      `Palette engine: k=${palette.k}${Number.isFinite(palette.forcedK) ? ` (forced ${palette.forcedK})` : ""}, ${selectionMode} residual ${formatNumber(palette.selectionResidual || palette.residual)}${residualNote}, colors ${Array.isArray(palette.colors) ? palette.colors.join(", ") : "n/a"}`
    );
    if (palette.selection?.aaAware) {
      logLines.push(
        `Palette AA selection: downweighted ${palette.selection.transitionPixels || 0} transition pixels (${((palette.selection.transitionPixelRatio || 0) * 100).toFixed(1)}%), coverage samples ${palette.selection.coverageMarked || 0}, contrast samples ${palette.selection.contrastMarked || 0}, weight ${formatNumber(palette.selection.transitionWeight || 0)}`
      );
    }
  }
  if (traced.paletteOptimization) {
    const paletteOpt = traced.paletteOptimization;
    const compactNote = Number.isFinite(paletteOpt.nodePreferenceEdgeBand)
      ? `; best edge ${paletteOpt.bestEdgeCandidate || paletteOpt.selectedCandidate}, compact band +${(paletteOpt.nodePreferenceEdgeBand * 100).toFixed(2)} pts`
      : "";
    logLines.push(
      `Palette boundary optimizer: ${paletteOpt.selected ? `selected ${paletteOpt.selectedCandidate}` : "kept base"} after ${paletteOpt.candidatesTested || 0} candidates (${paletteOpt.guardReason || "no guard reason"}${compactNote})`,
      `Palette boundary metrics: edge ${(Number.isFinite(paletteOpt.baselineEdgeRmse) ? paletteOpt.baselineEdgeRmse * 100 : 0).toFixed(2)}% -> ${(Number.isFinite(paletteOpt.selectedEdgeRmse) ? paletteOpt.selectedEdgeRmse * 100 : 0).toFixed(2)}%, hot ${(Number.isFinite(paletteOpt.baselineHotPixelRatio) ? paletteOpt.baselineHotPixelRatio * 100 : 0).toFixed(1)}% -> ${(Number.isFinite(paletteOpt.selectedHotPixelRatio) ? paletteOpt.selectedHotPixelRatio * 100 : 0).toFixed(1)}%, paths ${paletteOpt.baselinePaths || 0} -> ${paletteOpt.selectedPaths || 0}, nodes ${paletteOpt.baselineNodes || 0} -> ${paletteOpt.selectedNodes || 0}`
    );
    if (Array.isArray(paletteOpt.candidateSummaries)) {
      logLines.push(`Palette boundary candidates: ${paletteOpt.candidateSummaries.map((candidate) => `${candidate.name} edge ${(Number.isFinite(candidate.edgeWeightedRmse) ? candidate.edgeWeightedRmse * 100 : 0).toFixed(2)}%, hot ${(Number.isFinite(candidate.hotPixelRatio) ? candidate.hotPixelRatio * 100 : 0).toFixed(1)}%, paths ${candidate.paths}, nodes ${candidate.nodes}`).join("; ")}`);
    }
  }
  if (differenceStats && !differenceStats.error) {
    logLines.push(
      `Difference view: MAE ${(differenceStats.meanError * 100).toFixed(2)}%, RMSE ${(differenceStats.rmse * 100).toFixed(2)}%, max ${(differenceStats.maxError * 100).toFixed(1)}%, hot pixels ${(differenceStats.hotPixelRatio * 100).toFixed(1)}%`,
      `Edge-weighted difference: MAE ${(differenceStats.edgeWeightedMeanError * 100).toFixed(2)}%, RMSE ${(differenceStats.edgeWeightedRmse * 100).toFixed(2)}%, edge pixels ${(differenceStats.edgePixelRatio * 100).toFixed(1)}%`,
      `Background contamination: ${(differenceStats.backgroundContaminationRatio * 100).toFixed(2)}% (${differenceStats.contaminatedBackgroundPixels}/${differenceStats.backgroundPixels})`
    );
  } else if (differenceStats?.error) {
    logLines.push(`Difference view: unavailable (${differenceStats.error})`);
  }
  if (traced.componentCount) {
    logLines.push(
      `Components kept: ${traced.componentCount}`,
      `Boundary loops: ${traced.loopCount}`,
      `Min component area: ${traced.minComponentArea}px`,
      `Loop smoothing: ${traced.smooth ? "quadratic" : "line"}, tolerance ${formatNumber(traced.tolerance)}`
    );
  }
  if (traced.tracerOptions) {
    logLines.push(
      `Line threshold: ${traced.tracerOptions.ltres}`,
      `Curve threshold: ${traced.tracerOptions.qtres}`,
      `Path omit: ${traced.tracerOptions.pathomit}`,
      `Stroke width: ${traced.tracerOptions.strokewidth}`,
      `Blur radius: ${traced.tracerOptions.blurradius}`,
      `Blur delta: ${traced.tracerOptions.blurdelta}`,
      `Color cycles: ${traced.tracerOptions.colorquantcycles}`
    );
  }
  if (traced.pathRefinement) {
    const refinement = traced.pathRefinement;
    logLines.push(
      `Path refinement: ${refinement.enabled ? `${refinement.refinedSubpaths} loops, ${refinement.pointsBefore} -> ${refinement.pointsAfter} points, ${refinement.cubicSegments} cubic spans` : "off"}`,
      `Path refinement tolerance: ${formatNumber(refinement.tolerance)}, corner angle ${formatNumber(refinement.cornerAngle)} deg`
    );
  }
  if (traced.layerSeparation) {
    const layers = traced.layerSeparation;
    logLines.push(
      `Layer separation: background ${layers.background}, solid ${layers.solid}, highlights ${layers.highlight}, shadows ${layers.shadow}, soft effects ${layers.softEffect}`,
      `Layer model: ${layers.enabled ? "background + ordered trace + soft effects" : `unavailable (${layers.parserError})`}`
    );
  }
  if (traced.edgePolish) {
    const polish = traced.edgePolish;
    logLines.push(
      `Edge polish: ${polish.enabled ? `${polish.polishedSubpaths} subpaths, ${polish.pointsBefore} -> ${polish.pointsAfter} points, ${polish.cubicSegments} cubic spans` : "off"}`,
      `Edge polish variant: ${polish.variantName || "base"}, tolerance ${formatNumber(polish.tolerance)}, corner angle ${formatNumber(polish.cornerAngle)} deg; skipped ${polish.skippedSmall} small, ${polish.skippedSmooth} smooth`
    );
  }
  if (traced.curveOptimization) {
    const curve = traced.curveOptimization;
    logLines.push(
      `Curve optimizer: ${curve.enabled ? `${curve.candidatesTested} candidates, selected ${curve.selectedCandidate} (${curve.selectedLabel})` : "off"}`,
      `Curve optimizer guard: ${curve.guardReason}; edge RMSE base ${Number.isFinite(curve.baselineEdgeRmse) ? (curve.baselineEdgeRmse * 100).toFixed(2) : "n/a"}%, selected ${Number.isFinite(curve.selectedEdgeRmse) ? (curve.selectedEdgeRmse * 100).toFixed(2) : "n/a"}%; hot base ${Number.isFinite(curve.baselineHotPixelRatio) ? (curve.baselineHotPixelRatio * 100).toFixed(1) : "n/a"}%, selected ${Number.isFinite(curve.selectedHotPixelRatio) ? (curve.selectedHotPixelRatio * 100).toFixed(1) : "n/a"}%`
    );
  }
  if (traced.subPixelEdges) {
    const subPixel = traced.subPixelEdges;
    logLines.push(
      `Sub-pixel fit: ${subPixel.enabled ? `${subPixel.adjustedSubpaths} subpaths, ${subPixel.pointsAdjusted}/${subPixel.pointsVisited} points shifted, avg ${formatNumber(subPixel.averageShift)}px, max ${formatNumber(subPixel.maxShift)}px` : "off"}`,
      `Sub-pixel fit mode: ${subPixel.mode}, selected ${subPixel.selected ? "yes" : "no"} (${subPixel.guardReason || "no guard"}), max offset ${formatNumber(subPixel.maxOffset)}px; skipped small ${subPixel.skippedSmall}, low confidence ${subPixel.skippedLowConfidence}, unsupported ${subPixel.skippedUnsupported}`
    );
    if (Number.isFinite(subPixel.guardBaselineEdgeRmse) && Number.isFinite(subPixel.guardCandidateEdgeRmse)) {
      logLines.push(
        `Sub-pixel guard: edge RMSE baseline ${(subPixel.guardBaselineEdgeRmse * 100).toFixed(2)}%, candidate ${(subPixel.guardCandidateEdgeRmse * 100).toFixed(2)}%; hot baseline ${(subPixel.guardBaselineHotPixelRatio * 100).toFixed(1)}%, candidate ${(subPixel.guardCandidateHotPixelRatio * 100).toFixed(1)}%`
      );
    }
  }
  if (traced.gradientConversion) {
    const gradients = traced.gradientConversion;
    logLines.push(
      `Effect gradients: ${gradients.enabled ? `${gradients.pathsConverted} paths converted with ${gradients.gradientsAdded} gradients` : "off"}`,
      `Gradient targets: highlights ${gradients.highlight}, shadows ${gradients.shadow}, soft effects ${gradients.softEffect}; skipped ${gradients.skippedSmall} small, ${gradients.skippedUnsupported} unsupported`
    );
  }
  if (traced.exportOptimization) {
    const optimized = traced.exportOptimization;
    logLines.push(
      `Export optimization: ${optimized.enabled ? `${optimized.pathsBefore} -> ${optimized.pathsAfter} paths, ${optimized.bytesBefore} -> ${optimized.bytesAfter} bytes` : "off"}`,
      `Export cleanup: duplicates ${optimized.duplicatePathsRemoved}, tiny background ${optimized.tinyBackgroundPathsRemoved}, detached micro ${optimized.detachedMicroPathsRemoved || 0}, color merges ${optimized.colorMergePathsChanged}, flat colors ${optimized.flatColorsBefore} -> ${optimized.flatColorsAfter}, unused defs ${optimized.unusedDefsRemoved}`
    );
  }
  if (traced.vtracerOptions) {
    logLines.push(
      `VTracer hierarchy: ${traced.vtracerOptions.hierarchical}`,
      `VTracer mode: ${traced.vtracerOptions.mode}`,
      `VTracer color precision: ${traced.vtracerOptions.color_precision}`,
      `VTracer layer difference: ${traced.vtracerOptions.layer_difference}`,
      `VTracer filter speckle: ${traced.vtracerOptions.filter_speckle}`,
      `VTracer ticks: ${traced.vtracerTicks}`
    );
  }
  if (traced.error) logLines.push(`Fallback reason: ${traced.error}`);
  logLines.push(
    `Benchmark run saved: ${benchmarkRun.id}${benchmarkStore.baselineRunId ? "" : " (set a baseline to see deltas)"}`,
    "",
    "Prototype note: ImageTracerJS is still the stable baseline; VTracer is available as an experimental clustering comparison.",
    "Soft glows/shadows now get a first-pass blurred SVG effect layer instead of relying only on flat color paths.",
    "Sub-pixel edge fitting is an experimental coverage-crossing pass; judge it with edge RMSE and the preview together."
  );
  log(logLines.join("\n"));
  traceInProgress = false;
  traceButton.disabled = false;
  downloadButton.disabled = !currentSvg;
}

function downloadSvg() {
  if (!currentSvg) return;
  const blob = new Blob([currentSvg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${loadedFileName}-local-trace.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
sampleButton.addEventListener("click", () => loadImageUrl("./assets/sample-logo.png", "sample-logo.png"));
if (shadedButton) shadedButton.addEventListener("click", () => loadImageUrl("./assets/shaded-test.png", "shaded-test.png"));
if (bocButton) bocButton.addEventListener("click", () => loadImageUrl("./assets/boc-logo-small.png", "boc-logo-small.png"));
traceButton.addEventListener("click", () => {
  traceCurrentImage().catch((error) => {
    traceInProgress = false;
    traceButton.disabled = false;
    downloadButton.disabled = !currentSvg;
    log(`Trace failed: ${error.message}`);
  });
});
downloadButton.addEventListener("click", downloadSvg);

engineButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectorState.engine = button.dataset.engine;
    applySelectorState({ syncInternals: false });
  });
});

imageTypeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectorState.imageType = button.dataset.imageType;
    applySelectorState({ syncInternals: false });
  });
});

detailButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectorState.detail = button.dataset.detail;
    applySelectorState();
  });
});

antiAliasButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectorState.antiAlias = button.dataset.antiAlias;
    applySelectorState({ syncInternals: false });
  });
});

subPixelEdgeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectorState.subPixelEdges = button.dataset.subPixelEdges;
    applySelectorState({ syncInternals: false });
  });
});

curveOptimizerButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectorState.curveOptimizer = button.dataset.curveOptimizer;
    applySelectorState({ syncInternals: false });
  });
});

backgroundDetachButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectorState.backgroundDetach = button.dataset.backgroundDetach;
    applySelectorState({ syncInternals: false });
  });
});

colorModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectorState.colorMode = button.dataset.colorMode;
    applySelectorState();
  });
});

effectsButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectorState.effects = button.dataset.effects;
    applySelectorState();
  });
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  loadFile(event.dataTransfer.files[0]);
});

setBaselineButton.addEventListener("click", setCurrentBenchmarkAsBaseline);
compareBaselineButton.addEventListener("click", () => renderBenchmarkDeltas(currentBenchmarkRun, benchmarkBaselineRun()));
exportBenchmarkButton.addEventListener("click", exportBenchmarkJson);
clearBenchmarkButton.addEventListener("click", clearBenchmarkRuns);

loadBenchmarkStore();
// Dev override: ?engine=palette|regions|coverage|imagetracer to force an engine for testing.
// (No user-facing engine selector; the auto-router will choose in production — see WORKLOG spec.)
try {
  const devEngine = readQueryParam("engine");
  if (devEngine && engineLabels[devEngine]) selectorState.engine = devEngine;
  devOptions.paletteForceK = readQueryNumber("paletteK", 2, 16);
  devOptions.paletteOptimize = readQueryParam("paletteOptimize") !== "off";
} catch (e) { /* ignore */ }
applySelectorState();
renderBenchmarkLedger();
try {
  loadQueryAsset();
} catch (e) { /* ignore */ }
