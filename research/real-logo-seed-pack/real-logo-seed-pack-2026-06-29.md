# Real-World Logo Seed Pack - 2026-06-29 [codex]

Purpose: expand validation beyond the six synthetic benchmark logos with a varied internal seed pack of brand-like marks, wordmarks, transparent logos, glow/dark logos, low-res marks, and metallic/text stress cases.

Licensing/trademark note: source brand marks are from Simple Icons under CC0-1.0 where possible. Brand/trademark rights remain with their respective owners. Use this pack for internal benchmarking only, not marketing/demo screenshots.

Generated PNG inputs: `app/assets/benchmark-realworld/`
Source SVGs: `research/real-logo-seed-pack/sources/simple-icons/`
Contact sheet: `research/real-logo-seed-pack/contact-sheet.png`

## Samples

- `flat-github-mark.png` - flat-mark; source github; Solid monochrome mark on white.
- `thin-nike-swoosh.png` - thin-smooth-shape; source nike; Large thin curve plus short wordmark.
- `stripe-adidas-mark.png` - stripe-flat-logo; source adidas; Multiple strong stripe edges.
- `dark-apple-gloss.png` - dark-gloss; source apple; Light mark on dark background with soft glow.
- `spotify-green-roundel.png` - flat-roundel; source spotify; Round brand-like mark with internal curved stripes.
- `youtube-red-white.png` - two-tone-flat; source youtube; High contrast red/white logo.
- `wikipedia-fine-detail.png` - fine-detail; source wikipedia; Intricate mark and text, useful for small-detail stress.
- `wordpress-circle-text.png` - circle-letterform; source wordpress; Circular mark with letterform-like detail.
- `docker-dense-blue.png` - dense-blocks; source docker; Many small block-like components.
- `kubernetes-wheel.png` - complex-radial; source kubernetes; Radial spokes and internal detail.
- `firefox-gradient-panel.png` - gradient-flat-mark; source firefoxbrowser; Gradient background behind a white mark.
- `airbnb-line-symbol.png` - loop-line-symbol; source airbnb; Looped continuous-symbol style.
- `openstreetmap-detail.png` - intricate-detail; source openstreetmap; Intricate map-pin style geometry.
- `ubuntu-orange-circles.png` - circular-nodes; source ubuntu; Circular components with small gaps.
- `figma-color-on-dark.png` - multi-color-sim; source figma; Dark panel plus added colored accents to mimic multi-color marks.
- `x-lowres-black.png` - low-res-hard-edge; source x; Intentionally low-res hard-edge mark.
- `rust-gear.png` - gear-detail; source rust; Gear-like outer edge with internal shapes.
- `react-atom.png` - thin-strokes; source react; Thin elliptical strokes on dark background.
- `blender-orange.png` - curvy-multi-part; source blender; Curvy icon with hole detail.
- `telegram-transparent.png` - transparent-flat; source telegram; Transparent-background flat logo input.
- `tiktok-dark-glow.png` - dark-glow-accent; source tiktok; Dark background, offset chromatic shadows.
- `discord-rounded.png` - rounded-game-logo; source discord; Rounded shape and small interior cutouts.
- `microsoft-generated-fourcolor.png` - generated-multi-color; source generated; Generated four-color square mark plus wordmark; included for multi-color flat testing.
- `metallic-wordmark-generated.png` - generated-metal-wordmark; source generated; Generated metallic/text logo stress case.

## Recommended validation loop

1. Run the app locally and load each image with `?asset=assets/benchmark-realworld/<file>.png`.
2. Capture ours metrics from the benchmark ledger.
3. For the serious subset, upload to Vector Magic and save VM SVGs under `research/vm-realworld/`.
4. Compare ours vs VM using the existing browser harness before changing the engine.
