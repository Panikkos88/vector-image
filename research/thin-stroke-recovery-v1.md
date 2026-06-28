# Thin-Stroke Recovery v1

Date: 2026-06-28
Agent: codex

## Goal

Reduce the remaining `bench-outline-shield` gap after Claude's routing fix. The outline sample now routes to Palette/k5, but still trails Vector Magic mainly on the narrow yellow rules and dots.

## Implementation

Added a guarded Palette post-pass named `thinStrokeRecovery`.

The pass:

- selects high-chroma, small-area palette colors that are mostly made of thin connected components;
- builds a source-derived membership field by projecting original pixels between the target color and their nearest neighboring palette color;
- extracts iso-contours for three candidate settings: balanced, wide, and crisp;
- replaces only same-color thin SVG paths;
- injects a separate `<g data-layer="thin-stroke-recovery">`;
- measures the candidate with the existing difference metrics;
- keeps it only if edge error improves without hot-pixel, contamination, path, or node regression.

## Files

- `app/app.js`
  - `thinStrokeRecoveryOptions`
  - `selectThinStrokeTargets`
  - `buildThinStrokeMembershipField`
  - `buildThinStrokeLayer`
  - `injectThinStrokeLayer`
  - `thinStrokeGuardFailures`
  - `optimizeThinStrokeRecovery`
  - benchmark/log integration for `thinStrokeRecovery`
- `app/index.html`
  - cache-bust `app.js?v=20260628-thinstroke1`

## Verification

Completed:

- `npm.cmd run check` passed.
- `git diff --check` passed.
- Local static server served the new cache tag.
- Browser metric run completed on 2026-06-28 after retry.

Outline result:

- URL: `http://127.0.0.1:8787/?asset=assets/benchmarks/bench-outline-shield.png&run=codex-thinstroke1-local-outline`
- Router: Palette engine, k=5.
- Palette boundary: selected `centered`; base edge 12.97% -> 9.78%, paths 31.
- Thin-stroke recovery: selected `thin-strokes-wide`.
- Target: yellow `#ecb82f`, 1.44% of pixels, 46% thin coverage.
- Thin-stroke candidate delta: edge 9.78% -> 9.72%, hot 1.8% -> 1.7%, paths 31 -> 18, nodes 1372 -> 2543.
- Final: MAE 0.72%, edge RMSE 9.72%, hot 1.7%, background contamination 0.60%, 18 paths.

Smoke checks:

- BOC: unchanged at MAE 0.26%, edge 2.41%, hot 0.7%, 55 paths; thin-stroke skipped.
- Fine-text: unchanged at MAE 0.17%, edge 3.20%, hot 0.4%, 61 paths; thin-stroke candidate rejected/kept base.
- Metal: unchanged Region route at MAE 1.22%, edge 9.11%, hot 4.2%, 13 paths; thin-stroke not applicable.
- Dark-glow: thin-stroke skipped, but current local run measured MAE 0.28%, edge 3.32%, hot 0.4%, 68 paths. This does not match the earlier accepted dark-glow bar of 1.72% / 50 paths, so investigate separately before deploy.

Still blocked / not done:

- Download SVG check did not confirm: browser `download` event timed out and no new `*-local-trace.svg` appeared in Downloads.
- Cloud deploy/test was not attempted because the gain is tiny and the dark-glow smoke drift needs investigation first.

## Decision

Implemented and locally selected, but the gain is modest: only 0.06 edge-RMSE points. Do not deploy this by itself until we decide whether that small target improvement is worth keeping and why dark-glow no longer reproduces the earlier 1.72% reference.
