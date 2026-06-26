# GitHub Vectorization Research

Date: 2026-06-24

## Why We Feel "Close But Not There"

The current prototype is now strong for color grouping, glow preservation, layered output, and conservative edge repair. The remaining gap is not mainly color count or UI settings. It is that the hard boundaries are still derived from pixel-region contours. Professional tools appear to solve this with stronger segmentation, cleaner curve fitting, manual correction, and sometimes optimization against a rasterized error image.

## Repositories And Methods Reviewed

### VTracer / visioncortex

Repository: https://github.com/visioncortex/vtracer

Relevant points:

- Rust/WASM raster-to-vector engine.
- Handles color images directly.
- Uses clustering and curve fitting.
- Designed for compact vector output from high-resolution scans.
- MIT license.

Use for us:

- Keep as a comparison engine and possible backend engine.
- Its spline/corner/segment settings are worth exposing more carefully.
- The browser WASM path has already shown instability in our app, so it should not be the only engine yet.

### ImageTracerJS

Repository: https://github.com/jankovicsandras/imagetracerjs

Relevant points:

- Simple JavaScript raster tracer.
- Good browser baseline.
- Easy to inspect and patch.
- Unlicense.

Use for us:

- Keep as stable baseline.
- We are likely near the practical ceiling of this engine.
- Additional quality now needs custom preprocessing, edge fitting, and post-optimization.

### AutoTrace

Repository: https://github.com/autotrace/autotrace

Relevant points:

- Older bitmap-to-vector converter.
- Supports outline and centerline tracing.
- Includes color reduction and despeckling.
- Supports SVG, EPS, PDF, DXF, and other output formats.
- GPL/LGPL license split needs care before embedding.

Use for us:

- Research reference for centerline/outline tracing and despeckling.
- Not ideal as a web dependency unless license and packaging are acceptable.

### Potrace-Based Color Tracing

Examples:

- SVGcode: https://github.com/tomayac/SVGcode
- coltrace: https://github.com/arnehilmann/coltrace

Relevant points:

- Potrace is very good at clean binary mask tracing.
- Color tracing usually means quantize/posterize first, then trace each binary color mask.
- This can create sharp edges, but color/gradient handling is limited.

Use for us:

- Strong candidate for a next local experiment:
  1. Segment colors.
  2. Build binary masks per important region.
  3. Trace each region with a Potrace-style fitter.
  4. Reapply our layer/gradient/effect logic.
- Not enough by itself for soft glows and metallic gradients.

### LIVE: Layer-wise Image Vectorization

Repository: https://github.com/Picsart-AI-Research/LIVE-Layerwise-Image-Vectorization

Relevant points:

- CVPR 2022 layer-wise image vectorization.
- Recursively adds optimizable closed Bezier paths.
- Optimizes paths to fit the raster image while preserving layer-wise structure.
- Python/PyTorch research code, not a drop-in browser library.

Use for us:

- Strong architectural clue: add layer-wise vector primitives and optimize them against the raster.
- More useful as backend research than client-side JavaScript.

### diffvg

Repository: https://github.com/BachiLi/diffvg

Project page: https://people.csail.mit.edu/tzumao/diffvg/

Relevant points:

- Differentiable SVG rasterizer.
- Provides gradients for curve/control-point/color optimization from raster-space losses.
- Includes `refine_svg.py` for improving an existing SVG against a target raster.
- Apache-2.0 license.

Use for us:

- Best next breakthrough candidate.
- We can start from our generated SVG, rasterize it, compare to source, then optimize selected path control points/colors.
- Likely needs a Python backend worker, not browser-only execution.

### SuperSVG

Paper: https://openaccess.thecvf.com/content/CVPR2024/papers/Hu_SuperSVG_Superpixel-based_Scalable_Vector_Graphics_Synthesis_CVPR_2024_paper.pdf

Relevant points:

- Superpixel-based SVG synthesis.
- The paper groups methods into algorithmic tracing, deep-learning methods, and optimization-based methods.
- It reinforces that quantize-then-trace and DiffVG/LIVE-style optimization are the important families.

Use for us:

- Confirms our next architecture should move from palette quantization toward spatial segmentation plus optimization.

## Best Next Technical Direction

The next serious quality step should be a hybrid:

```text
edge-preserving preprocessing
-> spatial region segmentation
-> Potrace/VTracer-style clean mask tracing
-> sub-pixel coverage-aware boundary fitting
-> SVG layer/effect/gradient conversion
-> optional diffvg-style optimization loop
```

## Practical Next Experiments

1. Potrace-style mask tracer experiment
   - Build per-layer binary masks from our quantized/segmented image.
   - Trace masks with a Potrace-like algorithm.
   - Compare edge cleanliness against ImageTracerJS.

2. Local boundary optimizer
   - For each major hard-edge path, sample the original anti-aliased edge band.
   - Move control points along the normal direction to minimize raster error.
   - Start with only large `solid-shape` and `background` contours.

3. diffvg backend prototype
   - Export our current SVG and target PNG.
   - Run a short optimization pass on selected paths only.
   - Measure whether MAE/hot pixels improve without destroying editability.

4. Manual correction tools
   - Add foreground/background picks and region deletion.
   - Needed before aggressive automatic cleanup, because ambiguous logo regions need user guidance.

## Recommendation

Do not keep tuning ImageTracerJS alone. The highest-leverage next move is to build a small backend experiment around `diffvg` or a Potrace-style mask tracer, then compare output against our current app using the existing difference view.

For the current online product direction, the likely production shape is:

- Browser UI for upload, selectors, preview, manual correction, and download.
- Backend vectorization worker for slow/high-quality modes.
- Fast browser baseline for quick previews.
- High-quality mode using segmentation plus optimization.
