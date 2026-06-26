# Vector Magic Online App Research

Date: 2026-06-24

## Scope

Research what can be learned from public sources about Vector Magic's online app architecture and vectorization approach. This is not reverse engineering private server code; it is a public-facing inspection of pages, scripts, documentation, and product descriptions.

## High Confidence Findings

### It is an online app with server-side processing

The public app bundle and page text expose these terms:

- `getWorkerUrl`
- `/internal/websocket`
- `ensureWorker`
- `clearWebSocket`
- `sendFileToVectorizer`
- `uploadS3WithRetry`
- `uploadS3JsonWithRetry`
- `vectorizationRecordId`
- `segmentationUrl`
- `getSegmentationEdits`

The user-facing messages also include:

- "Unable to connect to the worker. Is your firewall or proxy blocking WebSockets?"
- "Workers overloaded. Additional workers should be online in a couple of minutes."
- "Synchronizing state with server, please wait before exiting."
- "Edits made are saved to the server when you hit Next."

This strongly indicates a browser UI that uploads source images, connects to backend workers over WebSockets, processes jobs server-side, and stores segmentation edits remotely.

### Uploaded files likely go through object storage

The app bundle includes `uploadS3WithRetry` and `uploadS3JsonWithRetry`. That suggests direct or signed uploads to S3-compatible object storage, followed by worker-side processing.

### The frontend is not the vectorization engine

The visible frontend bundle includes UI and workflow terms but no obvious public `wasm`, `opencv`, `potrace`, or full tracing engine reference. The processing workflow references backend workers, job IDs, vectorization records, and segmentation URLs.

### The visible frontend stack is traditional web UI

Public bundles expose:

- jQuery 3.5.1
- Bootstrap 3.4.1
- GreenSock / TweenLite animation code
- Custom minified app code
- CloudFront-hosted static assets

The response headers show CloudFront in front of the site. The HTML includes CSRF handling, which suggests a conventional server-rendered/session-based web app architecture.

### Vector Magic's algorithm is proprietary and Stanford-originated

Vector Magic's About page says James Diebel started the research project that led to Vector Magic as a graduate student at Stanford University. Other public mentions describe the original work as a Stanford AI Lab research project by James Diebel and Jacob Norda.

### It distinguishes image classes and uses segmentation

Their tutorial describes three input categories:

- Photos
- Artwork with blending / anti-aliasing
- Artwork without blending

The tutorial says segmentation is the "crude partitioning of the image into pieces" that is then smoothed to produce the final vector art. The online app exposes segmentation editing, palette selection, and reprocessing controls.

### Logged-in app workflow

Using an authenticated Chrome session, an existing completed image job opened at:

```text
/images/{imageId}/edit/{secret}
```

The review screen exposed:

- Single-pane and split-view controls.
- Bitmap/vector view controls.
- Zoom controls.
- A `Download Result` action.
- Detail level controls: Low, Medium, High.
- Color controls: Unlimited, Custom.
- Advanced controls: Edit Result, Remove Background, Hand-pick Settings.
- A message that the source image had been resized when it exceeded a practical online size.

The download/share page opened at:

```text
/images/{imageId}/{secret}
```

The page states that it is a privately shareable page and that anyone with the link can edit and download the latest result.

### Export URL structure

The download page exposed these result formats:

- Fill only: SVG, EPS, PDF.
- Stroke + fill: SVG, EPS, PDF.

Observed URL patterns:

```text
/images/{imageId}/download/{secret}/svg
/images/{imageId}/download/{secret}/eps
/images/{imageId}/download/{secret}/pdf
/images/{imageId}/download/{secret}/svgStrokeAndFill
/images/{imageId}/download/{secret}/epsStrokeAndFill
/images/{imageId}/download/{secret}/pdfStrokeAndFill
```

Chrome blocked the direct SVG URL with `ERR_BLOCKED_BY_CLIENT`, but fetching the privately shareable SVG URL directly succeeded.

### Sample SVG export characteristics

A real fill-only SVG export was saved as:

```text
research/vectormagic-sample-fill-only.svg
```

Observed characteristics:

- File size: 60,522 bytes.
- Path count: 154 `<path>` elements.
- Unique fill colors: 135.
- SVG 1.1 output with a `viewBox`, explicit `width` and `height`, and paths using absolute path commands.

This sample output indicates a many-region full-color trace for that image, not a simple low-color logo trace.

### Fresh controlled upload test

After enabling file access for the Codex Chrome extension, a generated test image was uploaded through the visible `Pick Image To Upload` button.

Input:

```text
work/vm-test/test-logo.png
```

Vector Magic automatically uploaded, classified, vectorized, and opened the review page:

```text
/images/3x9xg6sbpedlq/edit/mjaup7jukhmn13sc0o7hsbr5g554v3v20mb3jr6cjnvd7pfc4msn
```

The output/download page was:

```text
/images/3x9xg6sbpedlq/mjaup7jukhmn13sc0o7hsbr5g554v3v20mb3jr6cjnvd7pfc4msn
```

Saved exports:

```text
research/test-logo-vectormagic-fill-only.svg
research/test-logo-vectormagic-stroke-fill.svg
```

Observed export stats:

| File | Bytes | Paths | Unique fills | Unique strokes |
| --- | ---: | ---: | ---: | ---: |
| `test-logo-vectormagic-fill-only.svg` | 5,255 | 4 | 4 | 0 |
| `test-logo-vectormagic-stroke-fill.svg` | 10,455 | 4 | 4 | 4 |

The fill-only version used one filled path per major region/color. The stroke+fill version preserved the same path count but added stroke attributes, roughly doubling the file size for this small test.

### Anti-aliased edge information is central

Vector Magic's own tutorial emphasizes using anti-aliased boundary pixels to recover more accurate edge locations. It explicitly warns against naive posterization for blended artwork because the blending carries shape-boundary information.

## Medium Confidence Inferences

### Likely processing pipeline

Based on the app surface and documentation, the online pipeline likely looks like:

1. Browser collects image and settings.
2. Browser uploads file to object storage.
3. App creates a vectorization job.
4. Browser connects to a backend worker over WebSocket.
5. Worker analyzes image type, palette, and segmentation.
6. Worker generates vector result plus preview assets.
7. Browser lets user inspect original, segmentation, and vector result.
8. User may edit segmentation.
9. Worker reprocesses edited segmentation.
10. User downloads SVG/EPS/PDF after authorization/subscription checks.

### Algorithm family

Vector Magic does not appear to be a simple Potrace wrapper. Potrace is mainly a black-and-white bitmap tracer, while Vector Magic advertises full-color tracing, image classification, palette control, segmentation editing, and anti-aliasing-aware edge recovery.

Its likely family is:

- image classification
- color quantization or palette estimation
- region segmentation
- anti-aliased edge localization
- boundary extraction
- curve fitting / Bezier simplification
- region layering and SVG/EPS/PDF export

### Vectorizer.AI relation

Cedar Lake Ventures also operates Vectorizer.AI and describes it publicly as deep-learning-based raster-to-vector conversion. The Vector Magic page now invites users to try Vectorizer.AI as a "next generation" product. That does not prove Vector Magic itself uses deep learning, but it tells us the same company has moved newer vectorization work in that direction.

## Low Confidence / Not Confirmed

- The exact tracing algorithm used by Vector Magic.
- Programming language used on backend workers.
- Whether current Vector Magic uses any neural model internally.
- Whether the backend is AWS specifically, though S3-named upload methods and CloudFront are visible.
- Whether the desktop app shares the same engine as the online workers.

## Implications For Our Online-Only App

We should design our product as a real online app with server-side processing, not a browser-only toy, if accuracy is the priority.

Recommended architecture:

- Browser UI for upload, settings, preview, and segmentation editing.
- Direct object-storage uploads using signed URLs.
- Job API for vectorization records.
- Worker queue for CPU/GPU-heavy processing.
- WebSocket or server-sent events for progress.
- Separate preview artifacts: original raster, segmentation overlay, generated SVG preview.
- SVG/EPS/PDF export service.
- Persistent test corpus and quality metrics.

Recommended first engine path:

1. Start with color quantization plus contour tracing.
2. Add Potrace/VTracer-style tracing for simple masks and regions.
3. Add anti-aliased boundary estimation for artwork with blended edges.
4. Add segmentation editor support early, because automatic tracing will fail on edge cases.
5. Add benchmark comparisons against fixed test images.
6. Consider ML only after a classical baseline exists, unless photo/vector realism becomes the core product.

Recommended online product workflow:

1. `/images/{id}/edit/{secret}` style review/edit route.
2. Keep vectorization records shareable by secret link.
3. Separate review/edit state from export/download state.
4. Offer fill-only and stroke+fill exports.
5. Preserve a segmentation editor in the product plan; Vector Magic treats this as a first-class rescue tool for difficult cases.
6. Track when images are resized or pre-cropped so the user understands accuracy limits.

## Sources Checked

- Vector Magic tutorial: https://vectormagic.com/support/tutorials/how-to-use-vector-magic
- Vector Magic about page: https://vectormagic.com/about
- Vector Magic pricing/features page: https://vectormagic.com/pricing
- Cedar Lake Ventures: https://cedarlakeventures.com/
- Vectorizer.AI about page: https://vectorizer.ai/about
- Public Vector Magic frontend assets from CloudFront:
  - `all_9b3f43ae83881f0f537f5494368e614a.js`
  - `gs_d4467f4bc9b9a1fc75ce19f3ed03989c.js`
  - `m/Main.min_04101f894f0f6c9c51b8c508efba176d.js`
- Potrace reference: https://potrace.sourceforge.net/
- VTracer reference: https://github.com/visioncortex/vtracer
