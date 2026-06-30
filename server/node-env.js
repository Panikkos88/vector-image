// Headless browser-shim environment so the UNMODIFIED app/app.js engine runs under Node.
// Backed by @napi-rs/canvas (canvas + PNG/JPEG + ImageData), @resvg/resvg-js (SVG raster),
// and linkedom (DOMParser/Element with querySelectorAll/classList/innerHTML for SVG manipulation).
// The shipped app.js is loaded verbatim (Option B) -> zero browser-regression risk.

const { createCanvas, Image: NapiImage, ImageData: NapiImageData, loadImage } = require("@napi-rs/canvas");
const { Resvg } = require("@resvg/resvg-js");
const { parseHTML } = require("linkedom");

// --- linkedom document/window provides DOMParser, XMLSerializer, Element APIs ---------------
const { document: linkedomDocument, DOMParser, Node, Event } = parseHTML(
  "<!doctype html><html><head></head><body></body></html>"
);

// linkedom has no XMLSerializer; node.toString() yields valid (SVG) XML.
class XMLSerializer {
  serializeToString(node) { return node && node.toString ? node.toString() : String(node); }
}

// --- canvas element factory (real Skia canvas) ---------------------------------------------
function makeCanvas() {
  const canvas = createCanvas(1, 1);
  // app sets .width/.height after createElement; @napi-rs resizes on assignment (native).
  // Patch getContext so drawImage() unwraps our ImageShim to the underlying napi Image.
  const origGetContext = canvas.getContext.bind(canvas);
  canvas.getContext = (type, opts) => {
    const ctx = origGetContext(type, opts);
    if (ctx && !ctx.__drawPatched) {
      const origDraw = ctx.drawImage.bind(ctx);
      ctx.drawImage = (img, ...rest) => origDraw(img && img._img ? img._img : img, ...rest);
      ctx.__drawPatched = true;
    }
    return ctx;
  };
  return canvas;
}

const CANVAS_IDS = new Set(["originalCanvas", "quantizedCanvas", "differenceCanvas", "coverageCanvas"]);

// --- robust no-op stub element for UI nodes (addEventListener/classList/style/etc.) ---------
function makeStub() {
  const base = {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    children: [],
    childNodes: [],
    value: "",
    checked: false,
    textContent: "",
    innerHTML: "",
    width: 0,
    height: 0,
    disabled: false,
    addEventListener() {},
    removeEventListener() {},
    appendChild(c) { return c; },
    removeChild(c) { return c; },
    insertBefore(c) { return c; },
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    hasAttribute() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getContext() { return null; },
    click() {},
    focus() {},
    closest() { return null; }
  };
  return new Proxy(base, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p === "symbol") return undefined;
      return () => undefined; // any unknown method is a no-op
    },
    set() { return true; }
  });
}

const canvasCache = new Map();

const documentShim = new Proxy(linkedomDocument, {
  get(target, prop) {
    if (prop === "createElement") {
      return (tag) => {
        if (String(tag).toLowerCase() === "canvas") return makeCanvas();
        return target.createElement(tag);
      };
    }
    if (prop === "getElementById") {
      return (id) => {
        if (CANVAS_IDS.has(id)) {
          if (!canvasCache.has(id)) canvasCache.set(id, makeCanvas());
          return canvasCache.get(id);
        }
        return makeStub();
      };
    }
    if (prop === "querySelectorAll") return () => [];
    if (prop === "querySelector") return () => null;
    if (prop === "addEventListener") return () => {};
    const value = target[prop];
    return typeof value === "function" ? value.bind(target) : value;
  }
});

// --- Blob + URL: route SVG blobs through resvg into a SOURCE CANVAS ------------------------
// @napi-rs Image decode from a Buffer via `img.src = buf` draws transparent (sync src bug), but
// drawImage(canvas) scales reliably. So createObjectURL renders the SVG with resvg, builds a
// canvas from the pixels, and stashes it under a token the ImageShim resolves synchronously.
class BlobShim {
  constructor(parts, options = {}) {
    this._parts = parts || [];
    this.type = options.type || "";
  }
  text() { return Promise.resolve(this._parts.join("")); }
}

const blobCanvasRegistry = new Map();
let blobToken = 0;

const URLShim = {
  createObjectURL(blob) {
    if (blob && blob.type === "image/svg+xml") {
      const svg = (blob._parts || []).join("");
      const rendered = new Resvg(svg, { background: "rgba(0,0,0,0)" }).render();
      const src = createCanvas(rendered.width, rendered.height);
      src.getContext("2d").putImageData(
        new NapiImageData(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height),
        0, 0
      );
      const token = "blob:svg:" + (blobToken += 1);
      blobCanvasRegistry.set(token, src);
      return token;
    }
    return "blob:stub";
  },
  revokeObjectURL(token) { blobCanvasRegistry.delete(token); }
};

// --- Image: resolves an SVG-blob token to its source canvas; drawImage unwraps via _img -----
class ImageShim {
  constructor() {
    this._img = null;
    this.onload = null;
    this.onerror = null;
    this.width = 0;
    this.height = 0;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
  }
  set src(value) {
    const canvas = typeof value === "string" ? blobCanvasRegistry.get(value) : null;
    if (canvas) {
      this._img = canvas;
      this.width = this.naturalWidth = canvas.width;
      this.height = this.naturalHeight = canvas.height;
      queueMicrotask(() => this.onload && this.onload());
    } else {
      queueMicrotask(() => this.onerror && this.onerror(new Error("unsupported image src")));
    }
  }
}

function install() {
  global.document = documentShim;
  global.window = global;
  global.DOMParser = DOMParser;
  global.XMLSerializer = XMLSerializer;
  global.Node = Node;
  global.Event = Event;
  global.ImageData = NapiImageData;
  global.Image = ImageShim;
  global.Blob = BlobShim;
  global.URL = URLShim;
  global.location = { search: "", href: "http://localhost/", hash: "", pathname: "/" };
  global.navigator = { userAgent: "node" };
  global.localStorage = {
    _s: new Map(),
    getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
    setItem(k, v) { this._s.set(k, String(v)); },
    removeItem(k) { this._s.delete(k); }
  };
  global.requestAnimationFrame = (cb) => setImmediate(() => cb(performance.now()));
  global.cancelAnimationFrame = () => {};
  if (typeof global.performance === "undefined") global.performance = require("perf_hooks").performance;
}

module.exports = { install, makeCanvas, ImageShim, BlobShim, URLShim, loadImage, NapiImage };
