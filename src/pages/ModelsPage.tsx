import { PageHead } from "../components/PageHead";
import { Panel, SectionHead, Badge } from "../components/primitives";
import { Link } from "react-router-dom";

type ModelRow = {
  name: string;
  role: string;
  input: string;
  output: string;
  status: "SIMULATION" | "DEV / PENDING";
};

const MODELS: ModelRow[] = [
  {
    name: "Anomaly detector",
    role: "Compare forecast to climatological baseline",
    input: "Forecast field against baseline field",
    output: "Anomaly score grid (simulated)",
    status: "SIMULATION",
  },
  {
    name: "GNN FIND",
    role: "Locates the extreme object",
    input: "Anomaly score grid at one time step",
    output: "Object centroid and bounds (simulated)",
    status: "SIMULATION",
  },
  {
    name: "GNN FOLLOW",
    role: "Tracks the object footprint and intensity",
    input: "Object state from the previous time step",
    output: "Footprint and intensity track (simulated)",
    status: "SIMULATION",
  },
  {
    name: "Conditional diffuser",
    role: "12 km to 5 km targeted refinement",
    input: "Coarse 12 km field plus target region",
    output: "Refined 5 km field (simulated)",
    status: "SIMULATION",
  },
  {
    name: "Risk estimator",
    role: "Hazard plus exposure",
    input: "Object track and exposure layers",
    output: "Hazard risk levels (in development)",
    status: "DEV / PENDING",
  },
  {
    name: "Alert generator",
    role: "Warning text and channel routing",
    input: "Risk output plus message templates",
    output: "Warning text and routing plan (in development)",
    status: "DEV / PENDING",
  },
];

type SourceRow = {
  name: string;
  note?: string;
  kind: string;
  provenance: string;
  status: "CONNECTED" | "PENDING" | "NOT CONNECTED";
};

const SOURCES: SourceRow[] = [
  {
    name: "Open-Meteo",
    note: "used for live weather",
    kind: "Live weather provider",
    provenance: "REAL-TIME PROVIDER",
    status: "CONNECTED",
  },
  {
    name: "RainViewer",
    kind: "Radar tiles",
    provenance: "REAL-TIME PROVIDER",
    status: "CONNECTED",
  },
  {
    name: "OpenStreetMap / CARTO",
    kind: "Basemap",
    provenance: "REAL-TIME PROVIDER",
    status: "CONNECTED",
  },
  {
    name: "BigDataCloud / Nominatim",
    kind: "Geocoding",
    provenance: "REAL-TIME PROVIDER",
    status: "CONNECTED",
  },
  {
    name: "IMDAA baseline",
    kind: "Reanalysis baseline",
    provenance: "CLIMATOLOGICAL BASELINE (REQUIRED)",
    status: "PENDING",
  },
  {
    name: "ERA5 reanalysis baseline",
    kind: "Reanalysis baseline",
    provenance: "CLIMATOLOGICAL BASELINE (REQUIRED)",
    status: "PENDING",
  },
  {
    name: "Authority alert feed",
    kind: "Official warnings",
    provenance: "OFFICIAL CHANNEL",
    status: "NOT CONNECTED",
  },
];

const SEMANTICS: Array<{ status: string; tone: "blue" | "cyan" | "amber" | "red" | "green" | "muted"; meaning: string }> = [
  { status: "SIMULATION", tone: "amber", meaning: "Deterministic demo output, labelled" },
  { status: "DEV", tone: "muted", meaning: "In development, not operational" },
  { status: "PENDING", tone: "muted", meaning: "Requires verified data" },
  { status: "CONNECTED", tone: "green", meaning: "Provider reachable" },
];

function StatusBadge({ status }: { status: ModelRow["status"] | SourceRow["status"] }) {
  if (status === "SIMULATION") return <Badge tone="amber">SIMULATION</Badge>;
  if (status === "DEV / PENDING") return <Badge tone="muted">DEV / PENDING</Badge>;
  if (status === "CONNECTED") return <Badge tone="green" dot>CONNECTED</Badge>;
  if (status === "PENDING") return <Badge tone="muted">PENDING</Badge>;
  return <Badge tone="muted">NOT CONNECTED</Badge>;
}

export function ModelsPage() {
  return (
    <div>
      <PageHead
        kicker="DATA & MODELS"
        title="Model catalog"
        sub="Model registry for the VARUN-X pipeline. Models below are at simulation or development status in this prototype; no operational performance is claimed."
        right={<Badge tone="muted">PROTOTYPE STATUS</Badge>}
      />

      <section className="section">
        <SectionHead
          num="// 01"
          title="Pipeline Models"
          sub="Each stage of the VARUN-X pipeline, its inputs and outputs, and its honest status word."
        />
        <Panel title="PIPELINE MODELS" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Role</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {MODELS.map((m) => (
                  <tr key={m.name}>
                    <td className="mono-val">{m.name}</td>
                    <td>{m.role}</td>
                    <td>{m.input}</td>
                    <td>{m.output}</td>
                    <td>
                      <StatusBadge status={m.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ margin: 0, padding: "10px 12px" }}>
            Simulation outputs are deterministic demo data, never production inference.
          </p>
        </Panel>
      </section>

      <section className="section">
        <SectionHead
          num="// 02"
          title="Model Link"
          sub="Jump from the registry to the page where each model output is demonstrated."
        />
        <Panel title="MODEL LINK">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="btn btn-outline btn-sm" to="/anomalies">
              Anomaly detector
            </Link>
            <Link className="btn btn-outline btn-sm" to="/tracking">
              GNN tracking
            </Link>
            <Link className="btn btn-outline btn-sm" to="/downscaling">
              Diffusion downscaling
            </Link>
            <Link className="btn btn-outline btn-sm" to="/risk">
              Risk estimator
            </Link>
            <Link className="btn btn-outline btn-sm" to="/alerts">
              Alert generator
            </Link>
          </div>
        </Panel>
      </section>

      <section className="section">
        <SectionHead
          num="// 03"
          title="Data Sources"
          sub="Which providers are reachable in this prototype, and which baselines are still required."
        />
        <Panel title="DATA SOURCES" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Kind</th>
                  <th>Provenance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((s) => (
                  <tr key={s.name}>
                    <td>
                      <span className="mono-val">{s.name}</span>
                      {s.note && <div className="small muted">{s.note}</div>}
                    </td>
                    <td>{s.kind}</td>
                    <td className="mono">{s.provenance}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <section className="section">
        <SectionHead
          num="// 04"
          title="Provenance Model"
          sub="Real data, derived fields, AI output and official alerts remain separable categories."
        />
        <Panel title="PROVENANCE MODEL">
          <div className="flow">
            <span className="step">
              REAL DATA (PROVIDER) <Badge tone="green">LIVE</Badge>
            </span>
            <span className="arrow">-&gt;</span>
            <span className="step">
              DERIVED FIELDS (SIM) <Badge tone="amber">SIM</Badge>
            </span>
            <span className="arrow">-&gt;</span>
            <span className="step">
              AI MODEL OUTPUT (SIM) <Badge tone="amber">SIM</Badge>
            </span>
            <span className="arrow">-&gt;</span>
            <span className="step">
              VERIFICATION (PENDING) <Badge tone="muted">PENDING</Badge>
            </span>
            <span className="arrow">-&gt;</span>
            <span className="step">
              AUTHORITY CHANNEL (NOT CONNECTED) <Badge tone="muted">OFFLINE</Badge>
            </span>
          </div>
          <div style={{ marginTop: 16 }}>
            <p className="small muted">
              Live weather comes from a real provider. Those values are labelled LIVE and are never
              presented as VARUN-X model output.
            </p>
            <p className="small muted">
              AI model outputs in this prototype are demonstration results only. They are labelled
              SIM and are not operational forecasts or warnings.
            </p>
            <p className="small muted">
              Simulation data is seeded, deterministic demo content. It is reproducible but does not
              describe the real atmosphere.
            </p>
            <p className="small muted">
              Official alerts come from an authority feed. That feed is NOT CONNECTED in this
              prototype, so no official warning is produced or implied here.
            </p>
          </div>
        </Panel>
      </section>

      <section className="section">
        <SectionHead
          num="// 05"
          title="Model Status Semantics"
          sub="What each status word on this page means."
        />
        <Panel title="MODEL STATUS SEMANTICS" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {SEMANTICS.map((s) => (
                  <tr key={s.status}>
                    <td>
                      <Badge tone={s.tone}>{s.status}</Badge>
                    </td>
                    <td>{s.meaning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </div>
  );
}
