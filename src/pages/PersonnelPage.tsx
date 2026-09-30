import { useState } from "react";
import { PageHead } from "../components/PageHead";
import { Badge, DataState, Panel, SectionHead } from "../components/primitives";
import { Icon } from "../components/Icon";
import { CommandGate } from "../components/RoleGate";
import { AuditPanel } from "../components/AuditPanel";
import { fmtTime } from "../lib/format";
import { createRecord, updateRecord, useOpsTable, type Personnel } from "../lib/ops";

const ROLES = [
  "Incident Commander",
  "Operations Section",
  "Planning Section",
  "Logistics Section",
  "Finance / Admin",
  "Safety Officer",
  "Liaison Officer",
  "Public Information",
];

const COMPETENCIES: Array<[string, string]> = [
  ["First aid / medical", "Triage and primary care at staging points"],
  ["Swift-water rescue", "Flood response and boat operations"],
  ["Urban search", "USAR and confined-space access"],
  ["Heavy lift / extrication", "Machinery and structural access"],
  ["Comms / radio", "Field communications and coordination"],
  ["CBRN awareness", "Hazard awareness and decontamination principles"],
  ["Shelter management", "Camp layout, registration and operations"],
];

const LIFECYCLE = ["AVAILABLE", "ASSIGNED", "EN ROUTE", "ON SCENE", "COMPLETE"];

const PERSONNEL_STATUSES = LIFECYCLE;

const STATUS_TONE: Record<string, "blue" | "cyan" | "amber" | "green" | "muted"> = {
  AVAILABLE: "green",
  ASSIGNED: "blue",
  "EN ROUTE": "cyan",
  "ON SCENE": "amber",
  COMPLETE: "muted",
};

export function PersonnelPage() {
  return (
    <div>
      <PageHead
        kicker="PERSONNEL & RESCUE TEAMS"
        title="Personnel & Rescue Teams"
        sub="Rosters and task assignments require a verified authority roster. Until that roster is connected, this module shows schemas and empty states - it never invents personnel."
        right={<Badge tone="muted">VERIFIED ROSTER REQUIRED</Badge>}
      />
      <section className="section">
        <SectionHead num="// 01" title="Command Structure" />
        <div className="grid-2c">
          <CommandChain />
          <div className="console-stack">
            <DemoRoster />
            <SkillCompetency />
          </div>
        </div>
      </section>
      <TaskAssignments />
      <section className="section">
        <SectionHead num="// 03" title="Authority audit trail" />
        <AuditPanel />
      </section>
    </div>
  );
}

function CommandChain() {
  return (
    <Panel title="COMMAND CHAIN" meta="SCHEMA ONLY">
      <div className="stack">
        {ROLES.map((role) => (
          <div className="row-line" key={role}>
            <span className="rl-t">{role}</span>
            <Badge tone="muted">ROSTER: PENDING</Badge>
          </div>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 14 }}>
        Registered authority roster is required before real assignment.
      </p>
    </Panel>
  );
}

function DemoRoster() {
  const { state, reload } = useOpsTable<Personnel>("personnel");
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [competency, setCompetency] = useState(COMPETENCIES[0][0]);
  const [status, setStatus] = useState<string>("AVAILABLE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const roster = state.data ?? [];

  async function add() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await createRecord("personnel", {
        name: name.trim(),
        role,
        category: competency,
        availability: status,
        deployment: status,
      });
      setName("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The roster entry could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function advance(p: Personnel) {
    const current = String(p.availability ?? "AVAILABLE");
    if (current === PERSONNEL_STATUSES[PERSONNEL_STATUSES.length - 1]) return;
    const next = PERSONNEL_STATUSES[PERSONNEL_STATUSES.indexOf(current) + 1] ?? current;
    setBusy(true);
    setError("");
    try {
      await updateRecord("personnel", p.id, { availability: next, deployment: next });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The status could not be advanced.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="DEMO ROSTER REGISTRY" meta="SERVER DATABASE · DEMO ENTRIES · NOT A VERIFIED ROSTER" flush>
      <div style={{ padding: 14 }}>
        <p className="small muted" style={{ margin: 0, marginBottom: 12 }}>
          Add clearly-labelled demo personnel for planning. These entries never represent a verified
          authority roster, and every add or status change is written to the server audit trail.
        </p>
        {state.status === "forbidden" ? (
          <DataState
            icon="lock"
            title="ROSTER NOT PERMITTED FOR THIS ROLE"
            desc="Your session does not hold personnel:read, so the server rejected the request."
          />
        ) : (
          <CommandGate
            fallback={<p className="small muted" style={{ margin: 0 }}>Adding and assigning personnel requires COMMAND authority. Sign in with the command role.</p>}
          >
          <div className="stack" style={{ gap: 10 }}>
            <div className="kv-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label className="label" htmlFor="pp-name">NAME</label>
                <input
                  id="pp-name"
                  className="input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="DEMO PERSONNEL NAME"
                  autoComplete="off"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="pp-role">ROLE</label>
                <select id="pp-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="pp-status">STATUS</label>
                <select id="pp-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {PERSONNEL_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label className="label" htmlFor="pp-competency">COMPETENCY</label>
                <select id="pp-competency" className="input" value={competency} onChange={(e) => setCompetency(e.target.value)}>
                  {COMPETENCIES.map(([c]) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <p className="small" style={{ color: "var(--red)", margin: 0 }}>{error}</p>}
            <button className="btn btn-primary" type="button" onClick={() => void add()} disabled={!name.trim() || busy}>
              <Icon name="plus" size={14} /> {busy ? "SAVING…" : "ADD TO DEMO ROSTER"}
            </button>
          </div>
          </CommandGate>
        )}
      </div>
      <div className="divider" />
      {state.status === "loading" ? (
        <div style={{ padding: 14 }}>
          <DataState icon="people" title="LOADING ROSTER" desc="Reading personnel from the VARUN-X server." />
        </div>
      ) : state.status === "unavailable" ? (
        <div style={{ padding: 14 }}>
          <DataState
            icon="alert"
            title="ROSTER UNAVAILABLE"
            desc={state.error ?? "The server did not return personnel. No browser-local list is shown instead."}
            action={
              <button className="btn btn-primary" onClick={reload}>
                Retry
              </button>
            }
          />
        </div>
      ) : roster.length === 0 ? (
        <div style={{ padding: 14 }}>
          <DataState
            icon="people"
            title="NO ROSTER ENTRIES"
            desc="Demo roster entries appear here with their assignment status. No real personnel are fabricated."
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Competency</th>
                <th>Updated</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => {
                const current = String(p.availability ?? "AVAILABLE");
                return (
                  <tr key={p.id}>
                    <td className="mono-val">{p.id}</td>
                    <td>{p.name}</td>
                    <td>{p.role}</td>
                    <td className="small muted">{p.category}</td>
                    <td className="mono-val">{fmtTime(p.updated_at)}</td>
                    <td>
                      <Badge tone={STATUS_TONE[current] ?? "muted"}>{current}</Badge>
                    </td>
                    <td>
                      <CommandGate
                        fallback={<span className="small muted">AUTHORITY ONLY</span>}
                      >
                        <button
                          className="btn btn-outline btn-sm"
                          type="button"
                          onClick={() => void advance(p)}
                          disabled={busy || current === PERSONNEL_STATUSES[PERSONNEL_STATUSES.length - 1]}
                        >
                          {current === "COMPLETE" ? "COMPLETE" : "ADVANCE"}
                        </button>
                      </CommandGate>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted" style={{ padding: "8px 12px", margin: 0 }}>
        DEMO entries only, held in the VARUN-X server database. They are not a verified authority
        roster and are never transmitted.
      </p>
    </Panel>
  );
}

function SkillCompetency() {
  return (
    <Panel title="SKILL & COMPETENCY" meta="SCHEMA">
      <div className="list-2">
        {COMPETENCIES.map(([name, detail]) => (
          <div key={name}>
            <strong className="small" style={{ color: "var(--text)" }}>{name}</strong>
            <p className="small muted" style={{ marginTop: 2 }}>{detail}</p>
          </div>
        ))}
      </div>
      <div className="divider" />
      <p className="small muted" style={{ margin: 0 }}>
        Competency categories teams must hold. No certifications or counts are recorded until a
        registry is connected.
      </p>
    </Panel>
  );
}

function TaskAssignments() {
  return (
    <section className="section">
      <SectionHead num="// 02" title="Personnel Task Assignments" />
      <Panel
        title="TASK ASSIGNMENTS"
        meta="TABLE SCHEMA: TASK - ASSIGNEE - TEAM - STATUS"
      >
        <DataState
          icon="doc"
          title="NO TASK ASSIGNMENTS"
          desc="Assignment queue awaits verified roster and open incident records."
        />
        <div className="divider" />
        <div className="flow">
          {LIFECYCLE.map((step, i) => (
            <span key={step} style={{ display: "contents" }}>
              {i > 0 && <span className="arrow">→</span>}
              <span className="step">
                {step} <Badge tone="muted">SCHEMA</Badge>
              </span>
            </span>
          ))}
        </div>
      </Panel>
    </section>
  );
}
