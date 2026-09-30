import { Link } from "react-router-dom";
import { PageHead } from "../components/PageHead";
import { Panel, Badge, SectionHead, Metric, DataState } from "../components/primitives";
import { Icon, type IconName } from "../components/Icon";
import { MapBox } from "../components/MapBox";
import { LocationSearch } from "../components/LocationSearch";
import { useWeather } from "../lib/useWeather";
import { wmo, compass } from "../lib/weather";
import { fmtTime } from "../lib/format";
import { useMyIncidents } from "../lib/ops";
import { RISK_LABEL, primaryEvent, useAnalysis } from "../lib/analysis";

const PRIORITY_ACTIONS: Array<{ to: string; label: string; icon: IconName; tone?: "red" | "amber" }> = [
  { to: "/alerts", label: "ALERTS", icon: "alert" },
  { to: "/forecasts", label: "MAP", icon: "radar" },
  { to: "/live", label: "WEATHER", icon: "globe" },
  { to: "/safety", label: "SAFETY", icon: "shield" },
  { to: "/incidents", label: "REPORT", icon: "flag" },
  { to: "/safety", label: "EMERGENCY HELP", icon: "phone", tone: "red" },
];

const EMERGENCY_NUMBERS: Array<{ number: string; label: string; type: string }> = [
  { number: "112", label: "NATIONAL EMERGENCY NUMBER", type: "Police / Fire / Ambulance" },
  { number: "100", label: "POLICE", type: "Law enforcement" },
  { number: "101", label: "FIRE", type: "Fire and rescue" },
  { number: "102", label: "AMBULANCE", type: "Medical transport" },
  { number: "1078", label: "DISASTER HELPLINE", type: "State disaster management" },
];

const SAFETY_GUIDANCE: Array<{ t: string; d: string }> = [
  { t: "FLOODING", d: "Move to higher ground. Do not walk or drive through flood water." },
  { t: "EXTREME RAIN", d: "Avoid low-lying roads and drainage channels. Keep documents and livestock elevated." },
  { t: "HEAT", d: "Avoid direct sun during peak hours. Drink water and watch for heat stress signs." },
  { t: "THUNDERSTORM", d: "Seek shelter indoors. Avoid open fields, tall trees and water bodies." },
];

function QuickActions() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
        marginBottom: 18,
      }}
    >
      {PRIORITY_ACTIONS.map((a) => (
        <Link
          key={a.label}
          to={a.to}
          className="btn"
          style={{
            borderColor: a.tone === "red" ? "var(--red)" : "var(--border)",
            color: a.tone === "red" ? "var(--red)" : "var(--text-2)",
            justifyContent: "flex-start",
          }}
        >
          <Icon name={a.icon} size={15} /> {a.label}
        </Link>
      ))}
    </div>
  );
}

export function CitizenDashboard() {
  return (
    <div>
      <PageHead
        kicker="CITIZEN DASHBOARD"
        title="Alerts, weather and help for your area"
        sub="Prioritized information for residents, farmers and communities. Live weather uses your actual location when you allow it. VARUN-X never invents weather values or warnings."
        right={<Badge tone="cyan" dot>PUBLIC INTERFACE</Badge>}
      />
      <QuickActions />
      <section className="section">
        <AlertsSection />
      </section>
      <section className="section">
        <WeatherSection />
      </section>
      <section className="section">
        <HazardMapSection />
      </section>
      <section className="section">
        <SafetySection />
      </section>
      <section className="section">
        <ReportSection />
      </section>
      <section className="section">
        <VerifiedSection />
      </section>
    </div>
  );
}

/* ---------------- ALERTS ---------------- */

function AlertsSection() {
  const { state } = useWeather();
  const { state: analysisState } = useAnalysis({
    lat: state.coords?.lat ?? null,
    lon: state.coords?.lon ?? null,
    place: state.place?.name ?? null,
    mode: state.mode,
    enabled: state.status === "ready" && !!state.coords,
  });
  const ready = state.status === "ready" && !!state.data;
  const alerts: Array<{ severity: "green" | "amber" | "red"; title: string; note: string }> = [];

  if (ready && state.data) {
    const pop = Math.max(...state.data.hourly.precipitation_probability.slice(0, 6));
    const t = state.data.current;
    if (pop >= 60) alerts.push({ severity: "amber", title: "RAIN ADVISORY", note: `${pop}% precipitation probability in the next 6 hours` });
    if (t.temperature_2m >= 40) alerts.push({ severity: "red", title: "HEAT ADVISORY", note: `${Math.round(t.temperature_2m)}°C at threshold` });
    if (t.wind_speed_10m >= 50) alerts.push({ severity: "amber", title: "WIND ADVISORY", note: `Gusts at ${Math.round(t.wind_gusts_10m)} km/h` });
  }

  const analysis = analysisState.analysis;
  const modelEvents = analysis?.events ?? [];

  return (
    <Panel
      title="ALERTS FOR YOUR AREA"
      meta={
        ready
          ? `LIVE PROVIDER · ${state.place ? `${state.place.name}${state.place.state ? `, ${state.place.state}` : ""}` : ""}`
          : "LIVE PROVIDER NOT LOADED"
      }
      flush
    >
      <div style={{ padding: 14 }}>
        {ready ? (
          alerts.length > 0 ? (
            <div className="stack">
              {alerts.map((a) => (
                <div className="row-line" key={a.title}>
                  <div className="rl-l">
                    <Badge tone={a.severity} dot>{a.severity === "red" ? "WARNING" : "ALERT"}</Badge>
                    <span className="rl-t">{a.title}</span>
                  </div>
                  <span className="rl-s">{a.note}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="row-line">
              <div className="rl-l">
                <Badge tone="green" dot>NO ACTIVE WEATHER ALERT</Badge>
                <span className="rl-s">No provider threshold is currently crossed for this location.</span>
              </div>
            </div>
          )
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            Load your location below to compute live provider alerts. No warning is fabricated without live data.
          </p>
        )}
        <div className="divider" />
        <div className="stack" style={{ gap: 10 }}>
          <strong className="small uppercase mono" style={{ color: "var(--text-2)" }}>
            VARUN-X MODEL SIGNALS · SIMULATION
          </strong>
          {analysisState.status === "loading" ? (
            <p className="small muted" style={{ margin: 0 }}>Running the analysis pipeline…</p>
          ) : modelEvents.length > 0 ? (
            modelEvents.map((e) => (
              <div className="row-line" key={e.id}>
                <div className="rl-l">
                  <Badge tone="cyan" dot>SIM</Badge>
                  <span className="rl-t">{e.id}</span>
                </div>
                <span className="rl-s">
                  {e.title} · {e.region} · <Badge tone={e.risk === "critical" ? "red" : e.risk === "high" ? "amber" : "blue"}>{RISK_LABEL[e.risk]}</Badge>
                  {" · "}
                  {e.activeNow ? "active now" : `last active ${e.lastActiveLabel}`}
                </span>
              </div>
            ))
          ) : analysisState.status === "unavailable" ? (
            <p className="small muted" style={{ margin: 0 }}>
              The analysis service is unavailable. No substitute signal is shown.
            </p>
          ) : analysis ? (
            <p className="small muted" style={{ margin: 0 }}>
              No simulation signals were detected in the analysis window for this location.
            </p>
          ) : (
            <p className="small muted" style={{ margin: 0 }}>
              Load your location to run the VARUN-X analysis.
            </p>
          )}
          {analysis?.origin && (
            <span className="small muted mono">
              ANALYSIS ORIGIN · {analysis.origin} · GENERATED {new Date(analysis.generatedAt).toISOString().slice(0, 16).replace("T", " ")}Z
            </span>
          )}
        </div>
        <Link className="btn btn-outline btn-sm" style={{ marginTop: 14 }} to="/alerts">
          <Icon name="alert" size={14} /> View all alerts
        </Link>
      </div>
    </Panel>
  );
}

/* ---------------- WEATHER ---------------- */

function WeatherSection() {
  const { state, locate, selectPlace } = useWeather();
  const ready = state.status === "ready" && !!state.data && !!state.coords;

  return (
    <Panel
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Badge tone="cyan" dot>LIVE WEATHER</Badge>
          {ready && state.mode === "gps" && <Badge tone="blue">CURRENT LOCATION</Badge>}
          {ready && state.mode === "selected" && <Badge tone="amber">SELECTED LOCATION</Badge>}
        </span>
      }
      meta="OPEN-METEO · REAL PROVIDER · NO SIMULATED FALLBACK"
    >
      {ready && state.data ? (
        <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div className="small muted mono" style={{ marginBottom: 4 }}>
              {state.place ? `${state.place.name}${state.place.state ? `, ${state.place.state}` : ""}` : "DETECTED LOCATION"}
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 46, fontWeight: 700, lineHeight: 1 }}>
              {Math.round(state.data.current.temperature_2m)}
              <span style={{ fontSize: 18, color: "var(--text-2)" }}>°C</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>
              {wmo(state.data.current.weather_code).label}
            </div>
            <div className="small muted mono" style={{ marginTop: 6 }}>
              UPDATED {fmtTime(state.data.current.time, state.data.timezone)}
            </div>
          </div>
          <div className="kv-grid" style={{ flex: 1, minWidth: 280 }}>
            <Metric label="Feels like" value={`${Math.round(state.data.current.apparent_temperature)}°C`} />
            <Metric label="Humidity" value={`${Math.round(state.data.current.relative_humidity_2m)}%`} />
            <Metric label="Wind" value={`${compass(state.data.current.wind_direction_10m)} ${Math.round(state.data.current.wind_speed_10m)} km/h`} />
            <Metric label="Pressure" value={`${Math.round(state.data.current.pressure_msl)} hPa`} />
            <Metric
              label="Rain prob (6h)"
              value={`${Math.max(...state.data.hourly.precipitation_probability.slice(0, 6))}%`}
            />
          </div>
        </div>
      ) : (
        <DataState
          icon={state.status === "unavailable" ? "x" : "locate"}
          title={state.status === "unavailable" ? "WEATHER DATA UNAVAILABLE" : "LIVE WEATHER AVAILABLE ON REQUEST"}
          desc={
            state.status === "unavailable"
              ? "Live weather could not be retrieved. No simulated values are substituted."
              : "Allow access or pick a location to fetch real current weather and forecasts."
          }
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={locate} disabled={state.status === "locating" || state.status === "fetching"}>
                <Icon name="locate" size={14} /> Use My Location
              </button>
              <span className="muted small mono" style={{ alignSelf: "center" }}>OR</span>
              <div style={{ minWidth: 240, maxWidth: 380, position: "relative", zIndex: 900 }}>
                <LocationSearch onSelect={selectPlace} />
              </div>
            </div>
          }
        />
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <Link className="btn btn-outline btn-sm" to="/live">
          <Icon name="globe" size={14} /> Detailed forecast
        </Link>
        <Link className="btn btn-outline btn-sm" to="/forecasts">
          <Icon name="wave" size={14} /> Forecast comparison
        </Link>
      </div>
    </Panel>
  );
}

/* ---------------- HAZARD MAP ---------------- */

function HazardMapSection() {
  const { state } = useWeather();
  const { state: analysisState } = useAnalysis({
    lat: state.coords?.lat ?? null,
    lon: state.coords?.lon ?? null,
    place: state.place?.name ?? null,
    mode: state.mode,
    enabled: state.status === "ready" && !!state.coords,
  });
  const analysis = analysisState.analysis;
  const event = primaryEvent(analysis);
  // The overlay is the server's own risk grid for the earliest forecast frame.
  const frame = analysis?.frames?.[0] ?? null;
  const field = frame?.fields.risk ?? null;
  const coords = state.coords;
  const fallback = event?.track[0] ?? null;
  const ready = analysisState.status === "ready";

  return (
    <section aria-label="Hazard map">
      <SectionHead
        num="// HAZARD MAP"
        title="Weather and hazard map for your area"
        sub="Radar is live provider data. The coloured overlay and the tracked object are VARUN-X model output, not an official warning, and are labelled as such. The map centers on your detected position when available."
      />
      <Panel flush>
        <div style={{ height: 420 }}>
          <MapBox
            center={coords ?? (fallback ? { lat: fallback.lat, lon: fallback.lon } : undefined)}
            zoom={coords ? 8 : 5}
            height={420}
            event={event}
            field={field}
            kind="risk"
            timeIdx={-1}
            showOverlay={!!field}
            showTrack
            showRadar
            pins={
              coords
                ? [
                    {
                      lat: coords.lat,
                      lon: coords.lon,
                      label: state.mode === "gps" ? "YOUR LOCATION (GPS)" : "SELECTED LOCATION",
                      tone: state.mode === "gps" ? "blue" : "amber",
                    },
                  ]
                : []
            }
            flyTo={coords ? { lat: coords.lat, lon: coords.lon, zoom: 8 } : null}
          />
        </div>
        <p className="small muted" style={{ padding: "10px 12px", margin: 0 }}>
          {ready && field
            ? `Overlay is the VARUN-X ${analysis?.baseline.label ?? "model"} risk field for ${frame?.label}, produced by the server from provider data. Radar tiles are live provider imagery. Neither is an official alert.`
            : analysisState.status === "unavailable"
              ? "The analysis service is unavailable. Only live provider radar is shown and no overlay is substituted."
              : "Load your location to compute the VARUN-X risk overlay. No field is drawn until the server returns one."}
        </p>
      </Panel>
    </section>
  );
}

/* ---------------- SAFETY ---------------- */

function SafetySection() {
  return (
    <section aria-label="Safety and emergency help">
      <SectionHead
        num="// SAFETY & EMERGENCY HELP"
        title="What to do in extreme weather"
        sub="General protective guidance. Follow official local authority instructions above all. Shelters and road closures render only from verified authority data."
      />
      <div className="two-col">
        <Panel title="PROTECTIVE ACTIONS" meta="GENERAL GUIDANCE" flush>
          <div className="stack" style={{ padding: 14 }}>
            {SAFETY_GUIDANCE.map((g) => (
              <div className="row-line" key={g.t} style={{ alignItems: "flex-start" }}>
                <strong className="small mono" style={{ flex: "0 0 150px", color: "var(--text-2)" }}>{g.t}</strong>
                <span className="rl-s" style={{ fontSize: 12.5, color: "var(--text-2)" }}>{g.d}</span>
              </div>
            ))}
          </div>
        </Panel>
        <div className="console-stack">
          <Panel title="EMERGENCY CONTACTS" meta="NATIONAL NUMBERS · VERIFY LOCAL" flush>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Service</th>
                  </tr>
                </thead>
                <tbody>
                  {EMERGENCY_NUMBERS.map((c) => (
                    <tr key={c.number}>
                      <td className="mono-val">{c.number}</td>
                      <td className="muted small">{c.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ padding: "6px 12px", margin: 0 }}>
              Verify local numbers before field use. The prototype does not place calls.
            </p>
          </Panel>
        </div>
      </div>
      <div className="two-col" style={{ marginTop: 16 }}>
        <Panel title="NEARBY SHELTERS">
          <DataState
            icon="pin"
            title="AWAITING AUTHORITY DATA"
            desc="Shelter locations are published only from a verified authority feed. None are fabricated."
          />
        </Panel>
        <Panel title="ROAD CLOSURES">
          <DataState
            icon="alert"
            title="NO VERIFIED INFORMATION"
            desc="Road closure data renders only when verified authority data is available."
          />
        </Panel>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <Link className="btn btn-primary" to="/assistant">
          <Icon name="chat" size={14} /> Ask the AI Disaster Assistant
        </Link>
        <Link className="btn btn-outline" to="/safety">
          <Icon name="shield" size={14} /> Open Safety & Help
        </Link>
      </div>
    </section>
  );
}

/* ---------------- REPORT ---------------- */

function ReportSection() {
  const { state, reload } = useMyIncidents();
  const recent = (state.data?.incidents ?? []).slice(-5).reverse();
  const STATUS_TONE: Record<string, "green" | "blue" | "amber" | "muted"> = {
    RESOLVED: "green",
    VERIFIED: "blue",
    "UNDER REVIEW": "amber",
    RECEIVED: "muted",
  };
  return (
    <section aria-label="Report an incident">
      <SectionHead
        num="// REPORT INCIDENT"
        title="Report an incident and track its status"
        sub="Reports are never auto-verified. Status moves only with authority verification: RECEIVED → UNDER REVIEW → VERIFIED → RESOLVED."
      />
      <div className="grid-2c">
        <Panel title="REPORT AFFECTED AREAS" flush>
          <div className="stack" style={{ gap: 12, padding: 14 }}>
            <p className="small muted" style={{ margin: 0 }}>
              Report flooding, blocked roads, damage, injured or missing people, electricity failure, fire, water shortage and other incidents.
            </p>
            <Link className="btn btn-primary" to="/incidents">
              <Icon name="flag" size={14} /> Report an incident
            </Link>
          </div>
        </Panel>
        <Panel
          title="RECENT REPORT STATUS"
          meta={state.status === "ready" ? "YOUR REPORTS · SERVER DATABASE" : "SERVER DATABASE"}
        >
          {state.status === "loading" ? (
            <DataState icon="doc" title="LOADING" desc="Reading your reports from the VARUN-X server." />
          ) : state.status === "unavailable" || state.status === "forbidden" ? (
            <DataState
              icon="alert"
              title="REPORTS UNAVAILABLE"
              desc={
                state.error ??
                "The server did not return your reports. No browser-local list is shown instead."
              }
              action={
                <button className="btn btn-primary" onClick={reload}>
                  Retry
                </button>
              }
            />
          ) : recent.length === 0 ? (
            <DataState icon="doc" title="NO REPORTS" desc="Submitted reports will appear here with their current status." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Reported</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td className="mono-val">{r.id}</td>
                      <td className="mono-val">{fmtTime(r.occurred_at || r.created_at)}</td>
                      <td>
                        <Badge tone={STATUS_TONE[r.status] ?? "muted"}>{r.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- VERIFIED / AGRI ---------------- */

function VerifiedSection() {
  return (
    <section aria-label="Verified updates">
      <SectionHead
        num="// VERIFIED UPDATES"
        title="Verified disaster information and agricultural impact"
        sub="Only verified authority data is shown. No casualty, relief or impact figures are fabricated."
      />
      <div className="two-col">
        <Panel title="VERIFIED DISASTER UPDATES">
          <DataState
            icon="doc"
            title="NO VERIFIED UPDATES"
            desc="No verified disaster information is currently published for your area by a connected authority source."
          />
        </Panel>
        <Panel title="AGRICULTURAL WEATHER IMPACT">
          <DataState
            icon="drop"
            title="AWAITING AUTHORITY ADVISORIES"
            desc="Crop and livestock exposure advisories appear only from official agricultural guidance. VARUN-X does not generate unsupported farming instructions."
          />
        </Panel>
      </div>
    </section>
  );
}