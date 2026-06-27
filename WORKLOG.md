# WORKLOG

Shared handoff log for this project. **Two agents work here: Codex and Claude.**
They do not share memory — this file is the shared brain.

## Protocol
- **At session start:** read this file top to bottom before doing anything.
- **At session end:** update `Current State` + `Next Steps`, and add a `Change Log` entry.
- **One agent at a time** (turn-based). Don't edit in parallel — there is no git to merge.
- **Every Change Log entry names the exact files + functions touched** (no git diff to fall back on).
- **Git update (2026-06-26):** Git now exists for this project. Use `git status` and
  `git diff` before commits; keep one-agent-at-a-time discipline to avoid overlapping edits.
- **Before a risky/large edit, snapshot the file** (e.g. copy `app.js` → `app.js.bak-MMDD`). That is the only "undo".
- `SKILL.md` stays the algorithm/research memory. This file is for change-by-change handoffs.

---

## Mandatory Test Process For Engine Changes
2026-06-27 [codex]: User clarified that "done" must mean proven locally, against Vector
Magic references where available, and on the Google Cloud Run instance after deploy. Claude
and Codex must run this proof loop for every meaningful vectorization/engine change before
calling the work complete.

1. Local static check.
   - Run `npm run check`.
   - Pass condition: no JS syntax/check failures.

2. Local browser benchmark.
   - Test controlled samples locally at `http://localhost:8787/`.
   - Required samples when relevant: BOC/KOINO flat logo, NS CAR logo, shaded-test image.
   - Record: route/URL, engine/router decision, selected settings, palette k, selected
     optimizer candidate, runtime, MAE, RMSE, edge-weighted RMSE, hot pixels, paths,
     estimated nodes, SVG bytes when available, gradients/filters, and whether Download SVG works.

3. Vector Magic reference comparison.
   - If a VM SVG reference already exists, measure VM vs original and ours vs original,
     then record VM score, our score, and delta.
   - If a new benchmark logo has no VM reference, create/save the VM output once before
     treating that logo as a serious benchmark.
   - Current known VM bars: BOC approx 2.41% edge / 0.17% MAE / 0.5% hot / 55 paths;
     NS CAR approx 2.91% edge / 0.41% MAE / 1.4% hot / 34 paths.

4. Cloud deploy proof.
   - After local proof passes and the change is intended to ship, deploy to Google Cloud Run.
   - Test the public Cloud URL, not only localhost.
   - Confirm the deployed revision/cache tag is the new build.
   - Re-run the same benchmark sample(s) on Cloud and record the same metrics.
   - Confirm SVG preview renders and Download SVG works from Cloud.

5. Regression gate.
   - Accept a change only when visual error improves or stays within an intentional tolerance,
     hot pixels do not meaningfully increase, paths/nodes/SVG bytes do not grow without a
     documented accuracy reason, Cloud matches local within tolerance, and VM delta shrinks
     or remains acceptable.
   - If a change is local-only or not deployed, say that explicitly in the final response
     and in this worklog.

6. Worklog requirement.
   - At session end, add Local / VM / Cloud / Decision lines to the Change Log entry.
   - If any part of the proof loop was skipped, log exactly why.

---

## Definition of Done (set 2026-06-25 by user)
**Vector Magic quality is the bar — not a prototype.** The finished engine must rival VM:
multi-region segmentation, shared-edge (gap-free) topology, sub-pixel boundaries, clean
Beziers w/ corner preservation, an inversion/optimization loop, per-region gradients, and
robustness across image types. Full roadmap below. Known future fork: pure browser JS will
bottleneck at the optimization/photo stages — may need WASM/Rust or a backend (decide later;
segmentation→fitting is fine in JS). Build it as verifiable steps; benchmark every step.

ROADMAP TO BAR:
  1. Multi-region segmentation (SLIC in Lab + region merge)         <- IN PROGRESS
  2. Shared-edge region adjacency graph (gap-free, no double edges)
  3. Sub-pixel boundary placement from coverage (math exists)
  4. Bezier fit w/ corner preservation (basic exists, harden)
  5. Inversion loop: minimize re-rasterization error
  6. Per-region gradients (glows/shading/metallic)
  7. Robustness across image types (photo/scan/lowres classifier + handling)

## Current State
Working raster-to-SVG prototype at `app/index.html` (no build step, runs in browser).
Pipeline: cleanup → edge-preserving smooth → anti-alias coverage snap → small-detail
protection → k-means quantize → ImageTracerJS region trace → soft-effect layer →
layer separation → sub-pixel/curve-optimize (metric-guarded) → export optimize.
Default engine: Auto router. It chooses the Palette engine for clean flat-logo jobs and
the Region engine (SLIC + merge + adaptive gradients) when the palette guard fails.
Experimental: VTracer (WASM) and a handwritten tracer remain comparison-only.
Region engine now has a first guarded inversion-loop step: it traces several SLIC/merge
parameter candidates, rasterizes each SVG through `measureSvgDifference`, and keeps a
candidate only when edge/mean error improves without hot-pixel, contamination, or path-count
regression. First browser test kept base correctly because the tested alternatives were worse.
Live Cloud Run is deployed in project `true-image-to-vector`, region `europe-west1`, service
`vector-accuracy-studio`, revision `vector-accuracy-studio-00010-8lz`, serving 100% traffic.
Public URL tested: https://vector-accuracy-studio-709870851047.europe-west1.run.app
Git repository initialized at `outputs/vector-accuracy-studio` on branch `main`; the baseline
commit is the clean project starting point for future Codex/Claude work.
GitHub remote `origin` points to https://github.com/Panikkos88/vector-image.git.
UI is now focused on the active engine only: Auto router, Medium detail, Smooth
anti-aliasing, and the active metric-guarded optimizer. Older engine/debug selectors are
hidden to avoid confusion while routing is automatic.

2026-06-27 [codex]: BOC/KOINO precision pass added an internal Palette boundary optimizer
behind the hidden dev route `?engine=palette&paletteK=3`. It tests coordinate convention,
iso-level, and simplification variants, then selects by measured edge RMSE/hot pixels/path
growth. On BOC at native 699x780, forced k=3 now selects `centered-raw`: edge RMSE 11.18%
-> 2.78%, MAE 0.30%, hot 0.8%, 55 paths (same as VM), nodes 3,795 -> 28,820. This proves
the 0.5px pixel-center coordinate convention plus less simplification is the big BOC lever.
2026-06-27 [codex]: follow-up node-reduction pass keeps the same hidden Palette route but
selects compact near-tie geometry instead of always taking the sharpest edge result. Current
BOC browser benchmark selects `tight-corners-s20`: edge RMSE 2.70%, MAE 0.28%, hot 0.8%,
55 paths, nodes 16,014, runtime ~3.9s. That preserves the ~2.8% edge target while reducing
nodes 28,820 -> 16,014 vs `centered-raw`.
2026-06-27 [codex]: AA-aware palette selection now downweights detected transition/edge
pixels while choosing the Palette ladder, so BOC auto-picks k=3 without `?paletteK=3`.
Browser benchmark on `?engine=palette` selects k=3, `tight-corners-s18`: edge RMSE 2.60%,
MAE 0.27%, hot 0.7%, 55 paths, nodes 15,835, runtime ~3.9s. Superseded below by the
deployed Auto-router v1, which makes this route the default for flat logos.
2026-06-27 [codex]: Auto-router v1 is now the default and was initially deployed to Cloud Run
revision `vector-accuracy-studio-00009-k8j`. Default/no-query BOC chooses Palette/k=3 and
matches the prior best local result: edge RMSE 2.60%, MAE 0.27%, hot 0.7%, 55 paths,
15,835 nodes, runtime ~4s. Default/no-query shaded test chooses Region because the palette
guard rejects k=14/core residual 15.6. This answers the user requirement: the user no
longer picks an engine manually.
2026-06-27 [codex]: BOC compact-boundary pass reached the measured Vector Magic edge bar.
Default/no-query BOC still routes to Palette/k=3, but the optimizer now selects
`tight-corners-s18-c050`: edge RMSE 2.41%, MAE 0.26%, hot 0.7%, 55 paths, 13,269 nodes,
SVG ~162 KB, runtime ~6.6-6.9s local/cloud. This matches VM's known 2.41% edge / 55-path
reference while reducing nodes vs the previous 15,835-node `tight-corners-s18`.

Quality is near the ceiling of the current "quantize → trace regions → patch" architecture.
Recent post-passes (sub-pixel nudge, background detach v1/v2, micro-prune) are mostly
**rejected by the metric guard** because they don't beat the curve-optimized baseline.
Full per-pass benchmark history lives in SKILL.md.

**Diagnosed ceiling (Claude, 2026-06-25):** the engine traces flat-color regions, so
anti-aliased edges are lost. `recoverAntialiasCoverage` (app.js ~L1133) computes the true
sub-pixel coverage/alpha then immediately binarizes it (snaps to fg/bg at ~0.5). The
"sub-pixel" pass (`estimateCoverageCrossing` ~L2294) only nudges already-traced vertices and
the guard usually rejects it. Reaching Vector Magic quality needs an architecture change
(model + solve), not more post-passes.

## Next Steps
(Ordered by impact. Items 1-4 are an engine change, not a tune-up.)
1. ✅ DONE (2026-06-25 [claude]) **Stop binarizing coverage / capture the coverage map.**
   `recoverAntialiasCoverage` now also returns `coverageField` (per-edge-pixel
   {x,y,alpha,foreground,background,normal}) without changing the snap, so existing engines
   are untouched. Debug "Coverage (debug)" panel + "Show coverage map" toggle render it.
   NEXT within this item: feed `coverageField` into a boundary fitter (= step 2/3 below).
2. **Real spatial segmentation.** Move to Lab color space; replace palette-as-segmentation
   with SLIC superpixels → region merging.
3. **Coverage-driven boundary fitting.** Fit region boundaries to the coverage crossing,
   then to cubic Béziers w/ corner detection. Demote ImageTracerJS to a comparison baseline.
4. IN PROGRESS **Turn the metric guard into an optimizer.**
   - FIRST PASS (2026-06-26 [codex]): guarded global SLIC/merge candidate sweep + `regionOptimization`.
   - LOCAL SEARCH (2026-06-26 [claude]): bounded hill-climb (±regionSize/merge/compactness) around
     the winner, GATED to run only when the global sweep beat base (keeps common case fast).
     Verified do-no-harm; on our test images base is already locally optimal so it changes nothing.
   - MICRO-CANDIDATES (2026-06-26 [claude]): DONE. High-error regions (by fit residual) are
     split via 2-means Lab color into sub-regions, re-traced, kept only if edge clearly improves
     (looser path guard). Verified do-no-harm; on shaded the split was worse (radial already wins)
     so guard rejected; on the logo the optimizer (local search) won 7.65->6.94 edge, fewer paths.
   - DOWNSCALE-EVAL / COARSE-TO-FINE (2026-06-26 [claude]): DONE in code. Explore candidates on
     a 400px copy (regionSize scaled by downscale factor), then PROMOTE the top eval candidates
     (+base) to FULL res and decide there (full-res base is the floor -> can't regress).
     Result: 27s -> ~2-3s. BUT 400px ranking is imperfect: on the logo it did NOT surface the
     full-res winner, so it reverted to base (lost the marginal 7.65->6.94 win); do-no-harm held.
     Bumped promote 4->6 to try to recover the win (NOT yet browser-verified — see handoff).
   - OPEN for Codex: verify promote=6 recovers the logo win at acceptable speed; if not, options =
     raise maxEvalDim (e.g. 560), or seed a tiny FULL-res local search around the eval winner.
5. Real gradient/diffusion-curve modeling for glows/shadows (soft-effect layer is flat blur today).
6. DONE (2026-06-27 [codex]) Auto-router v1 selects Palette for flat BOC/KOINO and Region
   for shaded/gradient content. Next routing work should expand the labeled test set beyond
   BOC + shaded-test + NS CAR before changing thresholds.

Current BOC status: edge RMSE now matches the measured VM reference at about 2.41% with
the same 55 paths and fewer nodes than the prior local/cloud build. Remaining VM gaps are
MAE/hot pixels (ours 0.26% / 0.7% vs VM about 0.17% / 0.5%) and visual QA across more
flat-logo samples before changing router thresholds.

**Recommended first build:** prototype items 1+3 as a NEW experimental engine alongside
ImageTracerJS, so it can be benchmarked against the current output without breaking the baseline.

## VM ALGORITHM INTELLIGENCE (from HAR) — 2026-06-26 [claude]  *** READ THIS ***
Decoded vectormagic.com.har (BOC job pk4ecegitdxeq). VM's real pipeline:
  POST /api/images (w/h/size) -> upload raster to S3/CloudFront -> WSS /internal/websocket
  streams progress -> CLASSIFY (imageTypeE=2 logo/AA, imageComplexityE=3 high, usePaletteE=1)
  -> PALETTE LADDER -> quantize to chosen small palette -> server SEGMENTATION png ->
  trace -> download /svg|eps|pdf. Multiple variant jobs run (diff complexity/palette).
KEY = PALETTE LADDER (the secret): VM computes the OPTIMAL palette for every k=2..12+, each
with a score, auto-picks the elbow. For BOC it picked k=3: #006b84 teal, #fcb828 yellow,
#f9fafc white. Then quantizes whole image to those 3 -> crisp segmentation (saved
research/vm-boc-segmentation.png) -> trace. So VM = GLOBAL OPTIMAL SMALL PALETTE + quantize +
per-color segmentation + clean trace. NOT superpixels, NOT per-region means.
BOC HEAD-TO-HEAD (699x780 vs original, bg teal):
                 edge%  MAE%  hot%  paths
  Vector Magic   2.41   0.17  0.5   55
  Ours rs16      12.56  1.19  2.9   57
  Ours rs9       12.62  1.23  2.9   83
=> VM ~5x better edge at SAME path count. Our SLIC+per-region-mean approach is the WRONG tool
   for flat logos (too many fuzzy colors). Curve fitting already disproven as the lever.
REDIRECTED #1 PRIORITY (flat logos): (1) optimal palette estimation (ladder + elbow -> small
palette ~3-6), (2) quantize image to palette w/ AA edge handling, (3) connected-component
segmentation PER PALETTE COLOR (not SLIC means), (4) feed clean regions to existing sub-pixel
boundary + Bezier code. Target: BOC 12.6% -> ~3%. Keep SLIC/gradient path for SHADED content
(content-adaptive: flat->palette engine, shaded->region engine). Refs: app/assets/vm-boc.svg,
app/assets/vm-nscar.svg, research/vm-boc-segmentation.png.

## PALETTE ENGINE v1 — BUILT 2026-06-26 [claude] (steps 1-4 done; router=step5 still TODO)
Implemented + integrated (dev-flagged). NEW fns in app.js: paletteResidual, kmeansPalette,
computePaletteLadder (step1 ladder+elbow), quantizeToPalette, buildPaletteRegions (step2+3:
quantize->per-color connected components via findComponentsForLabel -> regions object).
Reuses traceRegionsToSvg as the finisher (step4). Engine branch "palette" in runTracePipeline;
engineLabels.palette; DEV OVERRIDE `?engine=palette|regions|coverage|imagetracer` (no user UI
selector — router will choose later). Fixed a crash: regionCoverageProjection now guards a
missing neighbour color (`if(!cs)return 1`) so dropped-speckle (-1) pixels are absorbed.
Cache `?v=20260626-palette1`. node --check OK. Snapshot app.js.bak-0626g-claude-palette.
BOC RESULT (699x780 vs original, vs VM 2.41% edge / 55 paths):
  auto (picked k=4): edge 11.89% / 113 paths / ~0.8s
  forced k=3:        edge 11.23% / 55 paths  (== VM's palette + EXACT path count!)
  MAE ~1.0%, hot ~2.6% (LOW) -> error is concentrated AT BOUNDARIES, not areas.
KEY FINDINGS (update the diagnosis):
  1. Palette + per-color segmentation now MATCHES VM structurally (k=3 -> 55 regions = VM's 55).
     The palette approach is validated for flat logos. 
  2. Edge still ~5x worse than VM despite identical structure -> the remaining lever is now
     BOUNDARY/CURVE PRECISION (sub-pixel placement + curve fit). This REVERSES the earlier
     "curves don't matter" note (that was measured when segmentation was wrong). Re-apply
     Schneider (saved in app.js.bak-0626f) + tighten sub-pixel placement NOW that regions are right.
  3. k-selection picks k=4 because the ANTI-ALIASED edge blend (#7bb2be) inflates the k=3 residual.
     VM picks 3 and treats edges as coverage. FIX: estimate palette ignoring edge/transition
     pixels (or treat AA as coverage), so the elbow lands on k=3 like VM.
NEXT (revised priority): (A) boundary/curve precision on palette regions [biggest lever now],
(B) DONE 2026-06-27 [codex] AA-aware k selection (-> k=3), (C) DONE 2026-06-27 [codex]
Auto-router v1 default/deployed.
Target BOC 11% -> ~3%.
UPDATE 2026-06-26 [claude]: re-tested Schneider curve fitting ON the correct k=3 palette regions
(snapshot app.js.bak-0626h). It made BOC WORSE (k3 11.23 -> 12.0; k4 -> 17.0). So CURVE FITTING
IS DEFINITIVELY NOT THE LEVER (disproven twice; reverted, kept Catmull-Rom). The ~11% edge gap
at correct structure (k3, 55 paths) is BOUNDARY-PLACEMENT PRECISION on the MANY fine high-
contrast edges (wreath leaves, thin Greek strokes, dashes): MAE 1.0%/hot 2.6% are low, but
edge-weighted RMSE punishes small per-edge offsets across thousands of fine-edge pixels. VM
nails each fine edge sub-pixel; we're slightly off on each -> accumulates to ~11%. This is an
UNSOLVED precision problem. Likely investigation (NOT curves): (i) sub-pixel iso placement
convention/offset in marching squares (possible ~0.5px systematic), (ii) simplifyClosedLoop
tolerance (0.5) shifting points -> try ~0.2 / skip simplify on small loops, (iii) the soft
membership field accuracy. Cheap experiments before any big build. Do NOT retry curve fitting.
UPDATE 2026-06-27 [codex]: BOC boundary experiment confirms (i) and (ii). Applying a +0.5px
pixel-center coordinate offset alone improves k=3 BOC edge 11.18% -> 6.18% at same 55 paths.
Combining +0.5px with near-raw simplification improves to 2.78% edge / 0.30% MAE / 0.8% hot,
same 55 paths, close to VM's 2.41% edge. Cost is high node count (28,820 estimate), so the next
precision task is node reduction/simplification that preserves the centered-raw geometry.
UPDATE 2026-06-27 [codex]: node-reduction pass added a compact-candidate selector. It first
finds the best edge result, then chooses the lowest-node candidate within a tight edge/hot band.
For BOC forced k=3, best edge was `tight-corners-s12` at 2.50% edge / 21,045 nodes, but the
compact guard selected `tight-corners-s20` at 2.70% edge / 16,014 nodes / 55 paths / 0.8% hot.
`tight-corners-s21` measured 2.75% / 15,316 nodes but was just outside the exact guard band;
`s22` dropped to 2.83% edge, so `s20` is the current safe compact point.
UPDATE 2026-06-27 [codex]: AA-aware palette selection is implemented. The ladder now
downweights coverage/contrast transition pixels during palette k-means and uses the core
residual for k selection while still recording full residual. BOC no longer needs
`?paletteK=3`: `?engine=palette` auto-selects k=3 with colors #067088, #e9f1f5, #fcb828 and
final `tight-corners-s18` output at 2.60% edge / 0.27% MAE / 0.7% hot / 55 paths / 15,835 nodes.
UPDATE 2026-06-27 [codex]: Auto-router v1 is implemented and deployed. Default/no-query BOC
routes to Palette/k=3; default/no-query shaded routes to Region because the palette guard fails.
UPDATE 2026-06-27 [codex]: Compact-boundary v2 reached the BOC VM edge bar without complexity
growth. It adds sharper corner-angle candidates around `tight-corners-s12..s18`, narrows the
compact-selection edge band, and selects `tight-corners-s18-c050`: 2.41% edge / 0.26% MAE /
0.7% hot / 55 paths / 13,269 nodes.

## PALETTE ENGINE SPEC (next major build) — 2026-06-26 [claude]  *** START HERE ***
GOAL: close the VM gap on FLAT logos (BOC 12.6% -> ~3% edge; NS CAR 7.5% -> ~3%) by building a
PALETTE ENGINE, and ship it behind an AUTO ROUTER so the user never picks an engine (VM-style).
Deliverable = "Palette Engine v1 + Auto Router v1 TOGETHER" (not a user-facing engine button).
Build the palette engine internally first (steps 1-4), keep the Region engine for shaded art,
then wire the router (step 5). Nothing existing breaks; engine choice leaves the user UI. Verify each step vs app/assets/vm-boc.svg +
vm-nscar.svg using measureSvgDifference. Do it in small commits, browser-verified each time.
Reuse existing: loopToSmoothSubpath (sub-pixel Bezier finish), extractIsoSegments/
linkSegmentsIntoLoops (contour), measureSvgDifference (guard/benchmark), fitRegionAdaptive
(only if a region needs a gradient — flat logos usually won't).

STEP 1 — Optimal palette estimation ("palette ladder").
  - For k = 2..~16, compute the best k-color palette (k-means in Lab on a sample of pixels;
    seed with k-means++). Record per-k quantization error (mean Lab distance).
  - Pick k at the "elbow" (error drop flattens) -> small palette (VM picked 3 for BOC).
    Expose an override so we can force k for testing.
  - ACCEPTANCE: on BOC the auto-pick lands k=3-4 with colors ~ {#006b84, #fcb828, #f9fafc}.

STEP 2 — Quantize to palette with anti-aliased edge handling.
  - Assign each pixel to nearest palette color (Lab). At edges, keep coverage so boundaries
    can be placed sub-pixel (reuse the coverage idea from recoverAntialiasCoverage rather than
    a hard snap). Output a per-pixel label map (palette index).
  - ACCEPTANCE: quantized preview visually matches VM's segmentation
    (research/vm-boc-segmentation.png): crisp teal/white/yellow, clean edges.

STEP 3 — Per-color connected-component segmentation.
  - For each palette color, find connected components (flood/union-find) = regions. This
    REPLACES SLIC for flat art (SLIC+per-region-mean was the wrong tool -> 12.6%).
  - Drop/merge tiny speckle components (area threshold). Keep holes (a region inside another).
  - ACCEPTANCE: BOC yields a few dozen clean components (bg, frame, yellow band, each glyph/
    leaf/dot), comparable to VM's ~55 paths.

STEP 4 — Trace + finish (reuse existing).
  - Per component: marching-squares iso on its mask (with the +1 zero-ring border fix already
    in traceRegionsToSvg), link loops, sub-pixel place, loopToSmoothSubpath for Beziers.
  - Fill each component with its PALETTE color (flat). Painter's order largest-first; holes via
    even-odd or paint-over (as today). Full-canvas base = largest region (border-gap fix).
  - ACCEPTANCE (the target): BOC edge <= ~4% at <= ~60 paths; NS CAR <= ~4%. Compare to VM
    2.41%/2.91%. If close, this is the flat-logo engine.

STEP 5 — AUTO ROUTER v1 (build TOGETHER with the Palette engine; product decision 2026-06-26 user).
  PRODUCT RULE: user does NOT choose an engine. The app auto-detects image type and routes.
  Show only result + a small status, e.g. "Detected: Flat logo artwork / Mode: Clean palette trace".
  Remove the engine selector from the user UI; keep a HIDDEN dev override (e.g. ?engine= or a dev
  flag) for testing/benchmarking only.
  CLASSIFIER (cheap, reuse the palette ladder already computed in STEP 1 — no extra pass):
    - flat logo  -> small elbow k with LOW quantization residual + hard edges  -> PALETTE engine
    - shaded/metallic/glow -> small k fails (residual stays high) but tones are smooth/continuous
      (low local gradient variance across regions) -> REGION engine (already wins on NS CAR/spheres)
    - photo/scan/complex -> high residual even at large k / high color entropy everywhere ->
      WARN ("not ideal for clean logo vectorization yet"); real photo engine is future (#7).
  Start with simple thresholds; TUNE against a small labeled set: BOC=flat, NS CAR=shaded, +1 photo.
  Optional later: self-check fallback (if chosen engine's measured edge error is poor, try the other).
  Routing must be do-no-harm: if unsure, prefer the engine that historically scores better for that
  signal; never worse than today's region-only default.

STEP 6 — Standing VM benchmark harness.
  - Script/page action: for each test logo, measure our output vs the VM reference SVG and the
    original; print edge/MAE/hot/paths table. Run it after every change. Targets = VM numbers.

DE-PRIORITIZED (do NOT chase first): Schneider curve fitting (disproven as the lever; code saved
in app.js.bak-0626f-claude-schneider, revisit for tidiness later); more optimizer tuning
(downscale-eval/promote-N WIP parked). 

## VM REFERENCE BENCHMARK (the bar to beat) — 2026-06-26 [claude]
User supplied Vector Magic's output for the NS CAR logo (= app/assets/sample-logo.png).
Saved VM SVG as app/assets/vm-nscar.svg. HEAD-TO-HEAD vs original raster (1024x724, bg black):
                 edge%   MAE%   hot%   paths   gradients
  Vector Magic   2.91    0.41   1.4    34      0
  Ours rs16      7.53    1.68   4.1    53      24
  Ours rs10      7.78    1.70   4.2    140     80
=> VM is ~2.6x better edge / 4x better MAE with FEWER paths and NO gradients. More paths do
   NOT help us (140 was worse) -> our deficit is QUALITY not budget.
WHERE WE LACK (priority):
  1. CURVE FITTING (biggest): VM = clean minimal cubic Beziers; we Catmull-Rom through marching-
     squares pixel points -> bumpy/imprecise edges. NEED least-squares Bezier fit (Schneider) +
     corner detection + adaptive error. Highest-impact next task.
  2. SHADING: VM uses ~5 stacked FLAT tonal shapes (no gradients) and wins; our 24 linear/radial
     gradients LOSE. Reconsider gradient approach vs finer tonal segmentation + flat fills.
  3. Boundary alignment: VM boundaries sit exactly on tonal edges; SLIC+merge boundaries don't.
  4. Palette coherence: VM ~7 deliberate colors vs our per-region means.
TARGET: get edge from ~7.5% down toward ~3% on this image, primarily via (1) then (2).
UPDATE 2026-06-26 [claude]: TESTED priority #1 (curve fitting). Implemented full Schneider
least-squares cubic Bezier fitting (corner-split + adaptive subdivision) replacing Catmull-Rom.
HEAD-TO-HEAD on NS CAR: edge 7.53 -> 7.92 (SLIGHTLY WORSE), not better. CONCLUSION: curve
fitting is NOT the bottleneck — smoother curves don't help when the region BOUNDARIES are
misplaced. REVERTED (code saved in app.js.bak-0626f-claude-schneider for future reuse/tuning).
RE-PRIORITIZED gap to VM (2.91% edge): the dominant error is (a) SEGMENTATION/BOUNDARY ALIGNMENT
(our SLIC+merge regions don't sit on the design's tonal edges) and (b) SHADING REPRESENTATION
(our per-region linear/radial gradients underperform VM's stacked flat tonal layers). Next work
should target (a)/(b), e.g. edge-snapped segmentation + finer tonal banding with flat fills,
NOT curve fitting. (Schneider may still help curve cleanliness later, with tighter maxError.)

## Change Log  (newest first)
- 2026-06-27 [codex] BOC compact-boundary v2 reached VM edge bar.
  Snapshot before edit: `app/app.js.bak-0627-codex-boc-compact2` and
  `app/index.html.bak-0627-codex-boc-compact2`.
  Files/functions touched:
    - `app/app.js`: added `loopGeometryStats` and `adaptiveLoopSimplifyTolerance`; updated
      `loopToSmoothSubpath` to use adaptive tolerance only when a candidate opts in.
    - `app/app.js`: expanded `paletteBoundaryCandidates` with sharper corner-angle sweeps
      around `tight-corners-s12..s18`, adaptive detail candidates, and final
      `tight-corners-s18-c050`.
    - `app/app.js`: tightened `optimizePaletteTrace` `nodePreferenceEdgeBand` from 0.003 to
      0.0018 so compact selection cannot choose a much worse edge candidate only because it
      has fewer nodes.
    - `app/index.html`: cache-busted app.js to `?v=20260627-boc-compact2`.
    - `WORKLOG.md`, `SKILL.md`: updated current state, next target, and this handoff.
  Local:
    - `npm run check` OK.
    - Browser at `http://localhost:8787/?run=boc-compact2-local-sweep3`, Load BOC Test, Trace:
      Auto router selected Palette/k=3. Boundary optimizer selected `tight-corners-s18-c050`
      after 36 candidates; best raw edge candidate was `tight-corners-s12-c065` at 2.33% edge /
      19,982 nodes, but compact selection chose 2.41% edge / 13,269 nodes. Final output:
      MAE 0.26%, edge RMSE 2.41%, hot 0.7%, 55 paths, SVG ~162,826 bytes, runtime 6,626 ms,
      Download SVG enabled.
    - Local shaded regression: Auto router selected Region, MAE 1.09%, edge RMSE 4.05%,
      hot 2.7%, 10 paths, runtime 2,804 ms, Download SVG enabled.
    - Local NS CAR/sample regression: Auto router selected Region, MAE 1.25%, edge RMSE 6.94%,
      hot 3.7%, 30 paths, runtime 4,717 ms, Download SVG enabled.
  VM:
    - Current known Vector Magic BOC reference remains about MAE 0.17%, edge RMSE 2.41%,
      hot 0.5%, 55 paths. Our default local/cloud BOC is now about MAE 0.26%, edge RMSE
      2.41%, hot 0.7%, 55 paths, so the edge gap is effectively closed while MAE/hot pixels
      still trail VM.
  Cloud:
    - Deployed with `gcloud run deploy vector-accuracy-studio --source . --project true-image-to-vector
      --region europe-west1 --port 8080 --allow-unauthenticated`.
    - Cloud Run revision `vector-accuracy-studio-00010-8lz` serves 100% traffic.
    - Public URL tested: https://vector-accuracy-studio-709870851047.europe-west1.run.app
    - Cache tag verified in deployed HTML: `app.js?v=20260627-boc-compact2`.
    - Cloud BOC result: Palette/k=3, selected `tight-corners-s18-c050`, MAE 0.26%,
      edge RMSE 2.41%, hot 0.7%, 55 paths, 13,269 nodes, SVG ~162,826 bytes, runtime 6,916 ms,
      Download SVG enabled.
    - Cloud shaded regression: Region engine, MAE 1.09%, edge RMSE 4.05%, hot 2.7%,
      10 paths, runtime 2,714 ms.
    - Cloud NS CAR/sample regression: Region engine, MAE 1.25%, edge RMSE 6.94%,
      hot 3.7%, 30 paths, runtime 4,409 ms.
  Decision:
    - Accepted. BOC now matches VM's measured edge RMSE at the same 55-path structure and
      lower node count than the previous auto-router build (13,269 vs 15,835). Do not keep
      chasing BOC edge blindly; next quality work should target BOC MAE/hot pixels and a
      broader flat-logo benchmark set.

- 2026-06-27 [codex] Auto-router v1 deployed and proof-loop tested.
  Snapshot before edit: `app/app.js.bak-0627-codex-router1` and
  `app/index.html.bak-0627-codex-router1`.
  Files/functions touched:
    - `app/app.js`: changed default `selectorState.engine` to `auto`; added
      `engineLabels.auto`; updated `applySelectorState` active labels.
    - `app/app.js`: added `paletteLadderOptions`, `autoRouteFromPaletteLadder`, and
      `forcedRouteDecision`.
    - `app/app.js`: updated `runTracePipeline` to compute the Palette ladder once, route
      automatically to Palette or Region, and attach `routerDecision` to traced outputs.
    - `app/app.js`: updated `buildBenchmarkRun` to persist `routerDecision`; updated
      `traceCurrentImage` logging to show the automatic route and guard reason.
    - `app/index.html`: changed the initial UI copy to Auto router / Auto route + metric guard
      and cache-busted app.js to `?v=20260627-router1`.
    - `WORKLOG.md`, `SKILL.md`: updated current state, next steps, and this handoff entry.
  Local:
    - `npm run check` OK.
    - Browser at `http://localhost:8787/?run=router1-boc-local`, Load BOC Test, Trace:
      Auto router selected Palette engine (flat-logo), k=3, core residual 9.1, full residual 10,
      transition pixels 6.4%. Final output: MAE 0.27%, edge RMSE 2.60%, hot 0.7%,
      background contamination 0.06%, 55 paths, 15,835 nodes, runtime 3,962 ms.
    - Browser at `http://localhost:8787/?run=router1-shaded-local`, Load Shaded Test, Trace:
      Auto router selected Region engine because the palette guard failed (k 14 > 4,
      core residual 15.6 > 12.5). Final output: MAE 1.09%, edge RMSE 4.05%,
      hot 2.7%, 10 paths, 4 gradients, runtime 2,475 ms.
    - Download SVG button was enabled after trace; local Playwright did not emit a blob download
      event, but the click produced no console errors.
  VM:
    - Current known Vector Magic BOC reference remains about MAE 0.17%, edge RMSE 2.41%,
      hot 0.5%, 55 paths. Our default local/cloud BOC is now 2.60% edge / 0.27% MAE /
      0.7% hot / 55 paths, so the remaining gap is about +0.19 edge points.
  Cloud:
    - Deployed with `gcloud run deploy vector-accuracy-studio --source . --project true-image-to-vector
      --region europe-west1 --port 8080 --allow-unauthenticated`.
    - Cloud Run revision `vector-accuracy-studio-00009-k8j` serves 100% traffic.
    - Public URL tested: https://vector-accuracy-studio-709870851047.europe-west1.run.app
    - Cache tag verified in deployed HTML: `app.js?v=20260627-router1`.
    - Cloud browser BOC default/no-query result: Palette engine, MAE 0.27%, edge RMSE 2.60%,
      hot 0.7%, 55 paths, runtime 3,950-3,971 ms.
    - Cloud browser shaded default/no-query result: Region engine, MAE 1.09%, edge RMSE 4.05%,
      hot 2.7%, 10 paths, 4 gradients, runtime 2,317 ms.
    - Cloud BOC SVG preview/export structure verified: `<svg>...</svg>`, 55 paths, 0 gradients,
      0 filters, about 192,274 bytes, Download SVG enabled.
  Decision:
    - Accepted. The user no longer needs to choose an engine. BOC auto-routes to the near-VM
      Palette path; shaded/gradient content auto-routes to Region. Next work is closing the
      final BOC edge gap (2.60% -> VM ~2.41%) without node/path growth and expanding the
      router test set before changing thresholds.

- 2026-06-27 [codex] Mandatory testing/release proof loop added for both agents.
  User requested that every meaningful engine change be tested through a repeatable process,
  including local results, Vector Magic reference comparison where available, and Google Cloud
  proof after deploy. This entry is also the handoff to Claude: read the new
  "Mandatory Test Process For Engine Changes" section near the top before future engine work.
  Files/functions touched:
    - `WORKLOG.md`: added `Mandatory Test Process For Engine Changes` section and this
      change-log entry.
  Local: not run; docs/process-only change.
  VM: not run; docs/process-only change.
  Cloud: not deployed/tested; docs/process-only change.
  Decision: accepted as new required workflow. Future engine changes must log Local / VM /
  Cloud / Decision lines, or explicitly say why a proof step was skipped.
- 2026-06-27 [codex] BOC AA-aware Palette k-selection pass v1.
  Snapshot before edit: `app/app.js.bak-0627-codex-aa-k1` and
  `app/index.html.bak-0627-codex-aa-k1`.
  Files/functions touched:
    - `app/app.js`: updated `buildColorBuckets` to support weighted buckets via
      `downweightMask`/`downweight`.
    - `app/app.js`: added `markPaletteTransition`, `buildPaletteTransitionMask`, and
      `selectPaletteLadderEntry`.
    - `app/app.js`: updated `computePaletteLadder` to downweight AA/contrast transition
      pixels for k selection, record full/core/selection residuals, and keep forced
      `paletteK` as a hidden override.
    - `app/app.js`: updated the Palette branch of `runTracePipeline`,
      `optimizePaletteTrace` stats, and `traceCurrentImage` log output to persist and
      display AA-aware palette selection metadata.
    - `app/index.html`: cache-busted app.js to `?v=20260627-aa-k1`.
    - `WORKLOG.md`, `SKILL.md`: updated current state, algorithm memory, and this handoff.
  Checks: `npm run check` OK. Browser benchmark at
  `http://localhost:8787/?engine=palette` (no `paletteK`), Load BOC Test, Trace:
    Palette engine auto-selected k=3 using AA-aware core residual 9.1, full residual 10,
    colors #067088, #e9f1f5, #fcb828; downweighted 35,074 transition pixels (6.4%).
    Boundary optimizer selected `tight-corners-s18`: edge 11.15% -> 2.60%, MAE 0.27%,
    RMSE 1.27%, hot 2.6% -> 0.7%, background contamination 0.06%, 55 paths,
    nodes 3,803 -> 15,835, runtime 3,896 ms.
  Interpretation: BOC now reaches the intended VM-like small-palette path automatically.
  This beats the prior forced-k compact result (2.70% edge / 16,014 nodes) and removes
  the hidden `?paletteK=3` requirement for this logo. Next work is auto-routing so the app
  chooses Palette vs Region without the hidden `?engine=palette` route.
- 2026-06-27 [codex] BOC Palette node-reduction pass v1.
  Snapshot before edit: `app/app.js.bak-0627-codex-boc-node1` and
  `app/index.html.bak-0627-codex-boc-node1`.
  Files/functions touched:
    - `app/app.js`: expanded `paletteBoundaryCandidates` with intermediate centered and
      tight-corner simplification variants (`centered-s08` through `centered-s20`,
      `tight-corners-s12` through `tight-corners-s25`).
    - `app/app.js`: replaced the previous single-winner guard with
      `paletteBoundaryCandidatePassesGuard` and `selectPaletteBoundaryResult`; updated
      `optimizePaletteTrace` to record `bestEdgeCandidate`, compact edge band, node/hot
      preference stats, and richer candidate summaries.
    - `app/app.js`: updated `traceCurrentImage` Palette optimizer logging to show the
      best-edge candidate and compact-selection band.
    - `app/index.html`: cache-busted app.js to `?v=20260627-boc-node5`.
    - `WORKLOG.md`, `SKILL.md`: updated current state, algorithm memory, and this handoff.
  Checks: `npm run check` OK. Browser benchmark at
  `http://localhost:8787/?engine=palette&paletteK=3`, Load BOC Test, Trace:
    baseline palette boundary edge 11.18%, hot 2.6%, 55 paths, 3,795 nodes;
    previous sharp `centered-raw` edge 2.78%, hot 0.8%, 55 paths, 28,820 nodes;
    best measured edge `tight-corners-s12` edge 2.50%, hot 0.7%, 55 paths, 21,045 nodes;
    selected compact `tight-corners-s20` edge 2.70%, MAE 0.28%, RMSE 1.32%,
    hot 0.8%, background contamination 0.06%, 55 paths, 16,014 nodes, 3,930 ms.
  Interpretation: BOC is still near Vector Magic's 2.41% edge / 55-path reference, now with
  ~44% fewer nodes than `centered-raw`. `tight-corners-s21` measured 2.75% / 15,316 nodes
  but was just outside the exact guard band; `s22` fell to 2.83%, so `s20` is the current
  safe compact choice. Next work is AA-aware k selection so the hidden forced `paletteK=3`
  becomes automatic.
- 2026-06-27 [codex] BOC Palette boundary precision pass v1.
  Snapshot before edit: `app/app.js.bak-0627-codex-boc-boundary1` and
  `app/index.html.bak-0627-codex-boc-boundary1`.
  Files/functions touched:
    - `app/app.js`: added `devOptions`, `readQueryParam`, `readQueryNumber`; updated
      `applySelectorState` to reflect hidden dev engine in the focused settings panel; updated
      `traceRegionsToSvg` with `regionBoundary` knobs (`iso`, `simplifyTolerance`,
      `cornerAngle`, `coordinateOffset`) and records boundary stats in `regionEngine`.
    - `app/app.js`: added `paletteBoundaryCandidates`, `paletteBoundaryCandidateBeatsCurrent`,
      `optimizePaletteTrace`; updated the Palette branch of `runTracePipeline` to use measured
      boundary candidates and hidden `?paletteK=3`; updated `buildBenchmarkRun` and
      `traceCurrentImage` to persist/log `paletteInfo` and `paletteOptimization`; added BOC
      test asset event hook.
    - `app/index.html`: added `Load BOC Test`; added focused-settings label ids; cache-busted
      app.js to `?v=20260627-boc-boundary1`.
  Checks: `npm run check` OK. Browser benchmark at
  `http://localhost:8787/?engine=palette&paletteK=3`, Load BOC Test, Trace:
    baseline palette boundary edge 11.18%, hot 2.6%, 55 paths, 3,795 nodes;
    selected `centered-raw` edge 2.78%, MAE 0.30%, RMSE 1.60%, hot 0.8%,
    background contamination 0.13%, 55 paths, 28,820 nodes, 1,822 ms.
  Interpretation: we are now very close to VM's BOC metric (VM 2.41% edge / 55 paths), but the
  selected result is node-heavy. Next work should reduce nodes without losing the +0.5px/raw-loop
  boundary accuracy, then make k=3 automatic with AA-aware palette selection.
- 2026-06-26 [claude] CRITICAL BUG FIXED: border-touching region flood-fill (found via the real
  KOINO/boc logo). `traceRegionsToSvg` built the per-region marching-squares field WITHOUT a
  guaranteed 0-ring on the image-edge sides (x0/y0 clamped to 0). A region touching the image
  border (this logo has a light PERIMETER FRAME touching all 4 edges) couldn't close its contour,
  so the even-odd fill FLOODED the interior with that region's color (white over teal).
  Symptom: KOINO logo MAE 30% / edge 44% / hot 46% with correct colors. Earlier tests (shaded,
  NS-CAR) had no full border frame so it never surfaced.
  FIX: field offset +1 each side (fw/fh +3, fi uses +1, loop points map p+x0-1/p+y0-1) -> full
  0-ring always. Added app/assets/boc-logo-small.png test asset. Cache `?v=20260626-borderfix1`.
  node --check OK. VERIFIED (manual internals, regionSize 9, 137 regions):
    KOINO logo: 43.87 -> 11.0 edge, 30.07 -> 0.96 MAE, 45.6 -> 2.5 hot, 87 paths.
                (vs the ORIGINAL ImageTracer on this logo: 18.5% edge / 5359 paths -> we now
                 beat it on edge at ~60x fewer paths.)
    Shaded app trace: 4.08 -> 4.05 edge, 10 paths = NO REGRESSION (do-no-harm for interior).
  STILL OPEN for the KOINO logo (Codex): (1) app default is MEDIUM (regionSize ~27) which is too
  coarse for this fine wreath/text — needs higher region density / content-adaptive detail;
  (2) the downscale-eval optimizer MISPREDICTS badly on fine detail (400px eval said 19.66% edge
  but full-res was 43.9% pre-fix) -> reconsider downscale-eval for high-edge-density images
  (raise maxEvalDim, or skip downscaling when detail is high). App end-to-end on this logo at
  Medium will still be mediocre until (1)/(2) are addressed; the FIX makes it correct, not yet great.
  COMMITTED 4a85c8f, pushed. DEPLOYED Cloud Run rev 00008-s8t (borderfix1) 100%; live-verified
  (0-ring fix in served app.js, /assets/boc-logo-small.png 200).
- 2026-06-26 [claude] DOWNSCALE-EVAL + COARSE-TO-FINE optimizer speedup (handoff to Codex).
  `optimizeRegionTrace`: NEW `downscaleImageData`; candidates now explored on a 400px copy via
  `evalSource`/`evalReference`/`evalC` (regionSize scaled by downscale factor) + `evalTrace`;
  then the top eval candidates (+base) are PROMOTED to full res and the winner is chosen there
  (`fullTraceOf`, full-res guard = do-no-harm floor). `regionOptimization` gains evalDownscaled/
  evalDims/fullRes* stats. Cache `?v=20260626-downscale1`. Snapshot app.js.bak-0626e-claude-downscale.
  VERIFIED IN PREVIEW (promote=4):
    shaded 512px: 9s -> ~2s, edge 4.09 -> 4.08 (do-no-harm), full-res viewBox 512.
    logo 1024px : 27s -> ~3s, edge 7.65 (= base; the 6.94 win was NOT recovered — 400px ranking
                  missed the full-res winner). Do-no-harm held; output is full-res (viewBox 1024).
  THEN changed promote 4 -> 6 to try to recover the logo win — node --check OK but NOT browser-
  verified (user asked to save for Codex before I finished the re-test).
  NOT committed-as-deployed: live Cloud Run is still microcand1 (rev 00007). NOT deployed this build.
  CODEX TODO: (1) reload preview, trace logo, confirm promote=6 effect + runtime; (2) if win still
  not recovered, raise maxEvalDim (~560) or add a small full-res local search around the eval winner;
  (3) deploy when satisfied.
- 2026-06-26 [claude] #5 PER-REGION MICRO-CANDIDATES (split) added to `optimizeRegionTrace`.
  NEW `computeRegionStats`, `splitRegionInPlace` (2-means Lab split of one region),
  `refineRegions` (find high-residual regions via fitRegionAdaptive, split top-N, rebuild),
  `refinementBeatsCurrent` (guard: edge must improve >0.1pt vs best, hot slack 0.5pt, paths
  <=2.2x base). Integrated after local search; adds a `region-split` candidate + `refinement`
  stats. Trimmed local search budget maxEvals 16->9, maxRounds 4->2 (most gain is early).
  Snapshot app.js.bak-0626d-claude-microcand. Cache `?v=20260626-microcand1`. node --check OK.
  VERIFIED (preview, Region engine):
    SHADED-test (512px): split tried (region-split edge 4.27% vs base 4.09%) -> guard REJECTED
      (radial gradient already wins on smooth shading); kept base. Do-no-harm. ~9s.
    LOGO (1024px): optimizer SELECTED a local-search candidate, edge 7.65% -> 6.94%, paths
      28 -> ~25 (better edge AND fewer paths). Real quality win. ~27s.
  HONEST: micro-candidate split targets WRONGLY-MERGED / bimodal regions (different failure mode
  than smooth shading, which radial handles). It engages and the guard never lets it hurt.
  Main downside = runtime (full-res candidate eval); downscale-eval is the planned fix (Next #4).
- 2026-06-26 [claude] RESUMED Codex's #5 (inversion loop): added bounded LOCAL SEARCH to
  `optimizeRegionTrace` (app.js ~L4601). After the global candidate sweep, hill-climbs by
  perturbing regionSize/mergeThreshold/compactness (±2) around the winner, keeping a neighbour
  only if it beats current best within the SAME guards; bounded by maxEvals=16 / maxRounds=4.
  GATED: only runs when the global sweep already beat base (`improved = best.name !== "base"`),
  so the common case stays fast. Added `localSearchRounds` to regionOptimization stats.
  Snapshot app.js.bak-0626c-claude-localsearch. Cache `?v=20260626-region-opt2`. node --check OK.
  VERIFIED LIVE-LOCAL (preview, Region engine, shaded-test, Medium):
    - ungated test: 9 candidates tested incl. 6 local neighbours -> guard kept base (do-no-harm),
      12.4s (too slow) -> added the gate.
    - gated: 948 ms, 3 candidates, kept base, metrics identical MAE 1.10 / edge 4.09 / hot 2.8 / 10p.
  HONEST: doesn't move numbers on our test images (base already locally optimal); raises the
  optimizer's ceiling for images where a global candidate wins, at no cost to the common case.
  Real accuracy lever is still per-region micro-candidates (see Next Steps #4). Reconciled with
  Codex's focused-region1 build via git (clean tree, commit 4a824b9) before editing.
  COMMITTED 5bd8f8f, pushed to GitHub (origin/main). DEPLOYED to Cloud Run revision
  `vector-accuracy-studio-00006-7jk` (region-opt2), serving 100%. Live verified via HTTP:
  index 200, app.js?v=region-opt2 200 + contains localSearchRounds, shaded-test 200.
  NOTE: Claude_Preview is sandboxed to the local server (can't drive the remote origin), so
  the functional trace test (948ms, base kept, MAE 1.10/edge 4.09/hot 2.8/10p) ran on the
  byte-identical local copy of the deployed commit. For a true remote in-browser test, use
  Claude_in_Chrome or open the URL manually.
- 2026-06-26 [codex] Focused UI on the active Region engine.
  Snapshot before edit: `app/index.html.bak-0626-codex-focused-ui` and
  `app/app.js.bak-0626-codex-focused-ui`.
  Files touched:
    - `app/app.js`: changed default `selectorState.engine` to `regions`; adjusted trace-log
      wording for hidden coverage/segmentation debug controls.
    - `app/index.html`: removed visible engine/detail/anti-alias/debug selectors and the
      Coverage debug panel; replaced settings panel with fixed Active Vector Engine summary;
      cache-busted app.js to `?v=20260626-focused-region1`.
    - `app/styles.css`: added `active-settings` / `setting-row` styling.
    - `WORKLOG.md`: recorded focused UI state.
  Checks: `npm run check` OK. Browser UI test at `http://localhost:8787/` confirmed zero
  engine/detail/anti-alias buttons, no coverage panel, settings show Region engine (SLIC) /
  Medium / Smooth / Guarded region loop. Shaded Test trace completed using Region engine,
  with Region optimizer kept base after 3 candidates; metrics MAE 1.10%, edge 4.09%,
  hot 2.8%, 10 paths, 4 gradients. Pushed to GitHub as `dd965db`; deployed to Cloud Run
  revision `vector-accuracy-studio-00005-hbt` serving 100% traffic. Cloud UI test confirmed
  the focused settings panel has zero engine/detail/anti-alias buttons, no coverage panel,
  and Shaded Test trace completed with Region engine + Region optimizer in 3794 ms.
- 2026-06-26 [codex] Connected local Git repo to GitHub.
  Files touched: `README.md` (merge conflict resolution), `WORKLOG.md`; Git remote `origin`
  added as `https://github.com/Panikkos88/vector-image.git`.
  Remote had one GitHub placeholder `README.md` commit (`c5911ae`), so local `main` merged
  `origin/main` with `--allow-unrelated-histories` and kept the project README content.
  Benchmark result: not rerun; Git/GitHub connection only.
- 2026-06-26 [codex] Git repository initialized.
  Files touched: `.gitignore`, `.gitattributes`, `WORKLOG.md`; repository metadata created under `.git/`.
  Added ignore rules for `node_modules/`, local backup snapshots (`*.bak-*`), logs, local
  env files, and generated build/coverage folders. Added line-ending/binary attributes for
  source files and assets. Updated protocol/current state to note that Git now exists on branch `main`.
  Baseline commit: `4df0a7e` (`Initial Vector Accuracy Studio baseline`).
  Benchmark result: not rerun; this is version-control setup only. Previous Cloud UI test
  remains the latest functional verification.
- 2026-06-26 [codex] DEPLOYED region optimizer build to Google Cloud Run.
  Files touched: `WORKLOG.md` only (deployment log update); no app code changed in this step.
  Command used: `gcloud run deploy vector-accuracy-studio --source . --project true-image-to-vector --region europe-west1 --port 8080 --allow-unauthenticated`.
  Result: revision `vector-accuracy-studio-00004-fj4` deployed and serving 100% traffic.
  Static smoke checks against Cloud Run: `/` 200, `/app.js?v=20260626-region-opt1` 200,
  `/assets/shaded-test.png` 200; live app.js contains `optimizeRegionTrace`; index contains
  cache tag `20260626-region-opt1`.
  Cloud UI/browser test on deployed app:
    Loaded public URL, selected Region engine, loaded Shaded Test, clicked Trace.
    Trace completed in 996 ms. Region optimizer kept base after 3 candidates.
    Final metrics: MAE 1.10%, RMSE 2.89%, edge 4.09%, hot 2.8%, contamination 0.24%,
    10 paths, 4 gradients. Candidate metrics: base edge 4.09% / hot 2.8% / 10 paths;
    edge-tight 4.85% / 4.3% / 9 paths; color-loose 4.36% / 3.3% / 9 paths.
    UI smoke: SVG preview rendered, 10 paths, 4 gradients, Download SVG enabled,
    benchmark summary showed 1 stored run.
- 2026-06-26 [codex] ROADMAP #5 FIRST PASS: guarded region inversion loop.
  Snapshot before edit: `app/app.js.bak-0626-codex-inversion1`.
  Files touched:
    - `app/app.js`: added `regionEngineBaseSettings`, `regionEngineCandidates`,
      `traceRegionCandidate`, `regionCandidateBeatsCurrent`, `optimizeRegionTrace`;
      updated the `selectorState.engine === "regions"` branch in `runTracePipeline`;
      updated `buildBenchmarkRun` to persist `regionEngine` + `regionOptimization`;
      updated `traceCurrentImage` log output to show candidate metrics.
    - `app/index.html`: cache-busted app.js to `?v=20260626-region-opt1`.
  Behavior: Region engine now traces multiple SLIC/merge variants, measures each SVG with
  `measureSvgDifference`, and keeps the best only if edge/mean error improves while hot pixels,
  background contamination, and paths stay within guard limits (max 10% path growth).
  CHECKS: `npm run check` OK. Local server restarted on `http://localhost:8787/`.
  BROWSER BENCHMARK (Load Shaded Test, Region engine, medium, 512x512):
    total 979 ms; base selected/kept after 3 candidates.
    base:       edge 4.09%, hot 2.8%, paths 10
    edge-tight: edge 4.85%, hot 4.3%, paths 9
    color-loose: edge 4.36%, hot 3.3%, paths 9
    final: MAE 1.10%, RMSE 2.89%, edge 4.09%, hot 2.8%, contamination 0.24%, 10 paths,
    4 gradients. This is a correct "do no harm" result: the optimizer rejected worse global
    segmentation settings instead of regressing output.
- 2026-06-26 [claude] CONTENT-ADAPTIVE HYBRID (option 2) DONE — big win, no regression.
  Two targeted fixes to the region engine:
  (1) NEW `fitRegionAdaptive` + `sampleRegionPixels` + `pickBetterFit` + `regionFillMarkup`:
      per region pick cheapest model by fit residual SSE — FLAT vs LINEAR vs RADIAL gradient.
      Radial = what lets shaded spheres/glows be represented (linear can't). Replaces
      fitRegionGradient (removed). Emits <linearGradient>/<radialGradient> userSpaceOnUse.
  (2) Gap fix: the LARGEST region's own fill now paints the full-canvas base rect, so sub-pixel
      tiling gaps reveal the real background (gradient) instead of flat grey -> kills the 30% hot.
  Cache `?v=20260626-hybrid1`. node --check OK. Snapshot app.js.bak-0626b.
  BENCHMARK (High):
    SHADED-test:  before 5.62/9.18/30.1 @23p  ->  AFTER 1.14 MAE / 4.21 edge / 2.9 hot @23p
                  (ImageTracer 1.84/6.28/4.8 @393p)  => region engine now BEATS ImageTracer on
                  shaded content on EVERY metric at 17x fewer paths. 7 linear + 2 radial grads.
    FLAT logo:    before 0.87/5.57/2.3 @42p  ->  AFTER 0.68/5.58/2.4 @42p  (no regression).
  STATUS vs bar: region engine now handles BOTH flat art AND smooth shading, beating the
  ImageTracer baseline on both, at a fraction of the paths. Real step toward VM. Still gaps to
  true VM: photos/scans (#7), finer detail, the inversion loop (#5), and likely gradient-mesh
  for complex shading. Redeploying hybrid1.
- 2026-06-26 [claude] SHADED-IMAGE BENCHMARK — KEY FINDING (overturns a hypothesis).
  Added tools/make-shaded-test.js (zlib PNG encoder, no deps) -> app/assets/shaded-test.png
  (512x512: vertical bg gradient + 2 radially-shaded spheres + linear-gradient bar, AA edges).
  Added "Load Shaded Test" toolbar button (+ shadedButton ref/listener). Cache `?v=...-shaded1`.
  BENCHMARK on shaded-test:
    ImageTracer Med   : MAE 1.84 | edge 6.28 | hot  4.8 | 393 paths
    Region High +grad : MAE 5.62 | edge 9.18 | hot 30.1 |  23 paths
    Region Med  +grad : MAE 5.69 | edge 9.18 | hot 30.5 |  10 paths
  FINDING (opposite of my hypothesis): the segmentation/region engine is BAD at smooth
  continuous shading — it loses to ImageTracer on edge RMSE AND has ~30% hot pixels. Reasons:
  (1) SLIC+merge can't carve continuous tone into clean regions (no edges to snap to);
  (2) too few regions to represent smooth gradients; (3) ONE LINEAR gradient per region can't
  model RADIAL sphere shading; (4) likely flat bgRect showing through region tiling gaps
  inflates hot% (secondary bug worth a follow-up, but edge 9.18>6.28 confirms the loss regardless).
  IMPLICATION FOR VM BAR: region engine is specialized to FLAT/segmented art (logos) where it
  wins on accuracy-per-path; it does NOT generalize to shaded/photographic content, which is
  exactly what VM handles. Reaching VM needs either content-adaptive strategy (flat->regions,
  smooth->diffusion-curves/gradient-mesh) or many-small-regions (kills the path-count win).
  This is the true VM gap, now measured. NEXT options: (a) radial-gradient fit + fix bgRect gaps,
  (b) content classifier + hybrid, (c) accept region engine as the flat-art specialist and treat
  smooth/photo as separate track.
  REDEPLOYED to Cloud Run (revision 2, shaded1 build, all 3 engines + Load Shaded Test). Verified
  live: index/app.js?v=shaded1/shaded-test.png all 200, shadedButton present.
  URL: https://vector-accuracy-studio-709870851047.europe-west1.run.app
- 2026-06-26 [claude] ROADMAP #6 DONE: per-region linear gradients. NEW `fitRegionGradient`
  (least-squares color plane per channel over region pixels -> luminance gradient axis ->
  2 stop colors at projected extremes; returns null if ~flat / stop distance <26).
  `traceRegionsToSvg` emits <defs><linearGradient userSpaceOnUse> + fill=url(#rgN) when a
  region varies, else flat. Cache `?v=20260626-gradients1`. node --check OK. (snapshot 0626a)
  BENCHMARK (High, sample-logo): flat 0.93/5.61/2.6 @42p -> +grad 0.87/5.57/2.3 @42p, 24 grads.
  HONEST: gradients MARGINAL here because sample-logo is mostly FLAT color (logo). Feature
  works/renders; wrong test image to show value. Real value is on SHADED/metallic/photo content.
  STATUS vs bar: region engine plateaus ~5.6% edge / 42 paths on flat logos = great accuracy-
  per-path (47x fewer paths than ImageTracer-Med 4.26%/1974p) but still trails raw accuracy;
  far from VM. NEXT: need a SHADED test image (or user's real KOINO logo) to validate gradients;
  then #5 inversion loop + finer region granularity. Live Cloud Run still = regions1 (pre-#3/#6);
  redeploy when ready to publish gradients1.
- 2026-06-26 [claude] ROADMAP #3 DONE: sub-pixel region boundaries. `traceRegionsToSvg` now
  takes sourceImageData (filtered.imageData) and builds a SOFT per-region membership field
  via NEW `regionCoverageProjection` (project anti-aliased pixel color onto region-pair color
  line -> 0.5 iso lands sub-pixel). Symmetric across a shared edge so adjacent regions meet
  cleanly. Falls back to hard mask if no source. Cache `?v=20260626-subpixel1`. node --check OK.
  Snapshot app.js.bak-0626a.
  BENCHMARK (LIVE, sample-logo, region engine):
    hard-mask Med : MAE 1.74 | edge 7.91 | hot 4.4 | 28 paths
    sub-pixel Med : MAE 1.71 | edge 7.66 | hot 4.4 | 28 paths  (#3 alone = MODEST gain)
    sub-pixel High: MAE 0.93 | edge 5.61 | hot 2.6 | 42 paths | 4s   <-- big jump
  vs ImageTracer Low 8.79/86p, Med 4.26/1974p.
  FINDINGS: (1) sub-pixel precision is NOT the main bottleneck (small gain alone).
  (2) REGION COUNT is the bigger lever (Med->High: 7.66->5.61 by 28->42 paths).
  (3) Region-High now BEATS ImageTracer-Low on every metric at HALF the paths, and approaches
  ImageTracer-Med accuracy (5.61 vs 4.26) at ~47x fewer paths (42 vs 1974), 5x faster.
  STILL behind ImageTracer-Med on raw accuracy -> not yet VM bar.
  NEXT levers toward bar (priority): #6 per-region GRADIENTS (remaining edge err likely from
  flat fills on shaded areas) + tune region count/merge; then #5 inversion loop. Also: live
  Cloud Run still serves regions1 (hard mask) -> redeploy when ready to publish subpixel1.
- 2026-06-26 [claude] DEPLOYED to Cloud Run. Project true-image-to-vector, region
  europe-west1, service vector-accuracy-studio, revision ...00001-7qs, PUBLIC
  (--allow-unauthenticated). URL: https://vector-accuracy-studio-709870851047.europe-west1.run.app
  Verified live: index/app.js/sample-logo HTTP 200, vtracer wasm 200 application/wasm,
  all 3 engine buttons present. gcloud not on shell PATH; invoked via full path
  "C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" (account
  christofi.panayiotis124@gmail.com). Redeploy: re-run deploy/deploy-cloudrun.sh (or the
  gcloud run deploy --source . command) after edits. To make private: redeploy without
  --allow-unauthenticated.
- 2026-06-26 [claude] Cloud Run deploy artifacts prepared (user wants app on their GCP).
  BLOCKER: gcloud/gsutil/firebase NOT installed here + no auth; I cannot connect to user's
  GCP (auth is theirs). Prepared so deploy is one command after THEY auth:
  Dockerfile (nginx:1.27-alpine, serves app/ on $PORT), deploy/default.conf.template
  (SPA fallback + wasm MIME), .gcloudignore (excludes node_modules/backups/research),
  deploy/deploy-cloudrun.sh (enables APIs + `gcloud run deploy --source . --allow-unauthenticated`),
  deploy/CLOUD_RUN_DEPLOY.md (steps). User must: install gcloud, `gcloud auth login`,
  `gcloud config set project`, then run the script. NOT YET DEPLOYED.
- 2026-06-25 [claude] ROADMAP #1 finished + #2 (practical) DONE: Region engine shipped.
  app.js NEW `makeUnionFind`, `mergeSuperpixels` (RAG: merge adjacent superpixels by mean-Lab
  distance via union-find -> per-pixel region map + per-region mean color/area/bbox),
  `traceRegionsToSvg` (per region: marching-squares iso over bbox -> linked loops ->
  loopToSmoothSubpath Beziers -> one even-odd path in region color, painter's order largest
  first, bg rect from largest region). New engine "regions" branch in runTracePipeline (SLIC
  on filtered.imageData -> merge -> trace; regionSize=min/26 clamp[8,36], mergeThreshold
  low16/med12/high8). Engine button "Region engine (SLIC)" + engineLabels.regions.
  Cache `?v=20260625-regions1`. node --check OK. Snapshot app.js.bak-0625f.
  BENCHMARK (LIVE, sample-logo):
    Region Low : MAE 2.09% | edge 10.51% | hot 5.9% | 24 paths | 2.5s
    Region Med : MAE 1.74% | edge  7.91% | hot 4.4% | 28 paths | 7s
    (vs ImageTracer Low 8.79%/86p, Med 4.26%/1974p; Coverage fg/bg Low 10.88%/16p)
  HONEST: Region engine SCALES WITH DETAIL (opposite of fg/bg coverage). Region-Med beats
  ImageTracer-Low on edge (7.91 vs 8.79) w/ fewer paths (28 vs 86), and hits that with 70x
  fewer paths than ImageTracer-Med. BUT does NOT beat ImageTracer-Med accuracy (4.26%). 
  ROOT CAUSE of remaining gap: region boundaries are PIXEL-RESOLUTION (hard mask). We have
  multi-region color OR sub-pixel edges, not both yet.
  NEXT = roadmap #3 applied to REGION edges: build per-region soft membership field (fractional
  at color-boundary pixels) so marching-squares 0.5 iso lands sub-pixel; expect edge ~7.9->~5%
  at same ~28 paths. THEN #5 inversion loop. Tradeoff note: region engine is a strong
  accuracy-PER-PATH point already; raw VM accuracy still needs #3+#5.
- 2026-06-25 [claude] ROADMAP #1 (segmentation) STARTED + VERIFIED: SLIC superpixels in Lab.
  app.js NEW `rgbToLab`, `computeSlicSuperpixels` (Achanta SLIC: grid init -> assign by
  Lab+xy distance -> update, 10 iters), `renderSegmentationDebug` (boundaries magenta over
  dimmed original). New UI checkbox "Show segmentation (SLIC)" + ref `showSegmentationInput`;
  wired into traceCurrentImage debug block (takes precedence over coverage map when on);
  log line added. Cache `?v=20260625-slic1`. node --check OK. Snapshot app.js.bak-0625e.
  VERIFIED LIVE (Low, sample-logo, region ~16px): 736 superpixels. QUANT CHECK: within-
  cluster RGB variance SLIC=120 vs rigid-grid=2591 (~21x lower) -> superpixels snap to color
  edges correctly. (Screenshot still times out on this renderer; verified via variance eval.)
  Debug-only: does NOT yet feed the engine. NOTE trace ~9s here because ImageTracer ran too
  (engine still imagetracer); SLIC itself is the added cost only when its checkbox is on.
  NEXT (finish roadmap #1 -> #2): merge superpixels by Lab similarity into regions (region
  adjacency graph), then extract SHARED-edge boundaries between region pairs (gap-free),
  sub-pixel place them, fit Beziers, feed the Coverage engine. THEN re-benchmark vs ImageTracer.
- 2026-06-25 [claude] STEP 2b-3 DONE: per-loop interior color + painter's order.
  app.js NEW `pointInPolygon`, `sampleLoopColor` (grid-sample interior of each loop, take
  mode quantized color). `traceWithCoverageEngine` now emits ONE <path> PER LOOP with its
  sampled color, drawn largest-area-first (painter's order) instead of one even-odd path.
  Cache `?v=20260625-coverage9`. node --check OK.
  BENCHMARK (LIVE, Low detail 512px, sample-logo.png):
                     ImageTracer | Coverage single | Coverage per-loop
    MAE              0.95%       | 2.97%           | 1.44%
    edge RMSE        8.79%       | 14.80%          | 10.88%
    hot              2.8%        | 7.9%            | 4.7%
    paths            86          | 1               | 16  (7 distinct colors)
    time             ~8s         | ~1.9s           | ~1.5s
  -> per-loop color roughly HALVED the accuracy gap. Coverage now near ImageTracer on
     pixels with ~5x fewer paths and ~5x faster.
  SURPRISE: Coverage at MEDIUM detail is WORSE than Low (MAE 2.15% / edge 13.51% / 18 paths).
  Cause hypothesis: higher-res fg/bg field captures more thin anti-aliased fringe as separate
  FLAT-colored regions; flat per-loop color + fg/bg-only segmentation don't scale with detail
  like ImageTracer. So more resolution != better here yet. Use LOW detail for coverage.
  REMAINING GAP ROOT CAUSE: (1) fg/bg field only separates foreground-vs-dominant-background,
  so color boundaries BETWEEN two non-bg regions are not their own loops; (2) flat color per
  region (no gradient/shading). Both are the segmentation step.
  NEXT (biggest lever) = item #2: real multi-region segmentation (SLIC superpixels in Lab +
  region merge) so EVERY region pair gets a sub-pixel loop. That is what can push coverage
  PAST ImageTracer. Smaller interim levers: tune cornerAngle/simplifyTolerance/minArea,
  per-region gradient fill.
- 2026-06-25 [claude] STEP 2b-2 DONE: real "Coverage engine" shipped + first benchmark.
  app.js NEW `traceWithCoverageEngine` (builds SVG straight from the sub-pixel iso-contour:
  marching squares -> linked loops -> `loopToSmoothSubpath` Catmull-Rom->Bezier w/ corner
  detection via `turnAngleDeviation`; one even-odd <path>, single fg color via
  `dominantForegroundColor`). Early-return in `runTracePipeline` for engine==="coverage"
  (bypasses ImageTracer + soft-effect/layer/subpixel/curve/export passes). Engine selector
  re-added to UI (ImageTracerJS | Coverage engine). engineLabels.coverage added.
  Cache `?v=20260625-coverage8`. node --check OK. Snapshot app.js.bak-0625d.
  BENCHMARK (LIVE, Low detail 512px, sample-logo.png, apples-to-apples):
    ImageTracer: MAE 0.95% | edge 8.79% | hot 2.8% | 86 paths | ~8s
    Coverage v0: MAE 2.97% | edge 14.80% | hot 7.9% | 1 path  | ~1.9s
  SVG verified: 16 subpaths, 160 cubic Beziers, evenodd holes, fg #b6c5b7 / bg #000000.
  HONEST READ: v0 LOSES on pixel accuracy but WINS hugely on simplicity (1 vs 86 paths) and
  speed (4x). The accuracy loss is the SINGLE-FOREGROUND-COLOR model (everything not-bg ->
  one flat color), NOT the geometry. The sub-pixel Bezier geometry is the proven win.
  NEXT (step 2b-3): per-loop interior color sampling + painter's order (largest area first),
  no even-odd; a hole loop samples bg color and paints over -> handles holes AND multi-color.
  Expect edge/MAE to drop sharply toward/under ImageTracer while keeping low path count.
  (Screenshot via Claude_Preview times out on this renderer; verified via DOM/SVG eval.)
- 2026-06-25 [claude] STEP 2b-1 saddle fix (debug-only). `extractIsoSegments` cases 5/10
  now use the asymptotic decider (cell-center avg vs iso) so the two contour lines never
  cross -> every vertex degree 2 -> clean closed loops. Cache `?v=20260625-coverage7`,
  node --check OK. VERIFIED LIVE (Claude_Preview :8011) at LOW detail: 4064 samples ->
  20 closed / 0 border / 4 open (was 13 open at medium pre-fix). Residual 4 opens are tiny
  degenerate features (single-cell / 1px) -> handle in fitter (drop tiny, close near-closed),
  not worth more topology work. NOTE: medium-detail trace is SLOW (>60s) because the
  ImageTracerJS baseline + sub-pixel/curve guard re-rasterize several candidate SVGs each
  trace. Our own coverage engine won't need ImageTracer, so this self-resolves; for now use
  LOW detail for fast iteration.
  NEXT (step 2b-2): fit cubic Béziers to closed loops (corner detection via turn-angle),
  drop/close tiny opens, emit a selectable "Coverage engine", benchmark vs ImageTracer.
- 2026-06-25 [claude] BUGFIX (regression from UI trim): Load Sample/Open did nothing,
  SVG Preview stayed blank. Cause: `loadImageUrl` (~L3859) and `loadFile` (~L3828) still
  read removed `maxSizeInput.value` -> threw in image.onload, aborting load silently.
  Fixed both to `Number(maxSizeInput?.value) || activePreset().maxSize`. Verified LIVE via
  Claude_Preview (server on :8011, .claude/launch.json "vas"): Load Sample -> Trace ->
  SVG Preview renders an <svg> (1974 paths, 606x428 visible), Difference MAE 0.41%/edge 4.26%,
  Coverage 9753 samples | 18 closed / 0 border / 13 open. Cache-bust `?v=20260625-coverage6`.
  (Sample-logo coverage has 13 OPEN loops that are NOT border -> genuine saddle/junction
  topology to address in step 2b before Bezier fitting.) Snapshots c-series still valid.
- 2026-06-25 [claude] UI trimmed for coverage-engine testing (user request). index.html
  settings panel reduced to ONLY: Detail, Anti-aliasing, "Show coverage map" (now default
  CHECKED). Removed controls: Engine, Image Type, Sub-pixel Edges, Curve Optimizer,
  Background Detach, Colors mode + custom input, Color Effects, Remove background, Edit/
  Hand-pick buttons, Max size, Iterations. Those settings still exist as fixed defaults in
  `selectorState` + detail presets, so the pipeline is unchanged. app.js made null-safe for
  the removed inputs (`maxSizeInput`/`iterationsInput`/`colorCountInput`/`customColorControl`/
  `removeBackgroundInput` now guarded in applySelectorState/currentTraceSettings/traceCurrentImage).
  Also set `selectorState.backgroundDetach` default "auto"->"off" (auto ran 2 pipelines/trace
  and could swap the coverage bg; off = single clean fast pipeline for testing).
  Cache-bust `?v=20260625-coverage5`. Snapshots app.js.bak-0625c, index.html.bak-0625c.
  node --check OK. To restore full UI later: index.html.bak-0625c has every control.
- 2026-06-25 [claude] STEP 2b-1 hardened (debug-only). First 2b-1 run on sample reported
  15452 samples / 15250 segs -> 20 closed, 16 open. Linking confirmed working (15k segs ->
  36 chains, not fragments). Fixes: `linkSegmentsIntoLoops` now extends BOTH directions
  (was forward-only → stranded mid-chain seeds as false opens) and classifies loops as
  closed / border (both ends on image frame = legitimately open, closeable later) / open
  (true topology bug). `renderCoverageField` colors: magenta=closed, cyan=border, yellow=open.
  Cache-bust `?v=20260625-coverage4`. node --check OK. Snapshot app.js.bak-0625b still valid.
  VERIFY: refresh → Trace w/ coverage debug → expect open count to drop toward 0; remaining
  opens should be cyan (border) like the full-width teal/yellow band + background. Yellow = bug.
- 2026-06-25 [claude] STEP 2b-1 implemented: link iso-segments into ordered loops
  (debug-only, non-breaking). Files: app.js NEW `linkSegmentsIntoLoops()` (chains
  marching-squares segments by shared endpoints into closed/open loops);
  `renderCoverageField()` now draws CLOSED loops magenta, OPEN loops yellow, returns
  {segmentCount, closedLoops, openLoops}; `traceCurrentImage` meta+log report loop counts.
  Cache-bust `?v=20260625-coverage3`. Snapshot reused app.js.bak-0625b. node --check OK.
  VERIFY IN UI: refresh → Load Sample → "Show coverage map" → Trace. Coverage panel should
  be mostly MAGENTA closed outlines. Lots of YELLOW = open-loop/topology bugs to fix before
  Bézier fitting. Read closed/open counts in the panel meta + Trace Log.
  NEXT (step 2b-2): fit cubic Béziers to the closed loops (corner detection), emit a new
  "Coverage engine" SVG, benchmark edge-RMSE + paths vs current (18.5% / 5359).
- 2026-06-25 [claude] STEP 2a implemented: sub-pixel boundary extraction (debug-only,
  non-breaking — does NOT change SVG output yet). Files/functions:
  • app.js `recoverAntialiasCoverage` (~L1133): also returns `scalarField` (Float32Array,
    0=bg / 1=fg, edge pixels carry alpha). Early photo/off return adds `scalarField: null`.
  • app.js NEW `extractIsoSegments()` (marching squares, 0.5 iso-contour → sub-pixel
    line segments). `renderCoverageField()` now strokes those segments in magenta over the
    (dimmed) alpha field and returns {segmentCount}.
  • app.js `traceCurrentImage`: passes scalarField; Coverage panel meta + "Sub-pixel
    boundary (step 2a)" log line now report segment count.
  • index.html cache-bust bumped to `?v=20260625-coverage2`.
  Snapshot: app.js.bak-0625b. node --check passes; server serves new symbols.
  VERIFY IN UI: Load Sample → check "Show coverage map" → Trace → Coverage panel should
  show a thin MAGENTA continuous outline tracing every glyph/wreath edge at sub-pixel
  position (the curve we will fit Béziers to in step 2b). Awaiting user eyeball.
  NEXT (step 2b): link segments into closed loops, fit cubic Béziers w/ corner detection,
  emit as a new "Coverage engine" option, then benchmark edge-RMSE + paths vs current.
- 2026-06-25 [claude] STEP 1 VERIFIED in UI on a hard sample (KOINO/wreath logo, teal bg +
  yellow band, 699x780, High/Balanced AA, 5359 paths). Coverage overlay = clean continuous
  edge bands hugging every glyph/wreath/seam (not noise) → approach sound, build step 2.
  Coverage stats: 6071 samples, alpha mean 0.45, min 0.03, max 0.93 → confirms genuine
  FRACTIONAL coverage exists at edges (not binary); this is the data the snap destroys.
  Difference: edge-weighted RMSE 18.5%, hot 6.8%, MAE 2.62% — error sits exactly on the
  coverage bands (red diff overlaps overlay), proving edges are where the loss is. (This
  image is much harder than the old 4.27% SKILL.md sample.) Non-breaking confirmed: SVG
  output/paths unchanged by step 1 (it only observes).
  NOTE for step 2: coverageField currently captures foreground-vs-dominant-background edges
  only. Multi-region interiors need real segmentation (Next Step #2) so every region PAIR
  gets a boundary, not just fg-vs-bg.
- 2026-06-25 [claude] STEP 1 implemented: coverage map. Additive + non-breaking.
  Files/functions:
  • app.js `recoverAntialiasCoverage` (~L1133): builds + returns `coverageField`
    [{x,y,alpha,foreground,background,normal}]; snap logic unchanged. Early photo/off
    return also returns `coverageField: []`.
  • app.js NEW `renderCoverageField()` + `coverageFieldStats()` (near `renderPalette`).
  • app.js `traceCurrentImage`: renders Coverage panel when toggle on; adds
    "Coverage map (step 1)" log line with sample count + alpha mean/min/max.
  • app.js: new element refs `coverageCanvas`/`coverageMeta`/`showCoverageMapInput`.
  • index.html: new "Coverage (debug)" panel + "Show coverage map (debug)" checkbox;
    cache-bust bumped to `?v=20260625-coverage1`.
  Snapshots: app.js.bak-0625, index.html.bak-0625 (the only undo).
  Verify: `node --check` passes both JS files; server serves new symbols.
  NOT YET DONE: benchmark before/after (coverage map doesn't change SVG output, so
  edge-RMSE/paths should be IDENTICAL — that is the non-breaking check to confirm in UI).
  To view: Load Sample → check "Show coverage map" → Trace → read Coverage panel.
- 2026-06-25 [codex] Session sync only. Read WORKLOG.md and SKILL.md in full, adopted
  the shared-agent protocol, and made no code changes because the requested task body
  still contained the placeholder `<describe the specific work here>`. Files/functions
  touched: WORKLOG.md Change Log only. Benchmark result: not run; no implementation change.
- 2026-06-25 [claude] Reviewed full codebase + pipeline; diagnosed architectural ceiling
  (region tracing vs Vector Magic's inverse-rasterization). No code changed. Created this
  WORKLOG.md (seeded from SKILL.md state). Key references: app.js recoverAntialiasCoverage
  (~L1133), estimateCoverageCrossing (~L2294), chooseFinalSvg (~L2643), runTracePipeline (~L3723).
- (earlier) [codex] Built prototype through detached micro-prune v1; see SKILL.md for the
  detailed per-pass benchmark history.
