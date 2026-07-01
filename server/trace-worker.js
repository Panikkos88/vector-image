// Worker thread: loads the engine once, then runs one forced-engine pipeline per request.
// Message in:  { id, imageData: {data: ArrayBuffer, width, height}, traceOptions, forceEngine }
// Message out: { id, ok, svg, pathCount, engineName }  |  { id, ok:false, error }

const { parentPort } = require("worker_threads");
const { loadEngine, env } = require("./load-engine");

const E = loadEngine();

parentPort.on("message", async (msg) => {
  const { id, imageData, traceOptions, forceEngine } = msg;
  try {
    const data = new Uint8ClampedArray(imageData.data);
    // global.ImageData is installed by the shim env (loadEngine -> env.install()).
    const id2 = new ImageData(data, imageData.width, imageData.height);
    const result = await E.runForcedPipeline(id2, traceOptions, forceEngine);
    parentPort.postMessage({ id, ok: true, ...result });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: error.message, stack: error.stack });
  }
});

parentPort.postMessage({ ready: true });
