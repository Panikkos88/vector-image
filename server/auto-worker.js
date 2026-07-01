// Worker: loads the platform-deterministic engine once, then runs the full FAITHFUL auto trace
// (dark-glow + high-detail bake-offs) per request on EXACT-decoded ImageData. Matches the browser
// (validated: apple/tiktok/react/metal within ~0.06pp). bg-detach path not yet replicated — 0/24
// benchmark samples trigger it; a follow-up for images that do.
// Message in:  { id, png: <ArrayBuffer/Buffer of PNG bytes> }
// Message out: { id, ok, svg, engine, edge, mae, hot, paths, ms } | { id, ok:false, error }

const { parentPort } = require("worker_threads");
const { loadEngine, imageDataFromPng } = require("./load-engine");

const E = loadEngine();

parentPort.on("message", async (msg) => {
  const { id, png } = msg;
  try {
    const buf = Buffer.isBuffer(png) ? png : Buffer.from(png);
    const imageData = await imageDataFromPng(buf);
    E.flattenAlphaOverMatte(imageData);
    const { traceOptions } = E.buildTraceContext();
    const t0 = performance.now();
    const pipeline = await E.runAutoRaw(imageData, traceOptions);
    const ms = Math.round(performance.now() - t0);
    const svg = pipeline.traced.svg;
    const m = await E.measureSvgDifference(imageData, svg, { backgroundColor: pipeline.coverageRecovered.backgroundColor });
    parentPort.postMessage({
      id, ok: true, svg,
      engine: pipeline.traced.engineName,
      paths: pipeline.traced.pathCount,
      edge: m.edgeWeightedRmse,
      mae: m.meanError,
      hot: m.hotPixelRatio,
      ms
    });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: error.message, stack: error.stack });
  }
});

parentPort.postMessage({ ready: true });
