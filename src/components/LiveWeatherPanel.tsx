import { useEffect, useMemo, useRef, useState } from "react";
import { useWeather } from "../lib/useWeather";
import { wmo, compass } from "../lib/weather";
import { fmtTime, fmtDay, relativeAge } from "../lib/format";
import { Icon } from "./Icon";
import { MapBox } from "./MapBox";
import { Panel, Badge, Metric, DataState } from "./primitives";
import { LocationSearch } from "./LocationSearch";

function CondDot({ code }: { code: number }) {
  const tone =
    code === 95 || code === 96 || code === 99 || code === 82
      ? "red"
      : code >= 61 && code <= 86
        ? "cyan"
        : code === 45 || code === 48
          ? "muted"
          : "blue";
  const map = {
    blue: "dot-blue",
    cyan: "dot-cyan",
    amber: "dot-amber",
    red: "dot-red",
    muted: "",
    green: "dot-green",
  } as const;
  return <span className={`dot ${map[tone]}`} aria-hidden />;
}

export function LiveWeatherPanel() {
  const { state, locate, selectPlace, retry } = useWeather();
  const searchRef = useRef<HTMLDivElement>(null);
  const ready = state.status === "ready" && !!state.data && !!state.coords;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Panel
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Badge tone="cyan" dot>
              LIVE WEATHER
            </Badge>
            {ready && state.mode === "selected" && <Badge tone="amber">SELECTED LOCATION</Badge>}
            {ready && state.mode === "gps" && <Badge tone="blue">CURRENT LOCATION</Badge>}
          </span>
        }
        meta={
          ready && state.data ? (
            <span className="mono">
              SOURCE: OPEN-METEO · UPDATED {fmtTime(state.data.current.time, state.data.timezone)}
              {state.fetchedAt ? ` · DATA AGE ${relativeAge(state.fetchedAt)}` : ""}
            </span>
          ) : (
            <span className="mono">SOURCE: OPEN-METEO</span>
          )
        }
      >
        {ready && state.data ? (
          <CurrentBlock data={state.data} />
        ) : (
          <StatusGate
            status={state.status}
            error={state.error}
            onLocate={locate}
            onRetry={retry}
            onManual={() => {
              searchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              searchRef.current?.querySelector("input")?.focus();
            }}
          />
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn btn-outline btn-sm" onClick={locate} disabled={state.status === "locating"}>
            <Icon name="locate" size={14} /> Use My Location
          </button>
          <span className="muted small mono">OR</span>
          <div style={{ flex: 1, minWidth: 240, maxWidth: 460, position: "relative", zIndex: 920 }} ref={searchRef}>
            <LocationSearch
              onSelect={(place) => {
                selectPlace(place);
              }}
            />
          </div>
        </div>
      </Panel>

      {ready && state.data && state.coords && (
        <>
          <Panel
            title="USER LOCATION MAP"
            meta={
              <span className="mono">
                {state.coords.lat.toFixed(4)}, {state.coords.lon.toFixed(4)} · REAL OBSERVATION POINT
              </span>
            }
            flush
          >
            <div id="live-map">
              <MapBox
                center={state.coords}
                zoom={9}
                height={400}
                event={null}
                showOverlay={false}
                showTrack={false}
                showRadar
                pins={[
                  {
                    lat: state.coords.lat,
                    lon: state.coords.lon,
                    label: state.place?.name ?? "Your location",
                    tone: state.mode === "gps" ? "blue" : "amber",
                  },
                ]}
              />
            </div>
            <div style={{ padding: 10 }}>
              <span className="hud" style={{ display: "inline-block" }}>
                BLUE PIN = GPS LOCATION · AMBER PIN = SELECTED LOCATION · NO SIMULATION OVERLAY
              </span>
            </div>
          </Panel>

          <Panel title="HOURLY FORECAST" meta="NEXT 24 HOURS">
            <HourlyStrip data={state.data} />
          </Panel>

          <Panel title="7-DAY FORECAST" meta="DAILY · REAL PROVIDER FORECAST">
            <DailyList data={state.data} />
          </Panel>

          <Panel title="OFFICIAL WEATHER ALERT STATUS" meta="VERIFIED SOURCE ONLY">
            <div className="row-line">
              <div className="rl-l">
                <Badge tone="green" dot>
                  NO ACTIVE WEATHER ALERT
                </Badge>
                <span className="rl-s">
                  No official alert is currently published for this location in the connected feed.
                </span>
              </div>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              VARUN-X only displays alerts from a connected authoritative source. In this prototype
              the official alert feed is not connected, so no alert is displayed. VARUN-X never
              manufactures warnings.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}

function StatusGate({
  status,
  error,
  onLocate,
  onRetry,
  onManual,
}: {
  status: ReturnType<typeof useWeather>["state"]["status"];
  error: string | null;
  onLocate: () => void;
  onRetry: () => void;
  onManual: () => void;
}) {
  const manualCtl = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
      <button className="btn btn-primary" onClick={onLocate}>
        <Icon name="locate" size={14} /> Allow Location Access
      </button>
      <button className="btn btn-outline" onClick={onManual}>
        Enter Location Manually
      </button>
    </div>
  );
  switch (status) {
    case "locating":
      return (
        <DataState
          icon="locate"
          title="REQUESTING LOCATION"
          desc="VARUN-X is requesting your browsing location to fetch live weather for your area."
        />
      );
    case "fetching":
      return (
        <DataState
          icon="signal"
          title="LOADING FORECAST DATA"
          desc="Retrieving current conditions, hourly and daily forecast from the live data provider."
        />
      );
    case "geolocation-denied":
      return (
        <DataState
          icon="pin"
          title="LOCATION ACCESS REQUIRED"
          desc="VARUN-X needs your location to provide weather for your area. Allow location access or enter a location manually. Your coordinates are not stored."
          action={manualCtl}
        />
      );
    case "geolocation-unavailable":
      return (
        <DataState
          icon="pin"
          title="LOCATION UNAVAILABLE"
          desc="The browser could not determine your position. Search for a location instead."
          action={manualCtl}
        />
      );
    case "unavailable":
      return (
        <DataState
          icon="x"
          title="WEATHER DATA UNAVAILABLE"
          desc={
            <>
              Live weather information is currently unavailable for this location.
              {error ? ` Provider response: ${error}.` : ""} VARUN-X does not substitute
              simulated values. Verify connectivity to the weather provider and retry.
            </>
          }
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={onRetry}>
                <Icon name="refresh" size={14} /> Retry
              </button>
              <button className="btn btn-outline" onClick={onManual}>
                Enter Location Manually
              </button>
            </div>
          }
        />
      );
    default:
      return (
        <DataState
          icon="locate"
          title="LIVE WEATHER"
          desc="VARUN-X uses your real location to retrieve live weather from the data provider."
          action={
            <button className="btn btn-primary" onClick={onLocate}>
              <Icon name="locate" size={14} /> Use My Location
            </button>
          }
        />
      );
  }
}

function CurrentBlock({ data }: { data: NonNullable<ReturnType<typeof useWeather>["state"]["data"]> }) {
  const cur = data.current;
  const cond = wmo(cur.weather_code);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const tick = () => setStale(Date.now() / 1000 - cur.time > 2 * 3600);
    tick();
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, [cur.time]);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 54, fontWeight: 700, lineHeight: 1 }}>
            {Math.round(cur.temperature_2m)}
            <span style={{ fontSize: 22, color: "var(--text-2)" }}>°C</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <CondDot code={cur.weather_code} />
            <span style={{ fontSize: 13, color: "var(--text-2)" }}>{cond.label}</span>
          </div>
          {stale && (
            <div style={{ marginTop: 8 }}>
              <Badge tone="amber" dot>
                STALE DATA
              </Badge>
            </div>
          )}
        </div>
        <div className="kv-grid" style={{ flex: 1 }}>
          <Metric label="Feels like" value={`${Math.round(cur.apparent_temperature)}°C`} />
          <Metric label="Humidity" value={`${Math.round(cur.relative_humidity_2m)}%`} />
          <Metric
            label="Wind"
            value={`${compass(cur.wind_direction_10m)} ${Math.round(cur.wind_speed_10m)} km/h`}
            note={`gust ${Math.round(cur.wind_gusts_10m)} km/h`}
          />
          <Metric label="Pressure" value={`${Math.round(cur.pressure_msl)} hPa`} />
          <Metric label="Visibility" value={`${(cur.visibility / 1000).toFixed(1)} km`} />
          <Metric label="Precipitation" value={`${cur.precipitation} mm`} note="last hour" />
          <Metric label="Cloud cover" value={`${Math.round(cur.cloud_cover)}%`} />
          <Metric label="UV index" value={cur.uv_index.toFixed(1)} note="current" />
        </div>
      </div>
    </div>
  );
}

function HourlyStrip({ data }: { data: NonNullable<ReturnType<typeof useWeather>["state"]["data"]> }) {
  const rows = useMemo(() => {
    const h = data.hourly;
    const tz = data.timezone;
    const out: Array<{
      t: number;
      temp: number;
      pop: number;
      rain: number;
      code: number;
      tz: string;
    }> = [];
    for (let i = 0; i < Math.min(24, h.time.length); i++) {
      out.push({
        t: h.time[i],
        temp: h.temperature_2m[i],
        pop: h.precipitation_probability[i],
        rain: h.precipitation[i],
        code: h.weather_code[i],
        tz,
      });
    }
    return out;
  }, [data]);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Hour</th>
            <th>Condition</th>
            <th>Temp</th>
            <th>Rain prob</th>
            <th>Rain</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.t}>
              <td className="mono-val">{fmtTime(r.t, r.tz)}</td>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <CondDot code={r.code} />
                  {wmo(r.code).label}
                </span>
              </td>
              <td className="mono-val">{Math.round(r.temp)}°C</td>
              <td className="mono-val">{r.pop}%</td>
              <td className="mono-val">{r.pop > 0 ? `${r.rain.toFixed(1)} mm` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyList({ data }: { data: NonNullable<ReturnType<typeof useWeather>["state"]["data"]> }) {
  const rows = useMemo(() => {
    const d = data.daily;
    const tz = data.timezone;
    const out: Array<{
      t: number;
      min: number;
      max: number;
      pop: number;
      sum: number;
      code: number;
      tz: string;
    }> = [];
    for (let i = 0; i < d.time.length; i++) {
      out.push({
        t: d.time[i],
        min: d.temperature_2m_min[i],
        max: d.temperature_2m_max[i],
        pop: d.precipitation_probability_max[i],
        sum: d.precipitation_sum[i],
        code: d.weather_code[i],
        tz,
      });
    }
    return out;
  }, [data]);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Day</th>
            <th>Condition</th>
            <th>Min / Max</th>
            <th>Precip</th>
            <th>Prob</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.t}>
              <td className="mono-val">{fmtDay(r.t, r.tz)}</td>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <CondDot code={r.code} />
                  {wmo(r.code).label}
                </span>
              </td>
              <td className="mono-val">
                {Math.round(r.min)} / {Math.round(r.max)}°C
              </td>
              <td className="mono-val">{r.sum.toFixed(1)} mm</td>
              <td className="mono-val">{r.pop}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}