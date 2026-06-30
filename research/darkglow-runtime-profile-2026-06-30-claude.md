# Dark-glow 96s runtime — profile + why quick fixes fail — 2026-06-30 [claude]

Profiled dark-apple-gloss (Auto, the worst case). `Trace completed in 95104 ms`. Added temporary
timing (reverted). Breakdown (the image lands on Palette via the dark-glow bake-off):

| Stage | Time | Notes |
|---|---|---|
| Region engine (`optimizeRegionTrace`) | **34s** | the bake-off BASELINE — apple loses it to Palette, so this 34s is WASTED |
| Palette challenger (`optimizePaletteTrace`) | **54s** | the WINNER (3.12%); kept |
| - super-retrace (within Region) | 1.3s | NOT the cost |
| - tonal banding builds | ~24s total | 6 builds = 3 variants (baseline/fine/broad) x 2 engines, each a 768px band build + measure |
| Total | ~95s | region 34 + palette 54 + overhead |

The cost is **two full optimizer pipelines**, each doing ~35 boundary candidates + a 30-candidate
simplifier sweep + 3 tonal-band variants, where every candidate calls `measureSvgDifference`
(rasterise 768px + compare). It's ~130 full-res rasterise+measure calls per trace. super-sampling
and super-retrace are NOT the bottleneck (contrary to my first guess).

When an image lands on REGION (tiktok, react), the **High-detail bake-off** then runs a THIRD full
pipeline (~another 50s). So Region-held dark-glow images are also ~90-100s.

## Quick knob-cuts TESTED and FAILED (do not retry these as-is)
- `skipSuperSample` on the palette challenger: paletteMs 54s -> 53s (no help — super wasn't the cost).
- `liteBoundary` on the palette challenger (base candidate, skip simplifier): made the palette
  challenger WORSE so it LOST the dark-glow bake-off -> apple flipped Palette 3.12% -> Region 4.40%
  (quality REGRESSION) AND landing on Region then triggered the High-detail bake-off -> total still
  ~100s. The 3.12% depends on the palette boundary/simplifier sweep; you can't cheap it out.
- tonal variants 3 -> 2: ~8s saved, marginal; bundled with the above, reverted.
All reverted; committed state unchanged (rev 00025-f26 / tonalvariant4, apple 3.12% / 96s).

## Why there is no safe quick fix
Every expensive stage (the two optimizer sweeps, the tonal variants, the high-detail bake-off) is
ALSO where the quality comes from. Cutting candidates/variants cheaply loses the win (proven by
liteBoundary). The cost is inherent to running full-res optimizer bake-offs.

## The proper fix (a real, careful refactor — scope deliberately)
Make the SAME decisions/results at lower cost, not fewer of them:
1. **Downscale the optimizer candidate evaluation.** The ~130 measure calls are full-res (768px).
   The Region engine already has a downscale-eval->promote path; give the PALETTE optimizer the same
   (rank ~35 boundary candidates + simplifier on a ~384px copy, promote only the top 1-2 to full res).
   ~4x fewer pixels per measure on the ranking pass.
2. **Cheap bake-off decider.** Don't run BOTH full optimizers to pick the engine. Run a cheap/
   downscaled Region AND Palette to DECIDE the winner, then run only the winner at full quality.
   Avoids the ~34s wasted on the losing baseline.
3. **Cache the tonal-band layer** across the Region trace and the palette challenger (same reference
   image -> identical band fragment); build once, reuse. Saves ~half the 24s tonal cost.
4. Consider gating the High-detail bake-off behind a quick downscaled check that it can actually win.
Target: ~95s -> ~15-25s on dark-glow images with NO quality change. Each iteration costs 50-100s to
test, so budget for that.
