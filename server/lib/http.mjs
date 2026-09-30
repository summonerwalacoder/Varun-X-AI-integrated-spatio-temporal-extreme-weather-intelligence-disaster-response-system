import { HttpError, bad } from "./util.mjs";

const MAX_BODY = 2 * 1024 * 1024; // 2 MB, enough for a downscaled image reference

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(bad("PAYLOAD_TOO_LARGE", "Request body exceeds 2 MB"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Minimal path router with `:param` segments. */
export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, path, handler, options = {}) {
    const segments = path.split("/").filter(Boolean);
    this.routes.push({ method, segments, handler, options });
    return this;
  }

  get(path, handler, options) {
    return this.add("GET", path, handler, options);
  }

  post(path, handler, options) {
    return this.add("POST", path, handler, options);
  }

  patch(path, handler, options) {
    return this.add("PATCH", path, handler, options);
  }

  delete(path, handler, options) {
    return this.add("DELETE", path, handler, options);
  }

  match(method, pathname) {
    const parts = pathname.split("/").filter(Boolean);
    let methodMismatch = false;
    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(":")) {
          params[seg.slice(1)] = decodeURIComponent(parts[i]);
        } else if (seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (route.method !== method) {
        methodMismatch = true;
        continue;
      }
      return { route, params };
    }
    return methodMismatch ? { methodMismatch: true } : null;
  }

  async handle(req, res, url) {
    const found = this.match(req.method, url.pathname);
    if (!found || !found.route) {
      sendError(res, new HttpError(404, "NOT_FOUND", `No route for ${req.method} ${url.pathname}`));
      return;
    }
    const { route, params } = found;
    const cookies = parseCookies(req.headers.cookie);

    const ctx = {
      req,
      res,
      url,
      method: req.method,
      params,
      query: Object.fromEntries(url.searchParams.entries()),
      cookies,
      setCookie(name, value, opts = {}) {
        appendCookie(res, name, value, opts);
      },
      clearCookie(name) {
        appendCookie(res, name, "", { maxAge: 0 });
      },
      json(status, payload) {
        sendJson(res, status, payload);
      },
    };

    try {
      if (req.method === "POST" || req.method === "PATCH" || req.method === "PUT") {
        const raw = await readBody(req);
        if (raw.length) {
          try {
            ctx.body = JSON.parse(raw.toString("utf8"));
          } catch {
            throw bad("INVALID_JSON", "Request body must be valid JSON");
          }
        } else {
          ctx.body = {};
        }
      } else {
        ctx.body = {};
      }
      const result = await route.handler(ctx);
      if (res.writableEnded) return;
      if (result === undefined) sendJson(res, 204, null);
      else sendJson(res, 200, result);
    } catch (err) {
      sendError(res, err);
    }
  }
}

function appendCookie(res, name, value, opts = {}) {
  const bits = [`${name}=${encodeURIComponent(value)}`];
  bits.push(`Path=${opts.path ?? "/"}`);
  if (opts.maxAge !== undefined) bits.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly !== false) bits.push("HttpOnly");
  if (opts.secure) bits.push("Secure");
  bits.push(`SameSite=${opts.sameSite ?? "Lax"}`);
  const prev = res.getHeader("Set-Cookie");
  const list = prev ? (Array.isArray(prev) ? prev.slice() : [prev]) : [];
  list.push(bits.join("; "));
  res.setHeader("Set-Cookie", list);
}

export function sendJson(res, status, payload) {
  const body = payload === null || payload === undefined ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(body);
}

export function sendError(res, err) {
  if (err instanceof HttpError) {
    sendJson(res, err.status, {
      error: { code: err.code, message: err.message, details: err.details ?? null },
    });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[varun-x] unhandled error:", message, err?.stack ?? "");
  sendJson(res, 500, {
    error: { code: "INTERNAL", message: "Internal server error", details: null },
  });
}
