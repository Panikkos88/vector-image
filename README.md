# Vector Accuracy Studio

A project folder for building a practical raster-to-vector prototype focused on vectorization accuracy.

## Goal

Build a working tool that can:

- Upload raster images.
- Classify image type: photo, artwork with blended edges, or artwork without blended edges.
- Tune detail level and color handling.
- Preview original vs vector result.
- Export SVG.

## Current Prototype

The first local prototype lives here:

```text
app/index.html
```

It runs in the browser with no dependencies and implements a simple baseline pipeline:

- canvas image loading
- color quantization
- per-color segmentation
- pixel-boundary tracing
- SVG preview/export

See `SKILL.md` for project memory, architecture notes, and the next algorithm targets.

## Suggested Phases

### Phase 1: Baseline Vectorizer

Create the smallest useful raster-to-SVG pipeline.

Deliverables:

- Image upload or file input.
- Bitmap preprocessing.
- Basic tracing path.
- SVG export.

### Phase 2: Color Artwork

Support logos and artwork with multiple colors.

Deliverables:

- Color quantization.
- Region segmentation.
- Contour extraction per color.
- Layered SVG output.

### Phase 3: Accuracy Controls

Add settings that materially affect output quality.

Deliverables:

- Detail level.
- Noise rejection.
- Palette constraints.
- Path smoothing.
- Corner preservation.

### Phase 4: Accuracy Improvements

Iterate against real test images.

Focus areas:

- Anti-aliased edge recovery.
- Better segmentation.
- Corner preservation.
- Noise rejection.
- Palette constraints.
- Editable, clean SVG output.

## Rough Size

- Useful vectorizer prototype: 2-6 weeks.
- Highly accurate Vector Magic-like product: 3-9+ months.

## Notes

The hard engineering is in tracing accuracy: segmentation, anti-aliasing interpretation, clean Bezier generation, and reliable handling of low-quality images.
