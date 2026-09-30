import { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  ImageOverlay,
  Polyline,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Field, FieldKind } from "../lib/analysis";
import { fieldToDataURL } from "../lib/fields";
import { fetchRadarLayer, radarTileUrl, type RadarTopology } from "../lib/radar";
import { Badge, Legend } from "./primitives";

const DARK_TILES =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const DARK_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export interface MapPin {
  lat: number;
  lon: number;
  label: string;
  tone?: "blue" | "red" | "cyan" | "amber";
}

const OVERLAY_LABEL: Record<FieldKind, string> = {
  precip: "PRECIPITATION FIELD",
  temp: "TEMPERATURE FIELD",
  wind: "WIND FIELD",
  efi: "EFI FIELD (SIMULATED ENSEMBLE)",
  risk: "RISK FIELD",
  anomaly: "ANOMALY vs BASELINE (SIMULATED BASELINE)",
};

const OVERLAY_LEGEND: Record<FieldKind, string[]> = {
  precip: ["DRY", "MODERATE", "HEAVY", "EXTREME"],
  temp: ["COLD", "NEUTRAL", "WARM", "HOT"],
  wind: ["LIGHT", "GALE", "STORM", "EXTREME"],
  efi: ["NORMAL", "ELEVATED", "HIGH", "EXTREME"],
  risk: ["LOW", "MODERATE", "HIGH", "CRITICAL"],
  anomaly: ["TYPICAL", "ABOVE TYPICAL", "WELL ABOVE", "EXTREME"],
};

const OVERLAY_COLORS: Record<FieldKind, string[]> = {
  precip: ["#42C6D9", "#4C8DFF", "#E5A93D", "#D95C5C"],
  temp: ["#4C8DFF", "#42C6D9", "#E5A93D", "#D95C5C"],
  wind: ["#42C6D9", "#4C8DFF", "#E5A93D", "#D95C5C"],
  efi: ["#42C6D9", "#4C8DFF", "#E5A93D", "#D95C5C"],
  risk: ["#55A878", "#E5A93D", "#D95C5C", "#D95C5C"],
  anomaly: ["#42C6D9", "#4C8DFF", "#E5A93D", "#D95C5C"],
};

const RADAR_LEGEND = [
  { c: "#42C6D9", l: "LIGHT" },
  { c: "#4C8DFF", l: "MODERATE" },
  { c: "#E5A93D", l: "HEAVY" },
  { c: "#D95C5C", l: "EXTREME" },
];

function CenterMap({
  target,
  zoom,
}: {
  target: { lat: number; lon: number };
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([target.lat, target.lon], zoom, { duration: 0.6 });
  }, [target.lat, target.lon, zoom, map]);
  return null;
}

/**
 * The minimum an event must expose to be drawn on the map.
 *
 * Deliberately structural rather than a single concrete type: the map only
 * needs an id, an optional "is it live" flag and a sparse track, so it stays
 * independent of whichever analysis payload produced it.
 */
export interface MapTrack {
  id: string;
  title?: string;
  region?: string;
  risk?: string;
  activeNow?: boolean;
  lastActiveLabel?: string;
  track: { tLabel: string; hours: number; lat: number; lon: number; intensity: number }[];
}

export interface MapBoxProps {
  center?: { lat: number; lon: number };
  zoom?: number;
  height?: number | string;
  pins?: MapPin[];
  event?: MapTrack | null;
  /** Grid returned by the server for the selected frame. */
  field?: Field | null;
  kind?: FieldKind;
  /** Index into the event's sparse track; -1 selects the last detected frame. */
  timeIdx?: number;
  showOverlay?: boolean;
  showTrack?: boolean;
  showRadar?: boolean;
  showRadarMeta?: boolean;
  flyTo?: { lat: number; lon: number; zoom: number } | null;
  className?: string;
}

export function MapBox({
  center = { lat: 20.5937, lon: 78.9629 },
  zoom = 5,
  height = 440,
  pins = [],
  event = null,
  field = null,
  kind = "risk",
  timeIdx = 3,
  showOverlay = true,
  showTrack = true,
  showRadar = true,
  showRadarMeta = true,
  flyTo = null,
  className = "",
}: MapBoxProps) {
  const [radar, setRadar] = useState<RadarTopology | null>(null);
  const [radarErr, setRadarErr] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchRadarLayer().then((topo) => {
      if (!alive) return;
      if (topo) {
        setRadar(topo);
      } else {
        setRadarErr(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const overlay = useMemo(() => {
    if (!showOverlay || !field) return null;
    return {
      url: fieldToDataURL(field),
      // The grid carries its own magnitude, so a constant opacity is honest
      // here; the earlier per-frame fade encoded a synthetic intensity curve.
      opacity: showRadar ? 0.6 : 0.78,
      bounds: [
        [field.latMin, field.lonMin],
        [field.latMax, field.lonMax],
      ] as [[number, number], [number, number]],
    };
  }, [showOverlay, field, showRadar]);

  const trackPos = useMemo(
    () => (event ? event.track.map((p) => [p.lat, p.lon] as [number, number]) : []),
    [event],
  );

  /**
   * The event track is sparse: it only holds frames where the object was
   * detected, so the requested index is clamped rather than assumed.
   */
  const marker = useMemo(() => {
    if (!event?.track.length) return null;
    const i = timeIdx >= 0 && timeIdx < event.track.length ? timeIdx : event.track.length - 1;
    return { point: event.track[i], index: i };
  }, [event, timeIdx]);

  const simBadge = overlay ? (
    <Badge tone="cyan" dot>
      SIMULATION OVERLAY
    </Badge>
  ) : null;

  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={zoom}
      style={{ height, width: "100%", background: "#0e1114" }}
      zoomControl={false}
      attributionControl={true}
      className={className}
    >
      <TileLayer
        attribution={DARK_ATTR}
        url={DARK_TILES}
        subdomains="abcd"
        maxZoom={19}
      />
      {showRadar && radar && !radarErr && (
        <TileLayer
          url={radarTileUrl(radar)}
          opacity={0.55}
          zIndex={500}
          maxNativeZoom={9}
          maxZoom={19}
        />
      )}
      {overlay && (
        <ImageOverlay
          url={overlay.url}
          bounds={overlay.bounds}
          opacity={overlay.opacity}
          zIndex={600}
        />
      )}
      {showTrack && trackPos.length > 0 && (
        <Polyline
          positions={trackPos}
          pathOptions={{
            color: "#D95C5C",
            weight: 2.2,
            opacity: 0.85,
            dashArray: "1 6",
          }}
        />
      )}
      {marker && (
        <CircleMarker
          center={[marker.point.lat, marker.point.lon]}
          radius={7}
          pathOptions={{
            color: "#42C6D9",
            weight: 2,
            fillColor: event?.activeNow ? "#D95C5C" : "#E5A93D",
            fillOpacity: 0.6,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <span className="mono">
              {event?.id} · {marker.point.tLabel}
            </span>
          </Tooltip>
        </CircleMarker>
      )}
      {pins.map((p, i) => (
        <CircleMarker
          key={`${p.label}-${i}`}
          center={[p.lat, p.lon]}
          radius={4}
          pathOptions={{
            color: p.tone === "red" ? "#D95C5C" : p.tone === "amber" ? "#E5A93D" : "#4C8DFF",
            weight: 2,
            fillColor: p.tone === "red" ? "#D95C5C" : "#4C8DFF",
            fillOpacity: 0.9,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <span className="mono">{p.label}</span>
          </Tooltip>
        </CircleMarker>
      ))}
      {flyTo && <CenterMap target={{ lat: flyTo.lat, lon: flyTo.lon }} zoom={flyTo.zoom} />}
      {simBadge && (
        <div className="map-o">
          {simBadge}
          <span className="hud mono">
            {event && showOverlay ? OVERLAY_LABEL[kind] : ""}
          </span>
        </div>
      )}
      <div className="map-o bottom">
        {radar && !radarErr ? (
          showRadarMeta && (
            <span className="hud">
              RADAR · {new Date(radar.timestamp * 1000).toISOString().slice(11, 16)}Z
            </span>
          )
        ) : (
          !radarErr && <span className="hud pulse">LOADING RADAR FRAME</span>
        )}
        <Legend
          items={showOverlay && overlay ? overlayLegendFor(kind) : RADAR_LEGEND}
        />
      </div>
      <div className="map-tools">
        <span className="hud mono">ZOOM · PAN</span>
      </div>
    </MapContainer>
  );
}

function overlayLegendFor(kind: FieldKind) {
  const labels = OVERLAY_LEGEND[kind];
  const colors = OVERLAY_COLORS[kind];
  return labels.map((l, i) => ({ c: colors[i], l }));
}

/** Picks one of the events the server actually returned for this location. */
export function EventSelect({
  events,
  onSelect,
  value,
  emptyLabel = "No tracked objects in the analysis window.",
}: {
  events: MapTrack[];
  onSelect: (ev: MapTrack) => void;
  /** null when the server returned no event at all. */
  value: string | null;
  emptyLabel?: string;
}) {
  if (!events.length) {
    return <span className="small muted">{emptyLabel}</span>;
  }
  return (
    <select
      className="select"
      value={value ?? events[0].id}
      style={{ maxWidth: 340 }}
      onChange={(e) => {
        const ev = events.find((x) => x.id === e.target.value);
        if (ev) onSelect(ev);
      }}
      aria-label="Select tracked object"
    >
      {events.map((ev) => (
        <option key={ev.id} value={ev.id}>
          {ev.id} · {ev.title}
          {ev.activeNow ? " · active now" : ` · last active ${ev.lastActiveLabel}`}
        </option>
      ))}
    </select>
  );
}
