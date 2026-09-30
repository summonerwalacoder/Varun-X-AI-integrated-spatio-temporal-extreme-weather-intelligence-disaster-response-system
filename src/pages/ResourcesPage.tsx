import { useState } from "react";
import { PageHead } from "../components/PageHead";
import { Badge, DataState, Panel, SectionHead } from "../components/primitives";
import { Icon } from "../components/Icon";
import { fmtTime } from "../lib/format";
import { createRecord, useOpsTable, type Resource } from "../lib/ops";

const CATEGORIES = [
  "Food",
  "Water",
  "Shelter kits",
  "Medical",
  "Power",
  "Communication",
  "Transport",
] as const;

type StatusKey = "RECEIVED" | "ALLOCATED" | "DISPATCHED" | "DELIVERED";

const STATUSES: StatusKey[] = ["RECEIVED", "ALLOCATED", "DISPATCHED", "DELIVERED"];

const STATUS_TONE: Record<StatusKey, "blue" | "cyan" | "amber" | "green"> = {
  RECEIVED: "blue",
  ALLOCATED: "cyan",
  DISPATCHED: "amber",
  DELIVERED: "green",
};

export function ResourcesPage() {
  const { state, reload } = useOpsTable<Resource>("resources");
  const [item, setItem] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("units");
  const [status, setStatus] = useState<StatusKey>("RECEIVED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const entries = state.data ?? [];

  async function addLine() {
    const q = Number(qty);
    if (!item.trim() || !isFinite(q) || q <= 0) return;
    setBusy(true);
    setError("");
    try {
      await createRecord("resources", {
        kind: item.trim(),
        quantity: Math.round(q),
        unit: unit.trim() || "units",
        status,
        source: category,
      });
      setItem("");
      setQty("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The supply line could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead
        kicker="RESOURCE & SUPPLY TRACKING"
        title="Resource & Supply Tracking"
        sub="Inventory lifecycle RECEIVED to DELIVERED, held in the VARUN-X server database. Every recorded line is written to the server audit trail. Nothing here is transmitted to a supply registry."
        right={<Badge tone="muted">SERVER DATABASE</Badge>}
      />
      <section className="section">
        <SectionHead num="// 01" title="Supply Framework" />
        <div className="grid-2c">
          <SupplyLifecycle />
          <InventorySchema />
        </div>
      </section>
      <section className="section">
        <SectionHead num="// 02" title="Record Supply" />
        <DemoEntry
          item={item}
          setItem={setItem}
          category={category}
          setCategory={setCategory}
          qty={qty}
          setQty={setQty}
          unit={unit}
          setUnit={setUnit}
          status={status}
          setStatus={setStatus}
          entries={entries}
          loadState={state.status}
          error={error}
          busy={busy}
          onAdd={() => void addLine()}
          onRetry={reload}
        />
      </section>
      <section className="section">
        <SectionHead num="// 03" title="Depot Positions" />
        <DepotMap />
      </section>
      <p className="small muted">
        Records live in the VARUN-X server database and are never sent to an external supply
        registry or agency.
      </p>
    </div>
  );
}

function SupplyLifecycle() {
  return (
    <Panel title="SUPPLY LIFECYCLE" meta="SCHEMA">
      <div className="flow">
        {STATUSES.map((s, i) => (
          <span key={s} style={{ display: "contents" }}>
            {i > 0 && <span className="arrow">→</span>}
            <span className="step">
              {s} <Badge tone="muted">SCHEMA</Badge>
            </span>
          </span>
        ))}
      </div>
      <div className="divider" />
      <p className="small muted" style={{ margin: 0 }}>
        A line moves to DELIVERED only when an authority records it. The system never advances a
        supply state on its own and never infers a quantity that was not entered.
      </p>
    </Panel>
  );
}

function InventorySchema() {
  const { state, reload } = useOpsTable<Resource>("resources");
  const rows = state.data ?? [];

  return (
    <Panel title="INVENTORY" meta={rows.length ? `${rows.length} RECORDED LINES` : "AWAITING ENTRIES"} flush>
      {state.status === "forbidden" ? (
        <div style={{ padding: 14 }}>
          <DataState
            icon="lock"
            title="INVENTORY NOT PERMITTED"
            desc="Your session does not hold resources:read, so the server rejected the request."
          />
        </div>
      ) : state.status === "unavailable" ? (
        <div style={{ padding: 14 }}>
          <DataState
            icon="alert"
            title="INVENTORY UNAVAILABLE"
            desc={state.error ?? "The server did not return resource records."}
            action={
              <button className="btn btn-primary" onClick={reload}>
                Retry
              </button>
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 14 }}>
          <DataState
            icon="box"
            title="NO INVENTORY DATA"
            desc="No supply lines have been recorded. Stock, allocation and dispatch numbers are never invented."
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Group</th>
                <th>Quantity</th>
                <th>Verification</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono-val">{r.id}</td>
                  <td>{r.kind}</td>
                  <td className="muted small">{r.source ?? "—"}</td>
                  <td className="mono-val">
                    {r.quantity} {r.unit}
                  </td>
                  <td>
                    <Badge tone={r.verification === "VERIFIED" ? "green" : "muted"}>{r.verification}</Badge>
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[r.status as StatusKey] ?? "muted"}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function DemoEntry({
  item,
  setItem,
  category,
  setCategory,
  qty,
  setQty,
  unit,
  setUnit,
  status,
  setStatus,
  entries,
  loadState,
  error,
  busy,
  onAdd,
  onRetry,
}: {
  item: string;
  setItem: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  qty: string;
  setQty: (v: string) => void;
  unit: string;
  setUnit: (v: string) => void;
  status: StatusKey;
  setStatus: (v: StatusKey) => void;
  entries: Resource[];
  loadState: string;
  error: string;
  busy: boolean;
  onAdd: () => void;
  onRetry: () => void;
}) {
  return (
    <Panel title="RECORD SUPPLY LINE" meta="SERVER DATABASE · NOT TRANSMITTED">
      <p className="small muted" style={{ margin: 0, marginBottom: 14 }}>
        Record a supply line in the VARUN-X operations database. The server checks the permission,
        writes an audit entry and stores the value. Nothing is sent to an external registry.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label className="label" htmlFor="res-item">Item</label>
          <input
            id="res-item"
            className="input"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
            placeholder="e.g. Ration pack"
          />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label className="label" htmlFor="res-category">Category</label>
          <select
            id="res-category"
            className="select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ width: 110 }}>
          <label className="label" htmlFor="res-qty">Quantity</label>
          <input
            id="res-qty"
            className="input"
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="field" style={{ width: 120 }}>
          <label className="label" htmlFor="res-unit">Unit</label>
          <input
            id="res-unit"
            className="input"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <div className="field" style={{ width: 150 }}>
          <label className="label" htmlFor="res-status">Status</label>
          <select
            id="res-status"
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusKey)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onAdd} disabled={busy}>
          <Icon name="plus" size={14} /> {busy ? "SAVING…" : "Add line"}
        </button>
      </div>
      {error && <p className="small" style={{ color: "var(--red)", margin: "10px 0 0" }}>{error}</p>}
      <div className="divider" />
      {loadState === "loading" ? (
        <DataState icon="box" title="LOADING" desc="Reading resource records from the VARUN-X server." />
      ) : loadState === "unavailable" || loadState === "forbidden" ? (
        <DataState
          icon="alert"
          title="RESOURCE RECORDS UNAVAILABLE"
          desc={
            loadState === "forbidden"
              ? "Your session does not hold resources:read, so the server rejected the request."
              : "The server did not return resource records. No browser-local list is shown instead."
          }
          action={
            <button className="btn btn-primary" onClick={onRetry}>
              Retry
            </button>
          }
        />
      ) : entries.length === 0 ? (
        <DataState
          icon="box"
          title="NO RECORDED LINES"
          desc="Add a supply line above. It will appear here with a server timestamp and a server-assigned ID."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Group</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Updated (server)</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((en) => (
                <tr key={en.id}>
                  <td className="mono-val">{en.id}</td>
                  <td>{en.kind}</td>
                  <td className="muted small">{en.source ?? "—"}</td>
                  <td className="mono-val">
                    {en.quantity} {en.unit}
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[en.status as StatusKey] ?? "muted"}>{en.status}</Badge>{" "}
                    <Badge tone="muted">UNVERIFIED</Badge>
                  </td>
                  <td className="mono-val">{fmtTime(en.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function DepotMap() {
  return (
    <Panel title="DEPOT MAP" meta="NO POSITIONS">
      <DataState
        icon="pin"
        title="NO DEPOT POSITIONS"
        desc="Depot coordinates would come from the supply registry once connected. No map is drawn because no positions exist."
      />
    </Panel>
  );
}