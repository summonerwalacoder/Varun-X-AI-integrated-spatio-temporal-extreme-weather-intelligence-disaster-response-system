/* ============================================================
   Field rendering helpers.

   Pure presentation code: colour ramps, canvas rasterisation and
   display normalisation. It operates on grids produced by the
   server and never generates a grid of its own.
   ============================================================ */

import type { Field, FieldKind } from "./analysis";

type RGB = [number, number, number];
type Stop = [number, RGB];
type Ramp = { stops: Stop[]; aMax: number; aBase: number };

const PALETTE: Record<FieldKind, Ramp> = {
  precip: {
    stops: [
      [0.0, [66, 198, 217]],
      [0.35, [76, 141, 255]],
      [0.7, [229, 169, 61]],
      [1.0, [217, 92, 92]],
    ],
    aMax: 0.78,
    aBase: 0.22,
  },
  wind: {
    stops: [
      [0.0, [66, 198, 217]],
      [0.4, [76, 141, 255]],
      [0.75, [229, 169, 61]],
      [1.0, [217, 92, 92]],
    ],
    aMax: 0.78,
    aBase: 0.22,
  },
  temp: {
    stops: [
      [0.0, [76, 141, 255]],
      [0.45, [66, 198, 217]],
      [0.7, [229, 169, 61]],
      [1.0, [217, 92, 92]],
    ],
    aMax: 0.8,
    aBase: 0.25,
  },
  efi: {
    stops: [
      [0.0, [66, 198, 217]],
      [0.3, [76, 141, 255]],
      [0.65, [229, 169, 61]],
      [1.0, [217, 92, 92]],
    ],
    aMax: 0.85,
    aBase: 0.28,
  },
  anomaly: {
    stops: [
      [0.0, [66, 198, 217]],
      [0.3, [76, 141, 255]],
      [0.65, [229, 169, 61]],
      [1.0, [217, 92, 92]],
    ],
    aMax: 0.85,
    aBase: 0.28,
  },
  risk: {
    stops: [
      [0.0, [85, 168, 120]],
      [0.45, [229, 169, 61]],
      [0.8, [217, 92, 92]],
    ],
    aMax: 0.85,
    aBase: 0.35,
  },
};

function rampColor(kind: FieldKind, t: number): RGB {
  const stops: Stop[] = (PALETTE[kind] ?? PALETTE.risk).stops;
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const f = Math.min(1, Math.max(0, (t - lo[0]) / span));
  return [
    Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * f),
    Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * f),
    Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * f),
  ];
}

export function normField(f: Field): Field {
  let mx = 0;
  for (let i = 0; i < f.data.length; i++) {
    if (f.data[i] > mx) mx = f.data[i];
  }
  const out = f.data.slice();
  if (mx > 0) for (let i = 0; i < out.length; i++) out[i] = out[i] / mx;
  return { ...f, data: out };
}

/** Per-frame display normalisation 0..1; map opacity carries the evolution. */
export function normalizeDisplay(field: Field): Field {
  return normField(field);
}

export function unitFor(kind: FieldKind): string {
  return kind;
}

export function fieldToDataURL(field: Field, maxW = 360): string {
  const norm = normField(field);
  const scale = Math.min(1, maxW / norm.w);
  const w = Math.max(2, Math.round(norm.w * scale));
  const h = Math.max(2, Math.round(norm.h * scale));
  const cnv = document.createElement("canvas");
  cnv.width = w;
  cnv.height = h;
  const ctx = cnv.getContext("2d");
  if (!ctx) return "";
  const img = ctx.createImageData(w, h);
  const pal = PALETTE[norm.kind] ?? PALETTE.risk;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(norm.w - 1, Math.round(x / scale));
      const sy = Math.min(norm.h - 1, Math.round(y / scale));
      const v = norm.data[sy * norm.w + sx];
      const i = (y * w + x) * 4;
      if (v <= 0.01) {
        img.data[i + 3] = 0;
        continue;
      }
      const [r, g, b] = rampColor(norm.kind, v);
      const a = Math.min(1, pal.aBase + v * pal.aMax);
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cnv.toDataURL("image/png");
}

export { rampColor, PALETTE };
