# Scientific Background Detach v1

Date: 2026-06-25

## What Changed

Added a modular deterministic background-detach stage:

```text
app/background-detach.js
```

The module exposes:

```text
window.BackgroundDetach.detach(imageData, options)
```

The main app now has a `Background Detach` selector:

- Off
- Auto
- Force

Default is Auto.

## Method

The v1 detector is deterministic and browser-only:

1. Estimate dominant background color from borders and corners.
2. Flood-fill only connected background pixels from the image border.
3. Build a trimap-style unknown band around the connected background boundary.
4. Estimate alpha in the unknown band from color distance to the background.
5. Smooth alpha only inside the unknown band.
6. Create a foreground `ImageData` with transparent background.
7. Optionally reattach the background as a separate SVG layer:

```text
data-layer="detached-background"
```

The existing `Remove background` checkbox still controls export behavior:

- unchecked: reattach background layer when the detached candidate is selected
- checked: keep foreground/logo transparent

## Guard

The detach stage is not trusted blindly.

When Auto or Force produces a detached foreground, the app traces both:

1. the current non-detached pipeline
2. the detached foreground pipeline

Then it measures both final SVGs against the original raster and keeps the detached result only if:

- edge-weighted RMSE does not worsen beyond tolerance
- hot pixels do not worsen beyond tolerance
- background contamination does not worsen beyond tolerance
- path count stays within the allowed growth bound

## Sample Result

Test image:

```text
app/assets/sample-logo.png
```

Settings:

- Engine: ImageTracerJS baseline
- Detail: Medium
- Anti-aliasing: Smooth
- Curve Optimizer: Balanced
- Sub-pixel Edges: Balanced
- Background Detach: Auto
- Effects: Preserve glows/shadows

Auto detected:

- background: `#000000`
- confidence: 100%
- foreground pixels: 67,869
- unknown pixels: 9,645
- matte edge pixels: 3,212
- candidate background paths avoided: 1

Guard result:

| Result | Edge RMSE | Hot Pixels | Paths |
| --- | ---: | ---: | ---: |
| Baseline | 4.26% | 1.1% | 1,974 |
| Detached candidate | 4.85% | 1.2% | 2,073 |

The detached candidate was rejected. The exported/previewed SVG stayed on the existing curve-optimized baseline.

## Interpretation

The module is useful even though Auto was rejected on this sample. It proves the guard is necessary: a seemingly logical foreground/background detach can damage anti-aliased logo edges if the matte is not yet good enough.

The next improvement should focus on the matte, not on making the guard looser.

## Next Direction

For v2:

1. Estimate foreground color locally on the non-background side of each unknown pixel.
2. Use local foreground/background color pairs instead of global distance to black.
3. Preserve glow/shadow pixels as a separate effect matte rather than forcing them into hard foreground alpha.
4. Score the matte before tracing by compositing foreground+background back to raster and measuring matte reconstruction error.
5. Only trace detached foreground when the matte reconstruction error is already lower than the original preprocessing path.

## v2 Follow-Up: Local Color-Pair Matte

Date: 2026-06-25

Implemented the first v2 matte upgrade in `app/background-detach.js`.

Changes:

- The unknown trimap band now includes both sides of the connected background boundary.
- Each unknown pixel searches nearby non-background pixels for a local foreground color.
- Alpha is estimated from the compositing equation:

```text
C = alpha * F + (1 - alpha) * B
```

- High-confidence foreground-side pixels stay solid so letters and hard curves are not over-cut.
- The module records foreground-side/background-side unknown counts, local sample coverage, foreground-side solid pixels, and matte reconstruction error.

Sample result with the same medium-detail logo settings:

| Result | Edge RMSE | Hot Pixels | Paths |
| --- | ---: | ---: | ---: |
| Baseline | 4.26% | 1.1% | 1,974 |
| Detached v1 | 4.85% | 1.2% | 2,073 |
| Detached v2 | 4.06% | 1.3% | 1,618 |

Additional v2 stats:

- confidence: 99%
- background: `#000000`
- unknown pixels: 19,159
- background-side unknown: 9,645
- foreground-side unknown: 9,514
- matte-edge pixels: 17,786
- local sample coverage: 100%
- foreground-side solid pixels: 3,985
- matte reconstruction RMSE: 4.57%

Interpretation:

The local color-pair matte is a real improvement over v1 for edge shape: edge RMSE improved and path count dropped. It is still not accepted because hot pixels increased. That means the next work should preserve fine high-contrast details inside the detached foreground or add a candidate that keeps a protected detail layer before tracing. The guard should stay strict.

## v3 Follow-Up: Hot-Pixel Trace Profile

Date: 2026-06-25

Implemented a detached-foreground tracing profile in `app/app.js`.

The idea was to keep the v2 matte but let ImageTracer preserve more thin foreground detail after the background has been detached:

- lower trace threshold for detached foreground candidates
- lower path omission
- one extra color quantization cycle for preserved effects
- line filtering disabled only for detached foreground candidates
- richer guard logging with explicit failure reasons and detached trace settings

Measured sample result:

| Result | Edge RMSE | Hot Pixels | Paths |
| --- | ---: | ---: | ---: |
| Baseline | 4.26% | 1.1% | 1,974 |
| Detached v2 compact | 4.06% | 1.3% | 1,618 |
| Detached v3 detail | 3.23% | 1.2% | 3,454 |

Guard result:

- rejected
- max allowed paths: 2,132
- failed gates: path growth, hot pixels, background contamination

Interpretation:

This is progress, but not yet shippable as the selected output. The hot-pixel problem responds to preserving fine detached foreground paths, but the no-linefilter candidate creates too many micro-paths. The next step should be a micro-path pruning/merging pass for detached foreground traces, using the difference guard to keep only pruning that preserves the edge RMSE and hot-pixel gains.

## v4 Follow-Up: Detached Micro-Path Pruning

Date: 2026-06-25

Implemented a detached-only micro-path pruning pass inside export optimization.

What changed:

- Export optimization now records detached path size and layer histograms.
- Detached foreground candidates can prune tiny opacity/gradient sliver paths.
- The guard stores detached export cleanup stats even when the candidate is rejected.

Measured sample result:

| Result | Edge RMSE | Hot Pixels | Paths |
| --- | ---: | ---: | ---: |
| Baseline | 4.26% | 1.1% | 1,974 |
| Detached v3 detail, no prune | 3.23% | 1.2% | 3,454 |
| Detached v4 balanced prune | 3.85% | 1.3% | 1,877 |

The pruner removed 1,577 detached micro paths. That solved the path growth gate:

- candidate paths: 1,877
- max allowed paths: 2,132

The candidate is still rejected because:

- hot pixels remain above the guard
- background contamination remains above the guard

Interpretation:

This confirms the project is moving in the right direction. Background detach plus detail-preserving tracing can outperform the baseline on edge RMSE, and micro-pruning can bring complexity back under budget. The remaining work is no longer general tracing quality; it is targeted cleanup of contamination/hot pixels in the detached candidate.
