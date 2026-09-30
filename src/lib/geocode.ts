import { api } from "./api";

export interface Place {
  name: string;
  district?: string;
  state?: string;
  country?: string;
  lat: number;
  lon: number;
  source: "reverse" | "manual";
}

interface ServerPlace {
  name: string | null;
  district?: string | null;
  state?: string | null;
  country?: string | null;
  lat: number;
  lon: number;
  source: string;
}

/**
 * Reverse geocoding runs on the VARUN-X server. The browser sends only
 * coordinates; it never calls a geocoding provider directly, so no provider
 * key or client-side rate limit applies.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<Place> {
  const res = await api<{ place: ServerPlace | null }>("/api/geo/reverse", {
    query: { lat: lat.toFixed(5), lon: lon.toFixed(5) },
    signal,
  });
  if (!res.place) {
    return {
      name: "Detected location",
      lat,
      lon,
      source: "reverse",
    };
  }
  return {
    name: res.place.name ?? "Detected location",
    district: res.place.district ?? undefined,
    state: res.place.state ?? undefined,
    country: res.place.country ?? undefined,
    lat,
    lon,
    source: "reverse",
  };
}

export interface GeoResult {
  name: string;
  admin1?: string;
  admin2?: string;
  country?: string;
  country_code?: string;
  latitude: number;
  longitude: number;
}

/** Forward geocoding runs on the VARUN-X server (Open-Meteo geocoding). */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<GeoResult[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await api<{ results: GeoResult[] }>("/api/geo/search", {
    query: { q },
    signal,
  });
  return res.results;
}

export function placeLabel(g: GeoResult): string {
  const parts = [g.name, g.admin1, g.country].filter(Boolean);
  return parts.join(", ");
}
