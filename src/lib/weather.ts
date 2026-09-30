import { api } from "./api";

export interface CurrentWeather {
  time: number;
  interval: number;
  temperature_2m: number;
  relative_humidity_2m: number;
  apparent_temperature: number;
  is_day: number;
  precipitation: number;
  rain: number;
  showers: number;
  snowfall: number;
  weather_code: number;
  cloud_cover: number;
  pressure_msl: number;
  surface_pressure: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  wind_gusts_10m: number;
  visibility: number;
  uv_index: number;
}

export interface HourlyWeather {
  time: number[];
  temperature_2m: number[];
  precipitation_probability: number[];
  precipitation: number[];
  weather_code: number[];
  wind_speed_10m: number[];
}

export interface DailyWeather {
  time: number[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_probability_max: number[];
  precipitation_sum: number[];
  uv_index_max: number[];
  sunrise: number[];
  sunset: number[];
}

export interface WeatherResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  timezone: string;
  timezone_abbreviation: string;
  utc_offset_seconds: number;
  current: CurrentWeather;
  hourly: HourlyWeather;
  daily: DailyWeather;
  /** Added by the VARUN-X server: where the coordinates came from. */
  origin?: "GPS" | "SELECTED LOCATION";
  placeLabel?: string | null;
  serverTime?: number;
  _provenance?: {
    category: string;
    source: string;
    provider: string;
    retrievedAt: number;
    resolution: string;
    disclaimer: string;
  };
}

/**
 * Live weather is fetched from the VARUN-X server, never from the provider
 * directly. The browser therefore never holds a provider key and cannot be
 * pointed at a different upstream by client code.
 *
 * `mode` is sent explicitly because coordinates alone cannot distinguish a
 * device fix from a place the user picked on the map.
 */
export async function fetchWeather(
  lat: number,
  lon: number,
  place?: string,
  mode: "gps" | "selected" = "selected",
): Promise<WeatherResponse> {
  return api<WeatherResponse>("/api/weather", {
    query: {
      lat: lat.toFixed(4),
      lon: lon.toFixed(4),
      place,
      origin: mode === "gps" ? "GPS" : "SELECTED LOCATION",
    },
  });
}

export const WMO_CODES: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "sun" },
  1: { label: "Mainly clear", icon: "sun" },
  2: { label: "Partly cloudy", icon: "cloudy" },
  3: { label: "Overcast", icon: "cloud" },
  45: { label: "Fog", icon: "fog" },
  48: { label: "Depositing rime fog", icon: "fog" },
  51: { label: "Light drizzle", icon: "rain" },
  53: { label: "Moderate drizzle", icon: "rain" },
  55: { label: "Dense drizzle", icon: "rain" },
  56: { label: "Freezing drizzle", icon: "rain" },
  57: { label: "Freezing drizzle, dense", icon: "rain" },
  61: { label: "Slight rain", icon: "rain" },
  63: { label: "Moderate rain", icon: "rain" },
  65: { label: "Heavy rain", icon: "heavyrain" },
  66: { label: "Freezing rain", icon: "rain" },
  67: { label: "Freezing rain, heavy", icon: "heavyrain" },
  71: { label: "Slight snowfall", icon: "snow" },
  73: { label: "Moderate snowfall", icon: "snow" },
  75: { label: "Heavy snowfall", icon: "heavyrain" },
  77: { label: "Snow grains", icon: "snow" },
  80: { label: "Slight rain showers", icon: "rain" },
  81: { label: "Moderate rain showers", icon: "rain" },
  82: { label: "Violent rain showers", icon: "heavyrain" },
  85: { label: "Slight snow showers", icon: "snow" },
  86: { label: "Heavy snow showers", icon: "heavyrain" },
  95: { label: "Thunderstorm", icon: "storm" },
  96: { label: "Thunderstorm with slight hail", icon: "storm" },
  99: { label: "Thunderstorm with heavy hail", icon: "storm" },
};

export function wmo(code: number): { label: string; icon: string } {
  return WMO_CODES[code] ?? { label: "Unknown condition", icon: "cloud" };
}

export function compass(deg: number): string {
  const idx = Math.round(deg / 45) % 8;
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][idx];
}

export type WeatherStage =
  | "loading"
  | "ready"
  | "permission-denied"
  | "position-unavailable"
  | "api-unavailable"
  | "manual";

export interface WeatherBundle {
  stage: WeatherStage;
  coords: { lat: number; lon: number } | null;
  mode: "gps" | "selected";
  place: {
    name: string;
    district?: string;
    state?: string;
    country?: string;
    source: "reverse" | "manual" | "none";
  } | null;
  data: WeatherResponse | null;
  error?: string;
  fetchedAt?: number;
}