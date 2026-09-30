import { useEffect, useState } from "react";
import { Panel, Badge, DataState } from "./primitives";
import { Icon } from "./Icon";
import { CommandGate } from "./RoleGate";
import { useWeather } from "../lib/useWeather";
import { fmtTime } from "../lib/format";
import {
  createRecord,
  dispatchBroadcast,
  fetchDeliveryStatus,
  updateRecord,
  useOpsTable,
  type Broadcast,
  type DeliveryStatus,
  type DispatchResult,
} from "../lib/ops";

const BROADCAST_TYPES = ["EVACUATION", "SHELTER", "ALL CLEAR", "PRECAUTION", "MISSING PERSON"] as const;
const BROADCAST_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "EXPIRED"] as const;
const PRIORITIES = ["LOW", "MODERATE", "HIGH", "CRITICAL"] as const;

/** DASHBOARD publishes in-app; the rest require a configured delivery provider. */
const CHANNELS = ["DASHBOARD", "SMS", "EMAIL", "PUSH"] as const;

/**
 * Delivery capability, read from the server.
 *
 * The composer needs to know which channels can actually reach someone before
 * it offers them, so the provider status is fetched once and shared.
 */
let deliveryPromise: Promise<DeliveryStatus> | null = null;
function useDeliveryStatus() {
  const [state, setState] = useState<{ status: string; data: DeliveryStatus | null }>({
    status: "loading",
    data: null,
  });
  useEffect(() => {
    let alive = true;
    deliveryPromise ??= fetchDeliveryStatus().catch(() => ({
      status: "UNCONFIGURED",
      detail: "Delivery capability could not be read from the server.",
      channels: {},
    }));
    void deliveryPromise.then((data) => {
      if (alive) setState({ status: "ready", data });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** True when the server reports a real provider behind this channel. */
function channelIsLive(delivery: DeliveryStatus | null, channel: string): boolean {
  if (channel === "DASHBOARD") return true;
  return delivery?.channels?.[channel.toLowerCase()]?.configured === true;
}

const SEVERITY_TONE: Record<string, "blue" | "amber" | "red"> = {
  LOW: "blue",
  MODERATE: "amber",
  HIGH: "amber",
  CRITICAL: "red",
};

const STATUS_TONE: Record<string, "green" | "blue" | "muted"> = {
  ACTIVE: "green",
  SCHEDULED: "blue",
  DRAFT: "muted",
  EXPIRED: "muted",
};

export function BroadcastComposer({ region: defaultRegion }: { region: string }) {
  const [type, setType] = useState<string>(BROADCAST_TYPES[0]);
  const [region, setRegion] = useState(defaultRegion);
  const [priority, setPriority] = useState<string>("HIGH");
  const [language, setLanguage] = useState<string>("English");
  const [status, setStatus] = useState<string>(BROADCAST_STATUSES[0]);
  const [channels, setChannels] = useState<string[]>(["DASHBOARD", "SMS"]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<Broadcast | null>(null);
  const { data: delivery } = useDeliveryStatus();

  function toggleChannel(c: string) {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  async function submit() {
    if (!text.trim() || busy || channels.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const created = await createRecord<Broadcast>("broadcasts", {
        type,
        region: region.trim() || "UNSPECIFIED",
        severity: priority,
        language,
        text: text.trim(),
        channels: channels.join(","),
        status,
      });
      setText("");
      setSent(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The broadcast could not be published.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="COMPOSE BROADCAST" meta="COMMAND ROLE ONLY" flush>
      <div className="stack" style={{ gap: 12, padding: 14 }}>
        <CommandGate fallback={<p className="small muted" style={{ margin: 0 }}>The broadcast composer requires COMMAND authority. Sign in with the command role to compose broadcasts.</p>}>
          <div className="stack" style={{ gap: 12 }}>
            <div className="kv-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="field">
                <label className="label" htmlFor="bc-type">TYPE</label>
                <select id="bc-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
                  {BROADCAST_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="bc-region">REGION</label>
                <input id="bc-region" className="input" type="text" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="E.G. KHAMMAM DISTRICT" autoComplete="off" />
              </div>
              <div className="field">
                <label className="label" htmlFor="bc-priority">SEVERITY</label>
                <select id="bc-priority" className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITIES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="bc-status">STATUS ON PUBLISH</label>
                <select id="bc-status" className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {BROADCAST_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label className="label" htmlFor="bc-lang">LANGUAGE</label>
                <select id="bc-lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="English">ENGLISH</option>
                  <option value="Hindi">HINDI</option>
                  <option value="Hinglish">HINGLISH</option>
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <span className="label">CHANNELS</span>
                <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
                  {CHANNELS.map((c) => {
                    const live = channelIsLive(delivery, c);
                    return (
                      <label key={c} className="row" style={{ gap: 6, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={channels.includes(c)}
                          onChange={() => toggleChannel(c)}
                        />
                        <span className="mono-val">{c}</span>
                        <Badge tone={live ? "green" : "muted"}>
                          {live ? "LIVE" : c === "DASHBOARD" ? "IN-APP" : "NO PROVIDER"}
                        </Badge>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="bc-text">MESSAGE</label>
              <textarea id="bc-text" className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="INSTRUCTIONS TO THE PUBLIC…" />
            </div>

            <div style={{ border: "1px solid var(--border)", padding: 12, background: "var(--surface-2)" }}>
              <div className="small muted mono" style={{ marginBottom: 6 }}>PREVIEW</div>
              <div className="small" style={{ color: "var(--text-2)", lineHeight: 1.6 }}>
                <Badge tone={SEVERITY_TONE[priority] ?? "blue"}>{priority}</Badge>{" "}
                <Badge tone="muted">{type}</Badge>{" "}
                <span className="mono-val">{region.trim() || "UNSPECIFIED"}</span> ·{" "}
                <span className="mono-val">{language}</span> · <span className="mono-val">{status}</span>
                <div className="muted" style={{ marginTop: 6, fontStyle: "italic" }}>{text.trim() || "No message text yet."}</div>
              </div>
            </div>

            <button className="btn btn-primary" type="button" onClick={() => void submit()} disabled={!text.trim() || busy || channels.length === 0}>
              <Icon name="alert" size={14} /> {busy ? "PUBLISHING…" : "PUBLISH BROADCAST"}
            </button>
            {error && <p className="small" style={{ color: "var(--red)", margin: 0 }}>{error}</p>}
            {sent && (
              <div className="row-line">
                <Badge tone="green" dot>PUBLISHED {sent.id}</Badge>
                <span className="rl-s mono-val">{fmtTime(sent.created_at)} · {sent.text}</span>
              </div>
            )}
            <p className="small muted" style={{ margin: 0 }}>
              Publishing writes the record to the VARUN-X server database and an audit entry. DASHBOARD
              reaches signed-in users immediately.{" "}
              {delivery?.status === "CONFIGURED"
                ? "The channels marked LIVE above have a real provider behind them and will transmit on dispatch."
                : "No SMS, email or push provider is configured, so those channels transmit nothing; the server records the dispatch as NOT_CONFIGURED with a zero delivery count."}
            </p>
          </div>
        </CommandGate>
      </div>
    </Panel>
  );
}

export function BroadcastStream() {
  const { state, reload } = useOpsTable<Broadcast>("broadcasts");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DispatchResult["dispatch"] | null>(null);
  const [error, setError] = useState("");
  const rows = state.data ?? [];

  async function runDispatch(b: Broadcast) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await dispatchBroadcast(b.id);
      setResult(res.dispatch);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The dispatch could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(b: Broadcast, next: string) {
    setBusy(true);
    setError("");
    try {
      await updateRecord("broadcasts", b.id, { status: next });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="BROADCAST STREAM" meta={state.status === "ready" ? `${rows.length} ON RECORD · SERVER DATABASE` : "SERVER DATABASE"} flush>
      {state.status === "forbidden" ? (
        <div style={{ padding: 14 }}>
          <DataState
            icon="lock"
            title="BROADCASTS NOT PERMITTED"
            desc="Your session does not hold broadcast:read, so the server rejected the request."
          />
        </div>
      ) : state.status === "unavailable" ? (
        <div style={{ padding: 14 }}>
          <DataState
            icon="alert"
            title="BROADCASTS UNAVAILABLE"
            desc={state.error ?? "The server did not return broadcasts."}
            action={
              <button className="btn btn-primary" onClick={reload}>
                Retry
              </button>
            }
          />
        </div>
      ) : state.status === "loading" ? (
        <div style={{ padding: 14 }}>
          <DataState icon="alert" title="LOADING" desc="Reading broadcasts from the VARUN-X server." />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 14 }}>
          <DataState
            icon="alert"
            title="NO BROADCASTS PUBLISHED"
            desc="Published broadcasts appear here with their status and are written to the server audit trail."
          />
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Time</th>
                  <th>Severity</th>
                  <th>Type</th>
                  <th>Region</th>
                  <th>Lang</th>
                  <th>Status</th>
                  <th>Dispatch</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td className="mono-val">{b.id}</td>
                    <td className="mono-val">{fmtTime(b.created_at)}</td>
                    <td>
                      <Badge tone={SEVERITY_TONE[b.severity] ?? "blue"}>{b.severity}</Badge>
                    </td>
                    <td className="small">{b.type}</td>
                    <td className="small">{b.region}</td>
                    <td className="mono-val">{b.language.slice(0, 3).toUpperCase()}</td>
                    <td>
                      <Badge tone={STATUS_TONE[b.status] ?? "muted"}>{b.status}</Badge>
                    </td>
                    <td>
                      <CommandGate fallback={<span className="small muted">AUTHORITY ONLY</span>}>
                        <button
                          className="btn btn-outline btn-sm"
                          type="button"
                          onClick={() => void runDispatch(b)}
                          disabled={busy}
                        >
                          DISPATCH NOW
                        </button>
                      </CommandGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 12 }}>
            <div className="row-line">
              <CommandGate fallback={<span className="small muted">AUTHORITY ONLY</span>}>
                <select
                  className="select"
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    const b = rows[0];
                    if (b && e.target.value) void setStatus(b, e.target.value);
                  }}
                  aria-label="Change most recent broadcast status"
                >
                  <option value="">CHANGE STATUS OF MOST RECENT…</option>
                  {BROADCAST_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </CommandGate>
            </div>
            {error && <p className="small" style={{ color: "var(--red)", marginTop: 8 }}>{error}</p>}
            {result && (
              <div style={{ marginTop: 10, border: "1px solid var(--border)", padding: 12, background: "var(--surface-2)" }}>
                <div style={{ marginBottom: 6 }}>
                  <Badge tone={result.status === "DELIVERED" ? "green" : result.status === "IN_APP_ONLY" ? "blue" : "amber"} dot>
                    {result.status} · {result.actuallySent} OF {result.intendedRecipients} DELIVERED
                  </Badge>
                </div>
                {result.reason && <p className="small muted" style={{ margin: 0 }}>{result.reason}</p>}
                <div className="kv-grid" style={{ marginTop: 10 }}>
                  <div>
                    <div className="small muted">INTENDED RECIPIENTS</div>
                    <div className="mono-val">{result.intendedRecipients}</div>
                  </div>
                  <div>
                    <div className="small muted">ACTUALLY DELIVERED</div>
                    <div className="mono-val" style={{ color: result.actuallySent > 0 ? "var(--green)" : "var(--amber)" }}>
                      {result.actuallySent}
                    </div>
                  </div>
                  <div>
                    <div className="small muted">CHANNELS ATTEMPTED</div>
                    <div className="mono-val">{result.channelsAttempted}</div>
                  </div>
                </div>
                {result.channels.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {result.channels.map((c) => (
                      <div key={c.channel} className="row-line">
                        <Badge tone={c.status === "SENT" ? "green" : c.status === "UNCONFIGURED" ? "muted" : "amber"}>
                          {c.channel} · {c.status}
                        </Badge>
                        <span className="rl-s mono-val">
                          {c.sent}/{c.attempted} sent{c.reason ? ` · ${c.reason}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

export function BroadcastStatusFlow() {
  return (
    <Panel title="BROADCAST LIFECYCLE" meta="STATUS FLOW" flush>
      <div className="flow" style={{ padding: 12 }}>
        <span className="step">DRAFT</span>
        <span className="arrow">→</span>
        <span className="step">SCHEDULED</span>
        <span className="arrow">→</span>
        <span className="step">ACTIVE</span>
        <span className="arrow">→</span>
        <span className="step">EXPIRED</span>
      </div>
      <div style={{ padding: "0 12px 12px" }}>
        <p className="small muted" style={{ margin: 0 }}>
          Broadcasts are composed, previewed, then stored with a target status. Dispatching attempts
          real delivery through every configured channel: DASHBOARD reaches signed-in users, and
          SMS, email and push transmit only where a provider is configured. The result records
          intended recipients against messages actually delivered, and the server writes the audit
          entry and the status change.
        </p>
      </div>
    </Panel>
  );
}

export function BroadcastRegionHint() {
  const { state } = useWeather();
  const region = state.place ? `${state.place.name}${state.place.state ? `, ${state.place.state}` : ""}` : "";
  return (
    <Panel title="DETECTED REGION" meta="FOR BROADCAST COMPOSITION">
      <p className="small" style={{ margin: 0 }}>
        {region
          ? <span className="mono-val">{region}</span>
          : <span className="muted">No live source region yet. Allow location access or select a location on the Live page, or type a region in the composer.</span>}
      </p>
    </Panel>
  );
}
