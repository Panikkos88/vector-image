// Loads the UNMODIFIED app/app.js engine under the Node shim env and exposes the internal
// functions the server orchestrator needs. Used by both the main thread and worker threads.
// The appendix runs in app.js's own scope, so it can reference the engine's internal functions
// directly (no changes to app.js).

const fs = require("fs");
const path = require("path");
const env = require("./node-env");

const APP_DIR = path.join(__dirname, "..", "app");

let cached = null;

function loadEngine() {
  if (cached) return cached;
  env.install();
  const bgText = fs.readFileSync(path.join(APP_DIR, "background-detach.js"), "utf8");
  const appText = fs.readFileSync(path.join(APP_DIR, "app.js"), "utf8");
  new Function(bgText)(); // IIFE -> window.BackgroundDetach

  const appendix = `
;globalThis.__engine = {
  selectorState, devOptions,
  flattenAlphaOverMatte,
  runBackgroundDetach,
  measureSvgDifference,
  chooseDarkGlowBakeoff,
  countSvgElements,
  estimateSvgPointCount,
  detailBakeoffEvaluation,
  traceCurrentImage,

  // Diagnostic: run one pipeline at a forced engine + detail, return the rich pipeline object.
  async runPipelineRaw(imageData, options, forceEngine) {
    const prev = selectorState.engine;
    selectorState.engine = forceEngine;
    try {
      const bg = runBackgroundDetach(imageData, options);
      return await runTracePipeline(imageData, imageData, options, options.colors, options.iterations, bg);
    } finally {
      selectorState.engine = prev;
    }
  },

  // Diagnostic: full auto path (dark-glow bake-off + high-detail), returns traced with all stats.
  async runAutoRaw(imageData, options) {
    const prev = selectorState.engine;
    selectorState.engine = "auto";
    try {
      const bg = runBackgroundDetach(imageData, options);
      let pipeline = await runTracePipeline(imageData, imageData, options, options.colors, options.iterations, bg);
      pipeline = await runHighDetailBakeoffIfUseful(pipeline, imageData, options, bg);
      return pipeline;
    } finally {
      selectorState.engine = prev;
    }
  },
  get currentSvg() { return currentSvg; },
  get loadedImage() { return loadedImage; },
  set loadedImage(v) { loadedImage = v; },

  // Mirror traceCurrentImage's trace-options construction exactly (no DOM inputs -> defaults).
  buildTraceContext() {
    const { maxSize, colors, iterations } = currentTraceSettings();
    const traceOptions = {
      removeLargestColor: false,
      maxSize, colors, iterations,
      detail: selectorState.detail,
      imageType: selectorState.imageType,
      antiAlias: selectorState.antiAlias,
      subPixelEdges: selectorState.subPixelEdges,
      curveOptimizer: selectorState.curveOptimizer,
      backgroundDetach: selectorState.backgroundDetach,
      effects: selectorState.effects
    };
    return { traceOptions, colors, iterations };
  },

  // Cheap route decision (setup only, NO optimizers) — mirrors runTracePipeline's auto branch.
  computeRouteAndSignal(imageData, options) {
    const cleaned = cleanupArtworkImageData(imageData, options);
    const filtered = edgePreservingSmoothImageData(cleaned.imageData, options);
    const coverageRecovered = recoverAntialiasCoverage(filtered.imageData, options);
    const backgroundColor = coverageRecovered.backgroundColor;
    const ladder = computePaletteLadder(filtered.imageData, paletteLadderOptions(coverageRecovered.coverageField));
    const routerDecision = autoRouteFromPaletteLadder(ladder);
    const signal = darkGlowBakeoffSignal(ladder, routerDecision);
    return { selectedEngine: routerDecision.selectedEngine, signal, backgroundColor };
  },

  // Run ONE forced engine end-to-end (incl. high-detail bake-off for regions). No dark-glow
  // palette bake-off (that only fires for engine==="auto"), so this is a single pipeline.
  async runForcedPipeline(imageData, options, forceEngine) {
    const prev = selectorState.engine;
    selectorState.engine = forceEngine;
    try {
      const { colors, iterations } = currentTraceSettings();
      const bg = runBackgroundDetach(imageData, options);
      let pipeline = await runTracePipeline(imageData, imageData, options, colors, iterations, bg);
      pipeline = await runHighDetailBakeoffIfUseful(pipeline, imageData, options, bg);
      return {
        svg: pipeline.traced.svg,
        pathCount: pipeline.traced.pathCount || countSvgElements(pipeline.traced.svg, "path"),
        engineName: pipeline.traced.engineName
      };
    } finally {
      selectorState.engine = prev;
    }
  }
};`;
  new Function(appText + appendix)();
  cached = globalThis.__engine;
  cached.devOptions.paletteOptimize = true;
  return cached;
}

// Build a flattened ImageData from a PNG buffer using the shim canvas (matches browser getImageData).
function imageDataFromPng(pngBuffer) {
  const napi = env.NapiImage ? null : null; // (kept for clarity; use loadImage below)
  return env.loadImage(pngBuffer).then((img) => {
    const canvas = env.makeCanvas();
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage({ _img: img }, 0, 0, img.width, img.height);
    return ctx.getImageData(0, 0, img.width, img.height);
  });
}

module.exports = { loadEngine, imageDataFromPng, env };
