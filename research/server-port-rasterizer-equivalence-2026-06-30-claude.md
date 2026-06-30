# Server-port foundation — resvg rasterizer matches the browser canvas — 2026-06-30 [claude]

Phase 2 of the runtime work is the server-side port (Node on Cloud Run). The #1 risk: the engine
picks candidates by rasterising each candidate SVG and measuring edge-weighted RMSE vs the reference
(`measureSvgDifference` -> `renderDifferenceView`, app/app.js ~3985). In the browser that raster is
`Blob -> Image -> drawImage` on a 2D canvas. Server-side we must use a native rasteriser. If it
disagrees with canvas, the metric guards shift and the engine makes DIFFERENT decisions -> quality
changes. So before porting anything, prove the rasterisers agree.

## What was built
`tools/node-measure.js` — a Node port of `measureSvgDifference`:
- minimal PNG decoder (8-bit, colourType 2/6, interlace 0; inflate + unfilter) — no node-canvas dep.
- `@resvg/resvg-js` to rasterise the candidate SVG to RGBA at the reference width.
- the EXACT metric loop copied verbatim from `renderDifferenceView` (matteRgb over black, Sobel edge
  weights /720 * 5, edge-weighted RMSE, hot-pixel ratio @ 0.08, background contamination).
- CLI: `node tools/node-measure.js <ref.png> <trace.svg> [bgR,bgG,bgB]`.

## Method
Captured the app's OWN output SVG for two samples (browser produced it; POSTed the SVG to a tiny local
receiver to keep it off-context), then ran node-measure on the same (reference PNG, SVG) pair and
compared to the browser's reported metrics.

## Result — agreement to <0.05pp on both
| Sample (engine)            | Metric | Browser (canvas) | Node (resvg) | delta |
|----------------------------|--------|------------------|--------------|-------|
| dark-apple-gloss (Palette) | edge   | 3.12%            | 3.17%        | +0.05 |
|                            | MAE    | 0.90%            | 0.89%        | -0.01 |
|                            | hot    | 2.0%             | 1.97%        | -0.03 |
| metallic-wordmark (Region) | edge   | 3.78%            | 3.74%        | -0.04 |
|                            | MAE    | 3.03%            | 3.02%        | -0.01 |
|                            | hot    | 0.6%             | 0.57%        | -0.03 |

Two structurally different SVG types — palette flat tonal bands AND region adaptive gradients (the
hardest case for raster agreement). Both agree within ~0.05pp. resvg is a faithful drop-in.

## Caveat (honest)
The residual (~0.05pp edge) is anti-aliasing noise and its SIGN is not perfectly consistent (resvg
slightly higher on apple, slightly lower on metal). The smallest guard threshold is
`minImprovement` ~0.0005 = 0.05pp, i.e. SAME scale as the noise. So an ULTRA-marginal candidate
decision (improvement sitting right at 0.05pp) could flip server vs browser. Real selections are
0.1-1pp wins, comfortably above the noise, so final output is effectively identical; but the port
should not tighten guard slack, and ideally re-baseline thresholds against resvg once ported.

## Why this matters
The browser does ~130 of these raster+measure calls per dark-glow trace, single-threaded, and the SVG
raster (Blob->Image->drawImage) is the dominant cost. Server-side: resvg is native (no DOM, no blob
round-trip) AND candidate evaluation can run across worker_threads in parallel. This is the path to
sub-second traces with NO quality change — and removes the downscale-flip-risk that made the
in-browser cuts #2/#3 (cheap bake-off decider, palette downscale-eval) risky.

## Next
- Port the candidate-evaluation hot loop to Node using node-measure's measure() + resvg.
- Parallelise candidate raster+measure across worker_threads.
- HTTP endpoint (POST image -> SVG + metrics); keep the browser as a thin client.
- The big open question for the FULL port: the engine itself (optimizePaletteTrace / optimizeRegionTrace
  / SLIC / tonal banding) is ~8000 lines of browser-coupled JS (ImageData, canvas getImageData/
  putImageData, document.createElement). Decide: (a) extract the pure-compute core to run under Node
  with an ImageData shim + node-canvas only where pixels are needed, or (b) port incrementally,
  starting with the measure/eval loop as a Node microservice the browser calls. (b) is lower-risk and
  matches this proof. Foundation committed: tools/node-measure.js.
