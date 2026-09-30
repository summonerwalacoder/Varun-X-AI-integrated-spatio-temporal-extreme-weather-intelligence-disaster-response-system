import { PageHead } from "../components/PageHead";
import { Panel, Badge, SectionHead, Metric, DataState } from "../components/primitives";
import { AuditPanel } from "../components/AuditPanel";
import { BroadcastComposer, BroadcastStream } from "../components/BroadcastConsole";
import { useWeather } from "../lib/useWeather";
import { wmo } from "../lib/weather";
import { fmtTime } from "../lib/format";
import { RISK_LABEL, intensityNow, useAnalysis } from "../lib/analysis";

const CONTACTS: Array<{ label: string; number: string; type: string; tone: BadgeTone }> = [
  { label: "NATIONAL EMERGENCY NUMBER", number: "112", type: "Police / Fire / Ambulance", tone: "red" },
  { label: "POLICE", number: "100", type: "Law enforcement", tone: "red" },
  { label: "FIRE", number: "101", type: "Fire and rescue", tone: "red" },
  { label: "AMBULANCE", number: "102", type: "Medical transport", tone: "red" },
  { label: "DISASTER HELPLINE", number: "1078", type: "State disaster management", tone: "amber" },
];

type BadgeTone = "blue" | "cyan" | "amber" | "red" | "green" | "muted";

const TASKS: Array<{ role: string; desc: string }> = [
  { role: "Incident Commander", desc: "Overall authority and decisions." },
  { role: "Operations", desc: "Field response and tactics." },
  { role: "Planning", desc: "Situation analysis and future plans." },
  { role: "Logistics", desc: "Supplies, transport, facilities." },
  { role: "Safety", desc: "Responder safety monitoring." },
  { role: "Public Info", desc: "Official information flow." },
  { role: "Liaison", desc: "Inter-agency coordination." },
];

export function EmergencyPage() {
  const { state } = useWeather();
  const ready = state.status === "ready" && !!state.data && !!state.coords;
  const { state: analysisState } = useAnalysis({
    lat: state.coords?.lat ?? null,
    lon: state.coords?.lon ?? null,
    place: state.place?.name ?? null,
    mode: state.mode,
    enabled: ready,
  });
  const events = analysisState.analysis?.events ?? [];

  return (
    <div>
      <PageHead
        kicker="EMERGENCY OPERATIONS"
        title="Emergency Operations"
        sub="Coordination display for emergency operations. VARUN-X is decision support, not an emergency service. In an emergency, follow local authority instructions."
        right={<Badge tone="red" dot>EMERGENCY DISPLAY</Badge>}
      />

      <section className="section">
        <Panel title="IN AN EMERGENCY" meta="FOLLOW LOCAL AUTHORITY INSTRUCTIONS" flush>
          <div style={{ padding: 16, background: "rgba(217,92,92,0.08)" }}>
            <p style={{ margin: 0, fontFamily: "var(--mono)", letterSpacing: "0.06em", color: "var(--text)", fontSize: 13 }}>
              IN A DISASTER: FOLLOW LOCAL AUTHORITY INSTRUCTIONS. VARUN-X IS DECISION SUPPORT, NOT AN
              EMERGENCY SERVICE. THIS PROTOTYPE DOES NOT PLACE EMERGENCY CALLS.
            </p>
          </div>
        </Panel>

        <Panel title="NATIONAL EMERGENCY CONTACTS" meta="PUBLIC NUMBERS · VERIFY LOCAL NUMBERS BEFORE FIELD USE" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Service</th>
                  <th>Channel</th>
                </tr>
              </thead>
              <tbody>
                {CONTACTS.map((c) => (
                  <tr key={c.number}>
                    <td className="mono-val">{c.number}</td>
                    <td>
                      <Badge tone={c.tone}>{c.label}</Badge>
                    </td>
                    <td className="muted small">{c.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ padding: "6px 12px", margin: 0 }}>
            Local authority numbers must be verified before field use. The prototype does not replace
            local emergency services.
          </p>
        </Panel>

        <div className="grid-2c">
          <Panel
            title="LIVE CONDITIONS"
            meta="REAL PROVIDER DATA · OPEN-METEO"
          >
            {ready && state.data ? (
              <div className="stack" style={{ gap: 10 }}>
                <Metric
                  label={state.place ? `${state.place.name}${state.place.state ? `, ${state.place.state}` : ""}` : "Live"}
                  value={`${Math.round(state.data.current.temperature_2m)}°C`}
                  note={wmo(state.data.current.weather_code).label}
                />
                <div className="kv-grid">
                  <Metric label="Wind" value={`${Math.round(state.data.current.wind_speed_10m)} km/h`} />
                  <Metric label="Rain prob" value={`${Math.max(...state.data.hourly.precipitation_probability.slice(0, 6))}%`} note="next 6 h" />
                  <Metric label="Updated" value={fmtTime(state.data.current.time, state.data.timezone)} />
                </div>
              </div>
            ) : (
              <DataState
                icon="locate"
                title="LIVE DATA NOT LOADED"
                desc="Allow location access or select a location on the Live page to populate live conditions."
              />
            )}
          </Panel>

          <Panel title="VARUN-X MODEL EVENTS" meta="SERVER ANALYSIS · NOT AN OFFICIAL ALERT">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Region</th>
                    <th>Risk</th>
                    <th>Extremeness</th>
                    <th>Footprint</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => {
                    // The server only reports an intensity for frames where the
                    // object was detected, so an absent value is reported as such
                    // rather than backfilled.
                    const now = intensityNow(ev);
                    return (
                      <tr key={ev.id}>
                        <td className="mono-val">{ev.id}</td>
                        <td>{ev.region}</td>
                        <td>
                          <Badge tone={ev.risk === "critical" ? "red" : ev.risk === "high" ? "amber" : "blue"}>
                            {RISK_LABEL[ev.risk]}
                          </Badge>
                        </td>
                        <td className="mono-val">
                          {now === null ? "NOT IN T+0h FRAME" : `${now.toFixed(2)} × ${ev.unit}`}
                        </td>
                        <td className="mono-val">{Math.round(ev.areaKm2).toLocaleString()} km²</td>
                        <td>
                          <Badge tone={ev.activeNow ? "amber" : "muted"}>
                            {ev.activeNow ? "DETECTED NOW" : `LAST ${ev.lastActiveLabel}`}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ padding: "6px 12px", margin: 0 }}>
              {analysisState.status === "loading"
                ? "Running the analysis pipeline for this location…"
                : analysisState.status === "unavailable"
                  ? "The analysis service is unavailable. No model event is listed in its place."
                  : analysisState.status === "ready" && !events.length
                    ? "The analysis detected no extreme object between T-24h and T+72h for this location."
                    : "Extremeness is relative to the server's baseline 95th percentile, not a physical unit. These are model outputs, never broadcast."}
            </p>
          </Panel>
        </div>

        <Panel title="EVACUATION AND SHELTER" meta="SCHEMA · AWAITING AUTHORITY DATA" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Shelter</th>
                  <th>Capacity</th>
                  <th>Occupancy</th>
                  <th>Supplies</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono-val">SHELTER-01</td>
                  <td className="mono-val">PENDING</td>
                  <td className="mono-val">PENDING</td>
                  <td className="mono-val">PENDING</td>
                  <td>
                    <Badge tone="muted">AWAITING AUTHORITY DATA</Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flow" style={{ padding: "12px 12px 0" }}>
            <span className="step"><Badge tone="muted">SHELTER OPEN</Badge></span>
            <span className="arrow">→</span>
            <span className="step"><Badge tone="muted">OPERATIONAL</Badge></span>
            <span className="arrow">→</span>
            <span className="step"><Badge tone="muted">OCCUPANCY REPORTED</Badge></span>
            <span className="arrow">→</span>
            <span className="step"><Badge tone="muted">RELIEF PROVIDED</Badge></span>
          </div>
        </Panel>

        <div className="grid-2c">
          <Panel title="MULTI-AGENCY COORDINATION" meta="ROSTER PENDING">
            <div className="stack">
              {TASKS.map((t) => (
                <div className="row-line" key={t.role}>
                  <span className="rl-l">
                    <span className="rl-t">{t.role}</span>
                    <span className="rl-s">{t.desc}</span>
                  </span>
                  <Badge tone="muted">PENDING</Badge>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="CONTROL CENTRE STATUS">
            <div className="stack">
              <div className="row-line">
                <span className="rl-l"><span className="rl-t">Communication gateway</span></span>
                <Badge tone="muted">NOT CONNECTED</Badge>
              </div>
              <div className="row-line">
                <span className="rl-l"><span className="rl-t">Notifications</span></span>
                <Badge tone="muted">IDLE</Badge>
              </div>
              <div className="row-line">
                <span className="rl-l"><span className="rl-t">Official alert feed</span></span>
                <Badge tone="muted">NOT CONNECTED</Badge>
              </div>
              <div className="row-line">
                <span className="rl-l"><span className="rl-t">Live provider</span></span>
                <Badge tone={ready ? "green" : "muted"}>{ready ? "CONNECTED" : "IDLE"}</Badge>
              </div>
            </div>
          </Panel>
        </div>

        <SectionHead
          num="// BROADCAST"
          title="Emergency broadcast"
          sub="Publish public broadcast messages for affected areas. Every publish is written to the audit trail. The prototype does not transmit to any real channel. It simulates the composition workflow."
        />
        <div className="grid-2c">
          <BroadcastComposer region={state.place ? `${state.place.name}${state.place.state ? `, ${state.place.state}` : ""}` : ""} />
          <BroadcastStream />
        </div>

        <SectionHead
          num="// AUDIT"
          title="Authority audit trail"
        />
        <AuditPanel />

        <SectionHead
          num="// LIMITS"
          title="Prototype limits"
        />
        <p className="small muted">
          This module has no communication gateway, no automated dispatch and no invented casualty or
          damage figures. Emergency decisions require human authority review with real operational tools.
        </p>
      </section>
    </div>
  );
}