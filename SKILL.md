# Vector Accuracy Studio Skill

> **Handoff log lives in `WORKLOG.md`.** Two agents (Codex + Claude) work here and do
> not share memory. At session start, read `WORKLOG.md` first. At session end, update its
> Current State / Next Steps and add a dated, agent-tagged Change Log entry naming the
> files+functions you touched. This SKILL.md stays the algorithm/research memory.

## Purpose

Keep this project focused on building an online raster-to-vector app with a Vector Magic-like workflow and our own vectorization engine.

## Current Product Direction

This is not a landing-page project. The priority is the vectorization pipeline:

1. Upload raster image.
2. Preprocess and optionally resize.
3. Classify or let the user choose image mode.
4. Segment colors/regions.
5. Trace region boundaries.
6. Generate preview SVG.
7. Export fill-only and later stroke+fill SVG.
8. Add a segmentation editor.
9. Move the same workflow to an online backend with job records and WebSocket progress.

## Reference Architecture Learned From Vector Magic

Vector Magic's browser-visible backend flow:

1. `POST /api/images` creates an image record from metadata.
2. Browser uploads the raster to S3/CloudFront with a signed multipart POST.
3. Browser opens `/internal/websocket` with image id, version, secret, and priority.
4. Worker classifies the image.
5. Worker runs one or more vectorization jobs with different configurations.
6. Worker streams progress and shape preview chunks.
7. Backend stores segmentation artifacts and vectorization records.
8. Download routes expose SVG/EPS/PDF and fill-only/stroke+fill variants.

## Algorithm Hypothesis

The closest public clue for Vector Magic is James Richard Diebel's Stanford PhD work:

`Bayesian Image Vectorization: The Probabilistic Inversion of Vector Image Rasterization`

Working hypothesis:

- region segmentation
- palette estimation
- anti-aliased edge interpretation
- probabilistic/sub-pixel boundary recovery
- curve fitting and simplification
- layered filled-shape SVG output

Do not describe our first prototype as matching that quality. It is only the starting baseline.

## Prototype Stages

### V0 Local Browser Prototype

Location:

```text
app/index.html
```

Required behavior:

- Runs locally without dependencies.
- Uploads a PNG/JPG.
- Uses Vector Magic-like workflow selectors: image type, detail level, colors mode, and advanced actions.
- Uses an engine selector:
  - ImageTracerJS baseline for the best current local SVG output.
  - Experimental tracer for learning and internal algorithm work.
- Quantizes colors.
- Segments by quantized color.
- Traces pixel-cell boundaries into SVG paths.
- Shows original, quantized raster, and SVG preview.
- Downloads SVG.

Known V0 limitations:

- "Unlimited" colors is currently an adaptive palette preset, not true unlimited/continuous color vectorization.
- ImageTracerJS is a stronger baseline than the first handwritten tracer, but it still does not match Vector Magic on anti-aliased text, glows, and fine details.
- Pixel-cell boundaries are blocky and not suitable as final vector art.
- Large images or high detail can produce too many paths, so the browser baseline uses detail presets and exposes max size under Prototype Internals.
- Broken/open contour loops must be discarded; otherwise SVG fills create diagonal artifacts.
- Background removal is optional and experimental; it clusters near-background colors but is not a real object/background segmentation model.

### V0.2 Browser Baseline

- Added `imagetracerjs` as a local dependency and vendored `app/vendor/imagetracer.js`.
- Default engine is ImageTracerJS.
- Added `vtracer-webapp` as an experimental WASM comparison engine under `app/vendor/vtracer/`.
- VTracer is not the default because current browser/WASM settings either over-compress this logo or can hit Rust-side failures at very fine color thresholds. Keep it as a research comparison path until tuned further.
- High detail currently uses a 1536px working size.
- Anti-aliasing has Off/Balanced/Smooth modes.
- Smooth anti-aliasing increases the adaptive palette to 144 colors on High, uses high-quality canvas resampling, round joins/caps, geometric precision SVG hints, and stronger curve tolerance.
- Color Effects has Clean flat colors/Balanced/Preserve glows-shadows modes.
- Preserve glows-shadows is the default. On High + Smooth it raises the adaptive palette to about 194 colors, keeps softer neutral tones, lowers path omission, and adds an extra color quantization cycle for gradients.
- Preserve glows-shadows now also creates a first-pass soft SVG effect layer: near-background glow/shadow color labels are traced as blurred SVG paths using an `feGaussianBlur` filter. This is a temporary bridge toward real gradient/mask/diffusion-curve handling.
- A mild edge-preserving smoothing pass runs before quantization/tracing for blended artwork. It reduces color chatter without averaging across strong edges.
- A coverage-aware anti-alias recovery pass runs after smoothing. It estimates the dominant background and snaps edge-band pixels toward either background or nearby foreground so fringe colors become cleaner vector boundaries instead of many small color islands.
- A conservative path-refinement pass runs after ImageTracerJS. It parses closed line-only SVG loops, simplifies minor point chatter, converts smooth spans to cubic Beziers, and preserves sharp corners with straight line segments.
- Artwork cleanup runs before quantization and tracing for non-photo anti-aliased modes. It flattens near-black/near-white neutral background noise and removes isolated speckles surrounded by neutral background. In Preserve mode the cleanup is gentler so gray/blue shadows and glows are not flattened as aggressively.
- Default image type is "Artwork with blended edges" because anti-aliased logos need smoother tracing.
- Solid background is default; transparent background must be explicitly enabled.

### Current Quality Finding

The output is now much closer structurally. The remaining visible weakness is anti-aliasing:

- ImageTracerJS can smooth paths and keep more intermediate colors.
- The cleanup pass reduces noisy background paths dramatically; in the sample test it reduced the SVG from roughly 3k paths to about 2k paths.
- Preserve glows-shadows trades a higher path count for better glow/shadow color fidelity. In the sample test it used 194 colors and about 3.5k paths.
- The first-pass soft effect layer adds SVG filters to represent glow/shadow regions separately. In the 1024px sample test it added 105 blurred paths and 1 SVG filter.
- Coverage-aware edge recovery reduced the 1024px sample from about 2,819 paths to 1,973 paths. It snapped 9,753 edge-band pixels: 5,829 to background and 3,924 to foreground.
- First-pass path refinement converted 47 closed loops from line-only geometry into cleaner cubic spans. It reduced those loops from 957 to 911 points and added 120 cubic Bezier segments while keeping the difference view stable at roughly 0.40% MAE and 1.2% hot pixels.
- First-pass layer separation now wraps the SVG as background, ordered trace, and soft-effect groups while tagging individual paths as background, solid-shape, highlight, shadow, or soft-effect. In the 1024px sample test it separated 1,293 background paths, 376 solid paths, 179 highlights, 20 shadows, and 105 soft-effect paths with the difference view still at roughly 0.40% MAE.
- First-pass gradient conversion now replaces eligible highlight, shadow, and soft-effect flat fills with reusable SVG gradients. In the 1024px sample test it converted 152 effect paths with 22 gradients and 1 existing blur filter while keeping the difference view at roughly 0.41% MAE and 1.2% hot pixels.
- The `nextFrame()` helper has a timeout fallback so background browser throttling cannot stall tracing before the first render frame.
- First-pass small detail protection detects text-like/thin high-contrast components in the original raster and restores those pixels after smoothing/coverage recovery. In the 1024px sample test it restored 1,019 pixels across 4 protected components, kept the output at 1,974 paths, and held the difference view at roughly 0.41% MAE with 1.1% hot pixels.
- First-pass export optimization runs after gradient conversion. In the 1024px sample test it preserved 1,974 paths, merged near-identical flat fills across 539 paths, reduced flat color buckets from 14 to 13, reduced SVG text size from 469,864 to 465,603 bytes, and kept the difference view at roughly 0.41% MAE with 1.1% hot pixels.
- Edge polish now runs after layer separation and before gradient conversion. It targets hard `background` and `solid-shape` stair-stepped subpaths, skips glows/gradients/tiny detail, and refits eligible contours into cubic Bezier spans. In the 1536px high-detail sample test it polished 64 subpaths, reduced those edge points from 7,416 to 6,228, added 466 cubic spans, reduced the final export from 2,570 to 2,549 paths, and held the difference view at roughly 0.33% MAE with 0.8% hot pixels.
- A persistent benchmark ledger now records trace runs in `localStorage` under `vectorAccuracyStudio.benchmarkRuns.v1`. Each run stores image fingerprint, settings, runtime, canvas size, palette size, paths, estimated path points, SVG bytes, gradients, filters, layer stats, sub-pixel stats, edge-polish stats, export stats, and difference metrics. The UI can set a baseline, compare deltas, export JSON, and clear runs.
- The difference view now includes edge-weighted MAE/RMSE from a Sobel/luma edge map, background contamination for solid-background logos, and complexity metrics so changes can be judged by visual error and SVG complexity together.
- Sub-pixel Edges now has Off/Balanced/Strong controls. The first implementation estimates a 50% coverage crossing from original anti-aliased edge samples and moves eligible hard-edge contour points before edge polish. A metric guard compares the candidate final SVG against the no-subpixel final SVG and keeps the no-subpixel result if edge RMSE, hot pixels, or complexity gets worse.
- Medium-detail sample verification after the metric guard: Off baseline holds at about 0.41% MAE, 2.19% RMSE, 4.27% edge-weighted RMSE, 1.1% hot pixels, 0.09% background contamination, 1,974 paths, and about 16,062 estimated points. Balanced tried 36 subpaths and Strong tried 38 subpaths, but both were rejected by the guard because candidate edge RMSE was slightly worse than the no-subpixel output.
- Curve Optimizer now has Off/Balanced/Strong controls. It renders multiple edge-polish curve-fitting variants, measures each final SVG with edge-weighted error, and keeps only a variant that improves edge RMSE without raising hot pixels or path count beyond the guard. In the medium-detail sample test, Balanced tested 3 candidates and selected the `crisper` variant, improving edge-weighted RMSE from about 4.27% to 4.26% while keeping 1.1% hot pixels and 1,974 paths. Sub-pixel fitting was still rejected after this because its candidate measured worse than the curve-optimized baseline.
- Scientific Background Detach v1 is now a separate browser module at `app/background-detach.js`, exposed as `window.BackgroundDetach`. The UI has Background Detach Off/Auto/Force, default Auto. It estimates a border/corner background, flood-fills only connected background, builds an unknown matte band, creates a transparent foreground, and can reattach the detected background as a separate SVG layer. The main pipeline treats it as an optional preprocessing candidate and keeps the existing non-detached output if the detached candidate worsens edge RMSE, hot pixels, contamination, or path count.
- Medium-detail sample verification for Background Detach Auto: it detected black at 100% confidence, found 67,869 foreground pixels, 9,645 unknown pixels, and 3,212 matte-edge pixels, but the detached candidate measured worse: edge RMSE about 4.85% vs 4.26% baseline, hot pixels 1.2% vs 1.1%, and paths 2,073 vs 1,974. The guard correctly rejected it and kept the existing curve-optimized output.
- Scientific Background Detach v2 upgrades the matte from global distance-to-background to local foreground/background color-pair solving. The unknown band now straddles both sides of the connected background boundary, estimates alpha with `C = alpha*F + (1-alpha)*B`, keeps high-confidence foreground-side pixels solid, and records matte reconstruction stats in the benchmark ledger.
- Medium-detail sample verification for Background Detach v2 Auto: confidence 99%, foreground pixels 68,899, unknown pixels 19,159 (9,645 background-side / 9,514 foreground-side), matte-edge pixels 17,786, local foreground sample coverage 100%, and matte reconstruction RMSE about 4.57%. The detached candidate improved edge-weighted RMSE from about 4.26% to 4.06% and reduced paths from 1,974 to 1,618, but hot pixels increased from 1.1% to 1.3%, so the guard correctly rejected it. The next target is hot-pixel control for detached mattes, not loosening the guard.
- Hot-pixel control pass v1 adds a detached-foreground trace profile and richer guard logging. For detached foregrounds, ImageTracer now uses a lower trace threshold, lower path omission, one extra color cycle, and line filtering off so thin foreground strokes survive. The guard now records failure reasons, max allowed paths, and the detached trace profile. In the medium-detail sample, the detached candidate improved edge-weighted RMSE from 4.26% to 3.23% and hot pixels from the previous detached 1.3% to 1.2%, but complexity jumped from 1,974 baseline paths to 3,454 detached paths with max allowed 2,132. The guard rejected it for path growth, hot pixels, and background contamination. Next target: prune or merge the no-linefilter micro-paths while preserving the new edge/hot-pixel gains.
- Detached micro-prune v1 now runs inside export optimization for detached foreground candidates. It records path size and layer histograms, then prunes tiny opacity/gradient sliver paths. In the medium-detail sample it removed 1,577 detached micro paths and brought the detached candidate under budget: 3,455 -> 1,877 paths, with max allowed 2,132. Edge-weighted RMSE stayed better than baseline at about 3.85% vs 4.26%, but hot pixels were still 1.3% vs 1.1% baseline and background contamination still failed, so the guard rejected it. This confirms the direction is right: detached foreground detail plus pruning can satisfy complexity, but the next target is background-contamination/hot-pixel cleanup.
- Region optimizer v1 is the first inversion-loop step for the SLIC Region engine. It generates global SLIC/merge candidates, rasterizes each SVG with the existing difference view, and keeps only candidates that improve edge/mean error without hot-pixel, contamination, or path-count regression. In the 512px shaded-test browser run, it correctly kept the base candidate: base 1.10% MAE / 4.09% edge / 2.8% hot / 10 paths; edge-tight worsened to 4.85% edge / 4.3% hot; color-loose worsened to 4.36% edge / 3.3% hot. Next inversion-loop work should be local per-region optimization around high-error areas, not only global SLIC settings.
- BOC/KOINO Palette boundary precision v1 confirms the remaining flat-logo gap is boundary coordinate placement plus simplification. With hidden dev route `?engine=palette&paletteK=3`, the Palette engine has the right 55-path structure. Adding a +0.5px pixel-center coordinate offset and near-raw loop simplification improves BOC from 11.18% edge RMSE / 2.6% hot to 2.78% edge RMSE / 0.8% hot at the same 55 paths, close to Vector Magic's 2.41% edge reference. The cost is a high node estimate: 3,795 -> 28,820. Next target is simplification/node reduction that preserves this centered-raw boundary accuracy, then AA-aware k selection so BOC auto-picks k=3.
- BOC/KOINO Palette node-reduction v1 adds a measured compact-candidate selector: first find the best-edge boundary variant, then choose the lowest-node candidate inside a tight edge/hot-pixel band. Current BOC forced-k=3 result selects `tight-corners-s20`: 2.70% edge RMSE, 0.28% MAE, 0.8% hot pixels, 55 paths, and 16,014 estimated nodes. This keeps near-Vector-Magic accuracy while cutting the previous `centered-raw` node estimate by about 44%. Next target is AA-aware k selection so this result does not require `?paletteK=3`.
- BOC/KOINO AA-aware Palette k-selection v1 removes the hidden `?paletteK=3` requirement for the BOC sample. The Palette ladder now downweights coverage/contrast transition pixels for k selection, using core-color residual while still recording full residual. On `?engine=palette`, BOC auto-selects k=3 with colors #067088, #e9f1f5, #fcb828 and final `tight-corners-s18` output at 2.60% edge RMSE, 0.27% MAE, 0.7% hot pixels, 55 paths, and 15,835 estimated nodes. Next target is the auto-router so users do not pick the hidden Palette route manually.
- Auto-router v1 is now the default user path. It computes the Palette ladder once, accepts Palette only for small clean palettes with a strong edge signal, and otherwise routes to Region. The original Auto-router proof selected Palette/k=3 for BOC at 2.60% edge RMSE, 0.27% MAE, 0.7% hot pixels, 55 paths, and about 15,835 nodes; this is superseded by compact-boundary v2 below. Local and Cloud shaded-test default/no-query runs still select Region because the palette guard rejects k=14/core residual 15.6.
- BOC/KOINO compact-boundary v2 reaches the measured Vector Magic edge bar on the default Auto-router path. The Palette optimizer now tests sharper corner-angle candidates around `tight-corners-s12..s18`, uses a tighter compact-selection edge band, and selects `tight-corners-s18-c050`. Local and Cloud BOC runs measure 2.41% edge RMSE, 0.26% MAE, 0.7% hot pixels, 55 paths, about 13,269 nodes, and about 162 KB SVG. This matches the known VM edge reference while reducing nodes vs the prior 15,835-node output. Remaining BOC gap: MAE/hot pixels and visual QA across more flat logos.
- It still traces blended edge pixels as regions instead of inferring the original sub-pixel vector edge.
- To reach Vector Magic quality, the next custom engine work must model anti-aliased edge pixels as coverage values and fit one clean boundary through them.

### V1 Local Engine Improvements

- Connected-component splitting per color.
- Better boundary simplification.
- Optional corner preservation.
- Background removal toggle.
- Stroke+fill export.
- Replace adaptive "Unlimited" with a real segmentation strategy that keeps as much color detail as useful without exploding path count.
- Compare output stats against Vector Magic sample files.

### V2 Backend Prototype

- Local server API.
- Image record ids.
- Object-storage-like upload folder.
- Worker job queue.
- WebSocket or SSE progress.
- Segmentation artifact output.
- Download routes.

## Current Constraints

- Keep implementation inspectable.
- Prefer no dependency until the baseline is working.
- Add dependencies only when they clearly improve tracing quality.
- Save research and generated samples under `research/`.
- Keep user-facing deliverables under this project folder.

## Next Technical Target

Current research note:

```text
research/vectorization-methodologies-next-steps.md
```

Improve from flat color tracing to a hybrid vectorization pipeline:

1. Add a VTracer comparison engine as the next quality baseline.
2. Add edge-preserving preprocessing in Lab color space.
3. Move from pure palette quantization to spatial segmentation, ideally SLIC/superpixel or hierarchical region clustering.
4. Trace merged region masks with Potrace-like contour extraction and Bezier fitting.
5. For the BOC/KOINO flat-logo path, edge RMSE now matches the VM reference at about 2.41% with 55 paths. Next: reduce MAE/hot pixels and validate the same behavior on more flat-logo samples before changing router thresholds.
5. Protect small text and thin details with stricter local segmentation before global smoothing/cleanup.
5. Preserve high-angle corners while smoothing curved spans.
6. Model anti-aliased edge pixels as sub-pixel coverage, not as separate fringe colors.
7. Add a separate effect layer for glows, shadows, and metallic highlights using gradients, opacity masks, or blur filters.
8. Compare against `research/test-logo-vectormagic-fill-only.svg` and exported local samples.
