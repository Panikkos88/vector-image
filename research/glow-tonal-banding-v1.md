# Glow Tonal Banding v1

Date: 2026-06-27

## Goal

Close the `bench-dark-glow` gap by modeling the smooth glow as stacked flat tonal bands, similar to the observed Vector Magic output, without changing the global k-means palette or lowering the shared `fitRegionAdaptive` flat-fill threshold.

## Implementation

- Added a Palette-only, metric-guarded dark-glow candidate.
- Detects low-luminance near-background glow pixels from the original raster.
- Builds cumulative threshold masks over the glow score and traces them as flat filled paths.
- Injects the tonal-band group after background paths and before foreground paths.
- Keeps the candidate only when `measureSvgDifference` improves error without unacceptable complexity growth.
- Added a narrow Auto-router exception for small dark-glow palettes so the feature is selected without user engine choice.

## Result

`bench-dark-glow`, Auto router, Medium/Smooth/Preserve:

| Run | MAE | Edge RMSE | Hot | Paths |
| --- | ---: | ---: | ---: | ---: |
| Previous local baseline | 2.04% | 3.86% | 0.3% | 65 |
| Palette base before bands | 1.84% | 2.64% | 0.8% | 47 |
| Tonal band selected | 0.27% | 1.72% | 0.2% | 50 |
| Vector Magic reference | 0.09% | 1.04% | 0.09% | 66 |

Local and Cloud Run revision `vector-accuracy-studio-00013-5vc` match on the selected result.

## Interpretation

This is a real gain. It confirms that the dark-glow problem was not solved by more global colors; it needed a separate tonal model for smooth near-background effects.

It does not fully reach Vector Magic yet. The remaining gap is likely:

- cleaner and more numerous tonal levels for subtle halo falloff,
- better separation of foreground black holes from glow background,
- stronger edge placement for small lettering and thin logo strokes,
- eventually a shared model for metallic/gradient tonal meshes.

## Guardrails

- Do not lower the shared `fitRegionAdaptive` flat threshold to fix dark glow.
- Do not retry higher global k as the primary path; it was already disproven.
- Keep the metric guard. The tonal-band layer is useful only when it proves the gain.
