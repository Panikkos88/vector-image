# GitHub Vectorization Research - 2026-06-28 [codex]

## Why this pass

Claude left the shipped build at `fringedissolve1`: outline Auto routes to Palette/k5,
ours measures **4.07% edge / 31 paths**, and the Vector Magic reference measures
**1.90% / 30 paths** in our own browser harness. The remaining measured gap is
corner geometry at the two shield tips plus inner cream/navy boundary precision, not
yellow stroke count and not Google Cloud/runtime.

This research pass looked for public projects that can teach us something useful for
that exact failure mode.

## High-value sources

### 1. SubpixelDeblurring - anti-aliased clip-art reconstruction

Repo: https://github.com/JinfanYang/SubpixelDeblurring
Project/paper: https://www.cs.ubc.ca/labs/imager/tr/2022/SubpixelDeblurring/

Why it matters:
- This is the closest public match to our actual problem: small flat-color clip-art,
  low-resolution or anti-aliased raster inputs, obscured topology/colors, then better
  vectorization after recovering a cleaner subpixel image.
- The repo states it includes training scripts and a `segmentation` stage that turns
  the blurry network output into blur-free aliased output.
- The paper abstract/snippets describe the same failure we see: direct vectorization
  of anti-aliased clip-art can lose intended geometry; a subpixel/deblurred
  intermediate improves vectorization.

What to borrow:
- Treat this as the north-star paper for "recover a sharper subpixel intermediate,
  then trace", especially for outline shield corners.
- Immediate browser-sized experiment: create a local ROI super-resolution/coverage
  grid around the two shield tips, solve the sharp two/three-color labels there, and
  feed the cleaned ROI boundary back to the existing Palette trace.
- Do not blindly add a neural model yet. First copy the deterministic insight:
  separate AA blur from intended topology before tracing.

### 2. diffvg - differentiable rasterization / optimization

Repo: https://github.com/BachiLi/diffvg

Why it matters:
- diffvg gives a differentiable rasterizer and includes an SVG refinement workflow
  (`refine_svg.py`) that optimizes vector parameters against a target raster.
- This is the right family of tools for "we have a mostly-correct SVG, now move a
  few control points/colors until raster error drops."

What to borrow:
- Not a drop-in browser solution. It is Python/PyTorch/C++ and belongs on a backend
  or in a small offline proof.
- Best next use: **ROI path optimizer**, not full-image generation. Initialize from
  our current outline SVG, crop to the two shield tips, optimize only nearby path
  points/control handles and fills, and accept by `measureSvgDifference`.
- This directly tests whether a VM-like corner is reachable by local parameter
  optimization before we rewrite the engine.

### 3. LIVE / SGLIVE - layer-wise vectorization with DiffVG

LIVE repo: https://github.com/Picsart-AI-Research/LIVE-Layerwise-Image-Vectorization
SGLIVE repo: https://github.com/Rhacoal/SGLIVE

Why they matter:
- LIVE progressively adds optimizable closed Bezier paths and optimizes them
  layer-wise against the raster.
- SGLIVE extends the idea with segmentation guidance and gradient fills.
- Both point in the same strategic direction as Vector Magic-quality output:
  segmentation/layer proposal plus measured raster error optimization.

What to borrow:
- For the current browser app: use their architecture as evidence that
  trace-once output is not the ceiling; error-minimized vector layers are the next
  architecture.
- For the next backend phase: build a job worker that can run a heavier optimizer on
  selected high-error areas while the browser UI stays responsive.
- Do not use them as an immediate production dependency. They are heavier research
  stacks and would be overkill before a small ROI proof.

### 4. VTracer / visioncortex - color vectorization baseline

Repo: https://github.com/visioncortex/vtracer
Core library: https://github.com/visioncortex/visioncortex

Why it matters:
- VTracer is a serious open-source color vectorizer in Rust/WASM.
- It exposes knobs we care about: color precision, gradient step, hierarchical
  stacked/cutout output, path mode, corner threshold, segment length, and splice
  threshold.
- Its README specifically says "perfect cut-out mode" is still a future task because
  cut-out shapes do not yet share boundaries perfectly. That is a useful warning:
  even strong public vectorizers struggle with the same topology/seam class.

What to borrow:
- Keep VTracer as a comparison engine and tune it offline against our benchmark pack,
  but do not expect it to close the VM gap by itself.
- Inspect its corner/splice behavior for ideas, especially if our unbounded Palette
  candidate probe shows that corner geometry is the missing candidate space.

### 5. Potrace / node-potrace - topology and corner policies

Node port: https://github.com/tooolbox/node-potrace
Original algorithm PDF: http://potrace.sourceforge.net/potrace.pdf
AutoTrace: https://github.com/autotrace/autotrace

Why it matters:
- Potrace is monochrome, but its turn policies, speckle filtering, corner threshold
  (`alphaMax`), curve optimization, and ambiguity handling are mature.
- node-potrace also has a posterization/layering mode that traces multiple threshold
  bands, useful for thinking about dark-glow/metal tonal bands.
- AutoTrace adds outline and centerline tracing, which may become useful for thin
  stroke recovery later.

What to borrow:
- For outline shield: try a **per-boundary Potrace-style mask pass** only on the
  problematic cream/navy/dark boundaries, then feed that polygon into our existing
  fill/layer stack.
- Especially inspect turn policy behavior around ambiguous 2x2 cells and convex
  tips. Our worst error is a corner/turn decision problem, not a palette problem.

### 6. ImageTracerJS - current baseline and ceiling marker

Repo: https://github.com/jankovicsandras/imagetracerjs
Process overview: https://github.com/jankovicsandras/imagetracerjs/blob/master/process_overview.md

Why it matters:
- This is already in our app. Its documented pipeline is color quantization,
  per-color layers, edge-node detection, path scanning, interpolation, and recursive
  line/quadratic fitting.
- The process overview itself lists "cubic splines", Potrace comparison, and better
  split points as improvement ideas.

What to borrow:
- We have probably mined the easy ImageTracer gains. Current VM gap is below the
  ImageTracer architecture level: it needs coverage/topology inference before trace
  or measured post-trace optimization.
- Keep it as a stable fallback/baseline, not the next research lever.

### 7. fit-curve / Bezier.js / simplify-js - geometry tools only

fit-curve: https://github.com/soswow/fit-curve
Bezier.js: https://github.com/Pomax/bezierjs
simplify-js: https://github.com/mourner/simplify-js

Why they matter:
- These are useful tools once the boundary points are correct.
- We have already tested Schneider-style fitting on wrong boundaries and it made
  results worse, so curve fitting alone is not the lever.

What to borrow:
- Use them inside a metric-guarded local optimizer after coverage/corner placement
  improves. They are finishing tools, not the source of VM-quality geometry.

### 8. StarVector - semantic SVG generation, not exact tracing

Repo: https://github.com/joanrod/star-vector

Why it matters:
- StarVector is a modern VLM for generating SVG code from images/text, with strong
  results on icon/logotype/diagram-style data.
- It is promising for semantic SVG reconstruction, but it is not designed as a
  deterministic exact raster-to-editable-logo tracer.

What to borrow:
- Future optional product path: semantic cleanup or "logo recreation" mode.
- Not the next step for VM parity on exact customer uploads. Our benchmark objective
  is raster-faithful SVG, so measured geometry optimization stays higher priority.

## Recommended next experiments

### Experiment A - unbounded Palette candidate probe

Purpose: answer Claude's open question: does more search in the current candidate
space move outline below 4.07?

Method:
- Temporarily uncap the Palette boundary optimizer on `bench-outline-shield`.
- Allow a slow browser run (~60s), many simplification/corner/iso/line variants.
- Do not ship. Record best edge/hot/path/node result.

Expected:
- If it barely moves, the current candidate space is exhausted.
- If it drops materially, a backend can be justified as a compute multiplier.

### Experiment B - ROI coverage-aware corner reconstruction

Purpose: attack the measured +81k shield-tip error directly.

Method:
- Detect the two high-error convex tip ROIs from the outline benchmark.
- Build local two/three-color coverage fields for dark/navy/cream using original
  pixels, not hard quantized labels.
- Solve a sharper local label/edge map at 2x or 4x resolution.
- Replace only the affected contour spans, preserve adjacent path topology, then
  rerun `measureSvgDifference`.

Acceptance:
- Edge RMSE improves vs 4.07%.
- Hot pixels do not increase.
- Path count stays within +10%.
- BOC/fine-text/dark-glow no-op because the pass should be gated to the outline
  failure signature.

### Experiment C - local vector parameter optimizer

Purpose: prove whether VM-like corners are reachable from our current SVG by
optimization.

Method:
- Crop to the two tip ROIs.
- Use our current SVG paths as initialization.
- Mutate/optimize only nearby path points/control handles and fill colors.
- Use the app's raster difference as the score, similar in spirit to diffvg or
  Primitive's score-driven hill climbing.

Browser-first version:
- Random/hill-climb over a tiny parameter set, no gradients.

Backend proof version:
- Try diffvg-style differentiable optimization after the browser proof shows value.

### Experiment D - Potrace-style per-boundary turn policy

Purpose: give the contour extractor a better candidate at ambiguous convex tips.

Method:
- Build binary masks for the problematic pairwise boundaries.
- Try Potrace-like turn policies on ambiguous cells (`minority`, `majority`,
  left/right variants).
- Convert the best local boundary back into our layered Palette SVG.

This is lower risk than a full backend and directly maps to the corner overshoot.

## What not to spend time on next

- Do not port the current browser code to Google Cloud expecting quality gains.
  Same algorithm means same SVG.
- Do not chase yellow path count on outline. Claude's path-swap proof says yellow
  is adequate.
- Do not retry global Schneider curve fitting as the main fix. It has already been
  tested on misplaced boundaries and worsened results.
- Do not loosen metric guards to accept prettier-looking but worse-scoring output.

## Current recommendation

Run Experiment A only as a quick proof/disproof, then build Experiment B. The public
research agrees with the diagnosis: VM-level output comes from reconstructing the
intended sharp/subpixel boundary before or during tracing, then measuring the final
SVG against the raster. Our next real gain is likely a small coverage-aware corner
reconstruction pass, not another global tracer swap.
