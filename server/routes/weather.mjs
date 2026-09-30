import { requirePermission } from "../lib/auth.mjs";
import { bad, nowSec, parseCoord } from "../lib/util.mjs";
import { fetchForecast, probeWeatherProvider, providerInfo } from "../services/weather.mjs";
import { getAnalysis, getRefinement, domainFor, REFINEMENT_KINDS } from "../services/intelligence.mjs";
import { WMO_CODES } from "../services/codes.mjs";
import { db, writeAudit } from "../lib/db.mjs";

function coords(ctx) {
  const lat = parseCoord(ctx.query.lat, "lat");
  const lon = parseCoord(ctx.query.lon, "lon");
  if (lat === null) throw bad("INVALID_LATITUDE", "lat must be a number between -90 and 90");
  if (lon === null) throw bad("INVALID_LONGITUDE", "lon must be a number between -180 and 180");
  return { lat, lon };
}

const ORIGINS = new Set(["GPS", "SELECTED LOCATION"]);

/**
 * Provenance of the requested coordinates.
 *
 * The client declares whether the point came from the device geolocator or
 * from an explicit user selection. Coordinates alone cannot tell them apart
 * (a selected place also resolves to lat/lon), so the default is the
 * conservative "SELECTED LOCATION" rather than claiming GPS.
 */
function origin(ctx) {
  const raw = String(ctx.query.origin ?? "").trim().toUpperCase();
  if (!raw) return "SELECTED LOCATION";
  if (!ORIGINS.has(raw)) {
    throw bad("INVALID_ORIGIN", "origin must be GPS or SELECTED LOCATION");
  }
  return raw;
}

export function register(router) {
  router.get("/api/weather", async (ctx) => {
    const user = requirePermission(ctx, "weather:read");
    const { lat, lon } = coords(ctx);
    const payload = await fetchForecast(lat, lon);
    const place = ctx.query.place ? String(ctx.query.place) : null;
    if (place) {
      writeAudit({
        user: { id: user.id, label: user.name, role: user.role },
        action: "WEATHER_VIEWED",
        scope: "SELECTED LOCATION",
        detail: place,
        result: "OK",
        ip: ctx.req.socket?.remoteAddress,
      });
    }
    return {
      ...payload,
      origin: origin(ctx),
      placeLabel: place,
      requestedBy: { id: user.id, role: user.role },
      serverTime: nowSec(),
    };
  });

  router.get("/api/weather/codes", (ctx) => {
    requirePermission(ctx, "weather:read");
    return { codes: WMO_CODES };
  });

  router.get("/api/weather/provider", async (ctx) => {
    requirePermission(ctx, "weather:read");
    return { provider: providerInfo(), health: await probeWeatherProvider() };
  });

  router.get("/api/analysis", async (ctx) => {
    const user = requirePermission(ctx, "weather:read");
    const { lat, lon } = coords(ctx);
    const place = ctx.query.place ? String(ctx.query.place) : null;
    const analysis = await getAnalysis(lat, lon, place);
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "ANALYSIS_VIEWED",
      scope: "VARUN-X AI OUTPUT",
      detail: place ?? `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
      result: `risk:${analysis.risk.level}`,
      ip: ctx.req.socket?.remoteAddress,
    });
    return { ...analysis, origin: origin(ctx) };
  });

  router.get("/api/analysis/refine", async (ctx) => {
    const user = requirePermission(ctx, "weather:read");
    const { lat, lon } = coords(ctx);
    const hours = Number(ctx.query.hours ?? 0);
    const kind = String(ctx.query.kind ?? "precip");
    if (!REFINEMENT_KINDS.includes(kind)) {
      throw bad("INVALID_FIELD", `kind must be one of ${REFINEMENT_KINDS.join(", ")}`);
    }
    const refinement = await getRefinement(lat, lon, hours, kind);
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "REFINEMENT_REQUESTED",
      scope: `${kind}@T${hours >= 0 ? "+" : ""}${hours}h`,
      result: "OK",
      ip: ctx.req.socket?.remoteAddress,
    });
    return refinement;
  });

  router.get("/api/analysis/domain", async (ctx) => {
    const user = requirePermission(ctx, "weather:read");
    const { lat, lon } = coords(ctx);
    const domain = await domainFor(lat, lon);
    return { ...domain, requestedByRole: user.role };
  });
}
