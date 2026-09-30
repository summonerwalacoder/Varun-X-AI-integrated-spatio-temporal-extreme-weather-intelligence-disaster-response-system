import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import {
  Panel,
  Badge,
  SectionHead,
  Metric,
  DataState,
  RiskBadge,
} from "../components/primitives";
import { MapBox, EventSelect } from "../components/MapBox";
import { GnnViz } from "../components/GnnViz";
import { FieldCanvas, LegendRamp } from "../components/FieldCanvas";
import { RiskEvolutionChart } from "../components/Charts";
import {
  intensityNow,
  intensityLater,
  type AnalysisFrame,
  type FieldKind,
  type AnalysisEvent,
} from "../lib/analysis";
import { useConsoleAnalysis, useRefinement, type ConsoleAnalysis } from "../lib/console";
import { useWeather } from "../lib/useWeather";
import { useSession, isCommand } from "../lib/session";

const STAGES = [
  { n: "01", name: "FORECAST", desc: "NWP ensemble forecasts and meteorological variables enter VARUN-X." },
  { n: "02", name: "DETECT", desc: "The system identifies unusual conditions against historical climatology." },
  { n: "03", name: "TRACK", desc: "Graph Neural Networks identify and follow evolving extreme-weather footprints." },
  { n: "04", name: "REFINE", desc: "Conditional diffusion selectively refines high-risk regions from approximately 12 km toward approximately 5 km resolution." },
  { n: "05", name: "PREDICT", desc: "Generate probabilistic high-resolution weather information while attempting to preserve extreme signals." },
  { n: "06", name: "WARN", desc: "Convert model outputs into location-specific risk alerts." },
  { n: "07", name: "RESPOND", desc: "Connect intelligence with emergency operations, authorities and citizens." },
];

export function Overview() {
  return (
    <div className="section" style={{ marginBottom: 0 }}>
      <Hero />
      <MissionConsole />
      <Pipeline />
      <ExtremeTypes />
      <GnnSection />
      <DiffusionSection />
      <RiskIntelligence />
      <WhyVarunX />
      <SmartAlerts />
      <RespondSection />
      <ModelChain />
      <DataArchitecture />
      <ResponsibleAI />
    </div>
  );
}

/* ---------------- hero ---------------- */

function Hero() {
  return (
    <section className="section" style={{ padding: "46px 0 34px" }}>
      <div className="uppercase small mono muted" style={{ marginBottom: 16 }}>
        SPATIO-TEMPORAL FORECAST INTELLIGENCE AND DISASTER RESPONSE
      </div>
      <h1 style={{ fontSize: 40, lineHeight: 1.08, maxWidth: 900, fontWeight: 700, letterSpacing: "-0.01em" }}>
        AI-Powered Intelligence for<span style={{ color: "var(--cyan)" }}> Extreme Weather</span>
      </h1>
      <p style={{ marginTop: 16, maxWidth: 720, color: "var(--text-2)", fontSize: 15.5, lineHeight: 1.6 }}>
        VARUN-X transforms large-scale numerical weather forecasts into actionable intelligence by
        detecting extreme anomalies, tracking their evolution, refining high-risk regions to higher
        spatial resolution, and delivering targeted warnings to authorities and communities.
      </p>
      <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
        <Link className="btn btn-primary" to="/live">
          <Icon name="radar" size={15} /> Explore Live Intelligence
        </Link>
        <Link className="btn btn-outline" to="/models">
          <Icon name="server" size={15} /> View System Architecture
        </Link>
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 22,
          flexWrap: "wrap",
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--muted)",
        }}
      >
        <Badge tone="cyan" dot>LIVE WEATHER</Badge>
        <Badge tone="blue" dot>NWP FORECAST</Badge>
        <Badge tone="muted">VARUN-X ANOMALY</Badge>
        <Badge tone="muted" dot>GNN TRACK</Badge>
        <Badge tone="muted" dot>DIFFUSION REFINEMENT</Badge>
        <Badge tone="green" dot>OFFICIAL ALERT</Badge>
        <Badge tone="amber" dot>SIMULATION / DEMO DATA</Badge>
      </div>
    </section>
  );
}

/* ---------------- mission console ---------------- */

const KINDS: Array<{ k: FieldKind; l: string }> = [
  { k: "risk", l: "Risk" },
  { k: "precip", l: "Precip" },
  { k: "efi", l: "EFI" },
  { k: "wind", l: "Wind" },
  { k: "temp", l: "Temp" },
];

function MissionConsole() {
  const c = useConsoleAnalysis();
  const weather = useWeather();
  const [kind, setKind] = useState<FieldKind>("risk");
  const field = c.field(kind);
  const userPin =
    weather.state.coords && weather.state.mode === "gps"
      ? [
          {
            lat: weather.state.coords.lat,
            lon: weather.state.coords.lon,
            label: "VERIFIED GPS POSITION",
            tone: "blue" as const,
          },
        ]
      : [];

  return (
    <section className="section" aria-label="Mission control console">
      <SectionHead
        num="// MISSION CONSOLE"
        title="Live Intel + Model Intelligence Console"
        sub="Server analysis for your current location. The live position pin is fetched from your browser when permission is granted; every overlay that is not live provider data is labelled."
        right={
          <Badge tone={c.origin === "GPS" ? "green" : "muted"}>
            {c.origin ?? "SELECTED LOCATION"}
          </Badge>
        }
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <EventSelect
          events={c.events}
          value={c.eventId}
          onSelect={(ev) => c.selectEvent(ev.id)}
          emptyLabel="NO OBJECT DETECTED IN THE ANALYSIS WINDOW"
        />
        <div className="layer-toggle" role="group" aria-label="Map layer">
          {KINDS.map((x) => (
            <button
              key={x.k}
              className={`layer-btn ${kind === x.k ? "active" : ""}`}
              onClick={() => setKind(x.k)}
            >
              {x.l}
            </button>
          ))}
        </div>
      </div>

      <ConsoleGate status={c.status} error={c.error} regionPending={c.regionPending} onRetry={() => void c.reload()}>
        <div className="console">
          <Panel
            title={`WEATHER / RISK MAP - ${c.eventId ?? "NO OBJECT"}`}
            meta={c.frame?.label ?? "—"}
            flush
          >
            <div style={{ height: 520 }}>
              <MapBox
                center={c.trackPoint ?? c.center ?? undefined}
                zoom={6}
                height={520}
                event={c.event}
                field={field}
                kind={kind}
                timeIdx={c.timeIdx}
                showOverlay
                showTrack
                showRadar
                pins={userPin}
                flyTo={
                  weather.state.coords
                    ? { lat: weather.state.coords.lat, lon: weather.state.coords.lon, zoom: 6 }
                    : null
                }
              />
            </div>
          </Panel>
          <ActiveAnomaly event={c.event} />
        </div>

        <div className="console" style={{ marginTop: 14 }}>
          <Panel
            title="GNN TRAJECTORY"
            meta="FIND + FOLLOW · PROTOTYPE MODEL OUTPUT"
          >
            <TimelineBar
              event={c.event}
              timeIdx={c.timeIdx}
              onTime={c.setTimeIdx}
            />
            <div style={{ marginTop: 12 }}>
              <GnnViz
                field={field}
                event={c.event}
                frameLabel={c.frame?.label ?? "—"}
                timeIdx={c.timeIdx}
                width={640}
                height={360}
              />
            </div>
          </Panel>
          <DiffusionPreview c={c} kind={kind} />
        </div>

        <div className="console-full" style={{ marginTop: 14 }}>
          <Panel
            title="TIME SERIES / RISK EVOLUTION"
            meta={
              <span className="mono" style={{ display: "inline-flex", gap: 12 }}>
                <span style={{ color: "var(--red)" }}>INTENSITY · SERVER</span>
                <span style={{ color: "var(--muted)" }}>NO SPREAD BAND RETURNED</span>
              </span>
            }
          >
            <div className="two-col">
              <div>
                {c.event ? (
                  <>
                    <RiskEvolutionChart event={c.event} />
                    <p className="small muted" style={{ marginTop: 6 }}>
                      {c.event.id} — server-detected evolution across{" "}
                      {c.event.track.length} frame{c.event.track.length === 1 ? "" : "s"} (
                      {c.event.track[0]?.tLabel} to {c.event.track[c.event.track.length - 1]?.tLabel}).
                      No ensemble spread is drawn because the server returns none.
                    </p>
                  </>
                ) : (
                  <DataState
                    icon="shield"
                    title="NO OBJECT DETECTED"
                    desc="The server found no extreme object for this location, so no evolution is plotted."
                  />
                )}
              </div>
              <div>
                <IntroToWeather />
              </div>
            </div>
          </Panel>
        </div>
      </ConsoleGate>
    </section>
  );
}

/** One shared loading/error/empty gate for the console sections. */
function ConsoleGate({
  status,
  error,
  regionPending,
  onRetry,
  children,
}: {
  status: string;
  error: string | null;
  regionPending: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (status === "loading" || status === "idle") {
    return (
      <Panel title="MISSION CONSOLE" meta="VARUN-X SERVER">
        <DataState
          icon="alert"
          title={regionPending ? "SELECT A REGION" : "LOADING ANALYSIS"}
          desc={
            regionPending
              ? "Allow location access or pick a location on the Live Weather page to load the model chain."
              : (error ?? "Requesting the model chain for the selected region.")
          }
          action={<button className="btn" onClick={onRetry}>RETRY</button>}
        />
      </Panel>
    );
  }
  if (status === "unavailable") {
    return (
      <Panel title="MISSION CONSOLE" meta="VARUN-X SERVER">
        <DataState
          icon="alert"
          title="ANALYSIS UNAVAILABLE"
          desc={error ?? "The server did not return an analysis. No client-side demo data is substituted."}
          action={
            <button className="btn btn-primary" onClick={onRetry}>
              Retry
            </button>
          }
        />
      </Panel>
    );
  }
  return <>{children}</>;
}

function IntroToWeather() {
  const { state, locate } = useWeather();
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <strong className="small uppercase mono" style={{ color: "var(--text-2)" }}>
          YOUR LOCAL WEATHER · LIVE DATA
        </strong>
        <button className="btn btn-outline btn-sm" onClick={locate} disabled={state.status === "locating" || state.status === "fetching"}>
          <Icon name="locate" size={14} />
          {state.status === "ready" ? "Refresh" : state.status === "locating" || state.status === "fetching" ? "Loading..." : "Use my location"}
        </button>
      </div>
      {state.status === "ready" && state.data ? (
        <LiveMini data={state.data} placeLabel={state.place?.name} mode={state.mode} />
      ) : (
        <DataState
          icon={state.status === "unavailable" ? "x" : "locate"}
          title={state.status === "unavailable" ? "WEATHER DATA UNAVAILABLE" : "LIVE WEATHER AVAILABLE ON REQUEST"}
          desc={
            state.status === "unavailable"
              ? "Live weather could not be retrieved. No simulated values are substituted."
              : "Click to fetch live current and forecast data for your actual location. Real provider data only."
          }
          action={
            (state.status === "geolocation-denied" || state.status === "geolocation-unavailable") && (
              <Link className="btn btn-outline btn-sm" to="/live">
                Enter location manually
              </Link>
            )
          }
        />
      )}
    </div>
  );
}

function LiveMini({ data, placeLabel, mode }: { data: NonNullable<ReturnType<typeof useWeather>["state"]["data"]>; placeLabel?: string; mode: "gps" | "selected" }) {
  const c = data.current;
  const rainProb = Math.max(...data.hourly.precipitation_probability.slice(0, 6));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, alignItems: "center" }}>
      <div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 40, fontWeight: 700 }}>
          {Math.round(c.temperature_2m)}
          <span style={{ fontSize: 18, color: "var(--text-2)" }}>°C</span>
        </div>
        <div className="small muted mono" style={{ marginTop: 2 }}>
          {wmoOf(c.weather_code)}
        </div>
      </div>
      <div className="kv" style={{ gridTemplateColumns: "130px 1fr" }}>
        <dt>Location</dt>
        <dd>
          {placeLabel ?? "Detected location"}{" "}
          <Badge tone={mode === "gps" ? "blue" : "amber"}>{mode === "gps" ? "GPS" : "SELECTED"}</Badge>
        </dd>
        <dt>Feels like</dt>
        <dd>{Math.round(c.apparent_temperature)}°C</dd>
        <dt>Rain prob (6h)</dt>
        <dd>{rainProb}%</dd>
        <dt>Humidity</dt>
        <dd>{Math.round(c.relative_humidity_2m)}%</dd>
        <dt>Wind</dt>
        <dd>{Math.round(c.wind_speed_10m)} km/h</dd>
        <dt>Pressure</dt>
        <dd>{Math.round(c.pressure_msl)} hPa</dd>
      </div>
    </div>
  );
}

function wmoOf(code: number) {
  const map: Record<number, string> = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle",
    61: "Rain", 63: "Rain", 65: "Heavy rain", 80: "Showers", 81: "Showers", 82: "Violent showers",
    95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
  };
  return map[code] ?? "-";
}

function TimelineBar({
  event,
  timeIdx,
  onTime,
}: {
  event: AnalysisEvent | null;
  timeIdx: number;
  onTime: (i: number) => void;
}) {
  if (!event?.track.length) {
    return <p className="small muted" style={{ margin: 0 }}>No detected frames to step through.</p>;
  }
  return (
    <div className="timeline" role="group" aria-label="Forecast timeline">
      {event.track.map((p, i) => (
        <button
          key={p.tLabel}
          className={`timeline-btn ${i === timeIdx ? "active" : ""}`}
          onClick={() => onTime(i)}
        >
          {p.tLabel}
        </button>
      ))}
    </div>
  );
}

function ActiveAnomaly({ event }: { event: AnalysisEvent | null }) {
  if (!event) {
    return (
      <div className="console-stack">
        <Panel title="ACTIVE ANOMALY" meta="VARUN-X SERVER">
          <DataState
            icon="shield"
            title="NO OBJECT DETECTED"
            desc="The server scanned the analysis window and did not detect an extreme object for this location."
          />
        </Panel>
      </div>
    );
  }
  const now = intensityNow(event);
  const peak = intensityLater(event);
  return (
    <div className="console-stack">
      <Panel
        title="ACTIVE ANOMALY"
        meta={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            {event.activeNow ? (
              <Badge tone="green" dot>ACTIVE NOW</Badge>
            ) : (
              <Badge tone="cyan" dot>LAST ACTIVE {event.lastActiveLabel}</Badge>
            )}
            <Badge tone="muted">PROTOTYPE MODEL OUTPUT</Badge>
          </span>
        }
      >
        <div className="stack">
          <div className="row-line">
            <div className="rl-l">
              <Icon name="target" size={16} className="muted" />
              <div>
                <div className="rl-t">{event.id}</div>
                <div className="rl-s">{event.title}</div>
              </div>
            </div>
            <RiskBadge risk={event.risk} />
          </div>
          <div className="kv">
            <dt>Status</dt>
            <dd style={{ textTransform: "uppercase", color: "var(--text)" }}>{event.status}</dd>
            <dt>Region</dt>
            <dd>{event.region}</dd>
            <dt>Detection tier</dt>
            <dd>{event.tier}</dd>
            <dt>Peak field</dt>
            <dd>{event.peakIntensity.toFixed(2)}</dd>
            <dt>Intensity now</dt>
            <dd>{now === null ? "NOT PRESENT NOW" : now.toFixed(2)}</dd>
            <dt>Peak in window</dt>
            <dd>{peak.toFixed(2)}</dd>
            <dt>Footprint area</dt>
            <dd>{Math.round(event.areaKm2).toLocaleString()} km²</dd>
            <dt>EFI peak</dt>
            <dd>{event.efiPeak.toFixed(2)} (prototype)</dd>
            <dt>Confidence</dt>
            <dd>{event.confidence.toFixed(2)} (model output)</dd>
            <dt>First appeared</dt>
            <dd>{event.introduced}</dd>
          </div>
          <p className="small muted">{event.note}</p>
        </div>
      </Panel>
      <Panel title="DETECTION → RESPOND CHAIN" flush>
        <div className="flow" style={{ padding: 12 }}>
          <span className="step">NWP</span>
          <span className="arrow">›</span>
          <span className="step">ERA5/IMDAA</span>
          <span className="arrow">›</span>
          <span className="step">EFI</span>
          <span className="arrow">›</span>
          <span className="step">GNN</span>
          <span className="arrow">›</span>
          <span className="step">DIFFUSE</span>
          <span className="arrow">›</span>
          <span className="step">RISK</span>
          <span className="arrow">›</span>
          <span className="step">ALERT</span>
        </div>
      </Panel>
    </div>
  );
}

/**
 * Before/after refinement straight from /api/analysis/refine. The coarse grid
 * and the refined grid are both returned by the server, so this is a real
 * comparison rather than a client-side upsample of a demo field.
 */
function DiffusionPreview({ c, kind }: { c: ConsoleAnalysis; kind: FieldKind }) {
  const point = c.trackPoint;
  const bounds = c.frame ? fieldBounds(c.frame, kind) : null;
  const r = useRefinement(
    point ? { lat: point.lat, lon: point.lon } : c.center,
    point ? hoursFromLabel(point.tLabel) : null,
    kind,
    bounds,
  );

  return (
    <Panel
      title="DIFFUSION REFINEMENT"
      meta="BEFORE / AFTER · PROTOTYPE MODEL OUTPUT"
    >
      <div className="stack" style={{ marginTop: 12 }}>
        {r.status === "loading" ? (
          <DataState icon="alert" title="REQUESTING REFINEMENT" desc="Asking the server for a refined grid." />
        ) : r.status === "unavailable" ? (
          <DataState
            icon="alert"
            title="REFINEMENT UNAVAILABLE"
            desc={r.error ?? "The server did not return a refinement. No field is generated in the browser."}
            action={
              <button className="btn btn-primary" onClick={r.reload}>
                Retry
              </button>
            }
          />
        ) : !r.coarse || !r.refined ? (
          <DataState
            icon="alert"
            title="NO REFINEMENT FOR THIS STEP"
            desc="Select a detected frame to request a server refinement."
          />
        ) : (
          <>
            <div className="stack">
              <FieldCanvas field={r.coarse} width={300} height={300} label="COARSE PARENT GRID" />
              <FieldCanvas field={r.refined} width={300} height={300} label="SERVER-REFINED GRID" />
            </div>
            <LegendRamp kind={kind} labels={["LOW", "MOD", "HIGH", "CRIT"]} />
            {r.metrics && (
              <div className="kv-grid">
                <Metric label="Parent cell" value={`${r.metrics.coarseCellKm.toFixed(2)} km`} note="server grid" />
                <Metric label="Refined cell" value={`${r.metrics.fineCellKm.toFixed(2)} km`} note="server grid" />
                <Metric label="Samples" value={String(r.metrics.samples)} note="diffusion draws" />
                <Metric label="Mass drift" value={`${r.metrics.massDriftPct.toFixed(2)}%`} note="conservation check" />
              </div>
            )}
            <p className="small muted">
              Conditional-diffusion refinement from the server. This stage is a prototype: it is
              labelled as simulated model output in the provenance table, and real operational
              inference would require a trained production model and a verified data pipeline.
            </p>
            {r.warnings.map((w) => (
              <p key={w} className="small muted" style={{ margin: 0 }}>⚠ {w}</p>
            ))}
          </>
        )}
      </div>
    </Panel>
  );
}

function hoursFromLabel(label: string): number | null {
  const m = /T([+-])(\d+)h/i.exec(label);
  if (!m) return null;
  return m[1] === "-" ? -Number(m[2]) : Number(m[2]);
}

function fieldBounds(frame: AnalysisFrame, kind: FieldKind) {
  const f = frame.fields?.[kind];
  if (f) {
    return { latMax: f.latMax, latMin: f.latMin, lonMin: f.lonMin, lonMax: f.lonMax };
  }
  const b = frame.fields && Object.values(frame.fields)[0];
  return b ? { latMax: b.latMax, latMin: b.latMin, lonMin: b.lonMin, lonMax: b.lonMax } : null;
}

/* ---------------- pipeline ---------------- */

function Pipeline() {
  return (
    <section className="section" id="pipeline">
      <SectionHead
        num="// CORE PIPELINE"
        title="From Forecast to Action"
        sub="Seven numbered stages connect global numerical weather prediction with localized intelligence and coordinated disaster response."
      />
      <div className="pipeline" role="list">
        {STAGES.map((s) => (
          <div className="pipe" key={s.n} role="listitem">
            <span className="pipe-num">{s.n}</span>
            <span className="pipe-name">{s.name}</span>
            <span className="pipe-desc">{s.desc}</span>
            <Icon name="chevron" size={12} className="pipe-arrow" />
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- extreme weather types ---------------- */

function ExtremeTypes() {
  const rows: Array<{ type: string; status: string; demo: boolean; period: string; region: string }> = [
    { type: "Cyclones", status: "GNN demo track", demo: true, period: "72 h", region: "Bay of Bengal" },
    { type: "Extreme Rainfall", status: "GNN demo track", demo: true, period: "72 h", region: "West coast (Konkan)" },
    { type: "Heatwaves", status: "GNN demo track", demo: true, period: "72 h", region: "Northwest India" },
    { type: "Cold Waves", status: "Pipeline designed", demo: false, period: "-", region: "North India" },
    { type: "Heat Domes", status: "Pipeline designed", demo: false, period: "-", region: "-" },
    { type: "Severe Storms", status: "Pipeline designed", demo: false, period: "-", region: "-" },
    { type: "Extreme Wind", status: "Pipeline designed", demo: false, period: "-", region: "-" },
    { type: "Flood Risk", status: "Pipeline designed", demo: false, period: "-", region: "-" },
    { type: "Drought Conditions", status: "Pipeline designed", demo: false, period: "-", region: "-" },
  ];
  return (
    <section className="section">
      <SectionHead
        num="// HAZARD REGISTRY"
        title="Extreme Weather Intelligence"
        sub="Prototype demonstration coverage is clearly separated from designed-but-not-demonstrated pipeline support."
      />
      <Panel flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Hazard</th>
                <th>Detection status</th>
                <th>Prototype demo</th>
                <th>Forecast period</th>
                <th>Region</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.type}>
                  <td className="mono-val">{r.type}</td>
                  <td>{r.status}</td>
                  <td>{r.demo ? <Badge tone="cyan">DEMO</Badge> : <Badge tone="muted">DESIGNED</Badge>}</td>
                  <td className="mono-val">{r.period}</td>
                  <td>{r.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

/* ---------------- GNN ---------------- */

function GnnSection() {
  const c = useConsoleAnalysis();
  const [kind, setKind] = useState<FieldKind>("risk");
  const field = c.field(kind);
  return (
    <section className="section">
      <SectionHead
        num="// GNN INTELLIGENCE"
        title="Find the anomaly. Follow its evolution."
        sub="VARUN-X represents the forecast field as a graph of geographically-ordered nodes holding meteorological variables. Neighbour edges encode spatial relationships. The GNN answers: where, how large, where moving, and how intensity changes."
        right={
          <Badge tone={c.origin === "GPS" ? "green" : "muted"}>
            {c.origin ?? "SELECTED LOCATION"}
          </Badge>
        }
      />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <EventSelect
          events={c.events}
          value={c.eventId}
          onSelect={(ev) => c.selectEvent(ev.id)}
          emptyLabel="NO OBJECT DETECTED IN THE ANALYSIS WINDOW"
        />
        <div className="layer-toggle" role="group" aria-label="GNN variable">
          {KINDS.map((x) => (
            <button key={x.k} className={`layer-btn ${kind === x.k ? "active" : ""}`} onClick={() => setKind(x.k)}>
              {x.l}
            </button>
          ))}
        </div>
      </div>
      <ConsoleGate status={c.status} error={c.error} regionPending={c.regionPending} onRetry={() => void c.reload()}>
        <div className="two-col">
          <Panel title={`GNN - NODE GRAPH (${c.eventId ?? "NO OBJECT"})`} meta="PROTOTYPE MODEL OUTPUT" flush>
            <TimelineBar event={c.event} timeIdx={c.timeIdx} onTime={c.setTimeIdx} />
            <div style={{ padding: 12 }}>
              <GnnViz
                field={field}
                event={c.event}
                frameLabel={c.frame?.label ?? "—"}
                timeIdx={c.timeIdx}
                width={640}
                height={400}
              />
            </div>
          </Panel>
          <div className="console-stack">
            <Panel title="CORE CONCEPT: FIND + FOLLOW">
              <div className="stack">
                {[
                  ["Where is the extreme anomaly?", "Extreme nodes are highlighted where the field deviates strongly from the climatological baseline (EFI proxy)."],
                  ["How large is its footprint?", "Footprint radius and extent are estimated from the connected extreme-node cluster (prototype stage, labelled in the provenance table)."],
                  ["Where is it moving?", "Track points across the analysis window define the trajectory. The amber motion vector shows step-to-step displacement."],
                  ["Is the intensity changing?", "Node values and the risk-evolution curve track intensity through the forecast window."],
                  ["How is the surrounding region evolving?", "Graph edges and node values capture how neighbouring regions warm or moisten as the object moves."],
                ].map(([q, a]) => (
                  <div key={q} className="row-line" style={{ alignItems: "flex-start" }}>
                    <div style={{ color: "var(--text)", fontSize: 13, fontWeight: 600, maxWidth: 200, flex: "0 0 200px" }}>{q}</div>
                    <span style={{ color: "var(--text-2)", fontSize: 12.5 }}>{a}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="NODE ATTRIBUTES" meta="CONTROLLED VOCABULARY">
              <div className="kv-grid">
                {["Temperature", "Rainfall", "Wind speed", "Wind direction", "Pressure", "Humidity", "Geopotential"].map((v, i) => (
                  <Metric key={v} label={`Node var ${i + 1}`} value={v} note={i < 3 ? "used in the server field" : "schema supported"} />
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </ConsoleGate>
    </section>
  );
}

/* ---------------- diffusion ---------------- */

function DiffusionSection() {
  const c = useConsoleAnalysis();
  const point = c.trackPoint;
  const bounds = c.frame ? fieldBounds(c.frame, "risk") : null;
  const r = useRefinement(
    point ? { lat: point.lat, lon: point.lon } : c.center,
    point ? hoursFromLabel(point.tLabel) : null,
    "risk",
    bounds,
  );
  return (
    <section className="section">
      <SectionHead
        num="// DIFFUSION INTELLIGENCE"
        title="Conditional Diffusion Downscaling"
        sub="Refine the regions that matter. After the GNN isolates a high-risk region, a conditional diffusion model generates higher-resolution, probabilistic weather fields."
        right={<Badge tone="muted">PROTOTYPE MODEL OUTPUT</Badge>}
      />
      <ConsoleGate status={c.status} error={c.error} regionPending={c.regionPending} onRetry={() => void c.reload()}>
        <div className="two-col">
          <Panel
            title="BEFORE / AFTER COMPARISON"
            meta={r.metrics ? `${r.metrics.coarseCellKm.toFixed(1)} KM → ${r.metrics.fineCellKm.toFixed(1)} KM · SERVER` : "SERVER REFINEMENT"}
            flush
          >
            {r.status === "loading" ? (
              <div style={{ padding: 14 }}>
                <DataState icon="alert" title="REQUESTING REFINEMENT" desc="Asking the server for a refined grid." />
              </div>
            ) : r.status === "unavailable" ? (
              <div style={{ padding: 14 }}>
                <DataState
                  icon="alert"
                  title="REFINEMENT UNAVAILABLE"
                  desc={r.error ?? "The server did not return a refinement. No field is generated in the browser."}
                  action={
                    <button className="btn btn-primary" onClick={r.reload}>
                      Retry
                    </button>
                  }
                />
              </div>
            ) : !r.coarse || !r.refined ? (
              <div style={{ padding: 14 }}>
                <DataState
                  icon="alert"
                  title="NO REFINEMENT FOR THIS STEP"
                  desc="The server did not return a coarse/refined pair for the selected frame."
                />
              </div>
            ) : (
              <>
                <div className="compare">
                  <div className="compare-cell">
                    <FieldCanvas field={r.coarse} width={520} height={520} label="COARSE PARENT GRID" />
                  </div>
                  <div className="compare-cell">
                    <FieldCanvas field={r.refined} width={520} height={520} label="SERVER-REFINED GRID" />
                  </div>
                </div>
                <div style={{ padding: 12 }}>
                  <LegendRamp kind="risk" labels={["LOW", "MODERATE", "HIGH", "CRITICAL"]} className="browseflow" />
                </div>
              </>
            )}
          </Panel>
          <div className="console-stack">
            <Panel title="PIPELINE" flush>
              <div className="flow" style={{ padding: 12 }}>
                <span className="step">COARSE</span>
                <span className="arrow">›</span>
                <span className="step">GNN TARGET</span>
                <span className="arrow">›</span>
                <span className="step">DIFFUSION</span>
                <span className="arrow">›</span>
                <span className="step">REFINED</span>
              </div>
            </Panel>
            {r.metrics && (
              <Panel title="SERVER METRICS" meta="FROM THE REFINE ENDPOINT">
                <div className="kv-grid">
                  <Metric label="Parent cell" value={`${r.metrics.coarseCellKm.toFixed(2)} km`} note="server grid" />
                  <Metric label="Refined cell" value={`${r.metrics.fineCellKm.toFixed(2)} km`} note="server grid" />
                  <Metric label="Samples" value={String(r.metrics.samples)} note="diffusion draws" />
                  <Metric label="Tail preserved" value={r.metrics.tailPreserved ? "YES" : "NO"} note="extremes kept" />
                  <Metric label="Mass drift" value={`${r.metrics.massDriftPct.toFixed(2)}%`} note="conservation check" />
                  <Metric label="Coarse P99" value={r.metrics.coarseP99.toFixed(2)} note="parent grid" />
                </div>
              </Panel>
            )}
            <Panel title="WHY TARGETED DOW-SCALING">
              <ul className="prose" style={{ paddingLeft: 18, margin: 0 }}>
                <li>Preserve extreme signals rather than smoothing them away.</li>
                <li>Recover fine-scale spatial structure in high-risk windows.</li>
                <li>Represent uncertainty through ensemble diffusion samples.</li>
                <li>Generate realistic local patterns consistent with meteorology.</li>
                <li>Reduce unnecessary global high-resolution computation.</li>
              </ul>
            </Panel>
            <Panel title="CORE CONCEPT">
              <div className="hud" style={{ display: "inline-block", fontFamily: "var(--mono)", fontSize: 13, letterSpacing: "0.06em" }}>
                DIFFUSION = REFINE + PREDICT
              </div>
            </Panel>
          </div>
        </div>
      </ConsoleGate>
    </section>
  );
}

/* ---------------- risk intelligence ---------------- */

function RiskIntelligence() {
  const c = useConsoleAnalysis();
  const r = c.analysis?.risk ?? null;
  const event = c.event;
  const now = event ? intensityNow(event) : null;
  return (
    <section className="section">
      <SectionHead
        num="// RISK INTELLIGENCE"
        title="Hazard Probability, Exposure, Impact"
        sub="Risk is a decision-support quantity synthesized from hazard probability, intensity, timing, and exposure. For live locations, meteorology comes from the live provider; model products remain prototype output until a production pipeline is connected."
        right={<Badge tone="muted">PROTOTYPE MODEL OUTPUT</Badge>}
      />
      <ConsoleGate status={c.status} error={c.error} regionPending={c.regionPending} onRetry={() => void c.reload()}>
        <div className="two-col">
          <Panel title={`RISK PROFILE - ${c.eventId ?? "NO OBJECT"}`} meta="SERVER VALUES">
            <div className="kv-grid">
              <Metric
                label="Model confidence"
                value={r ? r.confidence.toFixed(2) : "PENDING"}
                note="server model confidence, not a probability"
              />
              <Metric
                label="Intensity now"
                value={now === null ? "NOT PRESENT NOW" : now.toFixed(2)}
                note="server NOW frame"
              />
              <Metric
                label="Peak in window"
                value={event ? intensityLater(event).toFixed(2) : "PENDING"}
                note="max over detected frames"
              />
              <Metric
                label="Affected area"
                value={r ? `${Math.round(r.areaKm2).toLocaleString()} km²` : "PENDING"}
                note="server footprint extent"
              />
              <Metric label="Population exposure" value="PENDING" note="needs verified census overlay" />
              <Metric label="Infrastructure exposure" value="PENDING" note="needs verified GIS layer" />
            </div>
            {r && r.drivers.length > 0 && (
              <>
                <div className="divider" />
                <div className="small muted mono" style={{ marginBottom: 6 }}>RISK DRIVERS · SERVER</div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Driver</th><th>Value</th><th>Weight</th></tr>
                    </thead>
                    <tbody>
                      {r.drivers.map((d) => (
                        <tr key={d.label}>
                          <td className="small">{d.label}</td>
                          <td className="mono-val">{typeof d.value === "number" ? d.value.toFixed(3) : d.value}</td>
                          <td className="mono-val">{d.weight.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>
        <Panel title="RISK LEVELS" meta="SEMANTIC ONLY · NOT COLOR-ALONE">
          <div className="stack">
            {[
              ["LOW", "green"],
              ["MODERATE", "blue"],
              ["HIGH", "amber"],
              ["CRITICAL", "red"],
            ].map(([l, tone]) => (
              <div className="row-line" key={l}>
                <span className="badge" style={{ color: `var(--${tone})`, background: `var(--${tone}-dim)`, borderColor: `var(--${tone})` }}>
                  {l}
                </span>
                <span className="rl-s">
                  {l === "LOW" && "Background conditions expected. Monitor routine advisories."}
                  {l === "MODERATE" && "Elevated hazard signal. Prepare and monitor updates."}
                  {l === "HIGH" && "Likely impact. Authorities should pre-position response."}
                  {l === "CRITICAL" && "Extreme impact expected. Initiate protective action."}
                </span>
              </div>
            ))}
          </div>
        </Panel>
        </div>
      </ConsoleGate>
    </section>
  );
}

/* ---------------- why varun-x ---------------- */

function WhyVarunX() {
  const rows: Array<[string, string]> = [
    ["NWP forecasts", "Forecast input into the intelligence chain"],
    ["Ensemble uncertainty", "Extreme anomaly identification on top of ensemble spread"],
    ["EFI / climatological comparison", "Spatial anomaly signal vs. long-term baseline"],
    ["GNN", "Extreme-object detection and spatio-temporal tracking"],
    ["Diffusion", "Targeted refinement from approximately 12 km to approximately 5 km"],
    ["Physics constraints", "Meteorological consistency in model output"],
    ["Risk engine", "Impact-oriented estimation for decision support"],
    ["Alerts", "Actionable, scalar-aware communication"],
  ];
  return (
    <section className="section">
      <SectionHead
        num="// POSITIONING"
        title="Why VARUN-X"
        sub="VARUN-X does not replace meteorologists. It connects established forecasting capabilities into one verifiable intelligence chain."
      />
      <Panel flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Existing capability</th>
                <th>VARUN-X integration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([a, b]) => (
                <tr key={a}>
                  <td className="mono-val">{a}</td>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

/* ---------------- smart alerts ---------------- */

function SmartAlerts() {
  return (
    <section className="section">
      <SectionHead
        num="// SMART ALERTS"
        title="From Model Output to Actionable Warning"
        sub="Sample alert format below. No live alert is claimed: the official alert feed is not connected in this prototype."
      />
      <div className="two-col">
        <Panel title="SAMPLE ALERT FORMAT" meta="FORMAT ILLUSTRATION ONLY" flush>
          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Badge tone="amber" dot>EXTREME RAINFALL ALERT</Badge>
              <span className="mono small muted">WINDOW: NEXT 12-18 H</span>
            </div>
            <div className="kv" style={{ marginTop: 14 }}>
              <dt>Hazard</dt><dd>Extreme rainfall</dd>
              <dt>Location</dt><dd>District / locality (bound to live geocoding)</dd>
              <dt>Expected period</dt><dd>Next 12 to 18 hours</dd>
              <dt>Risk</dt><dd>HIGH</dd>
              <dt>Expected intensity</dt><dd>180 to 220 mm (illustrative range)</dd>
              <dt>Source</dt><dd>VARUN-X model chain (simulated)</dd>
              <dt>Status</dt><dd>Sample - not a live warning</dd>
            </div>
            <div style={{ marginTop: 12 }}>
              <strong className="small">Recommended precautions</strong>
              <ul className="prose" style={{ paddingLeft: 18, marginTop: 6, marginBottom: 0 }}>
                <li>Move important documents and livestock to elevated locations.</li>
                <li>Avoid flooded roads and do not cross fast-moving water.</li>
                <li>Follow official authority instructions.</li>
              </ul>
            </div>
          </div>
        </Panel>
        <Panel title="ALERT CHANNELS">
          <div className="stack">
            {[
              ["SMS", "Planned gateway; delivery states tracked, never fabricated"],
              ["Web notification", "Browser push when permitted"],
              ["Emergency broadcast", "Authority console with draft/scheduled/active states"],
              ["Authority dashboard", "Multi-role operational views"],
              ["AI Assistant", "Explains alerts in plain language and local languages"],
            ].map(([a, b]) => (
              <div className="row-line" key={a}>
                <div className="rl-l">
                  <Icon name="signal" size={15} className="muted" />
                  <span className="rl-t">{a}</span>
                </div>
                <span className="rl-s">{b}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- respond / operations ---------------- */

function RespondSection() {
  const { session } = useSession();
  // A forecast analyst reviews the response workflow but does not operate it,
  // so the deep links into the officer consoles are not offered.
  const operator = isCommand(session);
  return (
    <section className="section">
      <SectionHead
        num="// EMERGENCY OPERATIONS"
        title="Coordinated Response Layer"
        sub="Emergency tools live behind the Operations and Emergency pages. Dashboard shows capabilities and honest empty states, not invented statistics."
      />
      <div className="grid-2c">
        <Panel title="EMERGENCY BROADCAST">
          <p className="small muted" style={{ marginBottom: 10 }}>
            Authoritative instructions for evacuation, safe zones, road closures, shelters and medical assistance.
          </p>
          <div className="flow">
            <span className="step">DRAFT</span><span className="arrow">›</span>
            <span className="step">SCHEDULE</span><span className="arrow">›</span>
            <span className="step">ACTIVE</span><span className="arrow">›</span>
            <span className="step">EXPIRED</span>
          </div>
          {operator && (
            <Link className="btn btn-outline btn-sm" style={{ marginTop: 12 }} to="/emergency">
              Open console
            </Link>
          )}
        </Panel>
        <Panel title="CITIZEN INCIDENT REPORTING">
          <p className="small muted" style={{ marginBottom: 10 }}>
            Flooding, road blocks, damage, injuries, missing persons. Reports are never auto-verified; they generate an incident ID.
          </p>
          <div className="flow">
            <span className="step">RECEIVED</span><span className="arrow">›</span>
            <span className="step">REVIEW</span><span className="arrow">›</span>
            <span className="step">VERIFIED</span>
          </div>
          <Link className="btn btn-outline btn-sm" style={{ marginTop: 12 }} to="/incidents">
            Report / review
          </Link>
        </Panel>
      </div>
      {operator && (
        <Panel title="PERSONNEL & RESOURCES" meta="AUTHORITY OPERATIONS" style={{ marginTop: 16 }} flush>
        <div className="grid-2c">
          <div className="stack" style={{ padding: 14 }}>
            <p className="small muted" style={{ margin: 0 }}>
              Rescue teams, medical staff, logistics and supply lifecycle: received → allocated → dispatched → delivered.
            </p>
            <div className="flow">
              <span className="step">RECEIVED</span><span className="arrow">›</span>
              <span className="step">ALLOCATED</span><span className="arrow">›</span>
              <span className="step">DISPATCHED</span><span className="arrow">›</span>
              <span className="step">DELIVERED</span>
            </div>
          </div>
          <div className="stack" style={{ gap: 8, padding: 14 }}>
            <div className="row-line">
              <span className="rl-l"><span className="rl-t">Personnel & rescue teams</span><span className="rl-s">Availability, deployment, assignments</span></span>
              <Link className="btn btn-outline btn-sm" to="/personnel">Open</Link>
            </div>
            <div className="row-line">
              <span className="rl-l"><span className="rl-t">Resource & supply tracking</span><span className="rl-s">Inventory, allocation, dispatch state</span></span>
              <Link className="btn btn-outline btn-sm" to="/resources">Open</Link>
            </div>
          </div>
        </div>
      </Panel>
      )}
      <Panel title="PUBLIC ACCOUNTABILITY - DISASTER STATUS" meta="VERIFIED INFORMATION ONLY" style={{ marginTop: 14 }}>
        <p className="small muted">
          Verified aggregates (casualties, injured, missing, evacuated, shelter capacity, relief distribution)
          render only from verified authority inputs with source + timestamp + verification status. With no
          connected authority feed, this page displays its empty state rather than placeholder numbers.
        </p>
        {operator && (
          <Link className="btn btn-outline btn-sm" style={{ marginTop: 12 }} to="/emergency">
            Disaster status module
          </Link>
        )}
      </Panel>
    </section>
  );
}

/* ---------------- model chain ---------------- */

function ModelChain() {
  const steps = [
    "INPUT DATA", "CLIMATOLOGICAL BASELINE", "ANOMALY DETECTION", "GNN TRACKING", "TARGET REGION",
    "DIFFUSION DOWNSCALING", "PHYSICS CONSTRAINTS", "RISK ESTIMATION", "ALERT GENERATION",
  ];
  return (
    <section className="section">
      <SectionHead
        num="// MODEL EXPLAINABILITY"
        title="Full Model Chain"
        sub="Every stage is auditable. Each model output carries model, input, timestamp, resolution, confidence and source."
      />
      <Panel flush>
        <div className="flow" style={{ padding: 16 }}>
          {steps.map((s, i) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="step">{s}</span>
              {i < steps.length - 1 && <span className="arrow">›</span>}
            </span>
          ))}
        </div>
      </Panel>
    </section>
  );
}

/* ---------------- data & architecture ---------------- */

function DataArchitecture() {
  return (
    <section className="section">
      <SectionHead
        num="// DATA & MODELS"
        title="Scientific Data Sources and Architecture"
        sub="Supported sources and intended stack. Live weather today uses the keyless Open-Meteo provider with a server-side key option for other providers."
      />
      <div className="two-col">
        <Panel title="DATA SOURCES" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Source</th><th>Role</th><th>Status</th></tr>
              </thead>
              <tbody>
                <tr><td className="mono-val">ERA5</td><td>Historical baseline</td><td><Badge tone="muted">SUPPORTED</Badge></td></tr>
                <tr><td className="mono-val">IMDAA</td><td>Regional reanalysis</td><td><Badge tone="muted">SUPPORTED</Badge></td></tr>
                <tr><td className="mono-val">NCUM / NEPS-G</td><td>NWP ensemble</td><td><Badge tone="muted">SUPPORTED</Badge></td></tr>
                <tr><td className="mono-val">Open-Meteo</td><td>Live current + forecast</td><td><Badge tone="green" dot>LIVE</Badge></td></tr>
                <tr><td className="mono-val">RainViewer radar</td><td>Precipitation radar tiles</td><td><Badge tone="green" dot>LIVE</Badge></td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="TECHNICAL ARCHITECTURE" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Layer</th><th>Technology</th></tr>
              </thead>
              <tbody>
                <tr><td>Frontend</td><td className="mono-val">React 19 · Vite · TypeScript</td></tr>
                <tr><td>Maps</td><td className="mono-val">Leaflet · CARTO dark basemap</td></tr>
                <tr><td>Backend (target)</td><td className="mono-val">Python · FastAPI</td></tr>
                <tr><td>AI (target)</td><td className="mono-val">PyTorch / JAX</td></tr>
                <tr><td>Graph (target)</td><td className="mono-val">DGL / PyTorch Geometric</td></tr>
                <tr><td>Diffusion (target)</td><td className="mono-val">Hugging Face Diffusers</td></tr>
                <tr><td>Scientific data (target)</td><td className="mono-val">Xarray · Dask · NetCDF · Zarr</td></tr>
                <tr><td>DB (target)</td><td className="mono-val">PostgreSQL / PostGIS</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </section>
  );
}

/* ---------------- responsible AI ---------------- */

function ResponsibleAI() {
  return (
    <section className="section">
      <SectionHead
        num="// RESPONSIBLE AI"
        title="Decision Support, Not Autonomous Authority"
      />
      <div className="two-col">
        <Panel title="OPERATING PRINCIPLES">
          <ul className="prose" style={{ paddingLeft: 18, margin: 0 }}>
            <li>AI predictions are decision-support information.</li>
            <li>Official instructions from competent authorities take precedence.</li>
            <li>Forecast uncertainty is always communicated.</li>
            <li>Citizen reports require verification before use.</li>
            <li>The AI must not fabricate unavailable information.</li>
            <li>Model outputs are timestamped and labelled.</li>
            <li>Model predictions are distinguished from verified observations.</li>
          </ul>
        </Panel>
        <Panel title="DATA HONESTY POLICY">
          <div className="stack">
            {[
              ["LIVE OBSERVATION", "Real current conditions from the connected data provider."],
              ["FORECAST", "Provider NWP forecast - not a VARUN-X prediction."],
              ["AI MODEL OUTPUT", "VARUN-X GNN / diffusion products - simulated until a production pipeline is connected."],
              ["OFFICIAL ALERT", "Only from a connected authoritative source. None are fabricated."],
              ["SIMULATION / DEMO", "Clearly labelled deterministic demonstration data."],
            ].map(([a, b]) => (
              <div className="row-line" key={a} style={{ alignItems: "flex-start" }}>
                <strong className="small" style={{ flex: "0 0 170px", color: "var(--text-2)" }}>{a}</strong>
                <span className="small muted">{b}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  );
}