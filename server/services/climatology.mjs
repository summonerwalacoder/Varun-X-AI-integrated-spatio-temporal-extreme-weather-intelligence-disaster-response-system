/**
 * Climatological baseline from real reanalysis.
 *
 * The baseline is the reference an anomaly is measured against, so a simulated
 * one makes every anomaly statement meaningless. This module builds it from
 * ERA5 reanalysis served by the Open-Meteo archive endpoint, which is the
 * ECMWF/Copernicus 5-year reanalysis product and requires no API key.
 *
 * For a requested calendar window it samples the same days-of-year across the
 * last N complete years, then reports the mean, standard deviation and 95th
 * percentile per variable. The result is cached for a long time because
 * climatology changes slowly.
 *
 * When the archive is unreachable this returns an explicit UNAVAILABLE result.
 * It never substitutes invented numbers: callers decide how to label the gap.
 */

const ARCHIVE_BASE = process.env.VARUNX_ARCHIVE_BASE ?? "https://archive-api.open-meteo.com/v1/archive";
const DAILY_PARAMS = [
  "precipitation_sum",
  "temperature_2m_max",
  "temperature_2m_min",
  "wind_speed_10m_max",
].join(",");

/** Years of reanalysis sampled per baseline. ERA5 runs 1940 to present. */
const HISTORY_YEARS = Number(process.env.VARUNX_CLIMATOLOGY_YEARS ?? 10);
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;

const cache = new Map();
const inFlight = new Map();

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** ERA5 lag: the archive trails real time by about five days. */
const ERA5_LAG_DAYS = 6;

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function percentile(xs, p) {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

function round(v, dp = 3) {
  if (!Number.isFinite(v)) return null;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/**
 * The calendar window a lead time falls in, expressed as the days of year to
 * sample around it. Half-width grows with lead time because a forecast one week
 * out should be compared with a broad seasonal window, not a single day.
 */
function windowFor(validAt) {
  const d = new Date(validAt * 1000);
  const month = d.getUTCMonth();
  // Seasonal half-width in days: one week either side of the date, widened for
  // long lead times so the sample stays seasonally comparable.
  return { month, dayOfYear: Math.floor((Date.UTC(d.getUTCFullYear(), month, d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) };
}

/**
 * Samples ERA5 daily fields for a window centred on `validAt` and reduces them
 * to per-variable climatological statistics.
 */
async function fetchEra5Window(lat, lon, validAt, windowDays) {
  const centre = new Date(validAt * 1000);
  const latest = new Date(Date.now() - ERA5_LAG_DAYS * 86_400_000);
  const firstSampleYear = Math.max(1941, centre.getUTCFullYear() - HISTORY_YEARS + 1);
  const lastSampleYear = Math.min(latest.getUTCFullYear(), centre.getUTCFullYear() - 1);

  // Request one contiguous span per sampled year, so the archive is asked a
  // bounded number of times rather than once per day.
  const jobs = [];
  for (let year = firstSampleYear; year <= lastSampleYear; year++) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));
    // Only the months bracketing the window are needed.
    const mStart = Math.max(0, centre.getUTCMonth() - 1);
    const mEnd = Math.min(11, centre.getUTCMonth() + 1);
    const s = new Date(Date.UTC(year, mStart, 1));
    const e = new Date(Date.UTC(year, mEnd + 1, 0));
    if (s > end || e < start) continue;
    jobs.push({ year, start: iso(s), end: iso(e < latest ? e : latest) });
  }
  if (!jobs.length) return null;

  const accum = {
    precip: [],
    tempMax: [],
    tempMin: [],
    wind: [],
    sampledDays: 0,
  };

  for (const job of jobs) {
    const url =
      `${ARCHIVE_BASE}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&start_date=${job.start}&end_date=${job.end}&daily=${DAILY_PARAMS}&timezone=UTC&wind_speed_unit=kmh`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    let json = null;
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (res.ok) json = await res.json();
    } catch {
      json = null;
    } finally {
      clearTimeout(timer);
    }
    const daily = json?.daily;
    if (!daily?.time) continue;

    for (let i = 0; i < daily.time.length; i++) {
      const day = new Date(`${daily.time[i]}T00:00:00Z`);
      // Keep only days inside the seasonal window.
      const month = day.getUTCMonth();
      const delta = Math.abs(month - centre.getUTCMonth());
      const inWindow = delta <= 1;
      if (!inWindow) continue;
      const p = daily.precipitation_sum?.[i];
      const tMax = daily.temperature_2m_max?.[i];
      const tMin = daily.temperature_2m_min?.[i];
      const w = daily.wind_speed_10m_max?.[i];
      if (Number.isFinite(p)) accum.precip.push(p);
      if (Number.isFinite(tMax)) accum.tempMax.push(tMax);
      if (Number.isFinite(tMin)) accum.tempMin.push(tMin);
      if (Number.isFinite(w)) accum.wind.push(w);
      accum.sampledDays += 1;
    }
  }

  if (!accum.sampledDays) return null;
  return accum;
}

/**
 * Real climatological statistics for a point and lead time.
 * Returns `{ status: "REAL", ... }` on success or `{ status: "UNAVAILABLE" }`
 * when the reanalysis could not be reached. It never invents a value.
 */
export async function getClimatology(lat, lon, validAt = Math.floor(Date.now() / 1000), windowDays = 45) {
  const key = `clim:${lat.toFixed(2)},${lon.toFixed(2)}:${windowDays}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    const accum = await fetchEra5Window(lat, lon, validAt, windowDays);
    if (!accum || accum.sampledDays < 20) {
      const unavailable = {
        status: "UNAVAILABLE",
        mode: "UNAVAILABLE",
        label: "ERA5 reanalysis unreachable: no anomaly can be stated",
        reason: "The reanalysis archive did not return enough samples to build a baseline.",
      };
      cache.set(key, { at: Date.now(), value: unavailable });
      return unavailable;
    }

    const precipMean = mean(accum.precip);
    const precipSd = stdev(accum.precip);
    const tempMean = mean(accum.tempMax.concat(accum.tempMin));
    const tempSd = stdev(accum.tempMax.concat(accum.tempMin));
    const windMean = mean(accum.wind);
    const windSd = stdev(accum.wind);
    const w = windowFor(validAt);

    const value = {
      status: "REAL",
      mode: "ERA5_REANALYSIS",
      label: `ERA5 reanalysis baseline (${MONTHS[w.month]} window, ${HISTORY_YEARS} yr)`,
      source: "ERA5 reanalysis via Open-Meteo archive (ECMWF/Copernicus)",
      sampledDays: accum.sampledDays,
      precipMean: round(precipMean),
      precipSd: round(precipSd),
      precip95: round(percentile(accum.precip, 0.95)),
      tempMean: round(tempMean, 2),
      tempSd: round(tempSd, 2),
      temp95: round(percentile(accum.tempMax.concat(accum.tempMin), 0.95), 2),
      windMean: round(windMean, 2),
      windSd: round(windSd, 2),
      wind95: round(percentile(accum.wind, 0.95), 2),
      uncertainty: {
        temperature: "sampling uncertainty of the multi-year mean, not a forecast error",
        precipitation: "daily accumulation, not a subdaily extreme",
        note: "Baseline is a real reanalysis statistic; the forecast it is compared against is still a model run, not an observation.",
      },
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

/** Reaches the archive and reports whether a real baseline is obtainable. */
export async function probeClimatology(lat = 28.6139, lon = 77.209) {
  const started = Date.now();
  const result = await getClimatology(lat, lon);
  return {
    status: result.status === "REAL" ? "REACHABLE" : "UNAVAILABLE",
    provider: "ERA5 reanalysis (Open-Meteo archive)",
    detail: result.status === "REAL" ? `${result.sampledDays} reanalysis days sampled` : result.reason,
    latencyMs: Date.now() - started,
  };
}
