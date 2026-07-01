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
