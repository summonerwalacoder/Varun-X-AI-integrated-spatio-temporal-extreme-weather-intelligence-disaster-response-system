import { requirePermission } from "../lib/auth.mjs";
import { bad, parseCoord } from "../lib/util.mjs";
import { reverseGeocode, searchPlaces } from "../services/weather.mjs";
import { writeAudit } from "../lib/db.mjs";

export function register(router) {
  router.get("/api/geo/reverse", async (ctx) => {
    const user = requirePermission(ctx, "weather:read");
    const lat = parseCoord(ctx.query.lat, "lat");
    const lon = parseCoord(ctx.query.lon, "lon");
    if (lat === null || lon === null) {
      throw bad("INVALID_COORDINATES", "lat and lon are required");
    }
    const place = await reverseGeocode(lat, lon);
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "LOCATION_RESOLVED",
      scope: "GPS",
      detail: place ? `${place.name ?? ""} ${place.state ?? ""}`.trim() : "unresolved",
      result: place ? "OK" : "UNRESOLVED",
      ip: ctx.req.socket?.remoteAddress,
    });
    return {
      place,
      origin: "GPS",
      notice: place
        ? "Coordinate resolved from the device location, not from an IP address."
        : "The device location could not be resolved to a place name. Coordinates are still used for the forecast.",
    };
  });

  router.get("/api/geo/search", async (ctx) => {
    const user = requirePermission(ctx, "weather:read");
    const q = String(ctx.query.q ?? "").trim();
    if (q.length < 2) throw bad("QUERY_TOO_SHORT", "Type at least two characters");
    const results = await searchPlaces(q);
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "LOCATION_SEARCHED",
      scope: "SELECTED LOCATION",
      detail: q,
      result: `${results.length} result(s)`,
      ip: ctx.req.socket?.remoteAddress,
    });
    return { results, origin: "SELECTED LOCATION" };
  });
}
