"use strict";

const fs = require("fs");
const path = require("path");

let Resvg;
try {
  ({ Resvg } = require("@resvg/resvg-js"));
} catch (error) {
  console.error("This tool needs @resvg/resvg-js installed in node_modules.");
  console.error("Run: npm install --save-dev @resvg/resvg-js");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "app", "assets", "benchmark-realworld");
const RESEARCH_DIR = path.join(ROOT, "research", "real-logo-seed-pack");
const SOURCE_DIR = path.join(RESEARCH_DIR, "sources", "simple-icons");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const REPORT_PATH = path.join(RESEARCH_DIR, "real-logo-seed-pack-2026-06-29.md");
const CONTACT_SHEET_PATH = path.join(RESEARCH_DIR, "contact-sheet.png");

const SIMPLE_ICON_BASE = "https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons";
const LICENSE_NOTE =
  "Source icon from Simple Icons (CC0-1.0). Brand/trademark rights remain with respective owners. Internal benchmarking only.";

const samples = [
  {
    id: "flat-github-mark",
    slug: "github",
    label: "GITHUB",
    category: "flat-mark",
    fg: "#111111",
    bg: "#ffffff",
    layout: "mark-only",
    note: "Solid monochrome mark on white."
  },
  {
    id: "thin-nike-swoosh",
    slug: "nike",
    label: "NIKE",
    category: "thin-smooth-shape",
    fg: "#050505",
    bg: "#ffffff",
    layout: "mark-word",
    markScale: 0.82,
    note: "Large thin curve plus short wordmark."
  },
  {
    id: "stripe-adidas-mark",
    slug: "adidas",
    label: "ADIDAS",
    category: "stripe-flat-logo",
    fg: "#111111",
    bg: "#f7f7f7",
    layout: "mark-word",
    note: "Multiple strong stripe edges."
  },
  {
    id: "dark-apple-gloss",
    slug: "apple",
    label: "APPLE",
    category: "dark-gloss",
    fg: "#f4f6f8",
    bg: "#05070b",
    layout: "badge-word",
    effects: ["glow", "metal"],
    note: "Light mark on dark background with soft glow."
  },
  {
    id: "spotify-green-roundel",
    slug: "spotify",
    label: "SPOTIFY",
    category: "flat-roundel",
    fg: "#101010",
    bg: "#1ed760",
    layout: "badge-word",
    note: "Round brand-like mark with internal curved stripes."
  },
  {
    id: "youtube-red-white",
    slug: "youtube",
    label: "YOUTUBE",
    category: "two-tone-flat",
    fg: "#ffffff",
    bg: "#ff0033",
    layout: "badge-word",
    note: "High contrast red/white logo."
  },
  {
    id: "wikipedia-fine-detail",
    slug: "wikipedia",
    label: "WIKIPEDIA",
    category: "fine-detail",
    fg: "#222222",
    bg: "#ffffff",
    layout: "mark-word",
    markScale: 0.78,
    note: "Intricate mark and text, useful for small-detail stress."
  },
  {
    id: "wordpress-circle-text",
    slug: "wordpress",
    label: "WORDPRESS",
    category: "circle-letterform",
    fg: "#21759b",
    bg: "#f4f7f9",
    layout: "mark-word",
    markScale: 0.58,
    note: "Circular mark with letterform-like detail."
  },
  {
    id: "docker-dense-blue",
    slug: "docker",
    label: "DOCKER",
    category: "dense-blocks",
    fg: "#2496ed",
    bg: "#ffffff",
    layout: "mark-word",
    note: "Many small block-like components."
  },
  {
    id: "kubernetes-wheel",
    slug: "kubernetes",
    label: "KUBERNETES",
    category: "complex-radial",
    fg: "#326ce5",
    bg: "#ffffff",
    layout: "mark-word",
    markScale: 0.82,
    note: "Radial spokes and internal detail."
  },
  {
    id: "firefox-gradient-panel",
    slug: "firefoxbrowser",
    fallbackSlug: "firefox",
    label: "FIREFOX",
    category: "gradient-flat-mark",
    fg: "#ffffff",
    bg: "#ff8a00",
    bg2: "#7a1fff",
    layout: "badge-word",
    effects: ["gradient"],
    note: "Gradient background behind a white mark."
  },
  {
    id: "airbnb-line-symbol",
    slug: "airbnb",
    label: "AIRBNB",
    category: "loop-line-symbol",
    fg: "#ff385c",
    bg: "#ffffff",
    layout: "mark-word",
    markScale: 0.58,
    note: "Looped continuous-symbol style."
  },
  {
    id: "openstreetmap-detail",
    slug: "openstreetmap",
    label: "MAPMARK",
    category: "intricate-detail",
    fg: "#111111",
    bg: "#ffffff",
    layout: "mark-word",
    markScale: 0.58,
    note: "Intricate map-pin style geometry."
  },
  {
    id: "ubuntu-orange-circles",
    slug: "ubuntu",
    label: "UBUNTU",
    category: "circular-nodes",
    fg: "#e95420",
    bg: "#ffffff",
    layout: "mark-word",
    note: "Circular components with small gaps."
  },
  {
    id: "figma-color-on-dark",
    slug: "figma",
    label: "FIGMA",
    category: "multi-color-sim",
    fg: "#ffffff",
    bg: "#151515",
    layout: "badge-word",
    effects: ["accent-bars"],
    note: "Dark panel plus added colored accents to mimic multi-color marks."
  },
  {
    id: "x-lowres-black",
    slug: "x",
    fallbackSlug: "x",
    label: "X",
    category: "low-res-hard-edge",
    fg: "#111111",
    bg: "#ffffff",
    layout: "mark-only",
    rasterSize: 192,
    note: "Intentionally low-res hard-edge mark."
  },
  {
    id: "rust-gear",
    slug: "rust",
    label: "RUST",
    category: "gear-detail",
    fg: "#000000",
    bg: "#f7f1ea",
    layout: "mark-word",
    markScale: 0.58,
    note: "Gear-like outer edge with internal shapes."
  },
  {
    id: "react-atom",
    slug: "react",
    label: "REACT",
    category: "thin-strokes",
    fg: "#61dafb",
    bg: "#101820",
    layout: "badge-word",
    effects: ["glow"],
    note: "Thin elliptical strokes on dark background."
  },
  {
    id: "blender-orange",
    slug: "blender",
    label: "BLENDER",
    category: "curvy-multi-part",
    fg: "#f5792a",
    bg: "#ffffff",
    layout: "mark-word",
    note: "Curvy icon with hole detail."
  },
  {
    id: "telegram-transparent",
    slug: "telegram",
    label: "TELEGRAM",
    category: "transparent-flat",
    fg: "#26a5e4",
    bg: "transparent",
    layout: "mark-word",
    markScale: 0.58,
    note: "Transparent-background flat logo input."
  },
  {
    id: "tiktok-dark-glow",
    slug: "tiktok",
    label: "TIKTOK",
    category: "dark-glow-accent",
    fg: "#ffffff",
    bg: "#050505",
    layout: "badge-word",
    effects: ["glow", "cyan-shadow", "red-shadow"],
    note: "Dark background, offset chromatic shadows."
  },
  {
    id: "discord-rounded",
    slug: "discord",
    label: "DISCORD",
    category: "rounded-game-logo",
    fg: "#5865f2",
    bg: "#ffffff",
    layout: "mark-word",
    note: "Rounded shape and small interior cutouts."
  },
  {
    id: "microsoft-generated-fourcolor",
    slug: "microsoft",
    label: "MICROSOFT",
    category: "generated-multi-color",
    fg: "#111111",
    bg: "#ffffff",
    layout: "four-square-word",
    note: "Generated four-color square mark plus wordmark; included for multi-color flat testing."
  },
  {
    id: "metallic-wordmark-generated",
    slug: "github",
    label: "VECTOR PRO",
    category: "generated-metal-wordmark",
    fg: "#dfe5ec",
    bg: "#06080c",
    layout: "wordmark-only",
    effects: ["metal", "glow", "blue-accent"],
    note: "Generated metallic/text logo stress case."
  }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "VectorAccuracyStudioBenchmarkGatherer/1.0" }
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchSimpleIcon(sample) {
  const slugs = [sample.slug, sample.fallbackSlug].filter(Boolean);
  let lastError;
  for (const slug of slugs) {
    const url = `${SIMPLE_ICON_BASE}/${slug}.svg`;
    try {
      const svg = await fetchText(url);
      return { slug, url, svg };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No slug provided");
}

function extractInnerSvg(svg) {
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/i);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 24 24";
  const body = svg
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/^<svg\b[^>]*>/i, "")
    .replace(/<\/svg>\s*$/i, "")
    .trim();
  return { viewBox, body };
}

function backgroundMarkup(sample, size) {
  if (sample.bg === "transparent") {
    return "";
  }
  if (sample.effects?.includes("gradient")) {
    return `
      <defs>
        <linearGradient id="bgGrad" x1="0" y1="0" x2="${size}" y2="${size}">
          <stop offset="0" stop-color="${sample.bg}"/>
          <stop offset="1" stop-color="${sample.bg2 || sample.bg}"/>
        </linearGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#bgGrad)"/>`;
  }
  return `<rect width="${size}" height="${size}" fill="${sample.bg}"/>`;
}

function filtersMarkup(sample) {
  const filters = [];
  if (sample.effects?.includes("glow")) {
    filters.push(`
      <filter id="softGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="7" result="blur"/>
        <feColorMatrix in="blur" type="matrix" values="0.2 0 0 0 0.1 0 0.8 0 0 0.65 0 0 1 0 1 0 0 0 0.65 0" result="glow"/>
        <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>`);
  }
  if (!filters.length) return "";
  return `<defs>${filters.join("\n")}</defs>`;
}

function iconMarkup(icon, sample, x, y, w, h, extra = "") {
  const { viewBox, body } = icon;
  return `
    <svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${viewBox}" overflow="visible" ${extra}>
      <g fill="${sample.fg}">${body}</g>
    </svg>`;
}

function labelMarkup(sample, x, y, fontSize, fill = null, anchor = "middle") {
  const family = "Arial, Helvetica, sans-serif";
  const weight = sample.category.includes("fine") ? 600 : 800;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${family}" font-size="${fontSize}" font-weight="${weight}" letter-spacing="1.8" fill="${fill || sample.fg}">${escapeXml(sample.label)}</text>`;
}

function buildSvg(icon, sample) {
  const size = sample.sourceSize || 768;
  const markScale = sample.markScale || 0.72;
  const bg = backgroundMarkup(sample, size);
  const filters = filtersMarkup(sample);
  const filterAttr = sample.effects?.includes("glow") ? 'filter="url(#softGlow)"' : "";
  const accent = [];

  if (sample.effects?.includes("cyan-shadow")) {
    accent.push(iconMarkup(icon, { ...sample, fg: "#25f4ee" }, 202, 144, 300, 300, 'opacity="0.75"'));
  }
  if (sample.effects?.includes("red-shadow")) {
    accent.push(iconMarkup(icon, { ...sample, fg: "#fe2c55" }, 222, 158, 300, 300, 'opacity="0.75"'));
  }
  if (sample.effects?.includes("accent-bars")) {
    accent.push(`<rect x="137" y="515" width="112" height="24" rx="12" fill="#36c5f0"/>`);
    accent.push(`<rect x="273" y="515" width="112" height="24" rx="12" fill="#2eb67d"/>`);
    accent.push(`<rect x="409" y="515" width="112" height="24" rx="12" fill="#ecb22e"/>`);
    accent.push(`<rect x="545" y="515" width="112" height="24" rx="12" fill="#e01e5a"/>`);
  }

  let content = "";
  if (sample.layout === "mark-only") {
    const w = Math.round(size * markScale);
    const x = Math.round((size - w) / 2);
    content = `${accent.join("\n")}${iconMarkup(icon, sample, x, x, w, w, filterAttr)}`;
  } else if (sample.layout === "mark-word") {
    const w = Math.round(size * markScale);
    const x = Math.round((size - w) / 2);
    content = `${accent.join("\n")}${iconMarkup(icon, sample, x, 94, w, w, filterAttr)}
      ${labelMarkup(sample, size / 2, 660, sample.label.length > 8 ? 54 : 64)}`;
  } else if (sample.layout === "badge-word") {
    content = `${accent.join("\n")}<rect x="72" y="84" width="624" height="600" rx="56" fill="${sample.bg === "transparent" ? "#ffffff" : "rgba(255,255,255,0.04)"}" opacity="0.9"/>
      ${iconMarkup(icon, sample, 202, 136, 364, 364, filterAttr)}
      ${labelMarkup(sample, size / 2, 617, sample.label.length > 8 ? 50 : 62)}`;
  } else if (sample.layout === "four-square-word") {
    content = `
      <g transform="translate(168 160)">
        <rect x="0" y="0" width="168" height="168" fill="#f25022"/>
        <rect x="188" y="0" width="168" height="168" fill="#7fba00"/>
        <rect x="0" y="188" width="168" height="168" fill="#00a4ef"/>
        <rect x="188" y="188" width="168" height="168" fill="#ffb900"/>
      </g>
      ${labelMarkup(sample, size / 2, 650, 54, "#222222")}`;
  } else if (sample.layout === "wordmark-only") {
    content = `
      <defs>
        <linearGradient id="metalText" x1="0" y1="250" x2="0" y2="500">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="0.28" stop-color="#8c98a4"/>
          <stop offset="0.52" stop-color="#f6f7f8"/>
          <stop offset="1" stop-color="#59636d"/>
        </linearGradient>
      </defs>
      <ellipse cx="384" cy="420" rx="250" ry="42" fill="#1c8fd5" opacity="0.28" filter="url(#softGlow)"/>
      <path d="M110 482 C245 405 530 405 665 482" fill="none" stroke="#1c8fd5" stroke-width="22"/>
      <text x="384" y="390" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="100" font-weight="900" letter-spacing="-2" fill="url(#metalText)" stroke="#111820" stroke-width="3">${escapeXml(sample.label)}</text>`;
  }

  if (sample.effects?.includes("metal") && sample.layout !== "wordmark-only") {
    content += `<path d="M160 164 C340 92 522 96 608 174 C468 142 320 148 160 164Z" fill="#ffffff" opacity="0.22"/>`;
  }
  if (sample.effects?.includes("blue-accent")) {
    content += `<path d="M108 462 C250 520 526 520 666 462" fill="none" stroke="#0da6ff" stroke-width="14" opacity="0.95"/>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg}
  ${filters}
  ${content}
</svg>`;
}

async function rasterize(sample, svg) {
  const rasterSize = sample.rasterSize || 768;
  const pngPath = path.join(OUT_DIR, `${sample.id}.png`);
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: rasterSize },
    background: sample.bg === "transparent" ? "rgba(0,0,0,0)" : undefined,
    font: {
      loadSystemFonts: true
    }
  });
  fs.writeFileSync(pngPath, renderer.render().asPng());
  return pngPath;
}

async function buildContactSheet(entries) {
  const thumb = 192;
  const cols = 6;
  const rows = Math.ceil(entries.length / cols);
  const width = cols * thumb;
  const height = rows * (thumb + 34);
  const cells = [];
  for (let i = 0; i < entries.length; i += 1) {
    const x = (i % cols) * thumb;
    const y = Math.floor(i / cols) * (thumb + 34);
    const png = fs.readFileSync(entries[i].pngPath).toString("base64");
    cells.push(`
      <rect x="${x}" y="${y}" width="${thumb}" height="${thumb + 34}" fill="#f8fafc"/>
      <image x="${x}" y="${y}" width="${thumb}" height="${thumb}" href="data:image/png;base64,${png}" preserveAspectRatio="xMidYMid meet"/>
      <text x="${x + thumb / 2}" y="${y + thumb + 22}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#263348">${escapeXml(entries[i].id)}</text>`);
  }
  const sheetSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#eef3f8"/>
    ${cells.join("\n")}
  </svg>`;
  fs.writeFileSync(path.join(RESEARCH_DIR, "contact-sheet.svg"), sheetSvg, "utf8");
  fs.writeFileSync(CONTACT_SHEET_PATH, new Resvg(sheetSvg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: true } }).render().asPng());
}

function writeReport(entries) {
  const lines = [];
  lines.push("# Real-World Logo Seed Pack - 2026-06-29 [codex]");
  lines.push("");
  lines.push("Purpose: expand validation beyond the six synthetic benchmark logos with a varied internal seed pack of brand-like marks, wordmarks, transparent logos, glow/dark logos, low-res marks, and metallic/text stress cases.");
  lines.push("");
  lines.push("Licensing/trademark note: source brand marks are from Simple Icons under CC0-1.0 where possible. Brand/trademark rights remain with their respective owners. Use this pack for internal benchmarking only, not marketing/demo screenshots.");
  lines.push("");
  lines.push(`Generated PNG inputs: \`app/assets/benchmark-realworld/\``);
  lines.push(`Source SVGs: \`research/real-logo-seed-pack/sources/simple-icons/\``);
  lines.push(`Contact sheet: \`research/real-logo-seed-pack/contact-sheet.png\``);
  lines.push("");
  lines.push("## Samples");
  lines.push("");
  for (const entry of entries) {
    lines.push(`- \`${entry.file}\` - ${entry.category}; source ${entry.sourceSlug}; ${entry.note}`);
  }
  lines.push("");
  lines.push("## Recommended validation loop");
  lines.push("");
  lines.push("1. Run the app locally and load each image with `?asset=assets/benchmark-realworld/<file>.png`.");
  lines.push("2. Capture ours metrics from the benchmark ledger.");
  lines.push("3. For the serious subset, upload to Vector Magic and save VM SVGs under `research/vm-realworld/`.");
  lines.push("4. Compare ours vs VM using the existing browser harness before changing the engine.");
  fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  ensureDir(OUT_DIR);
  ensureDir(SOURCE_DIR);
  ensureDir(RESEARCH_DIR);

  const entries = [];
  for (const sample of samples) {
    console.log(`Fetching/rendering ${sample.id}...`);
    let fetched = null;
    let sourcePath = null;
    let icon = { viewBox: "0 0 24 24", body: "" };
    if (!["four-square-word", "wordmark-only"].includes(sample.layout)) {
      fetched = await fetchSimpleIcon(sample);
      sourcePath = path.join(SOURCE_DIR, `${sample.id}-${fetched.slug}.svg`);
      fs.writeFileSync(sourcePath, fetched.svg, "utf8");
      icon = extractInnerSvg(fetched.svg);
    }
    const composedSvg = buildSvg(icon, sample);
    const composedPath = path.join(SOURCE_DIR, `${sample.id}-composed.svg`);
    fs.writeFileSync(composedPath, composedSvg, "utf8");
    const pngPath = await rasterize(sample, composedSvg);
    const stat = fs.statSync(pngPath);
    entries.push({
      id: sample.id,
      file: `${sample.id}.png`,
      pngPath,
      category: sample.category,
      source: fetched ? "Simple Icons" : "Generated",
      sourceSlug: fetched ? fetched.slug : "generated",
      sourceUrl: fetched ? fetched.url : null,
      sourceSvg: sourcePath ? path.relative(ROOT, sourcePath).replace(/\\/g, "/") : null,
      composedSvg: path.relative(ROOT, composedPath).replace(/\\/g, "/"),
      license: fetched ? LICENSE_NOTE : "Generated by Vector Accuracy Studio benchmark tool for internal testing.",
      layout: sample.layout,
      rasterSize: sample.rasterSize || 768,
      bytes: stat.size,
      note: sample.note
    });
  }

  await buildContactSheet(entries);

  const manifest = {
    generatedAt: new Date().toISOString(),
    purpose: "Internal real-world logo seed pack for Vector Accuracy Studio benchmark validation.",
    licenseNote: LICENSE_NOTE,
    samples: entries.map(({ pngPath, ...entry }) => entry)
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeReport(entries);
  console.log(`Wrote ${entries.length} PNGs to ${path.relative(ROOT, OUT_DIR)}`);
  console.log(`Wrote manifest to ${path.relative(ROOT, MANIFEST_PATH)}`);
  console.log(`Wrote report to ${path.relative(ROOT, REPORT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
