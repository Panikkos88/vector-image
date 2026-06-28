# Palette Boundary Simplifier v1

Date: 2026-06-28
Agent: codex

## Goal

Use the accurate-but-node-heavy Palette boundary candidates instead of discarding them. The outline-shield benchmark already showed rejected candidates near 5.3% edge RMSE, while the accepted compact boundary stayed near 9.8%. This pass tries to refit those rejected candidates into lower-complexity SVGs, measures them, and only promotes a candidate if the metric guard accepts it.

## Implementation

- Added an internal Palette post-selection stage, `optimizePaletteBoundarySimplifier`.
- It only runs when the current Palette boundary edge RMSE is above 5.5% and at least one rejected source is 1.0 edge point better.
- It refits closed path subpaths from their endpoints using smooth and endpoint-line variants.
- It guards acceptance by edge improvement, hot pixels, background contamination, path growth, and node growth.
- It logs raw best candidate, sources, variants, failures, and selected result in the Trace Log and benchmark ledger through `paletteOptimization.boundarySimplifier`.

## Local Result

Sample: `app/assets/benchmarks/bench-outline-shield.png`

- Before this pass: Palette/k5 + thin-stroke v1 = 9.72% edge RMSE, 0.72% MAE, 1.7% hot, 18 paths.
- New boundary simplifier selected `boundary-simplifier:tight-corners-s12-c065:line-a30`.
- Boundary stage alone: 9.78% -> 5.36% edge RMSE, 1.8% -> 0.7% hot, 31 paths, nodes 1372 -> 4116.
- Final with thin-stroke recovery: 5.32% edge RMSE, 0.26% MAE, 0.7% hot, 18 paths, nodes 5248.
- Export check: `C:\Users\panik\Downloads\bench-outline-shield-local-trace (1).svg` downloaded, 66,104 bytes, and contains the boundary-simplifier marker.

## Regression Smoke

- BOC: unchanged at 2.41% edge / 0.26% MAE / 0.7% hot / 55 paths. Simplifier skipped because edge is already below trigger.
- Fine text: unchanged at 3.20% / 0.17% / 0.4% / 61 paths. Simplifier skipped.
- Dark glow: still at the drifted 3.32% / 0.28% / 0.4% / 68 paths. This pass did not create or fix the drift from the previous accepted 1.72% result.
- Metal: unchanged at 9.11% / 1.22% / 4.2% / 13 paths.

## Decision

Accept locally as a meaningful outline gain. Do not deploy yet because dark-glow still does not reproduce the earlier accepted 1.72% edge result, and Cloud proof was intentionally skipped.

## Next

The remaining outline gap to Vector Magic is still large: VM reference is 1.90% edge / 30 paths, while ours is 5.32% / 18 paths. The next likely gains are:

- shared-edge/coverage-aware contour reconstruction instead of endpoint-only refits,
- better thin-stroke source modeling for the yellow strokes and dots,
- and investigation of the dark-glow tonal-band drift before any Cloud deployment.
