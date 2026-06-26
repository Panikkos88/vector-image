# Vector Accuracy Studio Perfection Steps

Date started: 2026-06-24

## Goal

Move the prototype from "close visual trace" toward production-quality Vector Magic-like output.

## Step Tracker

1. Difference/error view - complete
   - Rasterize the generated SVG back to canvas.
   - Compare it against the original image at the working resolution.
   - Show a heatmap for visible error.
   - Report measurable error stats in the trace log.
2. Bezier/path refinement - complete first pass
   - Refit jagged traced boundaries into cleaner cubic Bezier curves.
   - Preserve sharp corners on letters and logo edges.
3. Shape/effect layer separation - complete first pass
   - Split solid logo shapes, metallic highlights, shadows/glows, and background.
4. Gradient/mask conversion - complete first pass
   - Replace clusters of flat shadow/highlight paths with SVG gradients, masks, or blur filters.
5. Small text/detail protection - complete first pass
   - Detect small text and thin components and trace them with stricter settings.
6. Path cleanup/export optimization - complete first pass
   - Merge similar colors, remove junk paths, simplify duplicate paths, and keep output editable.
7. Manual correction tools - pending
   - Add background/foreground picking, color merging, region deletion, and local detail controls.

## Completed Step Notes

### Step 1: Difference/error view

Implemented in the app as a fourth `Difference` panel.

Sample verification at 1024 x 724:

- SVG paths: 1,973
- Difference MAE: 0.40%
- Difference RMSE: 2.10%
- Max pixel error: 66.9%
- Hot pixels: 1.2%
- Difference canvas size: 1024 x 724

The heatmap uses dark pixels for close matches and warm colors for visible error. It should be used as the measurement loop before accepting future tracing changes.

### Step 2: Bezier/path refinement

Implemented a conservative post-trace path refinement pass for ImageTracerJS output.

Current behavior:

- Parses SVG path data after ImageTracer runs.
- Refines only safe closed line-only loops.
- Simplifies minor point chatter.
- Converts smooth spans to cubic Bezier `C` commands.
- Preserves sharp corners with straight `L` segments.
- Leaves unsupported or already-curved paths untouched.

Sample verification at 1024 x 724:

- SVG paths: 1,973
- Refined loops: 47
- Points: 957 -> 911
- Cubic spans added: 120
- Difference MAE: 0.40%
- Difference RMSE: 2.11%
- Hot pixels: 1.2%

This is deliberately conservative. It improves editability and curve cleanliness without materially changing the raster match. A later pass can use the difference view to try more aggressive curve fitting.

### Step 3: Shape/effect layer separation

Implemented a first-pass SVG layer model after tracing, soft-effect injection, and path refinement.

Current behavior:

- Preserves the SVG render order so the visual result stays stable.
- Moves detected leading background artwork into `#layer-background`.
- Wraps normal traced artwork in `#layer-ordered-trace`.
- Keeps blurred glow/shadow regions in `#layer-soft-effects`.
- Tags individual paths with `data-layer` values: `background`, `solid-shape`, `highlight`, `shadow`, and `soft-effect`.
- Parses both hex colors and ImageTracerJS `rgb(...)` fills for layer classification.

Sample verification at 1024 x 724:

- SVG paths: 1,973
- Background paths: 1,293
- Solid-shape paths: 376
- Highlight paths: 179
- Shadow paths: 20
- Soft-effect paths: 105
- Difference MAE: 0.40%
- Difference RMSE: 2.11%
- Hot pixels: 1.2%

This does not yet convert effects into clean gradients, but it gives the app a real structure to optimize: solid shapes can be simplified differently from highlights, shadows, and glows.

### Step 4: Gradient/mask conversion

Implemented a conservative first-pass effect-gradient conversion after shape/effect layer separation.

Current behavior:

- Converts eligible `highlight`, `shadow`, and `soft-effect` path fills into reusable SVG gradients.
- Keeps the existing soft blur filter for glow/shadow regions.
- Uses subtle gradient stops so the visual match stays close to the flat-color trace.
- Tags converted paths with `data-gradient-fill`.
- Stores original fills in `data-original-fill` for later editing or rollback.
- Adds a timeout fallback to `nextFrame()` so browser background throttling does not stall tracing.

Sample verification at 1024 x 724:

- SVG paths: 1,973
- SVG gradients: 22
- Linear gradients: 7
- Radial gradients: 15
- SVG filters: 1
- Converted effect paths: 152
- Converted highlights: 42
- Converted shadows: 5
- Converted soft effects: 105
- Difference MAE: 0.41%
- Difference RMSE: 2.11%
- Hot pixels: 1.2%

This is still not full cluster replacement with masks, but the SVG now contains editable gradient/effect primitives instead of relying only on flat color bands.

### Step 5: Small text/detail protection

Implemented a conservative preprocessing guardrail for small/high-contrast details.

Current behavior:

- Detects high-contrast foreground components in the original raster.
- Filters candidates to small text-like or thin components.
- Dilates the protected component mask by 1px.
- Restores original pixels into protected areas after smoothing and coverage recovery.
- Leaves the global smoothing, coverage recovery, layer separation, and gradient conversion passes intact.
- Reports candidate/protected component counts in the trace log.

Sample verification at 1024 x 724:

- Protected components: 4
- Candidate components: 15
- Restored pixels: 1,019
- SVG paths: 1,974
- SVG gradients: 22
- SVG filters: 1
- Difference MAE: 0.41%
- Difference RMSE: 2.20%
- Hot pixels: 1.1%

This is a first pass. It protects small details from global preprocessing without yet doing a separate local re-trace or OCR-aware text segmentation.

### Step 6: Path cleanup/export optimization

Implemented a conservative SVG export optimizer after layer separation, gradient conversion, and small detail protection.

Current behavior:

- Removes exact duplicate opaque paths when they are visually redundant.
- Removes tiny background-colored paths when they are below a strict junk threshold.
- Merges only near-identical flat fills inside editable shape/highlight/shadow layers.
- Prunes unused definitions after cleanup.
- Marks optimized exports with `data-export-optimized`.
- Keeps gradient fills, soft-effect filters, layer tags, and original gradient metadata intact.

Sample verification at 1024 x 724:

- SVG paths: 1,974 -> 1,974
- SVG bytes: 469,864 -> 465,603
- Exact duplicate paths removed: 0
- Tiny background paths removed: 0
- Paths with merged flat fills: 539
- Flat color buckets: 14 -> 13
- Unused definitions removed: 0
- SVG gradients: 22
- SVG filters: 1
- Difference MAE: 0.41%
- Difference RMSE: 2.20%
- Hot pixels: 1.1%

This first pass optimizes editability and export consistency without changing geometry. Later cleanup can be more aggressive after the manual correction tools can protect user-approved regions.

### Edge polish addendum

Added a focused edge-polish pass because the high-detail export still had stair-stepped hard edges.

Current behavior:

- Runs after layer separation and before gradient conversion.
- Targets only hard visual layers: `background` and `solid-shape`.
- Skips glow/filter/gradient paths.
- Detects long stair-stepped closed subpaths.
- Re-fits eligible subpaths into cleaner cubic Bezier spans.
- Preserves sharp corners through the same corner-angle guard used by path refinement.
- Skips tiny detail-like subpaths to avoid damaging small text.

High-detail sample verification at 1536 x 1086:

- SVG paths: 2,570 -> 2,549 after optimization
- Edge-polished subpaths: 64
- Edge points: 7,416 -> 6,228
- Cubic spans added by edge polish: 466
- Small subpaths skipped: 4,400
- Smooth subpaths skipped: 4
- SVG gradients: 34
- SVG filters: 1
- Difference MAE: 0.33%
- Difference RMSE: 1.95%
- Hot pixels: 0.8%

This is still not full sub-pixel inverse rasterization, but it directly attacks the visible stair-step edge problem in the generated SVG.

## Current Step Notes

Next step is Step 7: Manual correction tools. Add background/foreground picking, color merging, region deletion, and local detail controls so the user can correct ambiguous cases before export.
