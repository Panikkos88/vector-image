# Server port — the FULL engine runs headless under Node (unmodified app.js) — 2026-06-30 [claude]

Second Phase-2 milestone after the rasteriser-equivalence proof. The entire ~8000-line engine now
runs under Node with NO changes to app/app.js (Option B: load it verbatim behind shims). This retires
the second big port risk (browser coupling) after the first (rasteriser).

## How (server/node-env.js + server/run-trace.js)
- `node-env.js` installs browser-global shims:
  - `@napi-rs/canvas` (Skia) backs `document.createElement("canvas")`, `getContext`, `getImageData`/
    `putImageData`, `drawImage`, and `ImageData`. getImageData verified byte-identical to a known PNG
    decoder (RGBA order, no premultiply surprise).
  - `linkedom` backs `DOMParser`/`Element` so the SVG export code's `querySelectorAll("path[data-layer]")`,
    `querySelector("defs")`, attribute selectors, classList, etc. all work. `XMLSerializer` shimmed via
    `node.toString()` (linkedom emits valid SVG XML).
  - SVG raster: `Blob`+`URL.createObjectURL` render the SVG with resvg into a SOURCE CANVAS (not a PNG
    data-URI). NB: `@napi-rs` `new Image(); img.src = buffer` draws TRANSPARENT (sync-src decode bug);
    `drawImage(canvas)` and `await loadImage(buf)` both work. So we hand the engine's `new Image()` a
    canvas-backed shim; `ctx.drawImage` unwraps `img._img`.
  - getElementById returns real canvases for the 4 known canvas ids and robust Proxy stubs otherwise,
    so app.js's top-level UI bootstrap (addEventListener/classList/localStorage/location) runs without
    throwing.
- `run-trace.js` evals background-detach.js (IIFE -> window.BackgroundDetach) then app.js + a tiny
  appendix exposing `traceCurrentImage` / `currentSvg` / `loadedImage`, sets loadedImage to a napi
  image, calls the REAL `traceCurrentImage()`, and reads `currentSvg`. Same orchestration as the
  browser (dark-glow bake-off + high-detail bake-off), no logic duplicated.

## Fidelity (node headless vs browser)
| Sample (engine)            | paths (br/node) | edge browser | edge node | MAE br/node | hot br/node |
|----------------------------|-----------------|--------------|-----------|-------------|-------------|
| dark-apple-gloss (Palette) | 49 / 49         | 3.12%        | 3.23%     | 0.90/0.92   | 2.0/1.91    |
| metallic-wordmark (Region) | ?  / 30         | 3.78%        | 3.88%     | 3.03/2.97   | 0.6/0.56    |

Palette is structurally IDENTICAL (49 paths, 535K vs 537K bytes). Region drifts a little more (403K vs
493K bytes) because its internal measure-driven decisions (SLIC sweep, downscale-eval canvas resample
at app.js ~5468, super-retrace) compound the resvg-vs-canvas + Skia-vs-Chrome-resample offsets. Both
within ~0.1pp edge — faithful. The drift is the engine making marginally different candidate picks
because ITS internal measures use resvg; it is not a bug.

## Runtime reality — single-thread Node is SLOWER, parallelism is the whole point
apple 20.4s (browser 11.7s), metal 15.7s (browser 8s). Node's per-op canvas/JS is ~1.7-2x slower than
Chrome's native canvas. So a naive single-threaded port is a REGRESSION on speed. The server win comes
ONLY from parallelism, which the browser cannot do:
1. Coarse-grained: the dark-glow bake-off (Region baseline + Palette challenger) and the high-detail
   bake-off are INDEPENDENT full pipelines. Run them in parallel worker_threads -> tiktok's 3-pipeline
   wall time collapses toward 1 pipeline. Clean, no inner-loop surgery.
2. Fine-grained: the ~130 candidate raster+measure calls inside each optimizer are the hot loop;
   dispatch candidate measures to a worker pool. Higher speedup but needs the optimizer loops
   restructured to batch-generate then batch-measure (risk of drift — guard with metric parity).
Native resvg + N cores should beat the browser comfortably; target sub-5s.

## Next
- Worker pool: start with coarse-grained (parallel bake-off pipelines), measure the win, then decide
  if fine-grained candidate batching is worth the restructure.
- HTTP endpoint (POST image -> {svg, metrics}); keep the browser as a thin client (upload + display).
- Cloud Run: switch the service from the nginx static host to a Node server (Dockerfile FROM node,
  serve the static app AND the /trace endpoint). Verify live + metric-parity vs browser on the suite.
- Re-baseline metric guards against resvg once the server is canonical (the ~0.1pp offset).
Committed: server/node-env.js, server/run-trace.js. Deps: @napi-rs/canvas, @xmldom/xmldom (unused now,
linkedom won), linkedom.
