import { PageHead } from "../components/PageHead";
import { Panel, Badge, SectionHead, Metric, DataState } from "../components/primitives";
import { MapBox, EventSelect } from "../components/MapBox";
import { FieldCanvas, LegendRamp } from "../components/FieldCanvas";
import { useConsoleAnalysis } from "../lib/console";
import { RISK_LABEL } from "../lib/analysis";

const RISK_BANDS: Array<[string, string, string]> = [
  ["LOW", "green", "No unusual hazard signal."],
  ["MODERATE", "blue", "Elevated conditions within normal historical range."],
  ["HIGH", "amber", "Conditions may exceed operational thresholds."],
  ["CRITICAL", "red", "Extreme conditions likely; protective action recommended."],
];

export function RiskPage() {
  const c = useConsoleAnalysis();
  const riskField = c.field("risk");
  const drivers = c.analysis?.risk.drivers ?? [];

  if (c.status === "loading" || c.status === "idle") {
    return (
      <div>
        <PageHead kicker="RISK INTELLIGENCE" title="Risk Maps and Exposure" />
        <section className="section">
          <Panel title="RISK MAP" meta="VARUN-X SERVER">
            <DataState
            icon="alert"
            title={c.regionPending ? "SELECT A REGION" : "LOADING ANALYSIS"}
            desc={
              c.regionPending
                ? "Allow location access or pick a location on the Live Weather page to load the risk fields."
                : (c.error ?? "Requesting the risk fields for the selected region.")
            }
            action={<button className="btn" onClick={() => void c.reload()}>RETRY</button>}
          />
          </Panel>
        </section>
      </div>
    );
  }

  if (c.status === "unavailable" || !c.analysis) {
    return (
      <div>
        <PageHead kicker="RISK INTELLIGENCE" title="Risk Maps and Exposure" />
        <section className="section">
          <Panel title="RISK MAP" meta="VARUN-X SERVER">
            <DataState
              icon="alert"
              title="RISK ANALYSIS UNAVAILABLE"
              desc={c.error ?? "The server did not return a risk analysis. No client-side field is substituted."}
              action={
                <button className="btn btn-primary" onClick={() => void c.reload()}>
                  Retry
                </button>
              }
            />
          </Panel>
        </section>
      </div>
    );
  }

  const analysis = c.analysis;
  const r = analysis.risk;
  const noFrame = !c.frame;

  return (
    <div>
      <PageHead
        kicker="RISK INTELLIGENCE"
        title="Risk Maps and Exposure"
        sub={`Hazard probability, intensity and exposure combined for decision support. Risk grids are ${analysis.provenance?.risk?.real ? "server" : "simulated"} model output; exposure numbers require verified GIS and census layers and are shown as pending where absent.`}
        right={
          <Badge tone={c.origin === "GPS" ? "green" : "muted"}>
            {c.origin ?? "SELECTED LOCATION"} · VARUN-X AI OUTPUT
          </Badge>
        }
      />
      <section className="section">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          <EventSelect
            events={c.events}
            value={c.eventId}
            onSelect={(ev) => c.selectEvent(ev.id)}
            emptyLabel="NO OBJECT DETECTED"
          />
          <div className="timeline">
            {c.event?.track.map((p, i) => (
              <button
                key={p.tLabel}
                className={`timeline-btn ${i === c.timeIdx ? "active" : ""}`}
                onClick={() => c.setTimeIdx(i)}
                title={p.tLabel}
              >
                {p.tLabel}
              </button>
            ))}
          </div>
        </div>
        <div className="grid-2c">
          <Panel
            title="RISK MAP"
            meta={`${c.eventId ?? "NO OBJECT"} · ${c.trackPoint?.tLabel ?? "—"} · RISK LAYER + REAL RADAR`}
            flush
          >
            <MapBox
              center={c.trackPoint ?? c.center ?? undefined}
              zoom={6}
              height={460}
              event={c.event}
              field={riskField}
              kind="risk"
              timeIdx={c.timeIdx}
              showOverlay
              showTrack
              showRadar
            />
          </Panel>
          <div className="console-stack">
            <Panel
              title="RISK FIELD"
              meta={riskField ? `${c.trackPoint?.tLabel} · ${riskField.w}×${riskField.h} SERVER GRID` : "NOT DETECTED IN THIS FRAME"}
              flush
            >
              {riskField ? (
                <>
                  <FieldCanvas field={riskField} width={620} height={320} label="RISK FIELD" />
                  <div style={{ padding: 12 }}>
                    <LegendRamp kind="risk" labels={["LOW", "MODERATE", "HIGH", "CRITICAL"]} />
                  </div>
                </>
              ) : (
                <div style={{ padding: 14 }}>
                  <DataState
                    icon="alert"
                    title="NO RISK GRID IN THIS FRAME"
                    desc={
                      noFrame
                        ? "The server returned no object for this time step, so no risk grid exists. A field is not drawn to fill the gap."
                        : "The server returned no risk grid for this frame."
                    }
                  />
                </div>
              )}
            </Panel>
            <Panel title="RISK COMPONENTS" meta="SEMANTIC LEVELS">
              <div className="stack">
                {RISK_BANDS.map(([l, col, text]) => (
                  <div className="row-line" key={l}>
                    <span
                      className="badge"
                      style={{
                        color: `var(--${col})`,
                        background: `var(--${col}-dim)`,
                        borderColor: `var(--${col})`,
                      }}
                    >
                      {l}
                    </span>
                    <span className="rl-s">{text}</span>
                  </div>
                ))}
              </div>
              <div className="divider" />
              <p className="small muted" style={{ margin: 0 }}>
                Server verdict for this domain:{" "}
                <span className="mono-val" style={{ color: "var(--text)" }}>{RISK_LABEL[r.level]}</span>{" "}
                ({r.tier}, score {r.score.toFixed(3)}). The bands above describe meaning; they do
                not override the server value.
              </p>
            </Panel>
            <Panel title="EXPOSURE" meta={analysis.exposure?.status ?? "PENDING WITHOUT VERIFIED LAYERS"}>
              <div className="kv-grid">
                <Metric label="Population exposure" value="PENDING" note="requires verified census overlay" />
                <Metric label="Agricultural exposure" value="PENDING" note="requires crop/GIS layer" />
                <Metric label="Infrastructure exposure" value="PENDING" note="requires critical-facility GIS" />
                <Metric label="Road exposure" value="PENDING" note="requires road network layer" />
                <Metric label="Shelter proximity" value="PENDING" note="requires shelter registry" />
                <Metric
                  label="Hazard probability"
                  value={r.confidence.toFixed(2)}
                  note="server model confidence, not a probability"
                />
                <Metric label="Peak exceedance" value={r.exceedPeak.toFixed(2)} note="× baseline 95th percentile" />
                <Metric label="EFI peak" value={r.efiPeak.toFixed(2)} note="extreme forecast index proxy" />
              </div>
              {drivers.length > 0 && (
                <>
                  <div className="divider" />
                  <div className="small muted mono" style={{ marginBottom: 6 }}>
                    RISK DRIVERS · SERVER
                  </div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Driver</th>
                          <th>Value</th>
                          <th>Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drivers.map((d) => (
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
              {analysis.exposure?.note && (
                <p className="small muted" style={{ margin: "10px 0 0" }}>
                  {analysis.exposure.note}
                </p>
              )}
            </Panel>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead num="// AGRICULTURE" title="Agricultural Risk Exposure" />
        <Panel>
          <p className="small muted">
            Agricultural advisories are only rendered from authority-issued guidance. The prototype
            defines the schema; it does not generate crop advisories from unverified data.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Crop (schema)</th><th>Stress type</th><th>Forecast period</th><th>Advisory status</th></tr>
              </thead>
              <tbody>
                <tr><td className="mono-val">Wheat</td><td>Heat stress</td><td className="mono-val">Next 48 h</td><td><Badge tone="muted">FOLLOW LOCAL AUTHORITY GUIDANCE</Badge></td></tr>
                <tr><td className="mono-val">Rice</td><td>Flood exposure</td><td className="mono-val">Next 72 h</td><td><Badge tone="muted">FOLLOW LOCAL AUTHORITY GUIDANCE</Badge></td></tr>
                <tr><td className="mono-val">Pulses</td><td>Rainfall risk</td><td className="mono-val">Next 72 h</td><td><Badge tone="muted">FOLLOW LOCAL AUTHORITY GUIDANCE</Badge></td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section className="section">
        <SectionHead num="// INFRASTRUCTURE" title="Infrastructure Exposure" />
        <Panel title="EXPOSED LAYERS" meta="SCHEMA DEFINED">
          <div className="list-2">
            {["Roads", "Bridges", "Railways", "Power infrastructure", "Hospitals", "Schools", "Shelters", "Critical facilities"].map((x) => (
              <div className="row-line" key={x}>
                <span style={{ color: "var(--text)", fontSize: 13 }}>{x}</span>
                <Badge tone="muted">GEO OVERLAY · PENDING</Badge>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}
