import { useCallback, useEffect, useState } from "react";
import { PageHead } from "../components/PageHead";
import { Panel, Badge, SectionHead, DataState } from "../components/primitives";
import { Icon } from "../components/Icon";
import { MapBox } from "../components/MapBox";
import { CommandGate } from "../components/RoleGate";
import { AuditPanel } from "../components/AuditPanel";
import { useWeather } from "../lib/useWeather";
import { fmtTime } from "../lib/format";
import { useSession, isAuthority } from "../lib/session";
import {
  INCIDENT_STATUSES,
  createRecord,
  fetchMyIncidents,
  nextStatus,
  updateRecord,
  type Incident,
  type IncidentSeverity,
} from "../lib/ops";

const CATEGORIES = [
  "Flooding",
  "Building damage",
  "Trapped",
  "Electrical hazard",
  "Road blocked",
  "Fire / smoke",
  "Medical",
  "Other",
];

const SEVERITIES: IncidentSeverity[] = ["minor", "major", "critical"];

const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  minor: "MINOR",
  major: "MAJOR",
  critical: "CRITICAL",
};

function SeverityBadge({ s }: { s: string }) {
  const tone = s === "critical" ? "red" : s === "major" ? "amber" : "blue";
  return <Badge tone={tone}>{SEVERITY_LABEL[s as IncidentSeverity] ?? s.toUpperCase()}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "RESOLVED" ? "green" : status === "VERIFIED" ? "blue" : status === "UNDER REVIEW" ? "amber" : "muted";
  return <Badge tone={tone}>{status}</Badge>;
}

export function IncidentsPage() {
  const { state } = useWeather();
  const { session } = useSession();
  const authority = isAuthority(session);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [busy, setBusy] = useState(false);

  const [category, setCategory] = useState(CATEGORIES[0]);
  const [severity, setSeverity] = useState<IncidentSeverity>("minor");
  const [useLive, setUseLive] = useState(false);
  const [manualLoc, setManualLoc] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const res = await fetchMyIncidents();
      setIncidents(res.incidents);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitReport() {
    if (!desc.trim()) {
      setError("DESCRIPTION IS REQUIRED.");
      return;
    }
    if (!useLive && !manualLoc.trim()) {
      setError("CHOOSE LIVE LOCATION OR ENTER A LOCATION DESCRIPTION.");
      return;
    }
    const live =
      useLive && state.status === "ready" && state.coords
        ? { lat: state.coords.lat, lon: state.coords.lon }
        : {};
    setBusy(true);
    setError("");
    try {
      await createRecord("incidents", {
        category,
        severity,
        description: desc.trim(),
        location_label:
          useLive && state.place
            ? `${state.place.name}${state.place.state ? `, ${state.place.state}` : ""}`
            : manualLoc.trim() || "LIVE POSITION",
        ...live,
      });
      setDesc("");
      setManualLoc("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The report could not be submitted.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(r: Incident) {
    if (r.status === INCIDENT_STATUSES[INCIDENT_STATUSES.length - 1]) return;
    setBusy(true);
    try {
      await updateRecord("incidents", r.id, { status: nextStatus(r.status) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The status could not be advanced.");
    } finally {
      setBusy(false);
    }
  }

  const pins = incidents
    .filter((r): r is Incident & { lat: number; lon: number } => r.lat !== null && r.lon !== null)
    .map((r) => ({
      lat: r.lat,
      lon: r.lon,
      label: `${r.id} · ${r.status}`,
      tone: r.severity === "critical" ? ("red" as const) : r.severity === "major" ? ("amber" as const) : ("blue" as const),
    }));

  return (
    <div>
      <PageHead
        kicker="CITIZEN INCIDENT REPORTING"
        title="Report and Incident Clustering"
        sub="Citizen reports always begin as RECEIVED and are never auto-verified. Cluster signals are AI-generated and require human authority verification."
        right={<Badge tone="green" dot>REPORTING OPEN</Badge>}
      />
      <section className="section">
        <div className="grid-2c">
          <Panel title="REPORT INCIDENT" meta="STORED SERVER-SIDE · NOT TRANSMITTED">
            <div className="stack" style={{ gap: 12 }}>
              <div>
                <label className="small muted">CATEGORY</label>
                <select
                  className="input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 4 }}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="small muted">SEVERITY</label>
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {SEVERITIES.map((s) => (
                    <button
                      key={s}
                      className={`btn btn-sm ${severity === s ? "btn-primary" : "btn-outline"}`}
                      onClick={() => setSeverity(s)}
                      type="button"
                    >
                      {SEVERITY_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="small muted">LOCATION</label>
                <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                  {state.status === "ready" && state.coords ? (
                    <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={useLive} onChange={(e) => setUseLive(e.target.checked)} />
                      <span className="small">
                        Use my live position ({state.coords.lat.toFixed(3)}, {state.coords.lon.toFixed(3)})
                      </span>
                    </label>
                  ) : (
                    <p className="small muted" style={{ margin: 0 }}>
                      Live position not loaded. Enable it on the Live page, or type a location below.
                    </p>
                  )}
                  <input
                    className="input"
                    placeholder="e.g. Sector 12, Varanasi"
                    value={manualLoc}
                    onChange={(e) => setManualLoc(e.target.value)}
                    disabled={useLive}
                  />
                </div>
              </div>
              <div>
                <label className="small muted">DESCRIPTION</label>
                <textarea
                  className="input"
                  placeholder="Describe the situation clearly."
                  rows={3}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  style={{ display: "block", width: "100%", marginTop: 4, resize: "vertical" }}
                />
              </div>
              <div>
                <label className="small muted">PHOTO (PROTOTYPE - NOT UPLOADED)</label>
                <input type="file" accept="image/*" className="input" style={{ marginTop: 6 }} />
              </div>
              {error && <p className="small" style={{ color: "var(--red)" }}>{error}</p>}
              <button className="btn btn-primary" onClick={() => void submitReport()} type="button" disabled={busy}>
                <Icon name="flag" size={14} /> {busy ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </Panel>

          <div className="console-stack">
            <Panel
              title="INCIDENT MAP"
              meta={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Badge tone="cyan" dot>AI-GENERATED CLUSTER SIGNAL</Badge>
                  <Badge tone="amber">AUTHORITY VERIFICATION REQUIRED</Badge>
                </span>
              }
              flush
            >
              {pins.length > 0 ? (
                <MapBox center={{ lat: 22, lon: 79 }} zoom={5} height={380} pins={pins} />
              ) : (
                <DataState icon="pin" title="NO INCIDENTS LOGGED" desc="Submitted reports appear here as map points. No reports have been logged yet." />
              )}
            </Panel>
            <Panel title="HOW CLUSTERING WORKS">
              <p className="small muted">
                Clusters combine category, keyword and proximity. Duplicate reports and noise are
                expected. The system never marks a signal as verified automatically; a command-role
                authority advance is required to move an incident to VERIFIED, then RESOLVED.
              </p>
            </Panel>
          </div>
        </div>

        <Panel
          title="REPORTED INCIDENTS"
          meta={authority ? "ALL REPORTS · SERVER DATABASE" : "YOUR REPORTS · SERVER DATABASE"}
          flush
          style={{ marginTop: 14 }}
        >
          {loadState === "loading" ? (
            <DataState icon="doc" title="LOADING REPORTS" desc="Reading incidents from the VARUN-X server." />
          ) : loadState === "error" ? (
            <DataState
              icon="alert"
              title="REPORTS UNAVAILABLE"
              desc="The server did not return the incident list. Nothing is shown from local storage instead."
              action={
                <button className="btn btn-primary" onClick={() => void load()}>
                  Retry
                </button>
              }
            />
          ) : incidents.length === 0 ? (
            <DataState icon="doc" title="NO REPORTS" desc="Submitted reports are listed here with review status." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Reported</th>
                    <th>Category</th>
                    <th>Severity</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Authority</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((r) => (
                    <tr key={r.id}>
                      <td className="mono-val">{r.id}</td>
                      <td className="mono-val">{fmtTime(r.occurred_at ?? r.created_at)}</td>
                      <td>{r.category}</td>
                      <td>
                        <SeverityBadge s={r.severity} />
                      </td>
                      <td>{r.location_label ?? "—"}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>
                        <CommandGate
                          fallback={<span className="small muted">AUTHORITY ONLY</span>}
                        >
                          <button
                            className="btn btn-outline btn-sm"
                            type="button"
                            onClick={() => void verify(r)}
                            disabled={busy || r.status === INCIDENT_STATUSES[INCIDENT_STATUSES.length - 1]}
                          >
                            {r.status === INCIDENT_STATUSES[INCIDENT_STATUSES.length - 1]
                              ? "RESOLVED"
                              : "ADVANCE STATUS"}
                          </button>
                        </CommandGate>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted" style={{ padding: "6px 12px", margin: 0 }}>
            Reports are stored in the VARUN-X server database and are not transmitted to any external
            agency. Advancing status is an authority action: the server checks the permission, writes
            an audit entry and stamps the reviewer.
          </p>
        </Panel>

        <SectionHead num="// AUDIT" title="Authority audit trail" />
        <AuditPanel />

        <SectionHead
          num="// LIMITS"
          title="Reporting limits"
        />
        <p className="small muted">
          Reports are displayed for demonstration. No incident is given verified status by the system,
          and no casualty or damage statistics are derived from these reports.
        </p>
      </section>
    </div>
  );
}