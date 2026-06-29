# Vector Magic real-world references + targets — 2026-06-29 [claude]

Created via the user's purchased Vector Magic online account (Chrome automation: paste image ->
Fully Automatic vectorize -> Fill Only SVG). SVG refs saved alongside this file. Scores measured in
OUR harness (`measureSvgDifference`, original flattened over black to mirror the pipeline).

| Sample | Ours edge | VM edge | Ours hot | VM hot | VM paths | VM approach |
|---|---:|---:|---:|---:|---:|---|
| dark-apple-gloss | 5.44% | **2.01%** | 13.3% | 0.35% | 81 | many flat tonal bands (gloss) |
| tiktok-dark-glow | 4.93% | **1.92%** | 5.5% | 0.32% | 109 | many flat tonal bands (glow) |
| react-atom | 4.09% | **1.16%** | 4.6% | 0.05% | 70 | many flat tonal bands (glow) |
| metallic-wordmark-generated | 4.09% | **1.88%** | 1.7% | 0.19% | 19 | flat bands (metallic swoosh) |
| x-lowres-black | 4.26% | **1.53%** | 1.2% | 0.17% | 3 | clean hard-edge, anti-aliased mode |
| figma-color-on-dark | 4.23% | **1.10%** | 0.4% | 0.1% | 18 | clean flat multi-colour |

(Ours = Codex's 2026-06-29 real-world run, rev 00020-c4z, which already included region super-retrace.)

## What the refs tell us
- VM beats us on ALL six, by 2-3x edge and up to ~40x on hot pixels. The gap is real and large.
- The glow/gloss cluster (dark-apple-gloss, tiktok-dark-glow, react-atom) is VM's many-flat-band
  tonal quantization: it bands the smooth glow into 70-109 FLAT paths, zero gradients. Our Region
  engine uses ~10-13 regions + gradient fills -> the gloss mid-tones are badly approximated
  (the 13.3% / 5.5% / 4.6% hot pixels). THIS is the lever: generalized many-flat-band tonal modeling.
- figma-color-on-dark (VM 1.10% / 18 paths vs ours 4.23% / 45 paths): a FLAT multi-colour logo where
  we OVER-fragment (45 paths, 6 gradients) and still score worse. Likely a palette-k / routing issue,
  not tonal — cheaper potential win, investigate separately.
- x-lowres-black (VM 1.53% / 3 paths vs ours 4.26%): low-res hard-edge X; VM keeps it clean (3 paths),
  we over-complicate. Low-res hard-edge handling.
- metallic-wordmark (VM 1.88% / 19 paths): metallic swoosh + wordmark; bands again.

## Recommended build order (now unblocked, measured targets above)
1. Generalized many-flat-band tonal modeling for smooth gradient/glow/gloss regions (covers
   dark-apple-gloss, tiktok-dark-glow, react-atom, metallic-wordmark; biggest cluster). Replace/augment
   the Region engine's adaptive-gradient fills with VM-style cumulative flat tonal bands tuned to the
   gradient; metric-guarded. Existing `optimizeGlowTonalBanding` (dark-bg-only) is the seed.
2. figma-color-on-dark over-fragmentation: investigate palette-k / why 45 paths+gradients; likely a
   contained routing/selection fix.
3. x-lowres-black: low-res hard-edge handling (don't over-trace aliasing).
