// Headless Node trace harness: loads the UNMODIFIED app/app.js engine under the shim env and
// runs the real traceCurrentImage() on a PNG, then writes the produced SVG. Cross-checks with
// tools/node-measure.js. Milestone: prove the engine runs server-side and matches the browser.
//
// Usage: node server/run-trace.js <image.png> [outBasename]

const fs = require("fs");
const path = require("path");
const env = require("./node-env");
env.install();

const APP_DIR = path.join(__dirname, "..", "app");

function loadEngine() {
  const bgText = fs.readFileSync(path.join(APP_DIR, "background-detach.js"), "utf8");
  const appText = fs.readFileSync(path.join(APP_DIR, "app.js"), "utf8");
  // bg-detach IIFE sets window.BackgroundDetach (window === global in the shim).
  new Function(bgText)();
  const appendix = `
;globalThis.__engine = {
  traceCurrentImage,
  measureSvgDifference,
  selectorState,
  devOptions,
  get currentSvg() { return currentSvg; },
  get loadedImage() { return loadedImage; },
  set loadedImage(v) { loadedImage = v; }
};`;
  new Function(appText + appendix)();
  return globalThis.__engine;
}

async function main() {
  const imgPath = process.argv[2];
  const outBase = process.argv[3] || "node-trace";
  if (!imgPath) { console.error("usage: node server/run-trace.js <image.png> [outBasename]"); process.exit(1); }

  const t0 = performance.now();
  const E = loadEngine();
  E.devOptions.paletteOptimize = true;

  const napi = await env.loadImage(fs.readFileSync(imgPath));
  E.loadedImage = {
    _img: napi,
    width: napi.width,
    height: napi.height,
    naturalWidth: napi.width,
    naturalHeight: napi.height
  };

  const traceStart = performance.now();
  try {
    await E.traceCurrentImage();
  } catch (e) {
    console.error("[traceCurrentImage tail error — currentSvg may still be set]:", e.message);
  }
  const traceMs = Math.round(performance.now() - traceStart);

  const svg = E.currentSvg;
  if (!svg) { console.error("NO SVG PRODUCED"); process.exit(2); }
  const outSvg = path.join(__dirname, "..", "scratch-" + outBase + ".svg");
  fs.writeFileSync(outSvg, svg);

  // Cross-check metric with the standalone node-measure (resvg) against the same PNG.
  const { measureSvgAgainstPng } = require("../tools/node-measure.js");
  const m = measureSvgAgainstPng(fs.readFileSync(imgPath), svg, {});
  const pct = (x) => (x * 100).toFixed(2) + "%";
  console.log(JSON.stringify({
    traceMs,
    totalMs: Math.round(performance.now() - t0),
    svgBytes: svg.length,
    paths: (svg.match(/<path/g) || []).length,
    edge: pct(m.edgeWeightedRmse),
    MAE: pct(m.meanError),
    hot: pct(m.hotPixelRatio),
    outSvg
  }, null, 2));
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
