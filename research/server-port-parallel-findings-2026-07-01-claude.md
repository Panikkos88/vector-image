# Server port — worker-pool parallelism built + two findings that gate it — 2026-07-01 [claude]

Built coarse-grained parallelism (server/trace-parallel.js + trace-worker.js + load-engine.js): a
persistent worker pool; the main thread computes the cheap route decision, then dispatches the
forced-engine pipelines the sequential engine would run. For dark-glow the Region + Palette pipelines
run CONCURRENTLY and the REAL router + `darkGlowBakeoffSignal` + `chooseDarkGlowBakeoff` pick the
winner. Deterministic (engine has no Math.random in the compute path — only a benchmark-id).

## Result
- apple (Palette wins): parallel **14.2s** (vs 20.4s sequential-headless) = ~1.4x, output FAITHFUL —
  49 paths, edge 3.17% == browser 3.12%. Deterministic across runs.
- The ~1.4x (not 2x) is inherent to coarse-grained: it only hides the SHORTER pipeline behind the
  longer one (region ~8s behind palette ~13s). A bigger win needs fine-grained parallelism of the
  ~130 candidate raster+measure calls inside the long pipeline (a real optimizer-loop refactor).

## Finding 1 — high-detail bake-off is gated on engine==="auto" (parity bug in the forced approach)
`shouldRunHighDetailBakeoff` (app.js:7816) returns false unless `selectorState.engine==="auto"`. The
workers force "regions"/"palette", so high-detail NEVER fires in them. tiktok therefore comes out as
medium-Region (45 paths / 3.73%) — which actually MATCHES the browser's pre-high-detail number
(45 / 3.80%). So the forced-engine pipelines themselves are faithful; they just skip the post-step.

## Finding 2 — the high-detail guard is resvg-sensitive (the real blocker)
Even the SEQUENTIAL headless path (run-trace.js, engine=auto, high-detail DOES run) does NOT match the
browser on tiktok: it gives **24 paths / 4.75%** vs the browser's **58 / 3.41%**. The high-detail
bake-off's guard (`detailBakeoffEvaluation`, edge/hot deltas with thresholds like edgeDelta<=-0.002,
hotDelta<=0.0005) compares a medium baseline vs a high candidate — both measured with resvg under
Node. The ~0.1pp resvg-vs-canvas offset (documented earlier) is enough to flip this guard, so Node
selects a WORSE high-detail result than the browser does. This is the "ultra-marginal decisions can
flip" caveat from the rasteriser-equivalence note, now concrete and NOT ultra-marginal (0.4pp swing
in the final edge). Palette images don't hit this (no high-detail), which is why apple is clean.

## Conclusion / decision needed
The engine's OUTPUT ports faithfully to Node for Palette and medium-Region. The gap is specifically
the metric-GUARD decisions that ride on the resvg offset (high-detail here; the dark-glow bake-off
guard could be marginal on other images too). Two things must both be true for the server port to be
worth shipping:
1. Close the guard-sensitivity gap — re-baseline the high-detail (and dark-glow) guard thresholds
   against resvg, OR make the guards rasteriser-agnostic (compare with a fixed tolerance band), so
   Node makes the SAME accept/reject decisions as the browser. This is engine-tuning, not plumbing.
2. Get a real speedup — coarse-grained is only ~1.4x; the meaningful win is fine-grained candidate
   parallelism (refactor the optimizer loops to batch-measure across the pool).

Given the in-browser cache ALREADY fixed the headline 96s (->11.5s, shipped/live), the server port's
remaining value is (a) sub-5s traces via fine-grained parallelism and (b) offloading CPU from the
client. Both require the guard re-baseline first. Recommend deciding explicitly: invest in the guard
re-baseline + fine-grained parallelism, or bank the in-browser win and treat the server as future
work. Committed as WIP: server/{load-engine,trace-worker,trace-parallel}.js (faithful for Palette /
medium-Region; high-detail limitation documented in-code).

## DEEP DIVE (later same day) — the real root cause is PLATFORM-DEPENDENT RASTERISATION
Chased the tiktok gap to the bottom. It is NOT the guards per se; it is that the engine's decisions
ride on canvas operations that differ between Skia (Node/@napi-rs) and Blink (Chrome):

1. **imageSmoothing blurs at 1:1 under Skia.** `drawImageToCanvas` (app.js:456) sets
   `imageSmoothingQuality="high"`. @napi-rs/canvas then alters pixels EVEN at scale=1 (measured: 32,752
   channels differ vs the raw PNG, maxdiff 26). Chrome does not blur at 1:1. So preparing the source
   via drawImageToCanvas gives the Node engine a slightly-blurred image -> different trace. Building
   ImageData by EXACT decode (imageDataFromPng) matches the browser. This is why run-trace.js (routes
   through drawImageToCanvas) gave tiktok 24/4.75 while the exact-decode path gives 45/3.73 (== the
   browser's pre-high-detail 45/3.80). ACTION: the server must feed the engine EXACT-decoded ImageData,
   never drawImageToCanvas. (trace-parallel already does; run-trace.js does not and is thus unfaithful.)

2. **Downscale resampling differs Skia vs Blink.** The Region engine's downscale-eval (app.js:5455-5469)
   downsamples via canvas `imageSmoothingQuality="high"`. Skia (Mitchell/Catmull-ish) and Blink
   (Lanczos-ish) produce DIFFERENT downscaled pixels, which cascade into different SLIC superpixels ->
   different region candidates -> different output. On exact pixels, Node's HIGH-detail Region trace
   collapses to 27 paths/4.43% (worse than medium 45!) while the browser expands to 58/3.41%. This is
   pervasive in the Region path (SLIC sweep, downscale-eval, super-retrace all resample), NOT a single
   guard threshold.

### Consequence
- PALETTE output ports faithfully today (apple 49 paths, 3.17% ~ 3.12%). Palette does not downscale.
- REGION output is platform-dependent and can diverge materially (tiktok final 3.73% server-faithful vs
  3.41% browser, and high-detail is unreachable/degenerate under Node). Re-baselining guards will NOT
  fix this — the INPUTS to the guards differ because the pixels differ.

### The real fix — make the engine's rasterisation platform-deterministic
Replace platform-dependent canvas rasterisation in the DECISION path with pure-JS that runs
identically in browser AND Node:
1. Source prep + all `imageSmoothingQuality="high"` downscales -> a shared pure-JS resampler
   (area-average or Lanczos) used by both platforms. Same code -> identical pixels everywhere.
   Must be metric-guarded in-browser (quality must hold vs the current Skia/Blink downscale) and
   deployed. This is a real, SAFE-if-guarded change to the shared engine; it also removes browser
   Skia-vs-other-browser nondeterminism as a bonus.
2. SVG-measure raster (Blob->Image->drawImage) stays resvg on the server; it is only ~0.05pp off, well
   below the resampling-induced divergence. Revisit only if a guard is still marginal after (1).
Then re-verify server==browser across the suite, THEN add fine-grained candidate parallelism for the
speed win. NB: this is a larger, engine-level effort than "re-baseline a guard" — surfaced for an
explicit go/no-go given the in-browser 96s fix is already shipped.
