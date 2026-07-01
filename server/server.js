// Vector Accuracy Studio — Node server.
//   GET  /                serves the static browser app (app/)
//   POST /trace           body = raw PNG bytes -> { svg, engine, edge, mae, hot, paths, ms }
// Tracing runs in a worker pool on the platform-deterministic engine (matches the browser).
// Listens on $PORT (Cloud Run) or 8080.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");

const APP_DIR = path.join(__dirname, "..", "app");
const PORT = Number(process.env.PORT) || 8080;
const POOL_SIZE = Math.max(1, Math.min(4, (require("os").cpus().length || 2) - 1));

// ---- worker pool --------------------------------------------------------------------------
class Pool {
  constructor(size, script) {
    this.script = script;
    this.idle = [];
    this.queue = [];
    this.pending = new Map();
    this.seq = 0;
    for (let i = 0; i < size; i += 1) this._spawn();
  }
  _spawn() {
    const w = new Worker(this.script);
    let ready = false;
    w.on("message", (msg) => {
      if (!ready && msg && msg.ready) { ready = true; this._release(w); return; }
      const cb = this.pending.get(msg.id);
      if (cb) { this.pending.delete(msg.id); this._release(w); cb(msg); }
    });
    w.on("error", (err) => {
      for (const [id, cb] of this.pending) { this.pending.delete(id); cb({ id, ok: false, error: String(err) }); }
      // replace the dead worker
      this.workers = (this.workers || []).filter((x) => x !== w);
      this._spawn();
    });
    (this.workers = this.workers || []).push(w);
  }
  _release(w) {
    const next = this.queue.shift();
    if (next) next(w); else this.idle.push(w);
  }
  _acquire() {
    return new Promise((resolve) => {
      const w = this.idle.pop();
      if (w) resolve(w); else this.queue.push(resolve);
    });
  }
  async run(payload) {
    const w = await this._acquire();
    const id = (this.seq += 1);
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      w.postMessage({ id, ...payload });
    });
  }
}

const pool = new Pool(POOL_SIZE, path.join(__dirname, "auto-worker.js"));

// ---- static file serving ------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".ico": "image/x-icon"
};
function serveStatic(req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const full = path.normalize(path.join(APP_DIR, rel));
  if (!full.startsWith(APP_DIR)) { res.writeHead(403); res.end("forbidden"); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  });
}

// ---- request handler ----------------------------------------------------------------------
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") { res.writeHead(200); res.end("ok"); return; }

  if (req.method === "POST" && req.url.split("?")[0] === "/trace") {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => { chunks.push(c); size += c.length; if (size > 25 * 1024 * 1024) req.destroy(); });
    req.on("end", async () => {
      const png = Buffer.concat(chunks);
      if (!png.length) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "empty body" })); return; }
      const t0 = Date.now();
      const r = await pool.run({ png });
      if (!r.ok) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: r.error })); return; }
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({
        svg: r.svg, engine: r.engine, paths: r.paths,
        edge: r.edge, mae: r.mae, hot: r.hot,
        traceMs: r.ms, totalMs: Date.now() - t0
      }));
    });
    return;
  }

  if (req.method === "GET") { serveStatic(req, res); return; }
  res.writeHead(405); res.end("method not allowed");
});

server.listen(PORT, () => console.log(`vector-accuracy-studio server on :${PORT} (pool ${POOL_SIZE})`));
