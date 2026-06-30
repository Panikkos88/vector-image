# Dark-Glow Palette-vs-Region Bake-Off v1

Date: 2026-06-30
Agent: codex

## Summary

Implemented a guarded Auto-router follow-up for dark/glow/gloss images. When the normal router sends a dark-glow candidate to Region because Palette residual is too high, the app can now run Palette as a challenger, measure both final SVGs with the existing difference harness, and select Palette only when it improves edge/hot metrics without unacceptable complexity growth.

This is deliberately a measured routing/selection pass, not a new tracer. It uses the existing Palette + super boundary + tonal banding path as a challenger.

## Local Proof

Settings: Auto router, Medium detail, Smooth anti-aliasing, Balanced sub-pixel, Balanced curve optimizer, Background Detach Off, Preserve glows/shadows.

| Sample | Decision | Result |
| --- | --- | --- |
| `dark-apple-gloss` | Selected Palette | Region 4.40% edge / 7.4% hot / 40 paths -> Palette 3.12% edge / 2.0% hot / 49 paths |
| `tiktok-dark-glow` | Kept Region | Region 3.80% edge / 2.2% hot / 45 paths vs Palette 5.94% edge / 14.1% hot / 30 paths |
| `metallic-wordmark-generated` | Kept Region | Region 4.09% edge / 1.7% hot / 13 paths vs Palette 4.16% edge / 0.7% hot / 40 paths; rejected for insufficient edge win/background contamination |
| `react-atom` | No bake-off | Stayed Region at 4.09% edge / 4.6% hot / 11 paths |
| `figma-color-on-dark` | No bake-off | Stayed Palette at 4.23% edge / 0.4% hot / 45 paths |
| `telegram-transparent` | No bake-off | Stayed Palette at 1.54% edge / 0.2% hot / 13 paths |
| `bench-outline-shield` | No bake-off | Stayed Palette at 2.14% edge / 0.3% hot / 18 paths |
| `boc-logo-small` | No bake-off | Stayed Palette at 2.41% edge / 0.7% hot / 55 paths |

## Cloud Proof

Deployed to Cloud Run revision `vector-accuracy-studio-00023-htl` with cache tag `20260630-darkglowbakeoff1`.

Cloud UI matched local on the checked subset:

| Sample | Cloud Result |
| --- | --- |
| `dark-apple-gloss` | Palette selected: 3.12% edge / 2.0% hot / 49 paths |
| `tiktok-dark-glow` | Region kept: 3.80% edge / 2.2% hot / 45 paths |
| `metallic-wordmark-generated` | Region kept: 4.09% edge / 1.7% hot / 13 paths |
| `telegram-transparent` | Palette unchanged: 1.54% edge / 0.2% hot / 13 paths |
| `bench-outline-shield` | Palette unchanged: 2.14% edge / 0.3% hot / 18 paths |
| `boc-logo-small` | Palette unchanged: 2.41% edge / 0.7% hot / 55 paths |

## Interpretation

The bake-off confirms Claude's hypothesis for `dark-apple-gloss`: Palette + tonal bands is the better base for that dark-gloss class, cutting the post-Region result from 4.40% to 3.12% edge and from 7.4% to 2.0% hot pixels.

It also shows this is not a blanket dark-glow fix. `tiktok-dark-glow` is safer on Region today because the Palette challenger creates too many hot pixels. `metallic-wordmark-generated` remains Region because Palette does not win edge error, even though it improves hot pixels.

## Next Work

1. Build the next tonal-modeling pass for the remaining Region-held dark/glow targets, especially `tiktok-dark-glow` and `react-atom`.
2. Add a richer signal/logger for why `react-atom` does not enter the bake-off, so we know whether the residual/saturation eligibility is too tight or the challenger is truly unsuitable.
3. Re-run the full 24-logo local/cloud pack after the next tonal pass, not after every small routing tweak.
