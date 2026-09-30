export interface RadarTopology {
  host: string;
  path: string;
  timestamp: number;
}

interface RainViewerResponse {
  host?: string;
  radar?: {
    past?: Array<{ time: number; path: string }>;
    nowcast?: Array<{ time: number; path: string }>;
  };
}

/**
 * RainViewer free weather-radar API (keyless). Returns the most recent
 * available radar frame as a WMTS tile path. Real observational data.
 */
export async function fetchRadarLayer(): Promise<RadarTopology | null> {
  try {
    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as RainViewerResponse;
    const host = j.host ?? "https://api.rainviewer.com";
    const past = j.radar?.past ?? [];
    if (past.length === 0) return null;
    const latest = past[past.length - 1];
    return { host, path: latest.path, timestamp: latest.time };
  } catch {
    return null;
  }
}

export function radarTileUrl(topo: RadarTopology, size = 256): string {
  return `${topo.host}${topo.path}/${size}/{z}/{x}/{y}/2/0_0_0.png`;
}