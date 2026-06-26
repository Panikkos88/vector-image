(function () {
  "use strict";

  const TRANSPARENT_ALPHA = 8;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function luminance(rgb) {
    return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
  }

  function colorDistanceSq(a, b) {
    const dr = a[0] - b[0];
    const dg = a[1] - b[1];
    const db = a[2] - b[2];
    return dr * dr + dg * dg + db * db;
  }

  function rgbToHex(rgb) {
    return `#${rgb.map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
  }

  function cloneImageData(imageData) {
    return new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  }

  function noOp(imageData, mode, reason = "off") {
    return {
      imageData,
      applied: false,
      reason,
      mode,
      confidence: 0,
      backgroundColor: [0, 0, 0],
      foregroundPixels: imageData.width * imageData.height,
      sureBackgroundPixels: 0,
      unknownPixels: 0,
      matteEdgePixels: 0,
      backgroundPathsAvoided: 0,
      svgBackgroundLayer: "",
      stats: {
        mode,
        applied: false,
        reason,
        confidence: 0,
        backgroundColor: "#000000",
        foregroundPixels: imageData.width * imageData.height,
        sureBackgroundPixels: 0,
        unknownPixels: 0,
        matteEdgePixels: 0,
        backgroundPathsAvoided: 0
      }
    };
  }

  function transparentPixelRatio(imageData) {
    const data = imageData.data;
    let transparent = 0;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 245) transparent += 1;
    }
    return transparent / Math.max(1, imageData.width * imageData.height);
  }

  function borderSampleIndexes(width, height) {
    const indexes = [];
    for (let x = 0; x < width; x += 1) {
      indexes.push(x);
      indexes.push((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
      indexes.push(y * width);
      indexes.push(y * width + width - 1);
    }
    return indexes;
  }

  function averageBorderColor(imageData) {
    const { data, width, height } = imageData;
    const indexes = borderSampleIndexes(width, height);
    const buckets = new Map();

    for (const pixel of indexes) {
      const i = pixel * 4;
      if (data[i + 3] < 245) continue;
      const key = `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
      const bucket = buckets.get(key) || [0, 0, 0, 0];
      bucket[0] += data[i];
      bucket[1] += data[i + 1];
      bucket[2] += data[i + 2];
      bucket[3] += 1;
      buckets.set(key, bucket);
    }

    const best = [...buckets.values()].sort((a, b) => b[3] - a[3])[0];
    if (!best) return null;

    const color = [best[0] / best[3], best[1] / best[3], best[2] / best[3]];
    return {
      color,
      dominance: best[3] / Math.max(1, indexes.length),
      sampleCount: indexes.length,
      dominantCount: best[3]
    };
  }

  function toleranceForColor(color, mode) {
    const lum = luminance(color);
    const dark = lum < 52;
    const light = lum > 210;
    const base = dark ? 34 : light ? 38 : 32;
    return mode === "force" ? base * 1.3 : base;
  }

  function isBackgroundLike(data, pixel, background, toleranceSq, lumTolerance) {
    const i = pixel * 4;
    if (data[i + 3] < TRANSPARENT_ALPHA) return true;
    const rgb = [data[i], data[i + 1], data[i + 2]];
    return colorDistanceSq(rgb, background) <= toleranceSq
      || Math.abs(luminance(rgb) - luminance(background)) <= lumTolerance && colorDistanceSq(rgb, background) <= toleranceSq * 1.8;
  }

  function floodConnectedBackground(imageData, background, tolerance, mode) {
    const { data, width, height } = imageData;
    const toleranceSq = tolerance * tolerance;
    const lumTolerance = mode === "force" ? 34 : 24;
    const mask = new Uint8Array(width * height);
    const queue = [];
    const push = (pixel) => {
      if (mask[pixel]) return;
      if (!isBackgroundLike(data, pixel, background, toleranceSq, lumTolerance)) return;
      mask[pixel] = 1;
      queue.push(pixel);
    };

    for (let x = 0; x < width; x += 1) {
      push(x);
      push((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
      push(y * width);
      push(y * width + width - 1);
    }

    let head = 0;
    while (head < queue.length) {
      const pixel = queue[head];
      head += 1;
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x > 0) push(pixel - 1);
      if (x < width - 1) push(pixel + 1);
      if (y > 0) push(pixel - width);
      if (y < height - 1) push(pixel + width);
    }

    return { mask, count: queue.length };
  }

  function buildUnknownBand(backgroundMask, width, height, radius) {
    const unknown = new Uint8Array(width * height);
    let unknownPixels = 0;
    let backgroundUnknownPixels = 0;
    let foregroundUnknownPixels = 0;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x;
        const isBackground = Boolean(backgroundMask[pixel]);

        let touchesOpposite = false;
        for (let dy = -radius; dy <= radius && !touchesOpposite; dy += 1) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx += 1) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (Boolean(backgroundMask[ny * width + nx]) !== isBackground) {
              touchesOpposite = true;
              break;
            }
          }
        }

        if (touchesOpposite) {
          unknown[pixel] = 1;
          unknownPixels += 1;
          if (isBackground) backgroundUnknownPixels += 1;
          else foregroundUnknownPixels += 1;
        }
      }
    }

    return { unknown, unknownPixels, backgroundUnknownPixels, foregroundUnknownPixels };
  }

  function estimateAlpha(rgb, background, options) {
    const distance = Math.sqrt(colorDistanceSq(rgb, background));
    const start = options.alphaStart;
    const end = options.alphaEnd;
    return clamp((distance - start) / Math.max(1, end - start), 0, 1);
  }

  function solveAlpha(rgb, background, foreground) {
    const vr = foreground[0] - background[0];
    const vg = foreground[1] - background[1];
    const vb = foreground[2] - background[2];
    const denominator = vr * vr + vg * vg + vb * vb;
    if (denominator < 36) return 0;

    const dot = (rgb[0] - background[0]) * vr
      + (rgb[1] - background[1]) * vg
      + (rgb[2] - background[2]) * vb;
    return clamp(dot / denominator, 0, 1);
  }

  function localForegroundColor(imageData, backgroundMask, unknown, pixel, background, options) {
    const { data, width, height } = imageData;
    const x = pixel % width;
    const y = (pixel - x) / width;
    const maxRadius = options.localRadius;
    const minDistanceSq = options.minForegroundDistance * options.minForegroundDistance;

    let weightedR = 0;
    let weightedG = 0;
    let weightedB = 0;
    let weightSum = 0;
    let samples = 0;
    let sureSamples = 0;

    for (let radius = 1; radius <= maxRadius; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const neighbor = yy * width + xx;
          if (backgroundMask[neighbor]) continue;

          const i = neighbor * 4;
          if (data[i + 3] < 245) continue;
          const rgb = [data[i], data[i + 1], data[i + 2]];
          const distanceSq = colorDistanceSq(rgb, background);
          if (distanceSq < minDistanceSq) continue;

          const sure = unknown[neighbor] ? 0 : 1;
          const contrast = Math.min(2.4, Math.sqrt(distanceSq) / 72);
          const spatial = 1 / (1 + dx * dx + dy * dy);
          const weight = spatial * (0.38 + contrast) * (sure ? 1.35 : 0.45);
          weightedR += rgb[0] * weight;
          weightedG += rgb[1] * weight;
          weightedB += rgb[2] * weight;
          weightSum += weight;
          samples += 1;
          if (sure) sureSamples += 1;
        }
      }

      if (sureSamples >= 3 || samples >= 8) break;
    }

    if (weightSum <= 0) return null;
    return {
      color: [weightedR / weightSum, weightedG / weightSum, weightedB / weightSum],
      samples,
      sureSamples
    };
  }

  function smoothUnknownAlpha(alpha, unknown, width, height) {
    const smoothed = new Float32Array(alpha);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const pixel = y * width + x;
        if (!unknown[pixel]) continue;

        let sum = alpha[pixel] * 4;
        let weight = 4;
        const neighbors = [pixel - 1, pixel + 1, pixel - width, pixel + width];
        for (const neighbor of neighbors) {
          if (!unknown[neighbor]) continue;
          sum += alpha[neighbor];
          weight += 1;
        }
        smoothed[pixel] = sum / weight;
      }
    }
    return smoothed;
  }

  function unpremultiplyForeground(rgb, background, alpha) {
    if (alpha <= 0.01) return [0, 0, 0];
    return [
      clamp((rgb[0] - background[0] * (1 - alpha)) / alpha, 0, 255),
      clamp((rgb[1] - background[1] * (1 - alpha)) / alpha, 0, 255),
      clamp((rgb[2] - background[2] * (1 - alpha)) / alpha, 0, 255)
    ];
  }

  function buildForegroundImage(imageData, backgroundMask, unknown, background, options) {
    const { data, width, height } = imageData;
    const output = cloneImageData(imageData);
    const alpha = new Float32Array(width * height);
    const foregroundRgb = new Uint8ClampedArray(width * height * 3);
    const localSampleFlags = new Uint8Array(width * height);
    const solidForegroundFlags = new Uint8Array(width * height);
    let foregroundPixels = 0;
    let matteEdgePixels = 0;
    let sureBackgroundPixels = 0;
    let localForegroundSamples = 0;
    let localForegroundSureSamples = 0;
    let fallbackForegroundSamples = 0;
    let foregroundSideSolidPixels = 0;
    let foregroundSideSolidPreservedPixels = 0;

    const foregroundOptions = {
      localRadius: options.localRadius,
      minForegroundDistance: options.minForegroundDistance
    };

    for (let pixel = 0; pixel < alpha.length; pixel += 1) {
      const i = pixel * 4;
      const rgb = [data[i], data[i + 1], data[i + 2]];

      if (!backgroundMask[pixel] && !unknown[pixel]) {
        alpha[pixel] = 1;
        foregroundRgb[pixel * 3] = data[i];
        foregroundRgb[pixel * 3 + 1] = data[i + 1];
        foregroundRgb[pixel * 3 + 2] = data[i + 2];
        continue;
      }
      if (unknown[pixel]) {
        const local = localForegroundColor(imageData, backgroundMask, unknown, pixel, background, foregroundOptions);
        if (local) {
          const solved = solveAlpha(rgb, background, local.color);
          if (!backgroundMask[pixel] && solved >= options.foregroundSolidAlpha) {
            alpha[pixel] = 1;
            foregroundRgb[pixel * 3] = rgb[0];
            foregroundRgb[pixel * 3 + 1] = rgb[1];
            foregroundRgb[pixel * 3 + 2] = rgb[2];
            solidForegroundFlags[pixel] = 1;
            foregroundSideSolidPixels += 1;
          } else {
            alpha[pixel] = clamp(solved, backgroundMask[pixel] ? 0 : options.foregroundMinAlpha, 1);
            foregroundRgb[pixel * 3] = local.color[0];
            foregroundRgb[pixel * 3 + 1] = local.color[1];
            foregroundRgb[pixel * 3 + 2] = local.color[2];
          }
          localSampleFlags[pixel] = 1;
          localForegroundSamples += local.samples;
          localForegroundSureSamples += local.sureSamples;
        } else {
          alpha[pixel] = estimateAlpha(rgb, background, options);
          const fallback = unpremultiplyForeground(rgb, background, alpha[pixel]);
          foregroundRgb[pixel * 3] = fallback[0];
          foregroundRgb[pixel * 3 + 1] = fallback[1];
          foregroundRgb[pixel * 3 + 2] = fallback[2];
          fallbackForegroundSamples += 1;
        }
        continue;
      }

      alpha[pixel] = 0;
      sureBackgroundPixels += 1;
    }

    const smoothedAlpha = smoothUnknownAlpha(alpha, unknown, width, height);
    let reconstructionErrorSum = 0;
    let reconstructionErrorSqSum = 0;
    let reconstructionMaxError = 0;
    let reconstructionPixels = 0;
    let alphaSum = 0;

    for (let pixel = 0; pixel < smoothedAlpha.length; pixel += 1) {
      const i = pixel * 4;
      const a = clamp(smoothedAlpha[pixel], 0, 1);
      if (a > 0.12) foregroundPixels += 1;
      if (unknown[pixel] && a > 0.02 && a < 0.98) matteEdgePixels += 1;

      if (a <= 0.01) {
        output.data[i] = 0;
        output.data[i + 1] = 0;
        output.data[i + 2] = 0;
        output.data[i + 3] = 0;
        continue;
      }

      if (unknown[pixel]) {
        output.data[i] = foregroundRgb[pixel * 3];
        output.data[i + 1] = foregroundRgb[pixel * 3 + 1];
        output.data[i + 2] = foregroundRgb[pixel * 3 + 2];
      }
      output.data[i + 3] = Math.round(a * 255);

      if (unknown[pixel]) {
        const composite = [
          output.data[i] * a + background[0] * (1 - a),
          output.data[i + 1] * a + background[1] * (1 - a),
          output.data[i + 2] * a + background[2] * (1 - a)
        ];
        const dr = composite[0] - data[i];
        const dg = composite[1] - data[i + 1];
        const db = composite[2] - data[i + 2];
        const error = Math.sqrt(dr * dr + dg * dg + db * db) / 441.67295593;
        reconstructionErrorSum += error;
        reconstructionErrorSqSum += error * error;
        reconstructionMaxError = Math.max(reconstructionMaxError, error);
        reconstructionPixels += 1;
        alphaSum += a;
      }
    }

    return {
      imageData: output,
      foregroundPixels,
      matteEdgePixels,
      sureBackgroundPixels,
      localForegroundSamples,
      localForegroundSureSamples,
      fallbackForegroundSamples,
      localForegroundPixels: localSampleFlags.reduce((sum, value) => sum + value, 0),
      foregroundSideSolidPixels,
      foregroundSideSolidPreservedPixels,
      matteReconstructionMeanError: reconstructionErrorSum / Math.max(1, reconstructionPixels),
      matteReconstructionRmse: Math.sqrt(reconstructionErrorSqSum / Math.max(1, reconstructionPixels)),
      matteReconstructionMaxError: reconstructionMaxError,
      matteAlphaMean: alphaSum / Math.max(1, reconstructionPixels)
    };
  }

  function backgroundLayer(width, height, backgroundColor) {
    return `<g id="layer-detached-background" data-layer="detached-background" class="layer-detached-background"><rect width="${width}" height="${height}" fill="${rgbToHex(backgroundColor)}" /></g>`;
  }

  function confidenceScore(border, connectedRatio, unknownRatio, mode) {
    const borderScore = clamp((border.dominance - 0.24) / 0.46, 0, 1);
    const connectedScore = clamp((connectedRatio - 0.18) / 0.5, 0, 1);
    const unknownScore = clamp(1 - unknownRatio * 2.8, 0, 1);
    const score = borderScore * 0.45 + connectedScore * 0.42 + unknownScore * 0.13;
    return mode === "force" ? Math.max(score, 0.62) : score;
  }

  function detach(imageData, options = {}) {
    const mode = options.mode || "auto";
    if (mode === "off") return noOp(imageData, mode, "off");
    if (transparentPixelRatio(imageData) > 0.02) return noOp(imageData, mode, "existing alpha preserved");

    const border = averageBorderColor(imageData);
    if (!border) return noOp(imageData, mode, "no opaque border samples");

    const tolerance = toleranceForColor(border.color, mode);
    const connected = floodConnectedBackground(imageData, border.color, tolerance, mode);
    const connectedRatio = connected.count / Math.max(1, imageData.width * imageData.height);
    const band = buildUnknownBand(connected.mask, imageData.width, imageData.height, mode === "force" ? 2 : 1);
    const unknownRatio = band.unknownPixels / Math.max(1, imageData.width * imageData.height);
    const confidence = confidenceScore(border, connectedRatio, unknownRatio, mode);
    const threshold = mode === "force" ? 0.35 : 0.58;

    if (confidence < threshold) {
      const result = noOp(imageData, mode, "low confidence");
      result.confidence = confidence;
      result.backgroundColor = border.color.map(Math.round);
      result.stats.confidence = confidence;
      result.stats.backgroundColor = rgbToHex(border.color);
      result.stats.connectedBackgroundPixels = connected.count;
      result.stats.borderDominance = border.dominance;
      return result;
    }

    const foreground = buildForegroundImage(
      imageData,
      connected.mask,
      band.unknown,
      border.color,
      {
        alphaStart: mode === "force" ? tolerance * 0.38 : tolerance * 0.45,
        alphaEnd: mode === "force" ? tolerance * 1.55 : tolerance * 1.3,
        localRadius: mode === "force" ? 7 : 5,
        minForegroundDistance: mode === "force" ? 14 : 18,
        foregroundMinAlpha: mode === "force" ? 0.04 : 0.16,
        foregroundSolidAlpha: mode === "force" ? 0.78 : 0.68
      }
    );
    const matteSampleRatio = foreground.localForegroundPixels / Math.max(1, band.unknownPixels);
    const matteReconstructionLimit = mode === "force" ? 0.095 : 0.07;
    if (mode !== "force" && foreground.matteReconstructionRmse > matteReconstructionLimit && matteSampleRatio < 0.42) {
      const result = noOp(imageData, mode, "matte reconstruction low confidence");
      result.confidence = confidence;
      result.backgroundColor = border.color.map(Math.round);
      result.foregroundPixels = foreground.foregroundPixels;
      result.sureBackgroundPixels = foreground.sureBackgroundPixels;
      result.unknownPixels = band.unknownPixels;
      result.matteEdgePixels = foreground.matteEdgePixels;
      result.stats = {
        ...result.stats,
        reason: result.reason,
        confidence,
        backgroundColor: rgbToHex(border.color),
        borderDominance: border.dominance,
        connectedBackgroundPixels: connected.count,
        connectedBackgroundRatio: connectedRatio,
        unknownPixels: band.unknownPixels,
        backgroundUnknownPixels: band.backgroundUnknownPixels,
        foregroundUnknownPixels: band.foregroundUnknownPixels,
        matteEdgePixels: foreground.matteEdgePixels,
        matteMethod: "local-color-pair-v2",
        matteSampleRatio,
        localForegroundPixels: foreground.localForegroundPixels,
        foregroundSideSolidPixels: foreground.foregroundSideSolidPixels,
        foregroundSideSolidPreservedPixels: foreground.foregroundSideSolidPreservedPixels,
        localForegroundSamples: foreground.localForegroundSamples,
        localForegroundSureSamples: foreground.localForegroundSureSamples,
        fallbackForegroundSamples: foreground.fallbackForegroundSamples,
        matteReconstructionMeanError: foreground.matteReconstructionMeanError,
        matteReconstructionRmse: foreground.matteReconstructionRmse,
        matteReconstructionMaxError: foreground.matteReconstructionMaxError,
        matteAlphaMean: foreground.matteAlphaMean
      };
      return result;
    }

    const backgroundColor = border.color.map(Math.round);
    const stats = {
      mode,
      applied: true,
      reason: "applied",
      confidence,
      backgroundColor: rgbToHex(backgroundColor),
      borderDominance: border.dominance,
      connectedBackgroundPixels: connected.count,
      connectedBackgroundRatio: connectedRatio,
      sureBackgroundPixels: foreground.sureBackgroundPixels,
      foregroundPixels: foreground.foregroundPixels,
      unknownPixels: band.unknownPixels,
      backgroundUnknownPixels: band.backgroundUnknownPixels,
      foregroundUnknownPixels: band.foregroundUnknownPixels,
      matteEdgePixels: foreground.matteEdgePixels,
      matteMethod: "local-color-pair-v2",
      matteSampleRatio,
      localForegroundPixels: foreground.localForegroundPixels,
      foregroundSideSolidPixels: foreground.foregroundSideSolidPixels,
      foregroundSideSolidPreservedPixels: foreground.foregroundSideSolidPreservedPixels,
      localForegroundSamples: foreground.localForegroundSamples,
      localForegroundSureSamples: foreground.localForegroundSureSamples,
      fallbackForegroundSamples: foreground.fallbackForegroundSamples,
      matteReconstructionMeanError: foreground.matteReconstructionMeanError,
      matteReconstructionRmse: foreground.matteReconstructionRmse,
      matteReconstructionMaxError: foreground.matteReconstructionMaxError,
      matteAlphaMean: foreground.matteAlphaMean,
      backgroundPathsAvoided: connected.count ? 1 : 0
    };

    return {
      imageData: foreground.imageData,
      applied: true,
      reason: "applied",
      mode,
      confidence,
      backgroundColor,
      foregroundPixels: foreground.foregroundPixels,
      sureBackgroundPixels: foreground.sureBackgroundPixels,
      unknownPixels: band.unknownPixels,
      matteEdgePixels: foreground.matteEdgePixels,
      backgroundPathsAvoided: stats.backgroundPathsAvoided,
      svgBackgroundLayer: backgroundLayer(imageData.width, imageData.height, backgroundColor),
      stats
    };
  }

  window.BackgroundDetach = { detach };
})();
