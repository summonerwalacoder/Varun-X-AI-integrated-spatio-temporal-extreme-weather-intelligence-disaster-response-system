/* ============================================================
   Shared wiring for the analysis console pages.

   Every console page needs the same three things: a server
   analysis for the current location, a selected event, and the
   frame that event is detected in. This module resolves that
   once so no page falls back to a client-side demo event.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { useWeather } from "./useWeather";
import { unitFor } from "./fields";
import {
  fetchRefinement,
  useAnalysis,
  type Analysis,
  type AnalysisEvent,
  type AnalysisFrame,
  type AnalysisStatus,
  type Field,
  type FieldKind,
  type Refinement,
} from "./analysis";

export interface ConsoleAnalysis {
  /** Where the map is centred: the live location, or null before one exists. */
  center: { lat: number; lon: number } | null;
  origin: "GPS" | "SELECTED LOCATION" | null;
  placeLabel: string | null;
  status: AnalysisStatus;
  analysis: Analysis | null;
  error: string | null;
  reload: () => Promise<void>;
  /** True when no region has been resolved, so no analysis request has run yet. */
  regionPending: boolean;
  /** Server events for the current location; never a local demo list. */
  events: AnalysisEvent[];
  event: AnalysisEvent | null;
  eventId: string | null;
  selectEvent: (id: string) => void;
  /** Index into `event.track`; -1 means "last detected frame". */
  timeIdx: number;
  setTimeIdx: (i: number) => void;
  /** The server frame matching the selected track point, when detected. */
  frame: AnalysisFrame | null;
  /** Server grid for the selected frame, or null when nothing is detected. */
  field: (kind: FieldKind) => Field | null;
  trackPoint: { tLabel: string; lat: number; lon: number; intensity: number; hours: number } | null;
}

function pointFor(event: AnalysisEvent | null, timeIdx: number) {
  if (!event?.track.length) return null;
  return event.track[timeIdx < 0 ? event.track.length - 1 : timeIdx] ?? null;
}

/**
 * Maps a sparse track point onto its server frame. The server only returns
 * frames where an object was actually detected, so a track point that has no
 * frame means the model reported nothing for that hour.
 */
function frameFor(analysis: Analysis | null, hours: number | undefined): AnalysisFrame | null {
  if (!analysis || hours === undefined) return null;
  return analysis.frames.find((f) => f.hours === hours) ?? null;
}

export function useConsoleAnalysis(): ConsoleAnalysis {
  const weather = useWeather();
  const coords = weather.state.coords ?? null;
  const { state, reload } = useAnalysis({
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    place: weather.state.place?.name ?? null,
    mode: weather.state.mode,
    enabled: weather.state.status === "ready" && !!coords,
  });

  const analysis = state.analysis;
  const events = useMemo(() => analysis?.events ?? [], [analysis]);

  const [eventId, setEventId] = useState<string | null>(null);
  const [timeIdx, setTimeIdx] = useState(-1);

  // Follow the server: prefer an event that is active now, else the first.
  useEffect(() => {
    if (!events.length) {
      setEventId(null);
      return;
    }
    setEventId((cur) =>
      cur && events.some((e) => e.id === cur)
        ? cur
        : (events.find((e) => e.activeNow) ?? events[0]).id,
    );
  }, [events]);

  const event = useMemo(
    () => events.find((e) => e.id === eventId) ?? events[0] ?? null,
    [events, eventId],
  );

  // Keep the selection inside the event's own sparse track.
  useEffect(() => {
    setTimeIdx((i) => (i < -1 || i >= (event?.track.length ?? 0) ? -1 : i));
  }, [event?.track.length]);

  const point = pointFor(event, timeIdx);
  const frame = frameFor(analysis, point?.hours);
  const trackPoint = point
    ? { tLabel: point.tLabel, lat: point.lat, lon: point.lon, intensity: point.intensity, hours: point.hours }
    : null;

  return {
    center: coords ? { lat: coords.lat, lon: coords.lon } : null,
    origin: analysis?.origin ?? (weather.state.mode === "gps" ? "GPS" : null),
    placeLabel: weather.state.place?.name ?? null,
    status:     state.status,
    analysis,
    error: state.error,
    reload,
    events,
    /**
     * True while the analysis request has not been issued because no region
     * has been resolved yet. Distinguishes "waiting for a region" from a
     * request that is genuinely in flight, so pages stop showing a permanent
     * "LOADING" state that no request is actually behind.
     */
    regionPending: !coords && weather.state.status !== "ready",
    event,

    eventId: event?.id ?? null,
    selectEvent: setEventId,
    timeIdx,
    setTimeIdx,
    frame,
    field: (kind: FieldKind) => frame?.fields?.[kind] ?? null,
    trackPoint,
  };
}

/** Frame labels the server actually returned, for timeline controls. */
export function detectedLabels(event: AnalysisEvent | null, analysis: Analysis | null): string[] {
  if (!event || !analysis) return [];
  return event.track
    .map((p) => frameFor(analysis, p.hours))
    .filter((f): f is AnalysisFrame => !!f)
    .map((f) => f.label);
}

export interface RefinementState {
  status: "idle" | "loading" | "ready" | "unavailable";
  error: string | null;
  /** Coarse parent grid, as returned by the server. */
  coarse: Field | null;
  /** Refined grid, as returned by the server. */
  refined: Field | null;
  uncertainty: Field | null;
  probability: Field | null;
  metrics: Refinement["metrics"] | null;
  constraints: Refinement["constraints"];
  warnings: string[];
  frameLabel: string;
}

/** The server's refine endpoint returns bare grids, so borrow the frame bounds. */
function withBounds(
  grid: { w: number; h: number; data: number[] } | undefined,
  bounds: Bounds | null,
  kind: FieldKind,
): Field | null {
  if (!grid || !bounds) return null;
  return {
    w: grid.w,
    h: grid.h,
    data: Float32Array.from(grid.data),
    ...bounds,
    kind,
    unit: unitFor(kind),
  };
}

export interface Bounds {
  latMax: number;
  latMin: number;
  lonMin: number;
  lonMax: number;
}

/** Bounds of the current frame, taken from any field it contains. */
export function frameBounds(frame: AnalysisFrame | null): Bounds | null {
  if (!frame?.fields) return null;
  const f = frame.fields.risk ?? Object.values(frame.fields)[0];
  return f ? { latMax: f.latMax, latMin: f.latMin, lonMin: f.lonMin, lonMax: f.lonMax } : null;
}

/** Lead time in hours encoded in a frame label such as "T+6h" or "NOW". */
export function hoursFromLabel(label: string | undefined): number | null {
  if (!label) return null;
  if (/^now$/i.test(label.trim())) return 0;
  const m = /T([+-])(\d+)\s*h/i.exec(label);
  if (!m) return null;
  return m[1] === "-" ? -Number(m[2]) : Number(m[2]);
}

/**
 * Refinement for whichever frame the console is currently on, so the
 * downscale pages share the same server before/after as the rest of the
 * console rather than building their own grids.
 */
export function useFrameRefinement(c: ConsoleAnalysis, kind: FieldKind) {
  const point = c.trackPoint;
  const bounds = frameBounds(c.frame);
  return useRefinement(
    point ? { lat: point.lat, lon: point.lon } : c.center,
    point ? point.hours : null,
    kind,
    bounds,
  );
}

/**
 * Server-side conditional-diffusion refinement for the selected frame.
 * Returns the coarse/parent and refined grids the server produced, so the
 * comparison is a real before/after rather than a client-side upsample.
 */
export function useRefinement(
  center: { lat: number; lon: number } | null,
  hours: number | null,
  kind: FieldKind,
  bounds: Bounds | null,
): RefinementState & { reload: () => void } {
  const [state, setState] = useState<RefinementState>({
    status: "idle",
    error: null,
    coarse: null,
    refined: null,
    uncertainty: null,
    probability: null,
    metrics: null,
    constraints: [],
    warnings: [],
    frameLabel: "",
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!center || hours === null) {
      setState((s) => ({ ...s, status: "idle", coarse: null, refined: null }));
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, status: "loading", error: null }));
    fetchRefinement(center.lat, center.lon, hours, kind)
      .then((r) => {
        if (!alive) return;
        setState({
          status: "ready",
          error: null,
          coarse: withBounds(r.coarse, bounds, kind),
          refined: withBounds(r.refined, bounds, kind),
          uncertainty: withBounds(r.uncertainty, bounds, "anomaly"),
          probability: withBounds(r.probability, bounds, "risk"),
          metrics: r.metrics,
          constraints: r.constraints ?? [],
          warnings: r.warnings ?? [],
          frameLabel: r.frame?.label ?? "",
        });
      })
      .catch((e) => {
        if (!alive) return;
        setState((s) => ({
          ...s,
          status: "unavailable",
          error: e instanceof Error ? e.message : "refinement unavailable",
          coarse: null,
          refined: null,
        }));
      });
    return () => {
      alive = false;
    };
    // Bounds are compared by value: the caller passes a fresh object literal
    // each render, and a reference dep would refetch in a loop.
  }, [
    center?.lat,
    center?.lon,
    hours,
    kind,
    bounds?.latMax,
    bounds?.latMin,
    bounds?.lonMin,
    bounds?.lonMax,
    nonce,
  ]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
