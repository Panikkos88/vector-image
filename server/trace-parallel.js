// Parallel trace orchestrator. Runs the cheap route decision in the main thread, then dispatches
// the forced-engine pipeline(s) the sequential engine would run to a worker pool — the dark-glow
// bake-off's Region + Palette pipelines run CONCURRENTLY. The real router + darkGlowBakeoffSignal +
// chooseDarkGlowBakeoff decide the winner.
//
// FAITHFUL for: Palette-winning images (apple: 49 paths, 3.17% == browser) and medium-Region images.
// KNOWN LIMITATION (WIP): the HIGH-DETAIL bake-off does NOT run here. `shouldRunHighDetailBakeoff`
// hard-requires selectorState.engine==="auto" (app.js:7816), but the workers force "regions"/"palette".
// So high-detail-eligible images (tiktok) come out as medium-Region (45 paths/3.73%) instead of the
// browser's high-detail result (58/3.41%). Fixing the gate alone is NOT enough: the sequential
// headless path (which DOES run high-detail) misfires too (24 paths/4.75%) because the high-detail
// guard's edge/hot thresholds are sensitive to the resvg-vs-canvas ~0.1pp measure offset. The real
// fix is re-baselining that guard for resvg. See research/server-port-parallel-findings-*.md.

const path = require("path");
const { Worker } = require("worker_threads");
const { loadEngine, imageDataFromPng } = require("./load-engine");

class WorkerPool {
  constructor(size) {
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.seq = 0;
    this.pending = new Map();
    for (let i = 0; i < size; i += 1) this._spawn();
  }
  _spawn() {
    const worker = new Worker(path.join(__dirname, "trace-worker.js"));
    let ready = false;
    worker.on("message", (msg) => {
      if (!ready && msg && msg.ready) { ready = true; this._release(worker); return; }
      const cb = this.pending.get(msg.id);
      if (cb) { this.pending.delete(msg.id); this._release(worker); cb(msg); }
    });
    worker.on("error", (err) => {
      // fail any in-flight task on this worker
      for (const [id, cb] of this.pending) { this.pending.delete(id); cb({ id, ok: false, error: String(err) }); }
    });
    this.workers.push(worker);
  }
  _release(worker) {
    const next = this.queue.shift();
    if (next) next(worker);
    else this.idle.push(worker);
  }
  _acquire() {
    return new Promise((resolve) => {
      const w = this.idle.pop();
      if (w) resolve(w);
      else this.queue.push(resolve);
    });
  }
  run(imageData, traceOptions, forceEngine) {
    return new Promise(async (resolve) => {
      const worker = await this._acquire();
      const id = (this.seq += 1);
      this.pending.set(id, resolve);
      worker.postMessage({
        id,
        imageData: { data: imageData.data, width: imageData.width, height: imageData.height },
        traceOptions,
        forceEngine
      });
    });
  }
  async destroy() { await Promise.all(this.workers.map((w) => w.terminate())); }
}

let pool = null;
function getPool(size = 2) { if (!pool) pool = new WorkerPool(size); return pool; }

async function traceParallel(pngBuffer, { backgroundColor } = {}) {
  const E = loadEngine();
  const imageData = await imageDataFromPng(pngBuffer);
  E.flattenAlphaOverMatte(imageData);
  const { traceOptions } = E.buildTraceContext();
  const route = E.computeRouteAndSignal(imageData, traceOptions);
  const p = getPool();

  const timings = {};
  const t0 = performance.now();
  let finalSvg, finalEngine, bakeoff = null;

  if (route.selectedEngine === "regions" && route.signal && route.signal.eligible) {
    // Dark-glow: run Region + Palette CONCURRENTLY, then apply the real chooser.
    const [region, palette] = await Promise.all([
      p.run(imageData, traceOptions, "regions"),
      p.run(imageData, traceOptions, "palette")
    ]);
    if (!region.ok) throw new Error("region worker failed: " + region.error);
    if (!palette.ok) throw new Error("palette worker failed: " + palette.error);
    const choice = await E.chooseDarkGlowBakeoff(
      { traced: { svg: region.svg, pathCount: region.pathCount } },
      { traced: { svg: palette.svg, pathCount: palette.pathCount } },
      imageData,
      route.backgroundColor,
      route.signal
    );
    bakeoff = choice.stats;
    if (choice.selected) { finalSvg = palette.svg; finalEngine = palette.engineName; }
    else { finalSvg = region.svg; finalEngine = region.engineName; }
    timings.mode = "parallel-bakeoff";
  } else {
    const only = await p.run(imageData, traceOptions, route.selectedEngine);
    if (!only.ok) throw new Error("worker failed: " + only.error);
    finalSvg = only.svg; finalEngine = only.engineName;
    timings.mode = "single:" + route.selectedEngine;
  }
  timings.ms = Math.round(performance.now() - t0);

  const metrics = await E.measureSvgDifference(imageData, finalSvg, { backgroundColor: route.backgroundColor });
  return {
    svg: finalSvg,
    engine: finalEngine,
    routerEngine: route.selectedEngine,
    eligible: !!(route.signal && route.signal.eligible),
    bakeoff,
    metrics,
    timings
  };
}

module.exports = { traceParallel, getPool, WorkerPool };

if (require.main === module) {
  const fs = require("fs");
  (async () => {
    const imgPath = process.argv[2];
    if (!imgPath) { console.error("usage: node server/trace-parallel.js <image.png>"); process.exit(1); }
    const t0 = performance.now();
    const r = await traceParallel(fs.readFileSync(imgPath));
    const pct = (x) => (x * 100).toFixed(2) + "%";
    console.log(JSON.stringify({
      totalMs: Math.round(performance.now() - t0),
      pipelineMs: r.timings.ms,
      mode: r.timings.mode,
      routerEngine: r.routerEngine,
      eligible: r.eligible,
      engine: r.engine,
      paletteSelected: r.bakeoff ? r.bakeoff.selected : null,
      paths: (r.svg.match(/<path/g) || []).length,
      edge: pct(r.metrics.edgeWeightedRmse),
      MAE: pct(r.metrics.meanError),
      hot: pct(r.metrics.hotPixelRatio)
    }, null, 2));
    await getPool().destroy();
  })().catch((e) => { console.error("FATAL:", e); process.exit(1); });
}
