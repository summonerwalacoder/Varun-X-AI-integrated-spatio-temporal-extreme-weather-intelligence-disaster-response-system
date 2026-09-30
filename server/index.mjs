import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Router } from "./lib/http.mjs";
import { db } from "./lib/db.mjs";
import { register as registerAuth } from "./routes/auth.mjs";
import { register as registerWeather } from "./routes/weather.mjs";
import { register as registerGeo } from "./routes/geo.mjs";
import { register as registerOps } from "./routes/ops.mjs";
import { register as registerSystem } from "./routes/system.mjs";
import { register as registerAssistant } from "./routes/assistant.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(HERE, "..");
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

const router = new Router();
registerAuth(router);
registerWeather(router);
registerGeo(router);
registerOps(router);
registerSystem(router);
registerAssistant(router);

async function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST, safe);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    // SPA fallback for client-side routes
    filePath = join(DIST, "index.html");
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(DIST, "index.html");
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true",
    });
    res.end();
    return;
  }

  if ((req.url ?? "").startsWith("/api/")) {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Bad request");
      return;
    }
    await router.handle(req, res, url);
    return;
  }

  // In development the Vite dev server serves the app and proxies /api here.
  if (process.env.VARUNX_API_ONLY === "1") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("API only");
    return;
  }

  await serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`VARUN-X server listening on http://${HOST}:${PORT}`);
  console.log(`  database : ${dbPath()}`);
  console.log(`  static   : ${DIST}${process.env.VARUNX_API_ONLY === "1" ? " (disabled, API only mode)" : ""}`);
  console.log(`  api      : http://${HOST}:${PORT}/api/...`);
});

function dbPath() {
  return process.env.VARUNX_DB_PATH ?? join(process.cwd(), "varun-x-data", "varun-x.sqlite");
}

const shutdown = () => {
  console.log("\nShutting down VARUN-X server...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
