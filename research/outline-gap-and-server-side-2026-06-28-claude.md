# Outline VM gap + server-side question — notes for Codex (2026-06-28 [claude])

Context for whoever picks up the outline benchmark next. Current shipped state: outline Auto =
Palette/k5, **edge 4.07%**, 31 paths (Cloud rev `00016-4cr`, cache `20260628-fringedissolve1`).
VM reference = **1.90%** / 30 paths. This note explains exactly where the remaining gap is, what was
tried, and — importantly — why moving to the Google Cloud instance (server-side) will NOT close it
on its own. Don't re-derive this from scratch.

## How the gap was measured (reuse this method)
All numbers came from loading VM's own SVG into OUR harness in the browser and rasterizing both ours
and VM identically, then bucketing per-pixel error. Key reusable trick: `measureSvgDifference` is a
global; you can score ANY svg string against the original `originalCanvas` ImageData from the devtools
console / preview_eval. VM's SVG scores 1.90% in our own browser harness — see "platform" section.

## Where the remaining 4.07% -> 1.90% gap actually is (measured, raw edge-pixel error)
Decomposition by boundary type (ours vs VM, excess = ours - VM):
- **Shield tips, dark|navy boundary: ours 94k vs VM 13k (+81k) over only ~1258 px (~75 err/px).**
  This is the single biggest lever. It's a near-FULL colour swap (navy<->dark differ by ~82), i.e.
  cream AND navy OVERSHOOT into the dark background at the 2 sharp convex points (top + bottom tips
  of the hexagon). Sample: `(394,76) original [72,77,83] -> we render [211,212,205]` (cream where it
  should be dark/navy). Spatially clustered at top-centre and bottom-centre (the tips).
  => Corner/convex-point OVERSHOOT in the trace (marching-squares + simplify/line-refit). Fiddly,
  and it lives in SHARED `traceRegionsToSvg` / the boundary simplifier (risk to other samples).
- cream|navy (inner shield edge + CREST text): ours 163k vs VM 111k (+52k) over 7440 px. Broad
  residual sub-pixel imprecision on the inner boundary. Diminishing returns.
- Everything else (cream|dark outer, navy|yellow, cream|yellow): ~+25k total, minor.
- Path-swap proof that YELLOW IS NOT THE PROBLEM: VM-rest + our-2-yellow = 1.67%; our-rest +
  VM-15-yellow = 5.47%. Our 2 yellow paths are adequate; do NOT chase yellow path count.

## Separate (edge-neutral) finding: interior fill colour
The navy interior is a flat fill of EXACTLY [28,58,92] (18,768 identical px); VM renders it exactly
(0 interior error). We render ~[29,58,92] because the fill comes from `fitRegionAdaptive` returning
the MEAN of sampled region pixels (edge px pull it ~1-3 units off). This is ~85k of MAE-only error
but it is EDGE-NEUTRAL (interior px are low-weight in edge-weighted RMSE), so it does NOT move the
headline 4.07%.

### Tried + REVERTED this session (don't redo unless you change the approach):
- `refinePaletteColors` (snap palette colour to per-index mode) + `fitRegionAdaptive` flat branch
  using the mode instead of the mean. Result: only the largest navy component snapped to exact
  [28,58,92]; thin regions kept the mean (guarded on purpose). MAE stayed 0.28% (rounding), edge
  4.07->4.04 (noise). Net: edge-neutral, MAE-negligible, touches SHARED `fitRegionAdaptive` (metal
  risk). Reverted to keep the tree clean. If you want the exact-colour win, you must (a) sample the
  ORIGINAL image (not the filtered segSource) for the mode, and (b) make the flat fill use it for
  thin regions too — but the payoff is <0.3% MAE and zero edge, so it's low priority.
- Earlier rejected (already in the main change log): `fitSvgSubPixelEdges` vertex-nudge on the
  palette output (made outline WORSE 5.32->5.95); blanket morphological erosion (worse);
  coordinateOffset translation (can't fix symmetric dilation); referenceImageData as trace coverage
  source (inert, +/-0.01pt).

## The platform / server-side question (IMPORTANT — user asked about this twice)
User asked: would running on the Google Cloud instance / server-side (instead of the browser) close
the gap? **Answer: no, not by itself.** Record so we don't chase it as a silver bullet:

1. The deliverable is an SVG. Same code => byte-identical SVG whether run in-browser or in Node. It
   renders identically in every viewer. WHERE it's computed does not change quality.
2. **Proof the platform is not the ceiling:** VM's own `.svg`, rasterized by THIS browser and scored
   by OUR `measureSvgDifference`, measures 1.90%. So the browser/JS/our-metric can fully represent,
   render, and measure VM-quality output. The ceiling is the geometry our tracer emits, not the
   runtime. JS float math == C/Rust; browser AA is the same rasterizer for VM's paths and ours.
3. The optimizer already SELECTS THE BEST of all candidates it generates. 4.07% is not a time-out;
   it's that no candidate in the model is VM-quality at the corners. More compute searching the SAME
   candidate space won't find geometry that isn't in it.
4. Cloud Run today = nginx static host (see Dockerfile), ZERO server compute; the browser does all
   the work. Adding a backend means porting ~6,300 lines of browser-coupled JS (canvas, DOMParser,
   Image, SVG rasterization) to Node equivalents (@napi-rs/canvas, resvg, jsdom). Big, bug-prone,
   and produces identical output until the algorithm itself improves.
5. Where the cloud DOES earn its place: it's the deployment vehicle for a HEAVIER/better algorithm
   (true coverage-field corner reconstruction, per-vertex sub-pixel fitting, global boundary solve)
   that may be too slow to run interactively in a browser tab. Algorithm first; cloud is downstream.
   (This is how Vector Magic itself is built: server-side service, native code.)

## Recommended next step (verify-before-build, NOT yet done)
Before any server port, run ONE cheap in-browser experiment to confirm whether "more search" helps
at all: temporarily uncap the palette boundary optimizer (many more candidates, no time budget,
let outline take ~60s) and see if it drops well below 4.07.
- If it drops a lot -> "more search" is the lever; a Cloud server port to run it for real is
  justified.
- If it barely moves (the diagnosis predicts this) -> the gap is the MODEL, not compute; a port
  alone is wasted. The real work is a new corner/coverage boundary algorithm (build in-browser for
  fast iteration; move server-side only if it's too slow interactively).

## Experiment A RESULT (2026-06-28 [claude]) — DONE. Verdict: more search does NOT help.
Ran the unbounded in-browser candidate probe on bench-outline-shield: curated candidate set PLUS a
wide grid (iso {0.4,0.45,0.5,0.55,0.6,0.65,0.7} x coordinateOffset {-0.5,0,0.5,1.0} x
simplifyTolerance {0.05,0.18,0.4} x cornerAngle {0.55,0.8}). 207 candidates total, full trace +
measure each, no time cap. Method: temporary `window.__probe` grid appended to
paletteBoundaryCandidates (reverted after; not shipped).
- **Best edge across ALL 207 candidates = 3.94%** (probe point iso=0.5, offset=0.5, tol=0.05,
  corner=0.55) — essentially tied with the curated best `tight-corners-s12` 3.96% / `s12-c065` 3.97%.
- Shipped build selects 4.07% (node-compact pick slightly above the raw min-edge); the true floor of
  the whole space is ~3.94%.
- High iso (erosion) did NOT help: best points sit at iso~0.5; iso 0.55/0.6/0.65/0.7 were all worse.
  Negative offsets and high tolerances were worse too.
=> The current candidate space bottoms out ~3.94%, vs VM 1.90%. The ~2pt gap is NOT recoverable by
searching this model harder. CONFIRMED: the limit is the model, not the compute budget. A cloud
compute-multiplier on this same candidate space would plateau ~3.94%. Do not build a backend to
"search harder". Next must be a NEW model (Experiment B: ROI coverage-aware corner reconstruction).
The 3.94 vs 4.07 delta is node-heavy and not worth changing the shipped selection.

## The actual lever (whoever closes this)
A coverage-aware CORNER reconstruction at convex points (the tips), so cream/navy stop overshooting
into the dark background. That's the +81k. Then inner-edge sub-pixel precision for the next +52k.
Neither is a platform problem; both are geometry-model work, identical in any language.
