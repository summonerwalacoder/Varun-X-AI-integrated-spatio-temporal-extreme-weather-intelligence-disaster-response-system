/* ============================================================
   VARUN-X analysis client (server-authoritative)

   All intelligence shown in the UI comes from the VARUN-X server
   at /api/analysis. The server pulls live NWP fields from the
   provider and runs the tracking / anomaly / risk pipeline; the
   browser only renders what it returns.

   Nothing in this file invents a value. Where a stage is a
   prototype surrogate the server labels it, and that label is
   carried through to the interface unchanged.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

export type RiskLevel = "low" | "moderate" | "high" | "critical";

export type HazardKind =
  | "cyclone"
  | "extreme-rainfall"
  | "heatwave"
  | "coldwave"
  | "severe-storm";

export type FieldKind = "precip" | "temp" | "wind" | "efi" | "risk" | "anomaly";

/** Grid of one variable on one forecast frame. */
export interface Field {
  w: number;
  h: number;
  data: Float32Array;
  latMax: number;
  latMin: number;
  lonMin: number;
  lonMax: number;
  kind: FieldKind;
  unit: string;
}

export interface TrackPoint {
  tLabel: string;
  hours: number;
  lat: number;
  lon: number;
  intensity: number;
}

export interface DetailedTrackPoint extends TrackPoint {
  areaKm2: number;
  radiusKm: number;
  cells: number;
  bearing: number;
  speedKmh: number;
}

export interface AnalysisEvent {
  id: string;
  hazard: HazardKind;
  title: string;
  region: string;
  status: "tracking" | "forecast" | "developing";
  risk: RiskLevel;
  /** Detection tier: CLIMATOLOGICAL or RELATIVE. */
  tier: string;
  /** 1.0 equals the baseline 95th percentile. Not a physical unit. */
  peakIntensity: number;
  unit: string;
  radiusKm: number;
  confidence: number;
  efiPeak: number;
  exceedPeak: number;
  areaKm2: number;
  /** True only while the object is present in the current frame. */
  activeNow: boolean;
  lastActiveLabel: string;
  /** Frame in which the object first appeared, e.g. "T+6h". */
  introduced: string;
  driverTerm: string;
  note: string;
  /** Sparse: only the frames where the object was detected. */
  track: TrackPoint[];
  detailedTrack: DetailedTrackPoint[];
}

export interface RiskDriver {
  label: string;
  value: number | string;
  weight: number;
}

export interface Analysis {
  mode: string;
  generatedAt: number;
  center: { lat: number; lon: number; label: string | null };
  domain: {
    spanKm: number;
    coarseCells: number;
    coarseCellKm: number;
    fineCells: number;
    fineCellKm: number;
    inputSampleSpacingKm: number;
    bounds?: { latMax: number; latMin: number; lonMin: number; lonMax: number };
  };
  timeframes: { index: number; label: string; hours: number; validAt: number }[];
  frames: AnalysisFrame[];
  events: AnalysisEvent[];
  risk: {
    level: RiskLevel;
    tier: string;
    score: number;
    efiPeak: number;
    exceedPeak: number;
    peakIntensity: number;
    areaKm2: number;
    radiusKm: number;
    confidence: number;
    drivers: RiskDriver[];
  };
  baseline: {
    mode: string;
    label: string;
    precipMean: number;
    precipSd: number;
    precip95: number;
    tempMean: number;
    tempSd: number;
    temp95: number;
    windMean: number;
    windSd: number;
    wind95: number;
    uncertainty: Record<string, string>;
  };
  exposure: { status: string; note: string };
  provenance: Record<string, { category: string; source: string; real: boolean; resolution?: string }>;
  warnings: string[];
  origin?: "GPS" | "SELECTED LOCATION";
}

export interface AnalysisFrame {
  index: number;
  hours: number;
  label: string;
  validAt: number;
  fields: Record<FieldKind, Field>;
  object: { lat: number; lon: number; intensity: number } | null;
  tier: string;
  gnnScoreMax: number;
}

export interface Refinement {
  mode: string;
  frame: { index: number; label: string; validAt: number; hours: number };
  kind: FieldKind;
  coarse: { w: number; h: number; data: number[] };
  refined: { w: number; h: number; data: number[] };
  uncertainty: { w: number; h: number; data: number[] };
  probability: { w: number; h: number; data: number[] };
  metrics: {
    coarseCellKm: number;
    fineCellKm: number;
    coarseMean: number;
    fineMean: number;
    coarseP99: number;
    fineP99: number;
    tailPreserved: boolean;
    samples: number;
    massDriftPct: number;
  };
  constraints: { name: string; status: string }[];
  warnings: string[];
}

/* ------------------------- wire format ------------------------- */

interface WireField {
  w: number;
  h: number;
  data: number[];
  latMax: number;
  latMin: number;
  lonMin: number;
  lonMax: number;
  kind: string;
  unit: string;
}

interface WireFrame {
  index: number;
  hours: number;
  label: string;
  validAt: number;
  fields: Record<string, WireField>;
  object: { lat: number; lon: number; intensity: number } | null;
  tier: string;
  gnnScoreMax: number;
}

/** The analysis payload exactly as it arrives over the wire. */
type WireAnalysis = Omit<Analysis, "frames"> & { frames: WireFrame[] };

/**
 * JSON arrays become typed arrays once, at the network boundary, so render
 * loops elsewhere stay allocation free.
 *
 * The server's own `kind` wins over the map key, so a field the server labels
 * differently is rendered as the server labelled it rather than silently
 * corrected to match the key.
 */
function toField(raw: WireField, key: FieldKind): Field {
  const kind: FieldKind = (raw.kind as FieldKind) ?? key;
  return {
    w: raw.w,
    h: raw.h,
    data: Float32Array.from(raw.data ?? []),
    latMax: raw.latMax,
    latMin: raw.latMin,
    lonMin: raw.lonMin,
    lonMax: raw.lonMax,
    kind,
    unit: raw.unit,
  };
}

function hydrate(raw: WireAnalysis): Analysis {
  return {
    ...raw,
    frames: (raw.frames ?? []).map((f) => ({
      index: f.index,
      hours: f.hours,
      label: f.label,
      validAt: f.validAt,
      object: f.object,
      tier: f.tier,
      gnnScoreMax: f.gnnScoreMax,
      fields: Object.fromEntries(
        Object.entries(f.fields ?? {}).map(([key, value]) => [key, toField(value, key as FieldKind)]),
      ) as Record<FieldKind, Field>,
    })),
    events: (raw.events ?? []).map((e) => ({ ...e })),
  } as Analysis;
}

/* ---------------------------- calls ----------------------------- */

export async function fetchAnalysis(
  lat: number,
  lon: number,
  opts: { place?: string | null; mode?: "gps" | "selected"; signal?: AbortSignal } = {},
): Promise<Analysis> {
  const raw = await api<WireAnalysis>("/api/analysis", {
    signal: opts.signal,
    query: {
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
      place: opts.place ?? undefined,
      origin: opts.mode === "gps" ? "GPS" : "SELECTED LOCATION",
    },
  });
  return hydrate(raw);
}

export async function fetchRefinement(
  lat: number,
  lon: number,
  hours: number,
  kind: FieldKind,
  signal?: AbortSignal,
): Promise<Refinement> {
  return api<Refinement>("/api/analysis/refine", {
    signal,
    query: { lat: lat.toFixed(4), lon: lon.toFixed(4), hours, kind },
  });
}

/* ---------------------------- derived --------------------------- */

/**
 * Intensity of an event at the current frame.
 *
 * The server only returns the frames where the object was actually detected,
 * so this looks the NOW frame up by hour and reports `null` when the object is
 * not present now. It never invents a value to fill the gap.
 */
export function intensityNow(ev: AnalysisEvent): number | null {
  const point = ev.track.find((p) => p.hours === 0);
  return point ? point.intensity : null;
}

export function intensityLater(ev: AnalysisEvent): number {
  return ev.track.length ? Math.max(...ev.track.map((p) => p.intensity)) : 0;
}

/** The single most relevant event, preferring one that is active right now. */
export function primaryEvent(analysis: Analysis | null): AnalysisEvent | null {
  if (!analysis?.events?.length) return null;
  return analysis.events.find((e) => e.activeNow) ?? analysis.events[0];
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  low: "LOW",
  moderate: "MODERATE",
  high: "HIGH",
  critical: "CRITICAL",
};

export function riskTitle(r: RiskLevel): string {
  return r.toUpperCase();
}

/**
 * Plain-language risk sentence. Every clause is either a value the server
 * returned or an explicit statement that the data is unavailable.
 */
export function riskSentence(analysis: Analysis | null): string {
  if (!analysis) return "";
  const r = analysis.risk;
  if (!analysis.events.length) {
    return (
      `No extreme object was detected in the ${analysis.domain.spanKm} km analysis window ` +
      `between T-24h and T+72h, so the reported risk level is ${RISK_LABEL[r.level]}. ` +
      `A model statement is not a guarantee of safe conditions.`
    );
  }
  const ev = primaryEvent(analysis)!;
  const window = ev.activeNow ? "right now" : `last active ${ev.lastActiveLabel}`;
  return (
    `${ev.title} was ${window}. Risk ${RISK_LABEL[ev.risk]}, detection tier ${ev.tier}, ` +
    `peak extremeness ${ev.peakIntensity.toFixed(2)} where 1.0 is the baseline 95th percentile, ` +
    `footprint ${Math.round(ev.areaKm2).toLocaleString()} km2, ` +
    `confidence ${ev.confidence.toFixed(2)}.`
  );
}

/** True when any stage in the pipeline is a prototype surrogate. */
export function hasSimulatedStage(analysis: Analysis | null): boolean {
  if (!analysis) return false;
  return Object.values(analysis.provenance ?? {}).some((p) => !p.real);
}

/* ----------------------------- hook ----------------------------- */

export type AnalysisStatus = "idle" | "loading" | "ready" | "unavailable";

export interface AnalysisState {
  status: AnalysisStatus;
  analysis: Analysis | null;
  error: string | null;
  fetchedAt: number | null;
}

export interface UseAnalysisOptions {
  lat: number | null;
  lon: number | null;
  place?: string | null;
  mode?: "gps" | "selected";
  /** Set false to suspend the request, e.g. before location permission. */
  enabled?: boolean;
}

export function useAnalysis({
  lat,
  lon,
  place,
  mode = "selected",
  enabled = true,
}: UseAnalysisOptions) {
  const [state, setState] = useState<AnalysisState>({
    status: "idle",
    analysis: null,
    error: null,
    fetchedAt: null,
  });
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || lat === null || lon === null) {
      setState({ status: "idle", analysis: null, error: null, fetchedAt: null });
      return;
    }
    const id = ++seq.current;
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const analysis = await fetchAnalysis(lat, lon, { place, mode });
      if (id !== seq.current) return;
      setState({ status: "ready", analysis, error: null, fetchedAt: Date.now() });
    } catch (e) {
      if (id !== seq.current) return;
      setState({
        status: "unavailable",
        analysis: null,
        error: e instanceof Error ? e.message : "analysis unavailable",
        fetchedAt: null,
      });
    }
  }, [lat, lon, place, mode, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, reload: load };
}
