import { useState } from "react";
import { PageHead } from "../components/PageHead";
import { Panel, SectionHead, DataState, Badge } from "../components/primitives";
import { FieldCanvas, LegendRamp } from "../components/FieldCanvas";
import { EventSelect, MapBox } from "../components/MapBox";
import { HourlyTempChart } from "../components/Charts";
import type { Field, FieldKind, AnalysisEvent } from "../lib/analysis";
import { useConsoleAnalysis, useFrameRefinement } from "../lib/console";
import { useWeather } from "../lib/useWeather";

const VARS: Array<{ k: FieldKind; l: string }> = [
  { k: "precip", l: "Rainfall" },
  { k: "temp", l: "Temperature" },
  { k: "wind", l: "Wind" },
  { k: "efi", l: "EFI" },
];

const LEGENDS: Record<string, string[]> = {
  precip: ["DRY", "MOD", "HEAVY", "EXTREME"],
  temp: ["COOL", "MILD", "WARM", "HOT"],
  wind: ["CALM", "MODERATE", "STRONG", "SEVERE"],
  efi: ["NORMAL", "ELEVATED", "HIGH", "EXTREME"],
  anomaly: ["ZERO", "SLIGHT", "STRONG"],
  risk: ["LOW", "MODERATE", "HIGH", "CRITICAL"],
};

export function ForecastsPage() {
  return (
    <div>
      <PageHead
        kicker="FORECAST COMPARISON"
        title="Climatology · NWP · Anomaly · GNN · Diffusion"
        sub="Compare the same detected object across the full intelligence chain. Every grid below is returned by the VARUN-X server; where the server returns scalars rather than a grid, the cell says so instead of drawing a field."
        right={<Badge tone="muted">PROTOTYPE MODEL OUTPUT</Badge>}
      />
      <CompareZone />
      <ProviderForecast />
      <SectionStatements />
    </div>
  );
}

function CompareZone() {
  const c = useConsoleAnalysis();
  const [kind, setKind] = useState<FieldKind>("precip");
  const refinement = useFrameRefinement(c, kind);

  const baseline = c.analysis?.baseline ?? null;
  const forecast = c.field(kind);
  const anomaly = c.field("anomaly");
  const gnn = c.field("efi");

  if (c.status === "loading" || c.status === "idle") {
    return (
      <section className="section">
        <Panel title="FIELD COMPARISON" meta="VARUN-X SERVER">
          <DataState
            icon="alert"
            title={c.regionPending ? "SELECT A REGION" : "LOADING ANALYSIS"}
            desc={
              c.regionPending
                ? "Allow location access or pick a location on the Live Weather page to load the intelligence chain."
                : (c.error ?? "Requesting the intelligence chain for the selected region.")
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
        <Panel title="FIELD COMPARISON" meta="VARUN-X SERVER">
          <DataState
            icon="alert"
            title="COMPARISON UNAVAILABLE"
            desc={c.error ?? "The server did not return an analysis. No fields are generated in the browser."}
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
        <div className="layer-toggle" role="group" aria-label="Variable">
          {VARS.map((v) => (
            <button
              key={v.k}
              className={`layer-btn ${kind === v.k ? "active" : ""}`}
              onClick={() => setKind(v.k)}
            >
              {v.l}
            </button>
          ))}
        </div>
        <div className="timeline" style={{ flex: "1 1 300px" }}>
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
      </div>

      <div className="stack">
        <Panel
          title="FIELD COMPARISON"
          meta={`${c.eventId ?? "NO OBJECT"} · ${c.frame?.label ?? "—"}`}
          flush
        >
          <div className="list-2" style={{ gap: 1, background: "var(--border)" }}>
            <BaselineCell baseline={baseline} />
            <FieldCell
              label={`NWP / MODEL ${kind.toUpperCase()}`}
              field={forecast}
              legend={LEGENDS[kind] ?? LEGENDS.precip}
            />
            <FieldCell
              label="ANOMALY FIELD"
              field={anomaly}
              legend={LEGENDS.anomaly}
              note="field minus baseline"
            />
            <FieldCell
              label="GNN DETECTION (EFI)"
              field={gnn}
              legend={LEGENDS.efi}
              note="extreme-object signal"
            />
            <FieldCell
              label="DIFFUSION REFINED"
              field={refinement.refined}
              legend={LEGENDS[kind] ?? LEGENDS.precip}
              note={refinement.metrics
                ? `targeted refinement · ${refinement.metrics.coarseCellKm.toFixed(1)} → ${refinement.metrics.fineCellKm.toFixed(1)} km`
                : "targeted refinement"}
              status={refinement.status}
            />
            <FieldCell
              label="MAP TRACE"
              field={forecast}
              legend={LEGENDS.risk}
              map
              event={c.event}
              timeIdx={c.timeIdx}
              center={c.trackPoint ?? c.center}
            />
          </div>
        </Panel>
        <p className="small muted">
          Every grid in this comparison comes from the VARUN-X server for the frame shown. The
          baseline is reported by the server as domain statistics rather than a grid, so it is shown
          as numbers. Where a stage returned nothing for this frame the cell says so — no field is
          generated in the browser to fill a gap.
        </p>
      </div>
    </section>
  );
}

/** The server reports the baseline as scalar statistics, not a grid. */
function BaselineCell({ baseline }: { baseline: import("../lib/analysis").Analysis["baseline"] | null }) {
  return (
    <div style={{ background: "var(--surface)" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-soft)" }}>
        <span className="small uppercase mono" style={{ color: "var(--text-2)" }}>CLIMATOLOGY</span>
        <span className="small muted" style={{ marginLeft: 8 }}>domain statistics</span>
      </div>
      <div style={{ padding: 12 }}>
        {!baseline ? (
          <DataState icon="alert" title="NO BASELINE" desc="The server returned no baseline for this domain." />
        ) : (
          <div className="kv">
            <dt>Mode</dt><dd className="mono">{baseline.mode}</dd>
            <dt>Label</dt><dd>{baseline.label}</dd>
            <dt>Precip</dt>
            <dd className="mono">
              {baseline.precipMean.toFixed(2)} ± {baseline.precipSd.toFixed(2)} (p95 {baseline.precip95.toFixed(2)})
            </dd>
            <dt>Temp</dt>
            <dd className="mono">
              {baseline.tempMean.toFixed(1)} ± {baseline.tempSd.toFixed(1)} (p95 {baseline.temp95.toFixed(1)})
            </dd>
            <dt>Wind</dt>
            <dd className="mono">
              {baseline.windMean.toFixed(1)} ± {baseline.windSd.toFixed(1)} (p95 {baseline.wind95.toFixed(1)})
            </dd>
          </div>
        )}
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          The server reports the baseline as domain statistics, not a raster, so no baseline map is
          drawn here.
        </p>
      </div>
    </div>
  );
}

function FieldCell({
  label,
  field,
  legend,
  note,
  map,
  event,
  timeIdx,
  center,
  status,
}: {
  label: string;
  field: Field | null;
  legend: string[];
  note?: string;
  map?: boolean;
  event?: AnalysisEvent | null;
  timeIdx?: number;
  center?: { lat: number; lon: number } | null;
  status?: string;
}) {
  return (
    <div style={{ background: "var(--surface)" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-soft)" }}>
        <span className="small uppercase mono" style={{ color: "var(--text-2)" }}>{label}</span>
        {note && <span className="small muted" style={{ marginLeft: 8 }}>{note}</span>}
      </div>
      <div style={{ padding: 10 }}>
        {map && event ? (
          <MapBox
            center={center ?? undefined}
            zoom={6}
            height={240}
            event={event}
            field={field}
            kind="risk"
            timeIdx={timeIdx ?? -1}
            showOverlay
            showTrack
            showRadar
          />
        ) : field ? (
          <>
            <FieldCanvas field={field} width={400} height={360} />
            <div style={{ marginTop: 8 }}>
              <LegendRamp kind={field.kind} labels={legend} />
            </div>
          </>
        ) : (
          <DataState
            icon="alert"
            title={status === "loading" ? "LOADING" : "NO GRID RETURNED"}
            desc={
              status === "unavailable"
                ? "The server did not return a refinement for this frame."
                : "The server returned no grid for this stage in this frame. Nothing is drawn in its place."
            }
          />
        )}
      </div>
    </div>
  );
}

function ProviderForecast() {
  const { state, locate } = useWeather();
  const data = state.data;
  return (
    <section className="section">
      <SectionHead
        num="// LIVE PROVIDER FORECAST"
        title="Real Forecast for Your Location"
        sub="This block reads from the live weather provider for your actual coordinates. It is real data, not simulation."
        right={<Badge tone="green">LIVE WEATHER</Badge>}
      />
      <Panel
        title="HOURLY TEMPERATURE + RAIN PROBABILITY"
        meta={state.place ? `${state.place.name}${state.place.state ? `, ${state.place.state}` : ""}` : "location pending"}
        flush
      >
        {data ? (
          <div style={{ padding: "14px 10px 6px" }}>
            <HourlyTempChart data={data} />
          </div>
        ) : (
          <div style={{ padding: 14 }}>
            <button className="btn btn-primary" onClick={locate} disabled={state.status === "locating" || state.status === "fetching"}>
              {state.status === "locating" || state.status === "fetching" ? "Loading live data..." : "Fetch live forecast for my location"}
            </button>
            {state.status === "unavailable" && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Live data could not be retrieved. No simulated values substituted.
              </p>
            )}
          </div>
        )}
      </Panel>
    </section>
  );
}

function SectionStatements() {
  return (
    <section className="section">
      <Panel title="SCIENCE POSITIONING">
        <div className="list-2">
          {[
            ["Grid spacing", "VARUN-X reports the actual coarse and refined cell sizes the server returned rather than fixed marketing figures."],
            ["Probabilistic", "Downstream products are probabilistic predictions, not certainties."],
            ["Decision support", "AI output supports meteorologists; it does not replace them."],
            ["Community signals", "Citizen-report clustering is an AI-generated signal requiring authority verification."],
          ].map(([a, b]) => (
            <div key={a}>
              <strong className="small" style={{ color: "var(--text)" }}>{a}</strong>
              <p className="small muted" style={{ marginTop: 4 }}>{b}</p>
            </div>
          ))}
        </div>
      </Panel>
    </section>
  );
}
