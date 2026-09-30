import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { PageHead } from "../components/PageHead";
import { Badge, KV, Panel, SectionHead } from "../components/primitives";
import { fetchRadarLayer, type RadarTopology } from "../lib/radar";
import { useWeather, type WeatherStatus } from "../lib/useWeather";
import { fmtTime, relativeAge } from "../lib/format";

const LOCALE_KEY = "varun-x-lang";

type RadarState = "idle" | "checking" | "ok" | "down";

type Verbosity = "Low" | "Standard" | "Verbose";

interface SysEvent {
  id: number;
  at: number;
  text: string;
}

function weatherTone(s: WeatherStatus): "green" | "blue" | "red" | "muted" {
  switch (s) {
    case "ready":
      return "green";
    case "fetching":
    case "locating":
      return "blue";
    case "unavailable":
    case "geolocation-denied":
    case "geolocation-unavailable":
      return "red";
    default:
      return "muted";
  }
}

function weatherLabel(s: WeatherStatus): string {
  switch (s) {
    case "ready":
      return "LIVE";
    case "fetching":
      return "CHECKING";
    case "locating":
      return "LOCATING";
    case "unavailable":
      return "UNAVAILABLE";
    case "geolocation-denied":
      return "LOCATION DENIED";
    case "geolocation-unavailable":
      return "LOCATION UNAVAILABLE";
    default:
      return "IDLE";
  }
}

function radarBadge(state: RadarState) {
  switch (state) {
    case "ok":
      return <Badge tone="green" dot>CONNECTED</Badge>;
    case "checking":
      return <Badge tone="blue" dot>CHECKING</Badge>;
    case "down":
      return <Badge tone="red">UNAVAILABLE</Badge>;
    default:
      return <Badge tone="muted">IDLE</Badge>;
  }
}

function readLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_KEY);
  } catch {
    return null;
  }
}

function countFonts(): number {
  try {
    return document.fonts.size;
  } catch {
    return 0;
  }
}

const SIM_BADGES: Array<[string, "amber" | "muted"]> = [
  ["ANOMALY DETECTION", "amber"],
  ["GNN TRACK", "amber"],
  ["DIFFUSION", "amber"],
  ["RISK", "amber"],
];

export function SystemPage() {
  const weather = useWeather();
  const location = useLocation();

  const [sessionStart] = useState(() => Math.floor(Date.now() / 1000));
  const [now, setNow] = useState(() => Date.now());
  const [locale] = useState(readLocale);
  const [fontCount] = useState(countFonts);

  const [radar, setRadar] = useState<RadarTopology | null>(null);
  const [radarErr, setRadarErr] = useState(false);
  const [radarFetchEnabled, setRadarFetchEnabled] = useState(true);
  const [showSim, setShowSim] = useState(true);
  const [verbosity, setVerbosity] = useState<Verbosity>("Standard");

  const [events, setEvents] = useState<SysEvent[]>([]);
  const booted = useRef(false);
  const pathRef = useRef(location.pathname);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!radarFetchEnabled) return;
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
  }, [radarFetchEnabled]);

  function toggleRadarFetch(enabled: boolean) {
    setRadarFetchEnabled(enabled);
    if (!enabled) {
      setRadar(null);
      setRadarErr(false);
    }
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    pathRef.current = location.pathname;
    setEvents([{ id: 1, at: Math.floor(Date.now() / 1000), text: "SYSTEM BOOTED" }]);
  }, [location.pathname]);

  useEffect(() => {
    if (!booted.current) return;
    if (location.pathname !== pathRef.current) {
      pathRef.current = location.pathname;
      setEvents((es) => [
        ...es,
        { id: es.length + 1, at: Math.floor(Date.now() / 1000), text: `ROUTE CHANGE ${location.pathname}` },
      ]);
    }
  }, [location.pathname]);

  const wStatus = weather.state.status;
  const radarState: RadarState = !radarFetchEnabled ? "idle" : radarErr ? "down" : radar ? "ok" : "checking";
  const anyLive = wStatus === "ready" || radarState === "ok";
  const anyChecking = wStatus === "fetching" || wStatus === "locating" || radarState === "checking";
  const inputTone: "green" | "blue" | "muted" = anyLive ? "green" : anyChecking ? "blue" : "muted";
  const inputLabel = anyLive ? "LIVE" : anyChecking ? "CHECKING" : "IDLE";

  const radarSub = radarState === "ok" && radar
    ? `frame age ${relativeAge(radar.timestamp * 1000)}`
    : "observational radar tile provider";

  const visibleEvents = verbosity === "Verbose" ? events.slice(-25) : verbosity === "Low" ? events.slice(-4) : events.slice(-10);

  return (
    <div>
      <PageHead
        kicker="SYSTEM STATUS"
        title="System Status"
        sub="Status of data providers and pipeline stages. Checks are performed in-browser; anything not connected shows IDLE or PENDING."
        right={<Badge tone="muted">BROWSER-SCOPED CHECKS</Badge>}
      />
      <section className="section">
        <SectionHead num="// 01" title="Data Providers" />
        <div className="grid-2c">
          <Panel title="PROVIDER STATUS" meta="CHECKED IN-BROWSER">
            <div className="stack">
              <ProviderRow
                name="OPEN-METEO"
                sub="live weather provider"
                badge={
                  <Badge tone={weatherTone(wStatus)} dot>{weatherLabel(wStatus)}</Badge>
                }
              />
              <ProviderRow
                name="GEOCODING"
                sub="location name resolution, same flow"
                badge={
                  <Badge tone={weatherTone(wStatus)} dot>{weatherLabel(wStatus)}</Badge>
                }
              />
              <ProviderRow
                name="RAINVIEWER RADAR"
                sub={radarSub}
                badge={radarBadge(radarState)}
              />
            </div>
            <div className="divider" />
            <div className="stack">
              <ProviderRow
                name="BASEMAP TILES"
                sub="CARTO dark tiles, OSM attribution; tiles load on map mount"
                badge={<Badge tone="muted">PROVIDER-END</Badge>}
              />
              <ProviderRow
                name="OFFICIAL ALERT FEED"
                sub="authoritative alert ingestion, no feed connected"
                badge={<Badge tone="muted">NOT CONNECTED</Badge>}
              />
              <ProviderRow
                name="NOTIFICATION GATEWAY"
                sub="no gateway exists in this prototype"
                badge={<Badge tone="muted">IDLE</Badge>}
              />
            </div>
          </Panel>
          <div className="console-stack">
            <Panel
              title="RUNTIME TELEMETRY (SESSION)"
              meta={<Badge tone="muted">DEVICE-ONLY / SESSION-SCOPED</Badge>}
            >
              <KV
                items={[
                  ["Session start", <span key="a" className="mono-val">{fmtTime(sessionStart)}</span>],
                  ["Current device time", <span key="b" className="mono-val">{fmtTime(Math.round(now / 1000))}</span>],
                  ["Page load count", <span key="c" className="mono-val">1</span>],
                  ["Rendered route", <span key="d" className="mono-val">{location.pathname}</span>],
                  ["Build", <span key="e" className="mono-val">PROTOTYPE BUILD</span>],
                  ["Version", <span key="f" className="mono-val">VARUN-X v0.1.0</span>],
                ]}
              />
              <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
                All values come from this browser session only. No telemetry is transmitted.
              </p>
            </Panel>
            <Panel title="CONFIGURATION (SESSION)" meta="NOT PERSISTED">
              <div className="stack">
                <div className="row-line">
                  <span className="rl-t small">Enable radar fetch</span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={radarFetchEnabled}
                      onChange={(e) => toggleRadarFetch(e.target.checked)}
                      aria-label="Enable radar fetch"
                    />
                    <Badge tone={radarFetchEnabled ? "blue" : "muted"}>
                      {radarFetchEnabled ? "ON" : "OFF"}
                    </Badge>
                  </span>
                </div>
                <div className="row-line">
                  <span className="rl-l">
                    <span className="rl-t small">Show simulation datasets</span>
                    <span className="rl-s">toggles the simulation stage badges in the pipeline view</span>
                  </span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={showSim}
                      onChange={(e) => setShowSim(e.target.checked)}
                      aria-label="Show simulation datasets"
                    />
                    <Badge tone={showSim ? "amber" : "muted"}>
                      {showSim ? "ON" : "OFF"}
                    </Badge>
                  </span>
                </div>
                <div className="row-line">
                  <span className="rl-l">
                    <span className="rl-t small">Telemetry verbosity</span>
                    <span className="rl-s">limits how many recent system events are listed below</span>
                  </span>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                      className="select"
                      style={{ width: 140 }}
                      value={verbosity}
                      onChange={(e) => setVerbosity(e.target.value as Verbosity)}
                      aria-label="Telemetry verbosity"
                    >
                      <option value="Low">Low</option>
                      <option value="Standard">Standard</option>
                      <option value="Verbose">Verbose</option>
                    </select>
                    <Badge tone="muted">{verbosity.toUpperCase()}</Badge>
                  </span>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead num="// 02" title="Subsystem Checks and Event Log" />
        <div className="grid-2c">
          <Panel title="SUBSYSTEM CHECKS" meta="READ-ONLY" flush>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Subsystem</th>
                    <th>Check</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="mono-val">LOCALE STORED</td>
                    <td>localStorage read at boot</td>
                    <td>
                      <Badge tone={locale ? "green" : "muted"}>
                        {locale ? "STORED" : "NOT STORED"}
                      </Badge>
                      {locale && <span className="mono-val small" style={{ marginLeft: 8 }}>{locale}</span>}
                    </td>
                  </tr>
                  <tr>
                    <td className="mono-val">LOCATION PERMISSION</td>
                    <td>current useWeather status</td>
                    <td>
                      <Badge tone={weatherTone(wStatus)}>{weatherLabel(wStatus)}</Badge>
                    </td>
                  </tr>
                  <tr>
                    <td className="mono-val">NETWORK FETCH</td>
                    <td>not probed at boot</td>
                    <td>
                      <Badge tone="muted">OK ON WEATHER REQUEST</Badge>
                    </td>
                  </tr>
                  <tr>
                    <td className="mono-val">FONTS</td>
                    <td>document.fonts count</td>
                    <td>
                      <Badge tone="muted">{fontCount} FONTS</Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="RECENT SYSTEM EVENTS" meta="DEVICE TIME, SESSION ONLY">
            <div className="stack">
              {visibleEvents.map((ev) => (
                <div className="row-line" key={ev.id}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                    <Badge tone="muted">DEVICE</Badge>
                    <span className="mono-val small">{fmtTime(ev.at)}</span>
                    <span className="rl-t small" style={{ overflowWrap: "anywhere" }}>{ev.text}</span>
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <section className="section">
        <SectionHead num="// 03" title="Component & Pipeline Health" />
        <Panel title="PIPELINE" meta="PROTOTYPE PIPELINE">
          <div className="flow">
            <span className="step">
              INPUT DATA <Badge tone={inputTone} dot>{inputLabel}</Badge>
            </span>
            {showSim ? (
              SIM_BADGES.map(([step, tone]) => (
                <span key={step} style={{ display: "contents" }}>
                  <span className="arrow">→</span>
                  <span className="step">
                    {step} <Badge tone={tone}>SIMULATION READY - DEMO</Badge>
                  </span>
                </span>
              ))
            ) : (
              <span className="step">
                SIMULATION STAGES <Badge tone="muted">HIDDEN</Badge>
              </span>
            )}
            <span className="arrow">→</span>
            <span className="step">
              ALERT <Badge tone="muted">NO GATEWAY</Badge>
            </span>
          </div>
          <div className="divider" />
          <p className="small muted" style={{ margin: 0 }}>
            Detected live input feeds the chain only when providers report LIVE. Model stages are
            labeled simulation and are not production inference. The "Show simulation datasets"
            toggle above hides the simulation stage badges.
          </p>
        </Panel>
      </section>
    </div>
  );
}

function ProviderRow({
  name,
  sub,
  badge,
}: {
  name: string;
  sub: string;
  badge: ReactNode;
}) {
  return (
    <div className="row-line">
      <span className="rl-l">
        <span>
          <span className="rl-t small">{name}</span>
          <span className="rl-s" style={{ display: "block" }}>{sub}</span>
        </span>
      </span>
      {badge}
    </div>
  );
}