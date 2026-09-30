import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "node:crypto";

export const nowSec = () => Math.floor(Date.now() / 1000);
export const uid = (prefix) => `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
export const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const round = (v, d = 2) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashSecret(secret, salt = randomBytes(16).toString("hex")) {
  const derived = scryptSync(secret, salt, 32).toString("hex");
  return { salt, hash: derived };
}

export function verifySecret(secret, salt, expectedHash) {
  if (!salt || !expectedHash) return false;
  const derived = scryptSync(secret, salt, 32);
  const expected = Buffer.from(expectedHash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Deterministic PRNG (mulberry32) so every simulation run is reproducible. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Box-Muller normal deviate from a uniform generator. */
export function gaussian(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const bad = (code, message, details) => new HttpError(400, code, message, details);
export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, "UNAUTHENTICATED", message);
export const forbidden = (message = "Insufficient role permissions") =>
  new HttpError(403, "FORBIDDEN", message);
export const notFound = (message = "Record not found") => new HttpError(404, "NOT_FOUND", message);
export const conflict = (message = "Request could not be completed") =>
  new HttpError(409, "CONFLICT", message);

/**
 * Strictly parses a coordinate from a query string or JSON body.
 *
 * `Number()` alone is unsafe here: `Number(null)` and `Number("")` are both 0,
 * so an absent coordinate would silently become latitude 0 / longitude 0 and
 * the pipeline would analyse a real place in the Gulf of Guinea while the user
 * believes it has no location at all. Absent means absent.
 */
export function parseCoord(value, axis) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  if (typeof value === "object") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const limit = axis === "lat" ? 90 : 180;
  if (n < -limit || n > limit) return null;
  return n;
}
