// Faithful headless Node trace: EXACT-decoded ImageData (no drawImageToCanvas 1:1 blur) + the full
// auto pipeline (dark-glow + high-detail bake-offs). This is the correct headless reference (unlike
// run-trace.js, which routes through drawImageToCanvas and inherits the @napi-rs 1:1 smoothing blur).
// Usage: node server/run-auto.js <image.png> [outBasename]

const fs = require("fs");
const path = require("path");
const { loadEngine, imageDataFromPng } = require("./load-engine");

async function main() {
  const imgPath = process.argv[2];
  const outBase = process.argv[3] || "auto";
  if (!imgPath) { console.error("usage: node server/run-auto.js <image.png> [outBasename]"); process.exit(1); }
  const E = loadEngine();
  const imageData = await imageDataFromPng(fs.readFileSync(imgPath));
  E.flattenAlphaOverMatte(imageData);
  const { traceOptions } = E.buildTraceContext();
  const t0 = performance.now();
  const pipeline = await E.runAutoRaw(imageData, traceOptions);
  const ms = Math.round(performance.now() - t0);
  const svg = pipeline.traced.svg;
  fs.writeFileSync(path.join(__dirname, "..", "scratch-" + outBase + ".svg"), svg);
  const m = await E.measureSvgDifference(imageData, svg, { backgroundColor: pipeline.coverageRecovered.backgroundColor });
  const pct = (x) => (x * 100).toFixed(2) + "%";
  console.log(JSON.stringify({
    ms,
    engine: pipeline.traced.engineName,
    paths: pipeline.traced.pathCount,
    edge: pct(m.edgeWeightedRmse),
    MAE: pct(m.meanError),
    hot: pct(m.hotPixelRatio),
    darkGlowSelected: pipeline.traced.darkGlowBakeoff ? pipeline.traced.darkGlowBakeoff.selected : null,
    highDetailSelected: pipeline.traced.detailBakeoff ? pipeline.traced.detailBakeoff.selected : null
  }, null, 2));
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
