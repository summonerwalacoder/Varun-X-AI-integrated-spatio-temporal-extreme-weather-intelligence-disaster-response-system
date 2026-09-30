import { PageHead } from "../components/PageHead";
import { Panel, Badge, SectionHead, Metric, RiskBadge, DataState } from "../components/primitives";
import { FieldCanvas, LegendRamp } from "../components/FieldCanvas";
import { EventSelect } from "../components/MapBox";
import { useConsoleAnalysis } from "../lib/console";
import { intensityNow } from "../lib/analysis";

export function AnomaliesPage() {
  return (
    <div>
      <PageHead
        kicker="ANOMALY DETECTION"
        title="Extreme Anomaly Analysis"
        sub="VARUN-X compares the server's forecast fields against its climatological baseline and highlights statistically unusual conditions. The baseline and EFI-style field are prototype stages and are labelled as such."
      />
      <AnomalyExplorer />
      <EfiExplain />
      <AnomalyRegistry />
    </div>
  );
}

function AnomalyExplorer() {
  const c = useConsoleAnalysis();
  const anomaly = c.field("anomaly");
  const efi = c.field("efi");
  const baseline = c.analysis?.baseline ?? null;

  if (c.status === "loading" || c.status === "idle") {
    return (
      <section className="section">
        <Panel title="ANOMALY FIELD" meta="VARUN-X SERVER">
          <DataState
            icon="alert"
            title={c.regionPending ? "SELECT A REGION" : "LOADING ANALYSIS"}
            desc={
              c.regionPending
                ? "Allow location access or pick a location on the Live Weather page to load anomaly and EFI fields."
                : (c.error ?? "Requesting anomaly and EFI fields for the selected region.")
            }
            action={<button className="btn" onClick={() => void c.reload()}>RETRY</button>}
          />
        </Panel>
      </section>
    );
  }

  if (c.status === "unavailable" || !c.analysis) {
    return (
      <section className="section">
        <Panel title="ANOMALY FIELD" meta="VARUN-X SERVER">
          <DataState
            icon="alert"
            title="ANOMALY ANALYSIS UNAVAILABLE"
            desc={c.error ?? "The server did not return an analysis. No anomaly grid is generated in the browser."}
            action={
              <button className="btn btn-primary" onClick={() => void c.reload()}>
                Retry
              </button>
            }
          />
        </Panel>
      </section>
    );
  }

  return (
    <section className="section">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <EventSelect
          events={c.events}
          value={c.eventId}
          onSelect={(ev) => c.selectEvent(ev.id)}
          emptyLabel="NO OBJECT DETECTED IN THE ANALYSIS WINDOW"
        />
        <div className="timeline">
          {c.event?.track.map((p, i) => (
            <button
              key={p.tLabel}
              className={`timeline-btn ${i === c.timeIdx ? "active" : ""}`}
              onClick={() => c.setTimeIdx(i)}
            >
              {p.tLabel}
            </button>
          ))}
        </div>
        <Badge tone="muted" dot>PROTOTYPE MODEL OUTPUT</Badge>
      </div>
      <div className="two-col">
        <Panel
          title="ANOMALY FIELD"
          meta={anomaly ? `${c.eventId ?? "NO OBJECT"} · ${c.frame?.label} · field minus baseline` : "NOT DETECTED IN THIS FRAME"}
          flush
        >
          {anomaly ? (
            <>
              <FieldCanvas field={anomaly} width={520} height={440} label="ANOMALY INTENSITY" />
              <div style={{ padding: 12 }}>
                <LegendRamp kind="anomaly" labels={["NORMAL", "ANOMALY", "HIGH RISK", "CRITICAL"]} />
              </div>
            </>
          ) : (
            <div style={{ padding: 14 }}>
              <DataState
                icon="alert"
                title="NO ANOMALY GRID IN THIS FRAME"
                desc="The server returned no anomaly field for the selected step, so nothing is drawn. An anomaly map is not generated locally."
              />
            </div>
          )}
        </Panel>
        <div className="console-stack">
          <Panel title="DETECTION SIGNAL">
            {c.event ? (
              <Metric
                label="Anomaly peak"
                value={c.event.peakIntensity.toFixed(2)}
                note={`× baseline 95th percentile · ${c.event.tier}`}
              />
            ) : (
              <Metric label="Anomaly peak" value="NO OBJECT" note="server detected nothing" />
            )}
            <div className="divider" />
            <div className="list-2">
              {[
                ["Baseline", baseline ? `${baseline.label} (${baseline.mode})` : "PENDING"],
                ["Baseline precip", baseline ? `${baseline.precipMean.toFixed(2)} ± ${baseline.precipSd.toFixed(2)} (p95 ${baseline.precip95.toFixed(2)})` : "PENDING"],
                ["EFI", "extreme-forecast-index-style field (prototype)"],
                ["Signal", c.event ? `object detected by threshold, ${c.event.tier} tier` : "no object detected"],
                ["Status", c.event ? (c.event.activeNow ? "active now" : `last active ${c.event.lastActiveLabel}`) : "nothing tracked"],
              ].map(([a, b]) => (
                <div key={a}>
                  <strong className="small" style={{ color: "var(--text)" }}>{a}</strong>
                  <p className="small muted" style={{ marginTop: 2 }}>{b}</p>
                </div>
              ))}
            </div>
            {baseline && Object.keys(baseline.uncertainty ?? {}).length > 0 && (
              <>
                <div className="divider" />
                <div className="small muted mono" style={{ marginBottom: 6 }}>
                  BASELINE UNCERTAINTY · SERVER
                </div>
                <div className="list-2">
                  {Object.entries(baseline.uncertainty).map(([k, v]) => (
                    <div key={k}>
                      <strong className="small" style={{ color: "var(--text)" }}>{k}</strong>
                      <p className="small muted" style={{ marginTop: 2 }}>{v}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>
          <Panel
            title="EFI FIELD"
            meta={efi ? `EXTREME FORECAST INDEX (PROTOTYPE) · ${c.frame?.label}` : "NOT RETURNED IN THIS FRAME"}
            flush
          >
            {efi ? (
              <>
                <FieldCanvas field={efi} width={520} height={300} label="EFI" />
                <div style={{ padding: 12 }}>
                  <LegendRamp kind="efi" labels={["NORMAL", "ELEVATED", "HIGH", "EXTREME"]} />
                </div>
              </>
            ) : (
              <div style={{ padding: 14 }}>
                <DataState
                  icon="alert"
                  title="NO EFI GRID"
                  desc="The server returned no EFI-style field for this frame."
                />
              </div>
            )}
          </Panel>
        </div>
      </div>
    </section>
  );
}

function EfiExplain() {
  return (
    <section className="section">
      <SectionHead num="// EFI BASED ANALYSIS" title="Ensemble Extreme Forecast Index" />
      <Panel>
        <p className="prose" style={{ margin: 0 }}>
          In operational practice an Extreme Forecast Index quantifies how far an ensemble forecast
          departs from the model climatological distribution at the same location and time. VARUN-X
          uses this style of comparison as the anomaly signal that feeds the GNN. In this prototype
          the EFI-style field is produced by the server from its own baseline and is therefore
          labelled as model output — it is not read from a live ensemble system.
        </p>
      </Panel>
    </section>
  );
}

function AnomalyRegistry() {
  const c = useConsoleAnalysis();
  const events = c.events;

  return (
    <section className="section">
      <SectionHead num="// ANOMALY REGISTRY" title="Detected Anomaly Objects" />
      <Panel
        flush
        title={undefined}
      >
        {c.status === "loading" ? (
          <div style={{ padding: 14 }}>
            <DataState icon="alert" title="LOADING" desc="Reading detected objects from the server." />
          </div>
        ) : events.length === 0 ? (
          <div style={{ padding: 14 }}>
            <DataState
              icon="shield"
              title={c.status === "unavailable" ? "REGISTRY UNAVAILABLE" : "NO ANOMALY OBJECTS DETECTED"}
              desc={
                c.status === "unavailable"
                  ? (c.error ?? "The server did not return an analysis.")
                  : "The server scanned the analysis window and detected no object above the baseline threshold. No demo rows are listed instead."
              }
              action={
                <button className="btn btn-primary" onClick={() => void c.reload()}>
                  {c.status === "unavailable" ? "Retry" : "Rescan"}
                </button>
              }
            />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Hazard</th>
                  <th>Region</th>
                  <th>Intensity now</th>
                  <th>EFI peak</th>
                  <th>Risk</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const now = intensityNow(ev);
                  return (
                    <tr key={ev.id}>
                      <td className="mono-val">{ev.id}</td>
                      <td>{ev.hazard.replace("-", " ")}</td>
                      <td>{ev.region}</td>
                      <td className="mono-val">{now === null ? "NOT PRESENT NOW" : now.toFixed(2)}</td>
                      <td className="mono-val">{ev.efiPeak.toFixed(2)}</td>
                      <td>
                        <RiskBadge risk={ev.risk} />
                      </td>
                      <td>
                        <Badge tone={ev.activeNow ? "green" : "cyan"} dot>
                          {ev.activeNow ? "ACTIVE NOW" : ev.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
