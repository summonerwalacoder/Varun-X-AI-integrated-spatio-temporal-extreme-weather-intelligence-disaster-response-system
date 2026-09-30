import { fmtTime } from "../lib/format";
import { Panel, Badge, DataState } from "./primitives";
import { useSession, isAuthority } from "../lib/session";
import { useAudit } from "../lib/ops";

/**
 * Read-only authority audit trail.
 *
 * Reads the server's append-only audit_log, which is written inside the same
 * transaction as the mutation it records. The browser cannot add, edit or
 * delete an entry: acknowledging an alert is audited by the server, not by
 * the client that clicked the button.
 */
export function AuditPanel({ title = "AUDIT LOG", limit = 100 }: { title?: string; limit?: number }) {
  const { session } = useSession();
  // Gate the request itself, not just the rendering: a session without
  // audit:read must not generate a request the server will refuse.
  const allowed = isAuthority(session);
  const { state, reload } = useAudit(limit, allowed);

  if (!allowed) {
    return (
      <Panel title={title} meta="READ-ONLY · RESTRICTED">
        <DataState
          icon="lock"
          title="AUDIT LOG RESTRICTED"
          desc="The authority audit trail is visible to authorized sessions only."
        />
      </Panel>
    );
  }

  if (state.status === "forbidden") {
    return (
      <Panel title={title} meta="READ-ONLY · SERVER ENFORCED">
        <DataState
          icon="lock"
          title="AUDIT LOG NOT PERMITTED FOR THIS ROLE"
          desc="Your session does not hold the audit:read permission. The server rejected the request."
        />
      </Panel>
    );
  }

  if (state.status === "unavailable") {
    return (
      <Panel title={title} meta="READ-ONLY">
        <DataState
          icon="alert"
          title="AUDIT LOG UNAVAILABLE"
          desc={state.error ?? "The server did not return the audit trail."}
          action={
            <button className="btn btn-primary" onClick={reload}>
              Retry
            </button>
          }
        />
      </Panel>
    );
  }

  const entries = state.data?.entries ?? [];

  if (state.status !== "ready" || entries.length === 0) {
    return (
      <Panel title={title} meta="READ-ONLY">
        <DataState
          icon="doc"
          title="NO AUTHORITY ACTIONS RECORDED"
          desc="Authority actions such as publishing alerts, verifying incidents, allocating resources or dispatching broadcasts appear here as timestamped entries written by the server."
        />
      </Panel>
    );
  }

  return (
    <Panel title={title} meta={`READ-ONLY · APPEND-ONLY · ${entries.length} ENTRIES`}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Action</th>
              <th>Timestamp</th>
              <th>Scope</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="mono-val">{e.user_label}</td>
                <td className="muted small">{e.role ?? "-"}</td>
                <td>{e.action}</td>
                <td className="mono-val">{fmtTime(e.ts)}</td>
                <td className="mono-val">{e.scope}</td>
                <td>
                  <Badge tone={e.result === "SUCCESS" ? "green" : e.result.startsWith("SIMULATED") ? "amber" : "muted"}>
                    {e.result}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ padding: "8px 12px", margin: 0 }}>
        Server-side append-only store. Entries are written by the API as part of the change they
        describe and cannot be edited or removed from the interface.
      </p>
    </Panel>
  );
}
