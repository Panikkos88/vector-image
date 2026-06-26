# Raster-Guarded Curve Optimizer v1

Date: 2026-06-25

## What Changed

The prototype now has a Curve Optimizer control with three modes:

- Off
- Balanced
- Strong

The first implementation does not blindly smooth paths. It renders multiple final SVG candidates, measures each one against the original raster, and keeps a candidate only when the measured edge score improves.

## Method

The optimizer works inside the existing finalization path:

```text
layered SVG
-> optional sub-pixel candidate
-> edge-polish variant
-> gradient conversion
-> export optimization
-> raster difference scoring
```

Balanced mode tests:

- `base`: current edge polish settings
- `crisper`: lower tolerance, stronger corner preservation, slightly lower curve tension
- `smoother`: higher tolerance, softer corners, slightly higher curve tension

Strong mode adds:

- `precise`: tighter fit
- `flow`: longer smoother curve flow

Selection guard:

- Candidate edge-weighted RMSE must improve.
- Hot-pixel ratio must not materially increase.
- Path count must stay within 10% of the base candidate.

## Sample Result

Test image:

```text
app/assets/sample-logo.png
```

Settings:

- Engine: ImageTracerJS baseline
- Detail: Medium
- Anti-aliasing: Smooth
- Sub-pixel Edges: Balanced
- Curve Optimizer: Balanced
- Effects: Preserve glows/shadows

Verified browser run:

| Candidate | Edge RMSE | Hot Pixels | Paths | Result |
| --- | ---: | ---: | ---: | --- |
| base | 4.27% | 1.1% | 1,974 | Replaced |
| crisper | 4.26% | 1.1% | 1,974 | Selected |

Final measured result:

- MAE: 0.41%
- RMSE: 2.18%
- Edge-weighted RMSE: 4.26%
- Hot pixels: 1.1%
- Paths: 1,974
- Edge polish: 41 subpaths, 3,888 -> 3,665 points, 98 cubic spans

The sub-pixel candidate was tested after the curve-optimized baseline, but the metric guard rejected it because it measured worse:

- Baseline edge RMSE: 4.26%
- Sub-pixel candidate edge RMSE: 4.27%

## Interpretation

This is the first step that improved the measured edge score after the benchmark ledger was added. The gain is small, but it is trustworthy because it survived raster comparison and did not increase hot pixels or path count.

The important lesson is that guard-driven optimization is the right path. The next improvement should move from global curve-fit variants to local per-contour or per-curve optimization.

## Next Direction

For v2:

1. Select a small number of high-error contours from the difference map.
2. Optimize only those contours.
3. Try endpoint and cubic-control-handle perturbations.
4. Rasterize local tiles instead of the whole SVG for each candidate.
5. Accept only local edits that improve edge-weighted error and pass the global SVG guard.

This starts to resemble real inverse-rasterization without needing a full backend optimizer yet.
