# App

This folder contains the first local browser prototype.

Open `index.html` in a browser, or serve the folder locally:

```bash
python -m http.server 8787
```

Current V0 behavior:

- Upload or drop a raster image.
- Resize into a working canvas.
- Quantize colors with k-means.
- Trace per-color pixel-cell boundaries.
- Preview and download SVG.

This is a baseline only. It does not yet do anti-aliased edge recovery, smoothing, or Bezier fitting.
