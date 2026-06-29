# Metal gap diagnostic — 2026-06-28 [claude]

Same data-driven method as the outline diagnostic. Sample: `bench-metal-gradient.png` (a metallic
blue/white shaded logo). Shipped Auto routes it to the Region engine.

## Measured state (in our own browser harness)
- Ours (Region engine, SLIC + merge + adaptive gradients): edge 9.11%, MAE 1.22%, hot 4.2%,
  **13 paths, 1 gradient**.
- VM reference: edge **1.79%**, MAE 0.63%, **88 paths, 0 gradients** — VM approximates the whole
  metallic gradient with MANY FLAT COLOUR BANDS (13x #0087d2, 11x #ecf0f4, 10x #fafafa, plus ~50
  one-off near-white/grey shades). No `<linearGradient>`/`<radialGradient>` at all.
- Router sends metal to Region because the Palette guard fails at k=3 (core residual 25.2 > 12.5).

## Is it a cheap routing fix? NO (tested)
Forced Palette high-k via dev route `?engine=palette&paletteK=24&paletteOptimize=1`:
- The ladder caps at k=16 (got "k=16 (forced 16)"), 73 paths -> edge **10.75%**, MAE 2.13%,
  hot **10.4%**. That is WORSE than Region's 9.11%.
- So naive global k-means high-k banding is not the answer, and we cannot even reach VM's ~30
  colours through the ladder. VM's bands are placed SMARTLY along the gradient (cumulative/tonal),
  not via global k-means.

## Where the error actually is (ours vs VM abs error mass)
Split by local gradient magnitude:
- Smooth gradient interior: ours 2.18M vs VM 1.50M (1.45x) — even VM's flat bands leave interior
  residual; ours (gradient fill) is only modestly worse here.
- **Edges / sharp transitions (grad>40): ours 1.15M vs VM 78k = 14.7x worse.** This dominates.
=> Our 13-region engine is far too COARSE to capture metal's internal sharp features / specular
edges / shape boundaries. VM's 88 well-placed flat paths capture them. The metal gap is mostly
feature/edge UNDER-SEGMENTATION, secondarily gradient banding.

## Conclusion + lever
Metal is NOT a cheap win. It is the genuine shaded-content problem (the worklog's flagged
architectural ceiling). VM's answer is clear and explicit: ~88 smartly-placed FLAT paths (bands +
feature shapes), no gradients. To approach it we would need to produce far more, well-placed flat
regions than the current Region engine's ~13 — e.g.:
- Generalise Codex's `optimizeGlowTonalBanding` (currently dark-background only) into a global
  many-band flat tonal quantizer tuned to the gradient direction, AND
- keep/segment the sharp internal features (the 14.7x edge error) so they aren't washed into bands.
This is a substantial, uncertain build (same effort class as the outline sub-pixel rewrite), and it
touches the shared Region/Palette stack (regression risk). It must be metric-guarded.

## Recommendation
Both remaining gaps (outline last mile, metal) now require substantial engine rewrites with
uncertain payoff. The product is already at VM parity on flat/outline logos (the core vectorizer
use case). Suggest treating metal as a FEATURE decision: only invest in the many-band shaded
pipeline if supporting metallic/gradient/photo-ish uploads is a product goal. Otherwise bank the
current strong state and validate on real-world images (where actual user-facing quality lives)
rather than chasing the last points on two synthetic benchmark samples.
