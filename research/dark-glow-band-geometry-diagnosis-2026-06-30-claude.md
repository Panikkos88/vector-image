# Dark-glow band-geometry residual — precise diagnosis + failed cheap fix — 2026-06-30 [claude]

Picked up Codex's "smarter local band geometry" lever. Diagnosed dark-apple-gloss (current best:
Palette bake-off, **3.12% edge / 0.90% MAE / 2.0% hot / 49 paths**; VM ref 2.01%). Sharpened the
vague "local band geometry" into a concrete, measured spec.

## Where the residual actually is (measured, interior pixels, ours vs VM abs error)
Split the INTERIOR (low-local-gradient) error by original chroma:
- **Coloured glow (chroma > 22): ours 2,587,766 vs VM 558,656 = 4.6x worse** over 93k px (~27.7/px vs
  6.0/px). THIS is the residual.
- Grey glow (chroma <= 22): ours 900,726 vs VM 662,215 = only 1.36x worse over 488k px. Handled fine.

So the gap is the COLOURED gloss (the teal highlight arc / coloured reflections), not the grey radial
glow. Root cause: `glowPixelScore` is 1-DIMENSIONAL (deltaLum*0.64 + distance*0.36 + tiny colour
term). Coloured pixels get lumped with same-luminance grey pixels into the same score-band, and
`averageBandColor` returns the band's GLOBAL MEAN -> the teal averages to grey -> 4.6x error there.

## Cheap fix TESTED and FAILED (do not retry)
Hypothesis: add chroma to the score so coloured glow separates into its own bands. Changed
glowPixelScore to `deltaLum*0.5 + distance*0.3 + blueGreenLift*0.16 + chroma*0.34`. Result on
dark-apple-gloss (forced palette): edge **3.12% -> 3.54% (WORSE)**, MAE 0.90 -> 1.70, coloured-glow
residual essentially unchanged (2.57M). Reverted. WHY it fails: tonal bands are CUMULATIVE
INTENSITY-NESTED contours (iso-score). Colour is not intensity-ordered, so re-weighting the 1D score
just reshuffles the nesting; it never gives the teal pixels their own correctly-coloured spatial
region. A 1D score fundamentally cannot represent colour.

## The real fix (a genuine rework, not a tweak)
COLOUR-AWARE band SEGMENTATION: segment the glow area by actual colour (not 1D intensity), e.g.
- separate the coloured-glow pixels (chroma above a threshold) from the grey glow, and band/quantise
  them by their own colour (a small k-means in colour space), emitting per-colour-cluster flat
  regions; keep the existing intensity bands for the grey radial glow; OR
- 2D banding over (luminance, colour-direction).
Target: bring coloured-glow residual from 2.59M toward VM's 0.56M -> dark-apple-gloss ~3.12 -> ~2.3.

## IMPORTANT: runtime regression to address first
`Trace completed in 96383 ms` for dark-apple-gloss on the current build. The chained bake-offs
(Medium Auto + full Palette challenger with super-sampling + High-detail challenger) stack ~3
expensive pipelines on dark-glow images; was ~7s before the bake-offs. **96s/trace makes iterating
on band geometry painful AND is a real product problem** (VM returns in seconds). Strongly recommend
fixing this first (reuse the Medium trace, cap super-sampling in challengers, short-circuit when a
challenger can't win) — the band-geometry rework should not be ground out at 96s/iteration.

## Recommendation
We are VM-CLOSE on the whole suite (dark-apple 3.12 vs 2.01, tiktok 3.41 vs 1.92, react 2.69 vs 1.16;
synthetic 6 + transparent all at/near VM). The remaining dark-glow gain needs (1) the colour-aware
segmentation rework and (2) a runtime fix to iterate on it. Both are deliberate builds with
diminishing returns. Bank current state or scope the runtime-fix-then-colour-banding sequence
explicitly. Shipped state unchanged (rev 00025-f26 / tonalvariant4); this pass was diagnosis only.
