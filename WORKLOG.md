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
Default engine: ImageTracerJS. Experimental: VTracer (WASM) and a handwritten tracer.
Region engine now has a first guarded inversion-loop step: it traces several SLIC/merge
parameter candidates, rasterizes each SVG through `measureSvgDifference`, and keeps a
candidate only when edge/mean error improves without hot-pixel, contamination, or path-count
regression. First browser test kept base correctly because the tested alternatives were worse.
Live Cloud Run is deployed in project `true-image-to-vector`, region `europe-west1`, service
`vector-accuracy-studio`, revision `vector-accuracy-studio-00004-fj4`, serving 100% traffic.
Public URL tested: https://vector-accuracy-studio-709870851047.europe-west1.run.app
Git repository initialized at `outputs/vector-accuracy-studio` on branch `main`; the baseline
commit is the clean project starting point for future Codex/Claude work.

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
4. FIRST PASS (2026-06-26 [codex]) **Turn the metric guard into an optimizer.**
   Region engine now tests guarded SLIC/merge candidates and records `regionOptimization`.
   NEXT: make this a real local search around the selected candidate, and add shape/fill
   micro-candidates for high-error regions rather than only global SLIC settings.
5. Real gradient/diffusion-curve modeling for glows/shadows (soft-effect layer is flat blur today).
6. Image-type classifier to auto-select pipeline (photo vs blended artwork vs flat).

**Recommended first build:** prototype items 1+3 as a NEW experimental engine alongside
ImageTracerJS, so it can be benchmarked against the current output without breaking the baseline.

## Change Log  (newest first)
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
