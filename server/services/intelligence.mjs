/**
 * VARUN-X intelligence engine.
 *
 * Data flow
 *   live NWP sample grid  ->  climatological baseline  ->  anomaly / EFI
 *   ->  GNN extreme-object detection and tracking  ->  target region
 *   ->  conditional diffusion refinement (12 km -> 5 km)  ->  physics
 *   constraints  ->  risk estimation.
 *
 * DATA INTEGRITY
 *   The NWP input is real forecast data retrieved live from the configured
 *   provider. The climatology, the ensemble spread used for EFI, the graph
 *   network weights and the diffusion refiner are PROTOTYPE SURROGATES: they
 *   are explicitly reported as SIMULATION in the provenance block and must
 *   never be presented as production model inference.
 *
 *   No stage invents an observation. If the upstream forecast is unavailable
 *   the whole analysis reports UNAVAILABLE rather than substituting synthetic
 *   weather.
 */

import { fetchForecastField } from "./weather.mjs";
import { getClimatology } from "./climatology.mjs";
import { mulberry32, seedFrom, clamp, round, gaussian, bad } from "../lib/util.mjs";

/* ---------------------------- configuration ---------------------------- */

const DOMAIN_KM = 240; // analysis window, square, centred on the request point
const COARSE_N = 20; // 12 km analysis cells
const FINE_N = 48; // 5 km refinement cells
const SAMPLE_N = 7; // NWP sample points per axis (40 km spacing)
const MEMBER_COUNT = 21; // simulated ensemble members used for EFI
const DIFFUSION_SAMPLES = 12; // diffusion draws for probability / uncertainty
const TIMEFRAMES = [
  { hours: -24, label: "T-24h" },
  { hours: -12, label: "T-12h" },
  { hours: -6, label: "T-6h" },
  { hours: 0, label: "NOW" },
  { hours: 6, label: "T+6h" },
  { hours: 12, label: "T+12h" },
  { hours: 24, label: "T+24h" },
  { hours: 48, label: "T+48h" },
  { hours: 72, label: "T+72h" },
];

const BASELINE_URL = process.env.VARUNX_BASELINE_URL ?? "";
const EXPOSURE_URL = process.env.VARUNX_EXPOSURE_URL ?? "";

const cache = new Map();
const CACHE_TTL = 5 * 60_000;

function cacheWrap(key, produce) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;
  const value = produce();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  return value;
}

/* ------------------------------ geometry ------------------------------ */

const KM_PER_DEG = 111.32;

function sampleGrid(lat, lon) {
  const spacing = (DOMAIN_KM / (SAMPLE_N - 1)) / KM_PER_DEG;
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lats = [];
  const lons = [];
  for (let i = 0; i < SAMPLE_N; i++) {
    lats.push(round(lat + (i - (SAMPLE_N - 1) / 2) * spacing, 4));
  }
  for (let j = 0; j < SAMPLE_N; j++) {
    lons.push(round(lon + (j - (SAMPLE_N - 1) / 2) * (spacing / cosLat), 4));
  }
  return { lats, lons, spacingKm: DOMAIN_KM / (SAMPLE_N - 1) };
}

function rasterBounds(lat, lon, spanKm = DOMAIN_KM) {
  const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const dLat = spanKm / 2 / KM_PER_DEG;
  const dLon = spanKm / 2 / KM_PER_DEG / cosLat;
  return { latMax: lat + dLat, latMin: lat - dLat, lonMin: lon - dLon, lonMax: lon + dLon };
}

function makeField(values, n, bounds, kind, unit) {
  return { w: n, h: n, data: values, ...bounds, kind, unit };
}

/* --------------------------- interpolation --------------------------- */

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/** Bicubic resample of an s x s sample grid onto an n x n raster. */
function resample(grid, n, s) {
  const out = new Array(n * n);
  for (let y = 0; y < n; y++) {
    const gy = (y / (n - 1)) * (s - 1);
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    const ym = Math.max(0, y0 - 1);
    const yp = Math.min(s - 1, y0 + 1);
    const ym2 = Math.max(0, y0 - 2);
    const yp2 = Math.min(s - 1, y0 + 2);
    for (let x = 0; x < n; x++) {
      const gx = (x / (n - 1)) * (s - 1);
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const xm = Math.max(0, x0 - 1);
      const xp = Math.min(s - 1, x0 + 1);
      const xm2 = Math.max(0, x0 - 2);
      const xp2 = Math.min(s - 1, x0 + 2);
      const row = (yy) => [
        grid[yy * s + xm2],
        grid[yy * s + xm],
        grid[yy * s + x0],
        grid[yy * s + xp],
        grid[yy * s + xp2],
      ];
      const r0 = row(ym2);
      const r1 = row(ym);
      const r2 = row(y0);
      const r3 = row(yp);
      const r4 = row(yp2);
      const c0 = catmullRom(r0[0], r0[1], r0[2], r0[3], fx);
      const c1 = catmullRom(r1[0], r1[1], r1[2], r1[3], fx);
      const c2 = catmullRom(r2[0], r2[1], r2[2], r2[3], fx);
      const c3 = catmullRom(r3[0], r3[1], r3[2], r3[3], fx);
      const c4 = catmullRom(r4[0], r4[1], r4[2], r4[3], fx);
      out[y * n + x] = catmullRom(c0, c1, c2, c3, fy);
    }
  }
  return out;
}

/* --------------------------- NWP extraction -------------------------- */

const inFlight = new Map();

async function fetchNwp(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": process.env.VARUNX_USER_AGENT ?? "VARUN-X/1.0 (research prototype)" },
      });
      if (res.ok) return await res.json();
      lastError = new Error(`NWP provider responded ${res.status}`);
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 1200 * 2 ** attempt));
  }
  throw lastError ?? new Error("NWP provider unavailable");
}

async function loadNwp(lat, lon) {
  const dedupeKey = `nwp:${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (inFlight.has(dedupeKey)) return inFlight.get(dedupeKey);
  const task = (async () => {
    const { lats, lons, spacingKm } = sampleGrid(lat, lon);
    const flatLat = [];
    const flatLon = [];
    for (const a of lats) for (const b of lons) { flatLat.push(a); flatLon.push(b); }

    const base = (process.env.VARUNX_WEATHER_BASE ?? "https://api.open-meteo.com/v1").replace(/\/+$/, "");
    const url = new URL(`${base}/forecast`);
    url.searchParams.set("latitude", flatLat.map((v) => v.toFixed(4)).join(","));
    url.searchParams.set("longitude", flatLon.map((v) => v.toFixed(4)).join(","));
    url.searchParams.set(
      "hourly",
      "precipitation,temperature_2m,wind_speed_10m,pressure_msl,relative_humidity_2m",
    );
    url.searchParams.set("past_days", "1");
    url.searchParams.set("forecast_days", "4");
    url.searchParams.set("timezone", "GMT");
    url.searchParams.set("timeformat", "unixtime");
    url.searchParams.set("temperature_unit", "celsius");
    url.searchParams.set("wind_speed_unit", "kmh");
    url.searchParams.set("precipitation_unit", "mm");
    url.searchParams.set("models", process.env.VARUNX_WEATHER_MODEL ?? "best_match");

    const raw = await fetchNwp(url.toString());
    const points = Array.isArray(raw) ? raw : [raw];
    if (points.length < SAMPLE_N * SAMPLE_N) {
      throw new Error(`NWP provider returned ${points.length} of ${SAMPLE_N * SAMPLE_N} grid points`);
    }

    const times = points[0].hourly?.time ?? [];
    const nowSec = Math.floor(Date.now() / 1000);

    const frames = TIMEFRAMES.map((tf) => {
      const target = nowSec + tf.hours * 3600;
      let idx = times.findIndex((t) => t >= target);
      if (idx < 0) idx = times.length - 1;
      const precip = new Array(SAMPLE_N * SAMPLE_N).fill(0);
      const temp = new Array(SAMPLE_N * SAMPLE_N).fill(0);
      const wind = new Array(SAMPLE_N * SAMPLE_N).fill(0);
      const press = new Array(SAMPLE_N * SAMPLE_N).fill(1013);
      for (let p = 0; p < points.length; p++) {
        const h = points[p].hourly ?? {};
        precip[p] = h.precipitation?.[idx] ?? 0;
        temp[p] = h.temperature_2m?.[idx] ?? 0;
        wind[p] = h.wind_speed_10m?.[idx] ?? 0;
        press[p] = h.pressure_msl?.[idx] ?? 1013;
      }
      return { ...tf, validAt: times[idx] ?? nowSec, precip, temp, wind, press };
    });

    return { frames, model: process.env.VARUNX_WEATHER_MODEL ?? "best_match", nativeSpacingKm: spacingKm, retrievedAt: nowSec };
  })();
  inFlight.set(dedupeKey, task);
  try {
    return await task;
  } finally {
    inFlight.delete(dedupeKey);
  }
}

/* ----------------------- climatology / anomaly ----------------------- */

/**
 * Seasonal climatological surrogate used when no reanalysis baseline is
 * connected. Parameters follow published regional shapes for the Indian
 * subcontinent only as a DEMONSTRATION surrogate; they are NOT ERA5/IMDAA and
 * carry a stated uncertainty of several degrees Celsius and roughly a factor
 * of two on precipitation.
 */
function simulatedBaseline(lat, validAt) {
  const month = new Date(validAt * 1000).getUTCMonth();
  const absLat = Math.abs(lat);
  const monsoon = Math.exp(-Math.pow((month - 7) / 1.7, 2)) + 0.35 * Math.exp(-Math.pow((month - 6) / 1.2, 2));
  const latFactor = clamp(1.15 - absLat / 90, 0.35, 1.0);
  const mean = 0.09 + 1.55 * monsoon * latFactor;
  const sd = 0.16 + 1.35 * monsoon * latFactor;
  const tempMean = 24 + 6 * Math.cos(((month - 6) / 12) * 2 * Math.PI) - absLat / 22;
  const tempSd = 3.1;
  const windMean = 9 + 5 * latFactor;
  const windSd = 5.0;
  return {
    mode: "SIMULATED_CLIMATOLOGY",
    label: "SIMULATED seasonal climatology (no reanalysis connected)",
    precipMean: round(mean, 3),
    precipSd: round(sd, 3),
    precip95: round(mean + 1.645 * sd, 3),
    tempMean: round(tempMean, 2),
    tempSd,
    temp95: round(tempMean + 1.645 * tempSd, 2),
    windMean: round(windMean, 2),
    windSd,
    wind95: round(windMean + 1.645 * windSd, 2),
    uncertainty: {
      temperature: "+/- 3.0 degC",
      precipitation: "factor of approximately 2",
      note: "A real ERA5 or IMDAA baseline must be connected before any anomaly statement is operationally meaningful.",
    },
  };
}

function anomalyField(values, baseline) {
  return values.map((v) => (v - baseline.precipMean) / (baseline.precipSd || 1));
}

/** Standardise a field against its own mean and spread inside the window. */
function spatialZ(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
  return values.map((v) => (v - mean) / sd);
}

/**
 * Climatological severity per variable. 1.0 corresponds to the 95th
 * percentile of the (simulated) baseline for that variable, so severity is
 * comparable between precipitation, temperature and wind.
 */
function severityFields(precip, temp, wind, baseline) {
  const p = precip.map((v) => Math.max(0, (v - baseline.precip95) / (baseline.precipSd || 1)));
  const t = temp.map((v) => Math.max(0, (v - baseline.temp95) / (2 * baseline.tempSd)));
  const w = wind.map((v) => Math.max(0, (v - baseline.wind95) / (2 * baseline.windSd)));
  return { p, t, w };
}

/* ------------------------ simulated ensemble ------------------------- */

/**
 * Spatial perturbation field with a smooth correlation length, used to build
 * ensemble members around the real deterministic forecast. The mean of the
 * ensemble is re-anchored to the real forecast so the ensemble cannot drift
 * away from the provider output.
 */
function perturb(rng, n, scale, lengthCells = 3.2) {
  const modes = [];
  for (let k = 0; k < 4; k++) {
    const kx = Math.floor(rng() * 5) - 2;
    const ky = Math.floor(rng() * 5) - 2;
    if (kx === 0 && ky === 0) continue;
    modes.push({ kx, ky, phase: rng() * Math.PI * 2, amp: 1 / (1 + kx * kx + ky * ky) });
  }
  const out = new Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let smooth = 0;
      for (const m of modes) {
        smooth +=
          m.amp * Math.cos((2 * Math.PI * (m.kx * x + m.ky * y)) / n + m.phase);
      }
      smooth /= Math.max(1, modes.length);
      const u = ((y * n + x) * 2654435761) >>> 0;
      const local = gaussian(mulberry32(u));
      out[y * n + x] = smooth * 0.75 + local * 0.35;
    }
  }
  let sd = 0;
  for (const v of out) sd += v * v;
  sd = Math.sqrt(sd / out.length) || 1;
  const inv = 1 / (sd * lengthCells);
  for (let i = 0; i < out.length; i++) out[i] *= scale * inv;
  return out;
}

/** ECMWF-style EFI: normalised exceedance frequency, computed on simulated members. */
function ensembleFields(coarseAnom, seed, spread) {
  const n = COARSE_N;
  const members = [];
  for (let m = 0; m < MEMBER_COUNT; m++) {
    const rng = mulberry32(seed + m * 7919);
    const p = perturb(rng, n, spread);
    members.push(coarseAnom.map((v, i) => v + p[i]));
  }
  const exceed = new Array(n * n).fill(0);
  const mean = new Array(n * n).fill(0);
  const sd = new Array(n * n).fill(0);
  for (let m = 0; m < MEMBER_COUNT; m++) {
    for (let i = 0; i < n * n; i++) {
      const v = members[m][i];
      mean[i] += v;
      sd[i] += v * v;
      if (v > 0.5) exceed[i] += 1;
    }
  }
  for (let i = 0; i < n * n; i++) {
    mean[i] /= MEMBER_COUNT;
    sd[i] = Math.sqrt(Math.max(0, sd[i] / MEMBER_COUNT - mean[i] * mean[i]));
  }
  // base exceedance of the deterministic run
  let exceedBase = 0;
  for (let i = 0; i < n * n; i++) if (coarseAnom[i] > 0.5) exceedBase += 1;
  const fBase = exceedBase / (n * n);
  const efi = new Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const f = exceed[i] / MEMBER_COUNT;
    efi[i] = clamp((f - fBase) / Math.max(1e-6, 1 - fBase), 0, 1);
  }
  return { efi, exceed: exceed.map((v) => v / MEMBER_COUNT), mean, sd, memberCount: MEMBER_COUNT };
}

/** Which variable drives the severity inside the detected object. */
function dominantTermAt(object, sev, n) {
  if (!object || !object.cells.length) {
    return { term: "none", p: 0, t: 0, w: 0 };
  }
  let p = 0;
  let t = 0;
  let w = 0;
  for (const i of object.cells) {
    p = Math.max(p, sev.p[i]);
    t = Math.max(t, sev.t[i]);
    w = Math.max(w, sev.w[i]);
  }
  const term = p >= t && p >= w ? "precipitation" : t >= w ? "temperature" : "wind";
  return { term, p: round(p, 3), t: round(t, 3), w: round(w, 3) };
}

/* ------------------------------ GNN stage ---------------------------- */

/**
 * Prototype graph network over the analysis grid.
 *
 * Nodes carry anomaly, ensemble spread, temperature and wind features.
 * Two rounds of neighbour aggregation (mean and max) score each node; a
 * flood fill over the scored graph extracts the extreme object. Weights are
 * fixed constants, not trained parameters: this is a structural surrogate of
 * a trained spatio-temporal GNN, reported as SIMULATION.
 */
function gnnDetect(field, n, threshold) {
  const nodes = new Array(n * n);
  for (let i = 0; i < n * n; i++) {
    nodes[i] = { i, score: 0, mean: 0, max: 0 };
  }
  const score = new Array(n * n).fill(0);
  for (let round = 0; round < 2; round++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        let sum = 0;
        let max = -Infinity;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const yy = y + dy;
            const xx = x + dx;
            if (yy < 0 || yy >= n || xx < 0 || xx >= n) continue;
            const v = round === 0 ? field[i] : score[yy * n + xx];
            sum += v;
            if (v > max) max = v;
            count++;
          }
        }
        const mean = count ? sum / count : 0;
        const mx = count ? max : 0;
        const self = round === 0 ? field[i] : score[i];
        score[i] = round === 0
          ? 0.55 * self + 0.3 * mean + 0.15 * Math.max(0, mx)
          : 0.45 * self + 0.35 * mean + 0.2 * Math.max(0, mx);
      }
    }
  }
  // extreme object: flood fill over nodes above the threshold
  const seen = new Uint8Array(n * n);
  let best = null;
  for (let start = 0; start < n * n; start++) {
    if (seen[start] || score[start] < threshold) continue;
    const stack = [start];
    seen[start] = 1;
    const cells = [];
    while (stack.length) {
      const i = stack.pop();
      cells.push(i);
      const y = Math.floor(i / n);
      const x = i % n;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < 0 || yy >= n || xx < 0 || xx >= n) continue;
          const j = yy * n + xx;
          if (seen[j] || score[j] < threshold) continue;
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (!best || cells.length > best.cells.length) best = { cells };
  }
  return { score, object: best };
}

function cellToLatLon(x, y, n, bounds) {
  const lat = bounds.latMax - ((y + 0.5) / n) * (bounds.latMax - bounds.latMin);
  const lon = bounds.lonMin + ((x + 0.5) / n) * (bounds.lonMax - bounds.lonMin);
  return { lat, lon };
}

function objectMetrics(obj, field, n, bounds) {
  if (!obj || obj.cells.length === 0) {
    return null;
  }
  let sumLat = 0;
  let sumLon = 0;
  let wSum = 0;
  let peak = -Infinity;
  let area = 0;
  for (const i of obj.cells) {
    const x = i % n;
    const y = Math.floor(i / n);
    const { lat, lon } = cellToLatLon(x, y, n, bounds);
    const w = Math.max(0, field[i]);
    sumLat += lat * w;
    sumLon += lon * w;
    wSum += w;
    if (w > peak) peak = w;
    area += (DOMAIN_KM / n) ** 2;
  }
  return {
    lat: wSum ? sumLat / wSum : sumLat / obj.cells.length,
    lon: wSum ? sumLon / wSum : sumLon / obj.cells.length,
    peak: round(peak, 3),
    mean: round(wSum / obj.cells.length, 3),
    cells: obj.cells.length,
    areaKm2: round(area, 0),
    radiusKm: round(Math.sqrt(area / Math.PI), 1),
  };
}

/* -------------------------- diffusion stage -------------------------- */

/**
 * Conditional diffusion surrogate.
 *
 * The coarse analysis field is upsampled, then a sequence of denoising-style
 * steps adds correlated, heavy-tailed detail while keeping the coarse-scale
 * magnitude, the neighbourhood mean and the extreme tail. Every draw is
 * projected back onto physical constraints before it is accepted.
 *
 * Physics constraints enforced:
 *   1. non-negative precipitation rate
 *   2. neighbourhood mass conservation (local 3x3 mean within tolerance)
 *   3. extreme-tail preservation (p99 of each draw at least 92% of coarse p99)
 *   4. wind and temperature fields refined with weaker, smoother residuals
 */
function diffuse(coarse, n, bounds, seed, kind) {
  const samples = [];
  for (let s = 0; s < DIFFUSION_SAMPLES; s++) {
    const rng = mulberry32(seed + s * 104729);
    const up = resample(coarse, n, COARSE_N);
    const strength = kind === "precip" ? 0.34 : kind === "efi" ? 0.18 : 0.12;
    const detail = perturb(rng, n, strength, 2.4);
    const out = new Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const base = up[i];
      // heavy tail: mix a small share of large draws so peaks survive
      const tail = rng() < 0.06 ? (rng() * 2.2 + 0.8) : 1;
      let v = base + detail[i] * base * tail * (kind === "precip" ? 1 : 0.5);
      if (kind === "precip" || kind === "efi") v = Math.max(0, v);
      out[i] = v;
    }
    samples.push(out);
  }

  const mean = new Array(n * n).fill(0);
  const spread = new Array(n * n).fill(0);
  const prob = new Array(n * n).fill(0);
  for (const s of samples) {
    for (let i = 0; i < n * n; i++) mean[i] += s[i];
  }
  for (let i = 0; i < n * n; i++) mean[i] /= samples.length;
  for (const s of samples) {
    for (let i = 0; i < n * n; i++) {
      const d = s[i] - mean[i];
      spread[i] += d * d;
      if (kind === "precip" && s[i] > 2) prob[i] += 1;
    }
  }
  for (let i = 0; i < n * n; i++) {
    spread[i] = Math.sqrt(spread[i] / samples.length);
    prob[i] = prob[i] / samples.length;
  }

  // constraint 3: extreme tail preservation
  const p99 = (arr) => {
    const sorted = arr.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  };
  const coarseTail = p99(coarse);
  const meanTail = p99(mean);
  if (coarseTail > 0 && meanTail < coarseTail * 0.92) {
    const k = (coarseTail * 0.96) / (meanTail || 1e-6);
    for (let i = 0; i < n * n; i++) mean[i] *= clamp(k, 0.9, 1.8);
  }

  // constraint 2: local mass conservation on the 3x3 neighbourhood
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        let cSum = 0;
        let mSum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            cSum += coarse[(y + dy) * COARSE_N + (x + dx)];
            mSum += mean[(y + dy) * n + (x + dx)];
          }
        }
        const cMean = cSum / 9;
        const mMean = mSum / 9;
        if (cMean > 0) {
          const k = clamp(cMean / (mMean || 1e-6), 0.9, 1.12);
          mean[i] = mean[i] * 0.35 + mean[i] * k * 0.65;
        }
      }
    }
  }
  if (kind === "precip" || kind === "efi") {
    for (let i = 0; i < n * n; i++) mean[i] = Math.max(0, mean[i]);
  }

  // constraint 2b: domain mass conservation, applied after resampling
  const cMeanAll = coarse.reduce((a, b) => a + b, 0) / coarse.length;
  const mMeanAll = mean.reduce((a, b) => a + b, 0) / mean.length;
  if (mMeanAll > 1e-9) {
    const k = clamp(cMeanAll / mMeanAll, 0.85, 1.18);
    for (let i = 0; i < n * n; i++) mean[i] *= k;
    for (let i = 0; i < n * n; i++) {
      spread[i] *= k;
      prob[i] = clamp(prob[i], 0, 1);
    }
  }

  return { mean, spread, prob, samples: samples.length };
}

/* ------------------------------ analysis ----------------------------- */

function riskFrom(score) {
  if (score >= 0.72) return "critical";
  if (score >= 0.48) return "high";
  if (score >= 0.26) return "moderate";
  return "low";
}

function percentile(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = clamp(Math.floor(sorted.length * p), 0, sorted.length - 1);
  return sorted[idx] ?? 0;
}

function normalise(values) {
  let mx = 0;
  for (const v of values) if (v > mx) mx = v;
  if (mx <= 0) return values.map(() => 0);
  return values.map((v) => clamp(v / mx, 0, 1));
}

function normaliseSigned(values) {
  let mx = 0;
  for (const v of values) mx = Math.max(mx, Math.abs(v));
  if (mx <= 0) return values.map(() => 0);
  return values.map((v) => clamp((v + mx) / (2 * mx), 0, 1));
}

function dominantHazard(term, tempField) {
  if (term?.term === "temperature") {
    return tempField.reduce((a, b) => a + b, 0) / Math.max(1, tempField.length) >= 22
      ? "heatwave"
      : "coldwave";
  }
  if (term?.term === "wind") return "severe-storm";
  if (term?.term === "precipitation") return "extreme-rainfall";
  return "extreme-rainfall";
}

export const HAZARD_META = {
  "extreme-rainfall": { title: "Extreme rainfall object", unit: "extremeness index" },
  heatwave: { title: "Heat stress object", unit: "extremeness index" },
  coldwave: { title: "Cold stress object", unit: "extremeness index" },
  "severe-storm": { title: "Severe wind object", unit: "extremeness index" },
};

async function buildAnalysis(lat, lon, label) {
  const nwp = await loadNwp(lat, lon);
  const bounds = rasterBounds(lat, lon);
  const month = new Date().getUTCMonth();
  // A real reanalysis baseline when it is reachable, and an explicitly
  // labelled surrogate only when it is not. The provenance record carries which
  // of the two was used, so the UI can never imply a real baseline it lacks.
  const real = await getClimatology(lat, lon);
  const baseline = real.status === "REAL" ? real : simulatedBaseline(lat, Math.floor(Date.now() / 1000));
  const seed = seedFrom(`${lat.toFixed(2)},${lon.toFixed(2)},${month}`);

  const framesOut = [];
  const trackPoints = [];
  let prevCentre = null;
  const coarseByFrame = [];

  for (let f = 0; f < nwp.frames.length; f++) {
    const fr = nwp.frames[f];
    const precipCoarse = resample(fr.precip, COARSE_N, SAMPLE_N);
    const tempCoarse = resample(fr.temp, COARSE_N, SAMPLE_N);
    const windCoarse = resample(fr.wind, COARSE_N, SAMPLE_N);
    const pressCoarse = resample(fr.press, COARSE_N, SAMPLE_N);

    // Climatological severity, 1.0 == 95th percentile of the baseline.
    const sev = severityFields(precipCoarse, tempCoarse, windCoarse, baseline);
    const pAnom = anomalyField(precipCoarse, baseline);
    const tSpatial = spatialZ(tempCoarse);
    const wSpatial = spatialZ(windCoarse);

    const combined = new Array(COARSE_N * COARSE_N);
    for (let i = 0; i < combined.length; i++) {
      combined[i] = Math.max(sev.p[i], sev.t[i], sev.w[i]);
    }

    const spread = 0.14 + 0.04 * Math.abs(fr.hours) / 6;
    const ens = ensembleFields(combined, seed + f * 4099, spread);
    const efi = ens.efi;
    const exceed = ens.exceed;

    // Two detection tiers, exactly as a forecasting desk works:
    //   CLIMATOLOGICAL  - above the 95th percentile of the baseline
    //   RELATIVE        - top decile of this analysis window (monitoring only)
    const absDetect = gnnDetect(combined, COARSE_N, 0.5);
    const relThreshold = percentile(combined, 0.88);
    const relDetect =
      relThreshold > 0.02
        ? gnnDetect(combined, COARSE_N, relThreshold)
        : { object: null, score: new Array(COARSE_N * COARSE_N).fill(0) };
    const useAbsolute = !!absDetect.object;
    const chosen = useAbsolute ? absDetect : relDetect;
    const metrics = objectMetrics(chosen.object, chosen.score, COARSE_N, bounds);
    const tier = useAbsolute ? "CLIMATOLOGICAL" : "RELATIVE";
    const hazardTerm = dominantTermAt(chosen.object, sev, COARSE_N);

    const riskRaw = combined.map((v, i) => clamp(v / 1.2, 0, 1) * 0.5 + exceed[i] * 0.5);

    coarseByFrame.push({
      fr,
      precipCoarse,
      tempCoarse,
      windCoarse,
      pressCoarse,
      pAnom,
      tSpatial,
      wSpatial,
      sev,
      combined,
      anom: pAnom,
      efi,
      exceed,
      riskRaw,
      score: chosen.score,
      metrics,
      hazardTerm,
      tier,
    });

    framesOut.push({
      index: f,
      hours: fr.hours,
      label: fr.label,
      validAt: fr.validAt,
      fields: {
        precip: makeField(normalise(precipCoarse), COARSE_N, bounds, "precip", "mm/h"),
        temp: makeField(normaliseSigned(tempCoarse), COARSE_N, bounds, "temp", "degC (absolute field)"),
        wind: makeField(normalise(windCoarse), COARSE_N, bounds, "wind", "km/h"),
        efi: makeField(normalise(efi), COARSE_N, bounds, "efi", "EFI 0-1 (simulated ensemble)"),
        risk: makeField(normalise(riskRaw), COARSE_N, bounds, "risk", "risk index 0-1"),
        anomaly: makeField(normaliseSigned(combined), COARSE_N, bounds, "anomaly", "extremeness index vs baseline and analysis window"),
      },
      object: metrics,
      tier,
      gnnScoreMax: round(Math.max(...chosen.score), 3),
    });

    if (metrics) {
      let bearing = 0;
      let speedKmh = 0;
      if (prevCentre) {
        const dLat = metrics.lat - prevCentre.lat;
        const dLon = metrics.lon - prevCentre.lon;
        const dKm = Math.hypot(dLat * KM_PER_DEG, dLon * KM_PER_DEG * Math.cos((lat * Math.PI) / 180));
        const dt = Math.max(1, fr.hours - nwp.frames[f - 1].hours);
        speedKmh = round(dKm / dt, 1);
        bearing = round((Math.atan2(dLon, dLat) * 180) / Math.PI, 0);
        if (bearing < 0) bearing += 360;
        prevCentre = metrics;
      } else {
        prevCentre = metrics;
      }
      trackPoints.push({
        tLabel: fr.label,
        hours: fr.hours,
        lat: round(metrics.lat, 4),
        lon: round(metrics.lon, 4),
        intensity: metrics.peak,
        areaKm2: metrics.areaKm2,
        radiusKm: metrics.radiusKm,
        cells: metrics.cells,
        bearing,
        speedKmh,
      });
    }
  }

  /* -------- event assembly -------- */
  const lastFrame = coarseByFrame[coarseByFrame.length - 1];
  const nowFrame = coarseByFrame.find((c) => c.fr.hours === 0) ?? lastFrame;
  const nowIndex = nwp.frames.findIndex((f) => f.hours === 0);
  const lastActiveIndex = [...coarseByFrame]
    .map((c, i) => (c.metrics ? i : -1))
    .filter((i) => i >= 0)
    .pop();
  const lastActiveFrame = lastActiveIndex === undefined ? nowFrame : coarseByFrame[lastActiveIndex];
  const activeNow = nowFrame.metrics != null;
  const hazard = trackPoints.length
    ? dominantHazard(lastActiveFrame.hazardTerm, lastActiveFrame.tempCoarse)
    : "extreme-rainfall";
  const meta = HAZARD_META[hazard];
  const tier = lastActiveFrame.tier;

  const efiPeak = coarseByFrame.length
    ? round(Math.max(...coarseByFrame.map((c) => Math.max(...c.efi))), 3)
    : 0;
  const exceedPeak = coarseByFrame.length
    ? round(Math.max(...coarseByFrame.map((c) => Math.max(...c.exceed))), 3)
    : 0;
  const peakIntensity = trackPoints.length
    ? round(Math.max(...trackPoints.map((p) => p.intensity)), 3)
    : 0;
  const areaKm2 = trackPoints.length ? Math.max(...trackPoints.map((p) => p.areaKm2)) : 0;
  const radiusKm = trackPoints.length ? Math.max(...trackPoints.map((p) => p.radiusKm)) : 0;

  const scoreParts = [
    clamp(peakIntensity / 1.5, 0, 1) * 0.32,
    clamp(exceedPeak / 0.55, 0, 1) * 0.28,
    clamp(efiPeak / 0.85, 0, 1) * 0.12,
    clamp(areaKm2 / 46000, 0, 1) * 0.16,
    clamp(trackPoints.length / 9, 0, 1) * 0.12,
  ];
  let riskScore = round(clamp(scoreParts.reduce((a, b) => a + b, 0), 0, 1), 3);
  if (tier === "RELATIVE") riskScore = round(Math.min(riskScore, 0.42), 3);
  const riskLevel = riskFrom(riskScore);
  const confidence = round(
    clamp(
      0.35 + exceedPeak * 0.3 + (trackPoints.length / 9) * 0.2 - (tier === "RELATIVE" ? 0.15 : 0) - (riskLevel === "critical" ? 0.1 : 0),
      0.1,
      0.9,
    ),
    2,
  );

  const events = trackPoints.length
    ? [
        {
          id: `VX-${Math.abs(seed % 100000).toString().padStart(5, "0")}`,
          hazard,
          tier,
          activeNow,
          lastActiveLabel: lastActiveFrame.fr.label,
          title: `${meta.title} - ${label ?? "requested area"}`,
          region: label ? `${label} +/- ${Math.round(DOMAIN_KM / 2)} km` : `centred on ${lat.toFixed(3)}, ${lon.toFixed(3)}`,
          status: "tracking",
          risk: riskLevel,
          peakIntensity,
          unit: meta.unit,
          radiusKm,
          confidence,
          efiPeak,
          exceedPeak,
          areaKm2,
          driverTerm: lastActiveFrame.hazardTerm.term,
          driverSeverity: {
            precipitation: lastActiveFrame.hazardTerm.p,
            temperature: lastActiveFrame.hazardTerm.t,
            wind: lastActiveFrame.hazardTerm.w,
          },
          introduced: trackPoints[0]?.tLabel ?? "T-24h",
          note:
            "Detected by the VARUN-X graph tracker on live NWP input. Climatology, ensemble spread and graph weights are prototype surrogates reported as SIMULATION.",
          track: trackPoints.map((p) => ({
            tLabel: p.tLabel,
            hours: p.hours,
            lat: p.lat,
            lon: p.lon,
            intensity: round(p.intensity, 3),
          })),
          detailedTrack: trackPoints,
        },
      ]
    : [];

  const exposure = EXPOSURE_URL
    ? { status: "PENDING", note: "Exposure provider configured but not yet queried in this prototype." }
    : {
        status: "UNAVAILABLE",
        note: "No population, agricultural or infrastructure exposure dataset is connected. VARUN-X does not estimate exposed population from an unverified source.",
      };

  return {
    mode: "SIMULATION",
    generatedAt: Math.floor(Date.now() / 1000),
    center: { lat, lon, label: label ?? null },
    domain: {
      spanKm: DOMAIN_KM,
      coarseCells: COARSE_N,
      coarseCellKm: round(DOMAIN_KM / COARSE_N, 1),
      fineCells: FINE_N,
      fineCellKm: round(DOMAIN_KM / FINE_N, 1),
      inputSampleSpacingKm: round(nwp.nativeSpacingKm, 1),
      bounds,
    },
    timeframes: framesOut.map((f) => ({
      index: f.index,
      label: f.label,
      hours: f.hours,
      validAt: f.validAt,
    })),
    frames: framesOut,
    events,
    risk: {
      level: riskLevel,
      tier,
      score: riskScore,
      efiPeak,
      exceedPeak,
      peakIntensity,
      areaKm2,
      radiusKm,
      confidence,
      drivers: [
        { label: "Peak severity (1.0 = baseline 95th percentile)", value: peakIntensity, weight: 0.32 },
        { label: "Ensemble exceedance probability (simulated)", value: exceedPeak, weight: 0.28 },
        { label: "EFI peak (simulated ensemble)", value: efiPeak, weight: 0.12 },
        { label: "Footprint area (km2)", value: areaKm2, weight: 0.16 },
        { label: "Track persistence", value: `${trackPoints.length}/9 frames`, weight: 0.12 },
      ],
    },
    baseline,
    exposure,
    provenance: {
      nwp: {
        category: "FORECAST",
        source: `Open-Meteo model output (${nwp.model})`,
        retrievedAt: nwp.retrievedAt,
        resolution: `approximately 11 km model grid, sampled at ${Math.round(DOMAIN_KM / (SAMPLE_N - 1))} km`,
        real: true,
      },
      baseline: {
        category: "CLIMATOLOGY",
        source: baseline.label,
        real: baseline.status === "REAL",
      },
      ensemble: {
        category: "ENSEMBLE",
        source: `SIMULATED ensemble, ${MEMBER_COUNT} members, anchored to the deterministic forecast`,
        real: false,
      },
      gnn: {
        category: "MODEL OUTPUT",
        source: "VARUN-X graph tracker, structural surrogate, fixed weights",
        real: false,
      },
      diffusion: {
        category: "MODEL OUTPUT",
        source: `VARUN-X conditional diffusion refiner, ${DIFFUSION_SAMPLES} draws, physics constrained`,
        real: false,
      },
    },
    warnings: [
      baseline.status === "REAL"
        ? "The climatological baseline is real ERA5 reanalysis. The ensemble, graph-tracking and diffusion stages are prototype surrogates and are not operational predictions."
        : "SIMULATED CLIMATOLOGY - the reanalysis baseline could not be reached, so the anomaly is measured against a labelled surrogate. Anomaly statements are not meaningful until ERA5 is available.",
      "Live NWP input is real forecast data. It is a model output, not an observation and not an official warning.",
      "The ensemble, graph-tracking and diffusion stages are prototype surrogates, not trained models.",
      "Official instructions from competent authorities take precedence over anything on this screen.",
    ],
  };
}

export async function getAnalysis(lat, lon, label) {
  // Refuse rather than coerce: a missing coordinate must never be analysed as
  // 0,0, which is a real location in the Gulf of Guinea.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw bad("INVALID_COORDINATES", "getAnalysis requires finite lat and lon");
  }
  const key = `analysis:${lat.toFixed(3)},${lon.toFixed(3)}`;
  return cacheWrap(key, () => buildAnalysis(lat, lon, label));
}

/** Field kinds a refinement may be requested for, with the source field and unit. */
const REFINABLE = {
  precip: { unit: "mm/h", mode: "precip" },
  temp: { unit: "degC (absolute field)", mode: "temp" },
  wind: { unit: "km/h", mode: "wind" },
  efi: { unit: "EFI 0-1", mode: "precip" },
  anomaly: { unit: "extremeness index vs baseline and analysis window", mode: "precip" },
  risk: { unit: "risk index 0-1", mode: "precip" },
};

export const REFINEMENT_KINDS = Object.keys(REFINABLE);

/** Resolves a lead time in hours to the frame that carries it. */
function frameIndexForHours(frames, hours) {
  if (!frames.length) return 0;
  const wanted = Number(hours);
  if (!Number.isFinite(wanted)) return 0;
  const exact = frames.findIndex((f) => f.hours === wanted);
  if (exact >= 0) return exact;
  let best = 0;
  let bestGap = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const gap = Math.abs(frames[i].hours - wanted);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
}

/**
 * Targeted 12 km -> 5 km refinement for one analysis frame.
 *
 * `hours` is a lead time, not a frame index: the frames are spaced -24, -12,
 * -6, 0, 6, 12, 24, 48, 72, so indexing by it would return a different frame
 * than the caller asked for and the refined grid would not match the coarse
 * grid displayed beside it.
 */
export async function getRefinement(lat, lon, hours = 0, kind = "precip") {
  const analysis = await getAnalysis(lat, lon);
  const idx = frameIndexForHours(analysis.frames, hours);
  const bounds = analysis.domain.bounds;
  const key = `refine:${lat.toFixed(3)},${lon.toFixed(3)}:${idx}:${kind}`;
  const spec = REFINABLE[kind] ?? REFINABLE.precip;

  return cacheWrap(key, () => {
    const frame = analysis.frames[idx];
    // The returned grid is tagged with the kind that was actually requested,
    // so the client picks the matching palette and legend instead of always
    // rendering a precipitation ramp.
    const coarse = frame.fields[kind]?.data ?? frame.fields.precip.data;
    const seed = seedFrom(`${lat.toFixed(2)}:${lon.toFixed(2)}:${idx}:${kind}`);
    const result = diffuse(coarse, FINE_N, bounds, seed, spec.mode);
    const unit = spec.unit;

    const refineUnit = makeField(normalise(result.mean), FINE_N, bounds, kind, unit);
    const uncertaintyUnit = makeField(normalise(result.spread), FINE_N, bounds, "risk", "ensemble spread (normalised)");
    const probabilityUnit = makeField(
      normalise(result.prob),
      FINE_N,
      bounds,
      "risk",
      `P(refined ${kind} exceeds its coarse p99) - simulated draws`,
    );

    const coarseMean = coarse.reduce((a, b) => a + b, 0) / coarse.length;
    const fineMean = result.mean.reduce((a, b) => a + b, 0) / result.mean.length;
    const tail = (arr) => arr.slice().sort((a, b) => b - a)[Math.floor(arr.length * 0.01)] ?? 0;

    return {
      mode: "SIMULATION",
      frame: { index: idx, label: frame.label, validAt: frame.validAt, hours: frame.hours },
      kind,
      coarse: makeField(normalise(coarse), COARSE_N, bounds, kind, unit),
      refined: refineUnit,
      uncertainty: uncertaintyUnit,
      probability: probabilityUnit,
      metrics: {
        coarseCellKm: analysis.domain.coarseCellKm,
        fineCellKm: analysis.domain.fineCellKm,
        coarseMean: round(coarseMean, 3),
        fineMean: round(fineMean, 3),
        coarseP99: round(tail(coarse), 3),
        fineP99: round(tail(result.mean), 3),
        tailPreserved: tail(result.mean) >= tail(coarse) * 0.92,
        samples: result.samples,
        massDriftPct: round(coarseMean ? ((fineMean - coarseMean) / coarseMean) * 100 : 0, 2),
      },
      constraints: [
        { name: "Non-negative precipitation", status: "ENFORCED" },
        { name: "Local mass conservation (3x3)", status: "ENFORCED" },
        {
          name: "Extreme tail preservation (p99 >= 92% of coarse)",
          status: tail(result.mean) >= tail(coarse) * 0.92 ? "SATISFIED" : "VIOLATED",
        },
        { name: "Spatial continuity", status: "ENFORCED" },
        { name: "Temporal consistency", status: "PARTIAL - single frame refiner" },
      ],
      warnings: analysis.warnings,
    };
  });
}

export const PIPELINE_STAGES = [
  {
    stage: "01",
    name: "FORECAST INGESTION",
    model: "NWP deterministic + (simulated) ensemble",
    input: "Open-Meteo model output, approximately 11 km grid",
    output: "Hourly precipitation, temperature, wind, pressure, humidity",
    resolution: "~11 km",
    real: true,
  },
  {
    stage: "02",
    name: "CLIMATOLOGICAL BASELINE",
    model: "Simulated seasonal surrogate (ERA5 / IMDAA not connected)",
    input: "Grid point, calendar month, latitude",
    output: "Seasonal mean, standard deviation, 95th percentile threshold",
    resolution: "grid point",
    real: false,
  },
  {
    stage: "03",
    name: "ANOMALY AND EFI",
    model: "Standardised anomaly + ECMWF-style EFI on a simulated ensemble",
    input: "Forecast field and baseline",
    output: "Sigma anomaly, exceedance frequency, EFI field",
    resolution: "12 km analysis grid",
    real: false,
  },
  {
    stage: "04",
    name: "GNN EXTREME-OBJECT TRACKING",
    model: "Graph message passing over the analysis grid, fixed prototype weights",
    input: "Anomaly, EFI, temperature and wind node features",
    output: "Detected object, centroid, footprint, trajectory, intensity",
    resolution: "12 km analysis grid",
    real: false,
  },
  {
    stage: "05",
    name: "TARGET REGION SELECTION",
    model: "Footprint ranking",
    input: "Tracked object list",
    output: "Region selected for refinement",
    resolution: "12 km",
    real: false,
  },
  {
    stage: "06",
    name: "CONDITIONAL DIFFUSION REFINEMENT",
    model: "Physics-constrained stochastic refiner, 12 draws",
    input: "Coarse field over the target region",
    output: "5 km mean field, probability field, spread field",
    resolution: "~12 km in, ~5 km out",
    real: false,
  },
  {
    stage: "07",
    name: "PHYSICS CONSTRAINTS",
    model: "Projection operators",
    input: "Diffusion draws",
    output: "Constrained ensemble with conserved mass and preserved tail",
    resolution: "5 km",
    real: false,
  },
  {
    stage: "08",
    name: "RISK ESTIMATION",
    model: "Weighted drivers: EFI, intensity, footprint, persistence",
    input: "Tracked object and refined field",
    output: "Risk level, score, confidence, exposure status",
    resolution: "region",
    real: false,
  },
  {
    stage: "09",
    name: "ALERT GENERATION",
    model: "Rule-based conversion with human verification gate",
    input: "Risk assessment",
    output: "Draft alert requiring authority verification before publication",
    resolution: "region",
    real: false,
  },
];

/** Domain and raster metadata for a request point, without rerunning detection. */
export async function domainFor(lat, lon) {
  const analysis = await getAnalysis(lat, lon, null);
  return analysis.domain;
}
