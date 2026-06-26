# Vector Magic HAR Backend Trace

Date: 2026-06-24

Source HAR:

```text
C:\Users\panik\Downloads\vectormagic.com.har
```

Secrets, CSRF tokens, signed S3 query strings, and private share secrets are intentionally omitted from this report.

## What The HAR Captured

The HAR contains 18 network entries and 295 WebSocket frames.

The upload in this HAR was:

```text
LOGO PDF-1.png
```

The browser-side preprocessing resized the source before upload:

| Field | Value |
| --- | ---: |
| Original width | 2339 |
| Original height | 1654 |
| Original pixels | 3,868,706 |
| Original bytes | 87,519 |
| Uploaded working width | 1216 |
| Uploaded working height | 860 |
| Uploaded working pixels | 1,045,760 |
| Uploaded working bytes | 196,832 |
| `wasShrunk` | true |
| `wasTransparent` | false |

## Network Sequence

### 1. Create Image Record

```http
POST /api/images
Content-Type: application/x-www-form-urlencoded
Status: 200
```

The browser sends metadata only, not the image file:

```text
originalFilename
contentType
w
h
sizePixels
sizeBytes
originalW
originalH
originalSizePixels
originalSizeBytes
wasShrunk
wasTransparent
isGifImage
```

This creates the server-side image record and returns data used for upload/worker processing.

### 2. Upload Image To Object Storage

```http
POST https://d2f7anuvnar8n5.cloudfront.net/
Content-Type: multipart/form-data
Status: 201
Server: AmazonS3
```

The upload goes through CloudFront to S3-compatible storage. Response headers include:

```text
server: AmazonS3
x-amz-server-side-encryption: AES256
location: https://clv-vm2.s3.us-east-1.amazonaws.com/...
```

So the online app uses signed browser-side upload to object storage, then workers read from that stored object.

### 3. Connect To Worker

```http
GET /internal/websocket?lc=en-US&imageId={imageId}&version=1&secret={secret}&priority=0
Status: 101 Switching Protocols
```

The WebSocket stays open for about 11.1 seconds in this HAR and carries the classification/vectorization job protocol.

## WebSocket Message Summary

Total WebSocket messages:

```text
295
```

Message counts by direction/command:

| Direction / Command | Count | Likely meaning |
| --- | ---: | --- |
| send command 0 | 2 | heartbeat / ping |
| receive command 1 | 3 | heartbeat / ack |
| send command 2 | 1 | send image availability flags |
| receive command 3 | 1 | ack/transition after initial image state |
| send command 3 | 1 | start classification job |
| send command 4 | 2 | start vectorization job with configuration |
| receive command 5 | 267 | progress updates, usually `progress` + `finished` |
| receive command 7 | 2 | vectorization stage transition / result-ready marker |
| receive command 8 | 6 | shape payload chunks |
| receive command 9 | 2 | end/finalization marker |
| receive without command | 6 | non-command frame / separator frame |

Command names above are inferred from behavior and payload shape. The HAR does not include symbolic server-side names.

## Job Flow

The browser sent this initial image-state message:

```json
{
  "hasImage": true,
  "wasShrunk": true,
  "wasTransparent": false,
  "hasThumbnail": false,
  "hasClassificationRecord": false,
  "hasSegmentationEditsRecord": false
}
```

Then it started job `3`:

```json
{
  "jobId": 3
}
```

After classification, the browser sent two vectorization requests:

```json
{
  "version": 0,
  "vectorize": true,
  "sendResult": true,
  "configuration": {
    "jobId": 4,
    "imageTypeE": 1,
    "imageComplexityE": 2
  }
}
```

```json
{
  "version": 0,
  "vectorize": true,
  "sendResult": true,
  "configuration": {
    "jobId": 5,
    "imageTypeE": 1,
    "imageComplexityE": 3
  }
}
```

This strongly suggests:

- `imageTypeE: 1` was the selected/auto-detected image type for this image.
- `imageComplexityE: 2` and `imageComplexityE: 3` correspond to different detail levels.
- Vector Magic may compute more than one candidate vectorization during the same workflow.
- The final selected/current vectorization record in this HAR was the second vectorization, job `5`.

## Classification Result

The final `userImage` state includes:

```json
{
  "imageResultE": 3,
  "classification": {
    "classificationStateE": 0,
    "imageTypeE": 1,
    "imageComplexityE": 2,
    "usePaletteE": 2
  },
  "vectorizationRecordId": 70045803,
  "vectorizations": 2
}
```

It also contains `pfPhoto` and `pfLogo` strings. These look like ranked palette candidates by mode. Each line appears to contain:

```text
score;colorCount,color color color ...
```

This suggests the backend classifies the image and computes palette candidates for both photo-like and logo-like interpretations.

## Vectorization Result

The final user image contains two vectorization records:

| Vectorization | State | Image type | Complexity | Segmentation artifact |
| ---: | ---: | ---: | ---: | --- |
| 70045802 | 4 | 1 | 2 | `photo_medium_unlimited_segmentation.png` |
| 70045803 | 4 | 1 | 3 | `photo_high_unlimited_segmentation.png` |

The segmentation URLs are signed S3 URLs. The artifact names are very informative:

```text
photo_medium_unlimited_segmentation.png
photo_high_unlimited_segmentation.png
```

So the backend produces segmentation images as first-class artifacts, stored in object storage, and associates them with vectorization records.

## Shape Payloads

The worker sends multiple command-8 shape payloads. Each contains:

```json
{
  "jobId": 5,
  "progress": 80,
  "shapes": [
    {
      "color": "rgba(...)",
      "lengths": [...]
    }
  ]
}
```

Observed shape chunk summary:

| Job | Progress | Shape color groups | Length entries | Sum of lengths |
| ---: | ---: | ---: | ---: | ---: |
| 4 | 66 | 162 | 172 | 8,258 |
| 4 | 100 | 172 | 186 | 7,482 |
| 5 | 40 | 112 | 123 | 8,196 |
| 5 | 60 | 232 | 236 | 8,536 |
| 5 | 80 | 81 | 90 | 8,232 |
| 5 | 100 | 15 | 15 | 1,824 |

These shape payloads are likely used to progressively render preview geometry in the browser before or alongside final export generation. The payloads group geometry by RGBA color and send compact `lengths` arrays rather than full SVG text.

## Backend Architecture We Should Copy

For our online-only app, the HAR supports this architecture:

1. Browser preprocesses image with canvas.
2. Browser sends image metadata to app API.
3. App API creates an image record and returns upload instructions.
4. Browser uploads the raster to object storage via signed multipart POST.
5. Browser connects to a worker WebSocket using image id + secret.
6. Worker sends heartbeat/ack frames.
7. Browser sends initial image state.
8. Worker runs classification.
9. Browser or server starts one or more vectorization jobs with explicit configuration.
10. Worker streams progress.
11. Worker streams preview shape chunks grouped by color.
12. Worker stores segmentation images and vectorization records in object storage/database.
13. Download page exposes final SVG/EPS/PDF endpoints.

## What We Still Do Not Know

The HAR reveals protocol and artifact shape, but not the private algorithm implementation.

Still hidden:

- Actual segmentation algorithm.
- Anti-aliased edge localization method.
- Curve fitting / Bezier simplification method.
- How `imageTypeE`, `imageComplexityE`, and `usePaletteE` map internally.
- How command numbers map to server-side class names.
- How final SVG/EPS/PDF is generated from worker geometry.

But we now have enough to design a compatible architecture and start implementing our own backend protocol.
