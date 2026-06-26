import * as vtracerImports from "./vtracer_webapp_bg.js";

let runtimePromise = null;

export function loadVTracerRuntime() {
  if (!runtimePromise) runtimePromise = initVTracerRuntime();
  return runtimePromise;
}

async function initVTracerRuntime() {
  const wasmUrl = new URL("./vtracer_webapp_bg.wasm", import.meta.url);
  const imports = { "./vtracer_webapp_bg.js": vtracerImports };
  const response = await fetch(wasmUrl);
  let instance;

  if (WebAssembly.instantiateStreaming && response.headers.get("Content-Type") === "application/wasm") {
    ({ instance } = await WebAssembly.instantiateStreaming(response, imports));
  } else {
    const bytes = await response.arrayBuffer();
    ({ instance } = await WebAssembly.instantiate(bytes, imports));
  }

  vtracerImports.__wbg_set_wasm(instance.exports);
  instance.exports.__wbindgen_start();
  return vtracerImports;
}
