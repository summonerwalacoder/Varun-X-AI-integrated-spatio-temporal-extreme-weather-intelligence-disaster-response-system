/**
 * Live weather access.
 *
 * All upstream calls happen here, on the server. Credentials, when a keyed
 * provider is configured, are read from environment variables and never
 * returned to the browser. No synthetic fallback exists: when the upstream
 * fails the caller receives an explicit UNAVAILABLE state.
 */

const FORECAST_BASE = process.env.VARUNX_WEATHER_BASE ?? "https://api.open-meteo.com/v1";
const GEOCODE_BASE = process.env.VARUNX_GEOCODE_BASE ?? "https://geocoding-api.open-meteo.com/v1";
const NOMINATIM = process.env.VARUNX_REVERSE_GEOCODE_BASE ?? "https://nominatim.openstreetmap.org";
const API_KEY = process.env.WEATHER_API_KEY ?? "";

const CURRENT_PARAMS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "is_day",
  "precipitation",
  "rain",
  "showers",
  "snowfall",
  "weather_code",
  "cloud_cover",
  "pressure_msl",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "visibility",
  "uv_index",
].join(",");

const HOURLY_PARAMS = [
  "temperature_2m",
  "precipitation_probability",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
  "wind_gusts_10m",
  "relative_humidity_2m",
  "pressure_msl",
].join(",");

const DAILY_PARAMS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_probability_max",
  "precipitation_sum",
  "wind_speed_10m_max",
  "uv_index_max",
  "sunrise",
  "sunset",
].join(",");

const cache = new Map();
const TTL_MS = 60_000;

function key(...parts) {
  return parts.join("|");
}

function cacheGet(k) {
  const hit = cache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(k);
    return null;
  }
  return hit.value;
}

function cacheSet(k, value) {
  cache.set(k, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
}

async function upstream(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": process.env.VARUNX_USER_AGENT ?? "VARUN-X/1.0 (research prototype)",
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
    });
    if (!res.ok) {
      const err = new Error(`Upstream responded ${res.status}`);
      err.upstreamStatus = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function providerInfo() {
  return {
    name: "Open-Meteo",
    kind: "NWP FORECAST MODEL OUTPUT",
    endpoint: FORECAST_BASE,
    keyed: API_KEY.length > 0,
    documentation: "https://open-meteo.com/en/docs",
    note: API_KEY
      ? "Keyed provider configured. The key is held server-side only."
      : "Keyless public API. The browser never holds provider credentials.",
  };
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {{days?: number}} opts
 */
export async function fetchForecast(lat, lon, { days = 7 } = {}) {
  const k = key("forecast", lat.toFixed(3), lon.toFixed(3), days);
  const cached = cacheGet(k);
  if (cached) return cached;

  const url = new URL(`${FORECAST_BASE}/forecast`);
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lon.toFixed(4));
  url.searchParams.set("current", CURRENT_PARAMS);
  url.searchParams.set("hourly", HOURLY_PARAMS);
  url.searchParams.set("daily", DAILY_PARAMS);
  url.searchParams.set("forecast_days", String(Math.min(16, Math.max(1, days))));
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");

  const raw = await upstream(url.toString());
  const payload = {
    ...raw,
    _provenance: {
      category: "FORECAST",
      source: "Open-Meteo NWP model output",
      provider: "Open-Meteo",
      retrievedAt: Math.floor(Date.now() / 1000),
      modelRun: raw.current?.time ? null : null,
      resolution: "approximately 11 km model grid",
      units: {
        temperature: "degC",
        wind: "km/h",
        precipitation: "mm",
        pressure: "hPa",
        visibility: "m",
      },
      disclaimer: "Model forecast output. Not an observation and not an official warning.",
    },
  };
  cacheSet(k, payload);
  return payload;
}

/** Multi-point request used to build the NWP field feeding the AI stages. */
export async function fetchForecastField(lats, lons, { days = 5 } = {}) {
  const k = key("field", lats.map((v) => v.toFixed(3)).join(","), lons.map((v) => v.toFixed(3)).join(","), days);
  const cached = cacheGet(k);
  if (cached) return cached;

  const url = new URL(`${FORECAST_BASE}/forecast`);
  url.searchParams.set("latitude", lats.map((v) => v.toFixed(4)).join(","));
  url.searchParams.set("longitude", lons.map((v) => v.toFixed(4)).join(","));
  url.searchParams.set("hourly", "precipitation,temperature_2m,wind_speed_10m,wind_gusts_10m,pressure_msl,relative_humidity_2m");
  url.searchParams.set("forecast_days", String(days));
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");

  const raw = await upstream(url.toString(), { timeoutMs: 20000 });
  const list = Array.isArray(raw) ? raw : [raw];
  const payload = {
    retrievedAt: Math.floor(Date.now() / 1000),
    points: list,
  };
  cacheSet(k, payload);
  return payload;
}

export async function reverseGeocode(lat, lon) {
  const k = key("rev", lat.toFixed(4), lon.toFixed(4));
  const cached = cacheGet(k);
  if (cached) return cached;
  let place = null;
  try {
    const url = new URL(`${NOMINATIM}/reverse`);
    url.searchParams.set("lat", lat.toFixed(5));
    url.searchParams.set("lon", lon.toFixed(5));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("accept-language", "en");
    url.searchParams.set("zoom", "10");
    const j = await upstream(url.toString());
    const a = j.address ?? {};
    place = {
      name: a.city ?? a.town ?? a.village ?? a.county ?? a.state ?? "Detected location",
      district: a.county ?? a.state_district ?? null,
      state: a.state ?? null,
      country: a.country ?? null,
      lat,
      lon,
      source: "reverse",
      provider: "OpenStreetMap Nominatim",
    };
  } catch {
    place = null;
  }
  if (place) cacheSet(k, place);
  return place;
}

export async function searchPlaces(query) {
  const url = new URL(`${GEOCODE_BASE}/search`);
  url.searchParams.set("name", query);
  url.searchParams.set("count", "8");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const j = await upstream(url.toString());
  return (j.results ?? []).map((r) => ({
    name: r.name,
    admin1: r.admin1 ?? null,
    admin2: r.admin2 ?? null,
    country: r.country ?? null,
    country_code: r.country_code ?? null,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

/** Health probe used by the system status page. Never fakes a result. */
export async function probeWeatherProvider() {
  const started = Date.now();
  try {
    await fetchForecast(19.076, 72.877, { days: 1 });
    return { reachable: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { reachable: false, latencyMs: Date.now() - started, error: err.message };
  }
}
