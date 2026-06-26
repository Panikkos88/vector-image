# Vectorization Methodologies: Next Steps

Date: 2026-06-24

## Current Local Output Diagnosis

Sample checked:

```text
C:\Users\panik\Downloads\sample-logo-local-trace.svg
```

Observed SVG stats:

- Size: 588,675 bytes
- Paths: 3,464
- Unique `fill` values: 26
- Gradients: 0
- Filters: 0
- ViewBox: `0 0 1536 1086`

This confirms the current weakness: the tracer is now getting the large logo structure mostly right, but it represents anti-aliased edges, glows, shadows, and metallic highlights as many flat-color islands. Adding more colors alone will increase path count and may preserve some tones, but it will not become Vector Magic-level output unless the pipeline understands smooth effects and sub-pixel edges.

## Method Families Worth Using

### 1. Edge-Preserving Preprocessing

Use bilateral filtering or guided filtering before color segmentation. These smooth local compression noise and small color chatter while preserving real edges.

Why it helps us:

- Reduces speckled micro-shapes around black backgrounds and anti-aliased letters.
- Keeps strong logo edges sharper than a Gaussian blur.
- Gives color clustering a cleaner image without destroying the silhouette.

Implementation direction:

- Work in Lab color space, not raw RGB.
- Apply a mild bilateral/guided filter before palette generation.
- Use weaker smoothing on artwork without blended edges, stronger smoothing on photo/blended artwork.

Sources:

- Bilateral filtering: https://www.cs.jhu.edu/~misha/ReadingSeminar/Papers/Tomasi98.pdf
- Guided image filtering: https://people.csail.mit.edu/kaiming/publications/eccv10guidedfilter.pdf

### 2. Hierarchical Color Clustering and Stacked Regions

VTracer is the most directly useful open-source reference. It clusters the image first, then traces each cluster into vector paths. Its documented trace stages are pixel path extraction, polygon simplification, and curve smoothing/fitting.

Why it helps us:

- More spatially coherent than our current adaptive palette + flat path tracing.
- Has controls that map directly to our UI: color precision, gradient step, speckle filtering, corner threshold, segment length, and path precision.
- Designed for colored high-resolution images, unlike Potrace, which is fundamentally binary-first.

Implementation direction:

- Add a VTracer comparison engine before writing more custom tracer code.
- Test stacked output for logos, because stacked regions can avoid complicated holes and reduce broken fragments.
- Use VTracer as a quality benchmark even if we later build our own engine.

Sources:

- VTracer docs: https://www.visioncortex.org/vtracer-docs/
- VTracer GitHub: https://github.com/visioncortex/vtracer
- VTracer web package: https://www.jsdelivr.com/package/npm/vtracer-webapp

### 3. Superpixels and Region Merging

SLIC superpixels cluster pixels in combined color + image-position space. This creates small coherent regions that can then be merged with a region adjacency graph.

Why it helps us:

- Prevents pure color clustering from scattering disconnected pixels into many tiny islands.
- Gives the tracer shape-aware regions before path fitting.
- Lets us merge shadows/glows by local continuity, not just exact color.

Implementation direction:

- Generate SLIC-like superpixels in LabXY space.
- Build adjacency between superpixels.
- Merge neighbors by Lab distance, edge strength, and area thresholds.
- Trace the merged masks, not raw color buckets.

Sources:

- SLIC paper: https://www.cs.jhu.edu/~ayuille1/JHUcourses/VisionAsBayesianInference2022/4/Achanta_SLIC_PAMI2012.pdf
- EPFL SLIC page: https://www.epfl.ch/labs/ivrl/research/slic-superpixels/
- scikit-image segmentation note: https://scikit-image.org/docs/stable/auto_examples/segmentation/plot_segmentations.html

### 4. Potrace-Style Mask Tracing

Potrace is still relevant, but as a path-fitting stage for clean masks, not as the whole color-vectorization solution.

Why it helps us:

- Strong curve fitting and contour smoothing for binary components.
- Good conceptual model for turning a mask boundary into a clean Bezier path.
- Useful after region segmentation has already decided what belongs together.

Implementation direction:

- Segment first, then run Potrace-like tracing per component.
- Preserve corners for logo lettering and sharp automotive shapes.
- Use path simplification and Bezier fitting after mask cleanup.

Sources:

- Potrace paper: https://potrace.sourceforge.net/potrace.pdf
- AutoTrace project: https://github.com/autotrace/autotrace

### 5. Coverage-Aware Anti-Aliasing / Inverse Rasterization

Vector Magic's likely quality advantage is not only tracing; it appears to infer the original sub-pixel edge from anti-aliased pixels. James Diebel's Bayesian image vectorization work is the strongest public clue in that direction: model rasterization, then invert it.

Why it helps us:

- Anti-aliased edge pixels should become coverage evidence, not separate color regions.
- Recovers smoother boundaries through letters and curves.
- Reduces fringe paths while improving edge fidelity.

Implementation direction:

- For each boundary between two regions, estimate side colors and alpha coverage.
- Fit one clean curve through the transition band.
- Optimize the curve so its re-rendered anti-aliased raster matches the source edge.

Sources:

- ACM thesis record: https://dl.acm.org/doi/10.5555/1570919
- Semantic Scholar record: https://www.semanticscholar.org/paper/Bayesian-image-vectorization-%3A-the-probabilistic-of-Diebel/a1336e0f16e8099ba687ff361b98c184aa160edd

### 6. Direct Bezier Optimization

Several research systems improve tracing by rendering the candidate vector back to pixels and optimizing the Bezier paths against the raster. This is slower but attacks the exact problem we are seeing: shape quality after the first trace.

Why it helps us:

- Reduces accumulated error from pixel path -> polygon -> Bezier.
- Can refine curve control points and colors against the actual image.
- Useful as a second pass after VTracer/SLIC-style initialization.

Implementation direction:

- Start with traced paths from segmentation.
- Rasterize the SVG candidate to an offscreen canvas.
- Optimize control points/colors locally against the original image.
- Keep this as a high-quality mode, not the instant preview mode.

Sources:

- Direct optimization of Bezigons: https://arxiv.org/abs/1602.01913
- DiffVG project: https://people.csail.mit.edu/tzumao/diffvg/
- LIVE layer-wise image vectorization: https://ma-xu.github.io/LIVE/index_files/CVPR22_LIVE_main.pdf

### 7. Gradient / Glow / Shadow Representation

Our sample's weakest area is not only path geometry. Glows and metallic shadows are continuous-tone effects. They should often become SVG gradients, opacity layers, masks, or blur-filtered shapes instead of hundreds of flat paths.

Why it helps us:

- Preserves soft blue glow, dark shadows, and metallic highlights with fewer shapes.
- Makes the SVG more editable and more visually faithful.
- Separates clean logo geometry from photographic/airbrushed effects.

Implementation direction:

- First trace the flat logo layer.
- Render it back to canvas and compute a residual image: original minus flat vector reconstruction.
- Detect low-frequency soft regions in the residual.
- Approximate them with radial/linear gradients, translucent filled shapes, masks, or SVG blur filters.
- For more advanced work, investigate diffusion curves or gradient meshes.

Sources:

- Diffusion curves paper: https://inria.hal.science/hal-00840848/document
- Adobe Research diffusion curves page: https://research.adobe.com/publication/diffusion-curves-a-vector-representation-for-smooth-shaded-images-2/
- Optimized gradient meshes: https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/imagevectorization_siggraph07.pdf

### 8. Commercial UI Clues

Adobe Illustrator's Image Trace docs reinforce the same split: high-color modes can preserve more tone, but gradients often need special handling and may otherwise become many solid-color shapes.

Why it helps us:

- Confirms that high-color tracing is a tradeoff, not a complete solution.
- Supports exposing separate controls for paths, corners, noise, colors, and gradient/effect handling.

Source:

- Adobe Image Trace options: https://helpx.adobe.com/illustrator/desktop/manage-objects/traces-mockups-symbols/image-trace-panel-options.html

## Recommended Build Roadmap

## Implementation Update: 2026-06-24

Completed first implementation slice:

- Added `vtracer-webapp` as a vendored WASM comparison engine.
- Kept ImageTracerJS as the default because VTracer currently over-compresses this logo at safe thresholds and can fail at very fine color thresholds in the browser build.
- Added mild edge-preserving smoothing before quantization/tracing.
- Added a first-pass soft effect layer: near-background glow/shadow labels become blurred SVG paths with an `feGaussianBlur` filter.

Sample browser verification at 1024px medium detail:

- Engine: ImageTracerJS baseline
- Palette: 130 colors
- SVG paths: 2,819
- Soft effect layer: 105 blurred paths
- SVG filters: 1
- Trace time: about 2.4 seconds

This is not the final glow/shadow solution, but it proves the SVG can now carry a separate effects layer rather than forcing every soft tone into ordinary flat paths.

### Coverage Recovery Update

Added first-pass coverage-aware edge recovery:

- Estimates the dominant background color from the raster.
- Finds anti-aliased edge-band pixels that sit between background and a nearby stronger foreground color.
- Snaps those pixels toward background or foreground before tracing.
- Keeps the soft glow/shadow layer sourced from the pre-recovery filtered image so effects are not erased.

Sample browser verification at 1024px medium detail:

- Coverage edge pixels: 9,753
- Snapped to background: 5,829
- Snapped to foreground: 3,924
- SVG paths after recovery: 1,973
- Previous comparable default: about 2,819 paths
- Soft effect layer retained: 105 blurred paths and 1 SVG filter

This is still not true inverse rasterization, but it is the first working step toward treating anti-aliased pixels as coverage evidence rather than independent colors.

### Layer Separation Update

Added first-pass SVG layer organization:

- Background-like traced regions are tagged as `background`.
- Main logo regions are tagged as `solid-shape`.
- Bright neutral/metallic regions are tagged as `highlight`.
- Dark neutral regions are tagged as `shadow`.
- Blurred effect paths are kept in `#layer-soft-effects`.
- Normal artwork remains inside `#layer-ordered-trace` so render order is preserved.

Sample browser verification at 1024px medium detail:

- SVG paths: 1,973
- Background paths: 1,293
- Solid paths: 376
- Highlight paths: 179
- Shadow paths: 20
- Soft-effect paths: 105
- Difference view: 0.40% MAE, 2.11% RMSE, 1.2% hot pixels

This gives the next phase a cleaner input: gradients and masks can target highlight/shadow/effect regions without disturbing hard logo edges.

### Gradient Conversion Update

Added first-pass effect-gradient conversion:

- Eligible `highlight` and `shadow` paths now receive reusable linear gradients.
- `soft-effect` paths now receive reusable radial gradients while keeping the blur filter.
- Converted paths keep `data-original-fill` for later edit/rollback tooling.
- Gradient tuning is intentionally subtle so the visual metric remains close to the flat trace.
- `nextFrame()` now has a timeout fallback to prevent hidden-browser throttling from stalling local traces.

Sample browser verification at 1024px medium detail:

- SVG paths: 1,973
- SVG gradients: 22
- Linear gradients: 7
- Radial gradients: 15
- SVG filters: 1
- Converted effect paths: 152
- Difference view: 0.41% MAE, 2.11% RMSE, 1.2% hot pixels

The next quality improvement should focus on small text and thin detail protection before attempting more aggressive gradient/mask path replacement.

### Small Detail Protection Update

Added first-pass small-detail protection:

- Detects high-contrast foreground components against the estimated background.
- Keeps only small text-like or thin components.
- Dilates the protected mask by 1px.
- Restores original raster pixels after smoothing and coverage recovery, before quantization/tracing.

Sample browser verification at 1024px medium detail:

- Protected components: 4
- Candidate components: 15
- Restored pixels: 1,019
- SVG paths: 1,974
- SVG gradients: 22
- Difference view: 0.41% MAE, 2.20% RMSE, 1.1% hot pixels

This is intentionally conservative. A later production-quality pass should add local re-tracing for protected regions, text-aware segmentation, and path replacement rather than only pixel restoration.

### Export Optimization Update

Added first-pass export cleanup:

- Removes exact duplicate opaque paths when they are visually redundant.
- Removes tiny background-colored paths under a strict junk threshold.
- Merges only near-identical flat fills inside editable solid/highlight/shadow layers.
- Prunes unused definitions after cleanup.
- Marks optimized SVG output with `data-export-optimized`.

Sample browser verification at 1024px medium detail:

- SVG paths: 1,974 -> 1,974
- SVG size: 469,864 -> 465,603 bytes
- Paths with merged flat fills: 539
- Flat color buckets: 14 -> 13
- Duplicate paths removed: 0
- Tiny background paths removed: 0
- Difference view: 0.41% MAE, 2.20% RMSE, 1.1% hot pixels

This pass is deliberately non-destructive. More aggressive cleanup should wait until manual correction tools exist, because deleting/merging ambiguous regions without a user override can damage small logo details.

### Edge Polish Update

Added a focused edge-polish pass after high-detail exports showed stair-stepped hard contours:

- Runs after layer separation, before gradient conversion.
- Targets hard `background` and `solid-shape` layers.
- Skips filtered glow paths, gradient paths, and tiny detail-like subpaths.
- Re-fits eligible stair-stepped closed subpaths into cubic Bezier spans.
- Keeps sharp corners through a corner-angle guard.

High-detail browser verification at 1536px:

- Final SVG paths: 2,549
- Edge-polished subpaths: 64
- Edge points: 7,416 -> 6,228
- Cubic spans added: 466
- SVG gradients: 34
- SVG filters: 1
- Difference view: 0.33% MAE, 1.95% RMSE, 0.8% hot pixels

This improves the current ImageTracerJS-based geometry, but it is still a post-trace repair. The deeper Vector Magic-like fix remains coverage-aware boundary fitting before path generation.

### Phase A: Fastest Quality Jump

1. Add a VTracer comparison engine.
2. Add edge-preserving smoothing before segmentation.
3. Add path/effect stats to the UI: paths, fills, gradients, filters, file size.
4. Keep ImageTracerJS as a baseline, but stop tuning it as the main quality path.
5. Add an experimental effects layer for shadows/glows:
   - detect soft residual regions
   - export as radial/linear gradients or blurred translucent paths

Success criteria for the current logo:

- Fewer noisy speckles in the black background.
- Better preservation of blue glows and gray metallic shading.
- Gradients or filters present in the SVG where smooth effects exist.
- Similar or lower path count while improving visual match.

### Phase B: Custom Engine

1. Lab-space edge-preserving preprocessing.
2. SLIC/superpixel segmentation.
3. Region adjacency graph merging.
4. Potrace-like mask tracing per merged region.
5. Corner-aware Bezier fitting.
6. Coverage-aware anti-aliased boundary fitting.

This is the path toward Vector Magic-like edges.

### Phase C: High-Quality / Slower Mode

1. Rasterize our SVG candidate back to canvas.
2. Compute pixel/perceptual error.
3. Optimize Bezier control points and colors locally.
4. Use gradient/effect primitives for residual smooth tones.
5. Add a segmentation editor for user correction.

This is the path toward professional results on difficult images.

## Key Takeaway

The next breakthrough should not be "more colors" inside the current ImageTracerJS pipeline. The better architecture is hybrid:

```text
edge-preserving cleanup
-> spatial color segmentation
-> clean mask tracing
-> sub-pixel anti-alias boundary fitting
-> separate gradient/effect layer
-> optional optimization pass
```

That gives us a realistic route toward Vector Magic-level output while keeping the online app inspectable and buildable.
