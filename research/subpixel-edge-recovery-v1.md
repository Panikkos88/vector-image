# Sub-Pixel Edge Recovery v1

Date: 2026-06-24

## What Changed

The prototype now has a persistent benchmark ledger and a first experimental sub-pixel edge fitting pass.

Benchmark records are stored in browser `localStorage` under:

```text
vectorAccuracyStudio.benchmarkRuns.v1
```

Each run records:

- image fingerprint
- settings, including Sub-pixel Edges Off/Balanced/Strong
- runtime, canvas size, palette count
- path count, estimated point count, SVG bytes, gradients, filters
- layer, sub-pixel, edge-polish, and export stats
- MAE, RMSE, edge-weighted MAE/RMSE, hot pixels, and background contamination

## Sub-Pixel Method

The v1 fitter runs after layer separation and before edge polish.

It targets only hard-edge `background` and `solid-shape` paths, skipping tiny details, gradients, filters, soft effects, glows, shadows, and unsupported path geometry.

For eligible closed contours it:

1. Samples the original raster on both sides of a path point.
2. Estimates which side is the fill side.
3. Projects local colors between outside and inside colors.
4. Looks for the 50% coverage crossing.
5. Moves the point along the local normal by a limited amount:
   - Balanced: 0.45px max
   - Strong: 0.75px max
6. Smooths shifts between neighboring non-corner points.
7. Lets the existing edge-polish pass refit the result into cubic spans.

## Sample Result

Test image:

```text
app/assets/sample-logo.png
```

Medium-detail, ImageTracerJS baseline, Smooth anti-aliasing, Preserve glows/shadows:

| Mode | Final MAE | Final RMSE | Edge RMSE | Hot Pixels | Paths | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Off | 0.41% | 2.19% | 4.27% | 1.1% | 1,974 | Baseline |
| Balanced | 0.41% | 2.19% | 4.27% | 1.1% | 1,974 | Candidate rejected |
| Strong | 0.41% | 2.19% | 4.27% | 1.1% | 1,974 | Candidate rejected |

Candidate measurements before the guard:

- Balanced adjusted 36 subpaths and 339/3,952 points, but candidate edge RMSE was 4.29%.
- Strong adjusted 38 subpaths and 387/3,952 points, but candidate edge RMSE was 4.31%.
- The guard kept the no-subpixel final output because both candidates were slightly worse.

## Interpretation

The metric guard is valuable: it prevented a plausible-looking geometry change from silently degrading the final output.

The current v1 sub-pixel model is still too local. It moves path endpoints from sampled coverage crossings, but it does not yet optimize the full curve against a rasterized candidate. For ImageTracerJS output, many endpoints are already simplified Bezier endpoints rather than dense pixel-boundary samples, so moving them independently can harm the global curve even when the local crossing estimate is reasonable.

## Next Algorithm Direction

The next step should not be larger shifts. It should be a curve-level optimizer:

1. Work on one eligible contour at a time.
2. Rasterize the contour locally before and after candidate moves.
3. Accept only point/control-point updates that improve local edge-weighted error.
4. Optimize cubic control handles, not only endpoints.
5. Keep the current metric guard around the whole SVG as a final safety check.

This is closer to inverse rasterization and more likely to close the remaining Vector Magic gap.
