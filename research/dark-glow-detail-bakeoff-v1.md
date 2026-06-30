# Dark-Glow Detail Bake-Off v1

Date: 2026-06-30
Agent: codex

## Summary

Tested the next likely gain after the Palette-vs-Region bake-off: higher internal detail for Region-held dark/glow images.

The result is a real measured gain, but only when guarded. High detail helps `tiktok-dark-glow` and `react-atom`, but it is bad for `dark-apple-gloss` if applied blindly because Apple should stay on the Medium Palette path selected by the engine bake-off.

Implementation: Medium Auto runs that land on Region and have a strong dark-glow tonal signal now run a High-detail challenger. The app compares Medium vs High with `measureSvgDifference` and accepts High only if edge/hot metrics improve within path/node limits.

## Local Proof

Settings: normal product path, Auto router, Medium visible detail, Smooth anti-aliasing, Background Detach Off, Preserve glows/shadows. The High path is automatic and hidden behind the metric guard.

| Sample | Decision | Result |
| --- | --- | --- |
| `tiktok-dark-glow` | Selected High | Medium 3.80% edge / 2.2% hot / 45 paths -> High 3.41% edge / 1.8% hot / 58 paths |
| `react-atom` | Selected High | Medium 4.09% edge / 4.6% hot / 11 paths -> High 2.95% edge / 0.9% hot / 18 paths |
| `dark-apple-gloss` | No detail bake-off | Stayed Medium Palette at 3.12% edge / 2.0% hot / 49 paths |
| `metallic-wordmark-generated` | No detail bake-off | Stayed Region at 4.09% edge / 1.7% hot / 13 paths |
| `telegram-transparent` | No detail bake-off | Stayed Palette at 1.54% edge / 0.2% hot / 13 paths |
| `bench-outline-shield` | No detail bake-off | Stayed Palette at 2.14% edge / 0.3% hot / 18 paths |
| `boc-logo-small` | No detail bake-off | Stayed Palette at 2.41% edge / 0.7% hot / 55 paths |

## Cloud Proof

Deployed to Cloud Run revision `vector-accuracy-studio-00024-qb6` with cache tag `20260630-nextgainprobe1`.

Cloud UI matched local on the checked subset:

| Sample | Cloud Result |
| --- | --- |
| `tiktok-dark-glow` | High selected: 3.41% edge / 1.8% hot / 58 paths |
| `react-atom` | High selected: 2.95% edge / 0.9% hot / 18 paths |
| `dark-apple-gloss` | Medium Palette unchanged: 3.12% edge / 2.0% hot / 49 paths |
| `metallic-wordmark-generated` | Region unchanged: 4.09% edge / 1.7% hot / 13 paths |
| `telegram-transparent` | Palette unchanged: 1.54% edge / 0.2% hot / 13 paths |
| `boc-logo-small` | Palette unchanged: 2.41% edge / 0.7% hot / 55 paths |

## Interpretation

This is the next safe gain because it improves two VM-gap samples without routing all dark images to the same engine.

The important lesson: High detail is not globally safe. In a forced probe, `dark-apple-gloss` at High Auto fell back to Region and measured 5.19% edge / 9.5% hot, much worse than the Medium Palette result. The guard avoids that by only running after the Medium result is Region.

## Next Work

1. Re-run the full 24-logo local/cloud pack when ready, because this change adds extra work only to Region-held dark-glow cases.
2. Move from "detail as a proxy" to the real VM-style solution: many-flat-band tonal modeling for Region-held glows.
3. Keep the detail bake-off guarded; do not change the visible UI back to user-selectable detail unless product needs it.
