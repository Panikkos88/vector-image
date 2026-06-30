# Dark-Glow Tonal Variant Guard v1

Date: 2026-06-30
Agent: codex

## Summary

Tested the next gain after the guarded High-detail bake-off: allow the dark-glow tonal-band pass to act as a measured challenger inside the High-detail Region path.

The useful gain is on `react-atom`. High-detail alone improved it to 2.95% edge / 0.9% hot at 18 paths. The tonal-band candidate improved it further to 2.69% edge / 0.9% hot at 45 paths. The old detail bake-off guard rejected that because it assumed High should only add a few paths. The new guard allows the wider path/node budget only for a strong visual win: edge improves at least 1.2 percentage points and hot pixels improve at least 2.5 percentage points in the High challenger.

## Implementation

- `glowTonalBandOptions` now supports named tonal variants: `baseline`, `fine`, and `broad`.
- `optimizeGlowTonalBanding` evaluates all variants, measures each SVG through `measureSvgDifference`, and selects the best guarded candidate.
- `tonalBandCandidatePassesGuard` now has a `moderate-clean-win` complexity lane for tonal bands: edge improves by at least 0.20 percentage points, hot pixels do not rise, and contamination stays within slack.
- `detailBakeoffEvaluation` now has a strong-visual-win path budget so High+tonal can be accepted when the visual improvement is large enough.

## Local Proof

Settings: normal product path, Auto router, Medium visible detail, Smooth anti-aliasing, Background Detach Off, Preserve glows/shadows.

| Sample | Result |
| --- | --- |
| `react-atom` | High+tonal selected: 2.95% edge / 0.9% hot / 18 paths -> 2.69% edge / 0.9% hot / 45 paths |
| `tiktok-dark-glow` | Held: 3.41% edge / 1.8% hot / 58 paths |
| `dark-apple-gloss` | Held: Palette bake-off winner 3.12% edge / 2.0% hot / 49 paths |
| `boc-logo-small` | Held: 2.41% edge / 0.7% hot / 55 paths |

## Cloud Proof

Deployed to Cloud Run revision `vector-accuracy-studio-00025-f26` with cache tag `20260630-tonalvariant4`.

Cloud UI matched local:

| Sample | Cloud Result |
| --- | --- |
| `react-atom` | 2.69% edge / 0.9% hot / 45 paths |
| `tiktok-dark-glow` | 3.41% edge / 1.8% hot / 58 paths |
| `dark-apple-gloss` | 3.12% edge / 2.0% hot / 49 paths |
| `boc-logo-small` | 2.41% edge / 0.7% hot / 55 paths |

## Interpretation

This is a small but real gain. It confirms that React's gap is partly tonal-band modeling, not only boundary geometry. The `fine` and `broad` variants did not beat the baseline variant on the checked samples, but keeping the variant evaluator is useful because it fails closed and gives us a log of the candidate space.

Next tonal work should stop adding broad variants and instead build smarter band geometry: split tonal bands by local feature regions, protect foreground strokes better, and avoid making every glow threshold global.
