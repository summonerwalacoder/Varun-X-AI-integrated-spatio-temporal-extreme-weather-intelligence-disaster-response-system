import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchWeather, type WeatherResponse } from "./weather";
import { reverseGeocode, type Place } from "./geocode";

export type WeatherStatus =
  | "idle"
  | "locating"
  | "fetching"
  | "ready"
  | "geolocation-denied"
  | "geolocation-unavailable"
  | "unavailable";

export interface WeatherState {
  status: WeatherStatus;
  coords: { lat: number; lon: number } | null;
  mode: "gps" | "selected";
  place: Place | null;
  data: WeatherResponse | null;
  error: string | null;
  fetchedAt: number | null;
}

interface WeatherApi {
  state: WeatherState;
  locate: () => void;
  selectPlace: (place: Place) => void;
  retry: () => void;
}

const WeatherContext = createContext<WeatherApi | null>(null);

/**
 * Region the console falls back to when the browser withholds a fix.
 *
 * Kept on the Delhi NCR centroid because it is a real place on the map: the
 * label is surfaced in the UI as the region being analysed, never as the
 * browser's location, and GPS keeps priority whenever it is available.
 */
const DEFAULT_LAT = 28.6139;
const DEFAULT_LON = 77.209;
const DEFAULT_REGION_NAME = "Delhi NCR (fallback region)";
const DEFAULT_REGION_STATE = "Delhi";

/** How long to wait for a real fix before using the fallback region. */
const FALLBACK_AFTER_MS = 2500;
const GEOLOCATION_TIMEOUT_MS = 4000;

function fallbackPlace(): Place {
  return {
    name: DEFAULT_REGION_NAME,
    state: DEFAULT_REGION_STATE,
    country: "IN",
    lat: DEFAULT_LAT,
    lon: DEFAULT_LON,
    source: "manual",
  };
}

function freshState(): WeatherState {
  return {
    status: "idle",
    coords: null,
    mode: "gps",
    place: null,
    data: null,
    error: null,
    fetchedAt: null,
  };
}

/**
 * Single source of location truth for the whole application.
 *
 * Every panel reads the same coordinates, so a fix obtained in one component
 * is immediately visible everywhere else and the analysis requests are made
 * against exactly the point the weather was fetched for.
 */
export function WeatherProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WeatherState>(freshState);
  const seq = useRef(0);

  const fetchFor = useCallback(
    async (lat: number, lon: number, mode: "gps" | "selected", place: Place | null) => {
      const id = ++seq.current;
      setState((s) => ({ ...s, status: "fetching", coords: { lat, lon }, mode, place }));
      try {
        const data = await fetchWeather(lat, lon, place?.name, mode);
        if (id !== seq.current) return;
        setState((s) => ({ ...s, status: "ready", data, fetchedAt: Date.now() }));
      } catch (e) {
        if (id !== seq.current) return;
        setState((s) => ({
          ...s,
          status: "unavailable",
          error: e instanceof Error ? e.message : "weather api unavailable",
        }));
      }
    },
    [],
  );

  const locate = useCallback(() => {
    const id = ++seq.current;
    if (!("geolocation" in navigator)) {
      setState((s) => ({
        ...s,
        status: "geolocation-unavailable",
        error: "geolocation not supported",
      }));
      void fetchFor(DEFAULT_LAT, DEFAULT_LON, "selected", fallbackPlace());
      return;
    }
    setState((s) => ({ ...s, status: "locating", mode: "gps" }));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (id !== seq.current) return;
        const { latitude, longitude } = pos.coords;
        let place: Place | null = null;
        try {
          place = await reverseGeocode(latitude, longitude);
        } catch {
          place = null;
        }
        await fetchFor(latitude, longitude, "gps", place);
      },
      (err) => {
        if (id !== seq.current) return;
        if (err.code === err.PERMISSION_DENIED) {
          setState((s) => ({ ...s, status: "geolocation-denied", error: "permission denied" }));
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setState((s) => ({
            ...s,
            status: "geolocation-unavailable",
            error: "position unavailable",
          }));
        } else {
          setState((s) => ({
            ...s,
            status: "geolocation-unavailable",
            error: "location request timed out",
          }));
        }
        // Recovery: a failed fix must not leave the console without a region.
        void fetchFor(DEFAULT_LAT, DEFAULT_LON, "selected", fallbackPlace());
      },
      { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 600000 },
    );
  }, [fetchFor]);

  const selectPlace = useCallback(
    (place: Place) => {
      void fetchFor(place.lat, place.lon, "selected", place);
    },
    [fetchFor],
  );

  const retry = useCallback(() => {
    if (state.coords) {
      void fetchFor(state.coords.lat, state.coords.lon, state.mode, state.place);
    } else {
      locate();
    }
  }, [state, fetchFor, locate]);

  /**
   * Bootstraps the provider so the intelligence layer has a region to work on.
   *
   * Geolocation is optional and frequently refused or unavailable, so waiting
   * for it left every analysis page permanently idle. GPS is still tried first;
   * if it does not resolve promptly the app falls back to a named region so the
   * console renders real data instead of an endless loading state. The state
   * keeps `mode: "gps"` for a real fix and reports the fallback through `place`,
   * so the source of the region is never misrepresented.
   */
  useEffect(() => {
    if (state.status !== "idle") return;
    const id = ++seq.current;

    // Guarantees the console gets a region even if geolocation never answers.
    const fallback = setTimeout(() => {
      if (id !== seq.current) return;
      void fetchFor(DEFAULT_LAT, DEFAULT_LON, "selected", fallbackPlace());
    }, FALLBACK_AFTER_MS);

    if (!("geolocation" in navigator)) {
      clearTimeout(fallback);
      void fetchFor(DEFAULT_LAT, DEFAULT_LON, "selected", fallbackPlace());
      return;
    }

    setState((s) => ({ ...s, status: "locating", mode: "gps" }));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (id !== seq.current) return;
        clearTimeout(fallback);
        const { latitude, longitude } = pos.coords;
        let place: Place | null = null;
        try {
          place = await reverseGeocode(latitude, longitude);
        } catch {
          place = null;
        }
        await fetchFor(latitude, longitude, "gps", place);
      },
      () => {
        if (id !== seq.current) return;
        clearTimeout(fallback);
        setState((s) => ({
          ...s,
          status: "geolocation-denied",
          error: "location permission was not granted",
        }));
        void fetchFor(DEFAULT_LAT, DEFAULT_LON, "selected", fallbackPlace());
      },
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 600000, enableHighAccuracy: false },
    );

    return () => clearTimeout(fallback);
  }, [state.status, fetchFor]);

  const api = useMemo<WeatherApi>(
    () => ({ state, locate, selectPlace, retry }),
    [state, locate, selectPlace, retry],
  );

  return <WeatherContext.Provider value={api}>{children}</WeatherContext.Provider>;
}

export function useWeather(): WeatherApi {
  const ctx = useContext(WeatherContext);
  if (!ctx) {
    throw new Error("useWeather must be used inside <WeatherProvider>");
  }
  return ctx;
}
