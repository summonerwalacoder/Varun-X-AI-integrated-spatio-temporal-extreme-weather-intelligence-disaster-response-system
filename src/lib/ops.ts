/* ============================================================
   VARUN-X operations client (server-authoritative)

   Every operations record lives in the server's SQLite database.
   Nothing is kept in localStorage, so two browsers signed in as the
   same role always see the same state, and an audit entry is written
   for every mutation because the server does it, not the caller.
   ============================================================ */

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

/* ------------------------------ shapes ------------------------------ */

export type IncidentStatus = "RECEIVED" | "UNDER REVIEW" | "VERIFIED" | "RESOLVED";
export type IncidentSeverity = "minor" | "major" | "critical";

export const INCIDENT_STATUSES: IncidentStatus[] = ["RECEIVED", "UNDER REVIEW", "VERIFIED", "RESOLVED"];

export interface Incident {
  id: string;
  reporter_user_id: string | null;
  category: string;
  /**
   * The declared unions document the values the server uses, but the wire type
   * stays open: a row written by a newer server must render as-is rather than
   * fail to typecheck, and an unknown status must still display.
   */
  severity: IncidentSeverity | string;
  description: string;
  photo_ref: string | null;
  lat: number | null;
  lon: number | null;
  location_label: string | null;
  occurred_at: number;
  status: IncidentStatus | string;
  reviewed_by: string | null;
  reviewed_at: number | null;
  resolution_note: string | null;
  is_demo: number;
  created_at: number;
  updated_at: number;
}

export interface Personnel {
  id: string;
  staff_id: string;
  name: string;
  role: string;
  department: string | null;
  team: string | null;
  category: string;
  availability: string;
  deployment: string;
  assigned_task: string | null;
  location_label: string | null;
  lat: number | null;
  lon: number | null;
  contact_state: string;
  is_demo: number;
  updated_at: number;
}

export interface Team {
  id: string;
  name: string;
  type: string;
  members: string | null;
  strength: number;
  location_label: string | null;
  lat: number | null;
  lon: number | null;
  assignment: string | null;
  availability: string;
  equipment: string | null;
  status: string;
  is_demo: number;
  updated_at: number;
}

export interface Resource {
  id: string;
  kind: string;
  quantity: number;
  unit: string;
  source: string | null;
  origin: string | null;
  destination: string | null;
  responsible: string | null;
  status: string;
  verification: string;
  is_demo: number;
  updated_at: number;
  history: string;
}

export interface Shelter {
  id: string;
  name: string;
  type: string;
  capacity: number;
  occupied: number;
  status: string;
  lat: number | null;
  lon: number | null;
  address: string | null;
  contact: string | null;
  source: string;
  verified: number;
  is_demo: number;
  updated_at: number;
}

export interface Broadcast {
  id: string;
  type: string;
  region: string;
  hazard: string | null;
  severity: string;
  language: string;
  text: string;
  channels: string;
  status: string;
  created_by: string | null;
  created_at: number;
  publish_at: number | null;
  published_at: number | null;
  expires_at: number | null;
  recipient_estimate: number | null;
  delivery_note: string | null;
}

export interface Alert {
  id: string;
  hazard: string;
  area: string;
  severity: string;
  window_start: number;
  window_end: number;
  confidence: number | null;
  uncertainty: string | null;
  action: string;
  source: string;
  lat: number | null;
  lon: number | null;
  origin: string;
  verification: string;
  created_by: string | null;
  created_at: number;
  expires_at: number | null;
}

export interface AuditEntry {
  id: number;
  ts: number;
  user_id: string | null;
  user_label: string;
  role: string | null;
  action: string;
  scope: string;
  result: string;
  detail: string | null;
  ip: string | null;
}

export interface Snapshot {
  role: string;
  generatedAt: number;
  incidents: Incident[];
  personnel: Personnel[];
  teams: Team[];
  resources: Resource[];
  shelters: Shelter[];
  alerts: Alert[];
  broadcasts: Broadcast[];
  dataClass: string;
  notice: string;
}

export interface DataSource {
  id: string;
  name: string;
  kind: string;
  provider: string;
  resolution: string | null;
  cadence: string | null;
  licence: string | null;
  connected: number;
  status: string;
  last_check: number | null;
  notes: string | null;
}

export type OpsTable = "incidents" | "personnel" | "teams" | "resources" | "shelters" | "alerts" | "broadcasts";

/* ------------------------------ calls ------------------------------- */

export async function fetchSnapshot(): Promise<Snapshot> {
  return api<Snapshot>("/api/ops/snapshot");
}

/**
 * Reports filed by the signed-in citizen. The server scopes this to the
 * reporter in SQL, so it is the only incident list a citizen can read.
 */
export async function fetchMyIncidents(): Promise<{ incidents: Incident[]; scope: string }> {
  return api<{ incidents: Incident[]; scope: string }>("/api/incidents/mine");
}

export async function fetchTable<T>(table: OpsTable, query: Record<string, string> = {}): Promise<T[]> {
  const res = await api<Record<string, T[]>>(`/api/${table}`, { query });
  return res[table] ?? [];
}

const SINGULAR: Record<OpsTable, string> = {
  incidents: "incident",
  personnel: "personnel",
  teams: "team",
  resources: "resource",
  shelters: "shelter",
  alerts: "alert",
  broadcasts: "broadcast",
};

export async function createRecord<T>(table: OpsTable, body: Record<string, unknown>): Promise<T> {
  const res = await api<Record<string, T>>(`/api/${table}`, { method: "POST", body });
  return res[SINGULAR[table]];
}

export async function updateRecord<T>(table: OpsTable, id: string, body: Record<string, unknown>): Promise<T> {
  const res = await api<Record<string, T>>(`/api/${table}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
  return res[SINGULAR[table]];
}

export interface ChannelOutcome {
  channel: "SMS" | "EMAIL" | "PUSH";
  /** `UNCONFIGURED` means no provider credentials exist for that channel, so
   *  nothing was sent and nothing is counted as delivered. */
  status: "SENT" | "FAILED" | "UNCONFIGURED";
  sent: number;
  attempted: number;
  reason?: string;
}

export interface DispatchResult {
  broadcast: Broadcast;
  /** Mirrors the server payload exactly; the names are the server's, so the
   *  page cannot read a field the server never sends. */
  dispatch: {
    /** `DELIVERED` only when a real provider accepted the message,
     *  `NOT_CONFIGURED` when an external channel was requested but no provider
     *  exists for it, `IN_APP_ONLY` when no external channel was requested. */
    status: "DELIVERED" | "FAILED" | "NOT_CONFIGURED" | "IN_APP_ONLY";
    intendedRecipients: number;
    actuallySent: number;
    channels: ChannelOutcome[];
    channelsAttempted: number;
    reason: string | null;
  };
}

/**
 * Broadcast dispatch attempts real delivery through whatever providers are
 * configured (Twilio, SMTP, FCM). With no credentials the server returns
 * `NOT_CONFIGURED` and a zero send count, and the page says exactly that.
 */
export async function dispatchBroadcast(id: string): Promise<DispatchResult> {
  return api<DispatchResult>(`/api/broadcasts/${encodeURIComponent(id)}/dispatch`, { method: "POST" });
}

export interface DeliveryStatus {
  status: "CONFIGURED" | "UNCONFIGURED";
  detail: string;
  channels: Record<string, { configured: boolean; provider: string; missing?: string[] }>;
}

/** Whether a real delivery provider exists for each channel. */
export async function fetchDeliveryStatus(): Promise<DeliveryStatus> {
  return api<DeliveryStatus>("/api/ops/delivery");
}

export interface OfficialAlert {
  hazard: string;
  headline: string;
  severity: string;
  urgency: string;
  certainty: string;
  description: string;
  instruction?: string;
  area?: string;
  authority: string;
  source: string;
  verification: string;
  identifier?: string;
  issuedAt: number | null;
  expiresAt: number | null;
  dataClass: string;
  /** The geography the issuing feed covers. Always displayed, because a warning
   *  only means anything against the region that issued it. */
  feedScope?: string;
}

export interface OfficialAlertFeed {
  status: "REAL" | "UNAVAILABLE";
  configured: boolean;
  source?: string;
  format?: "CAP" | "RSS" | "CAP/GeoJSON";
  scope?: string;
  alerts?: OfficialAlert[];
  note?: string;
  reason?: string;
}

/**
 * Warnings published by the competent authority.
 *
 * The server returns `UNAVAILABLE` with a reason when no official feed is
 * configured, and never substitutes generated or example warnings.
 */
export async function fetchOfficialAlerts(): Promise<OfficialAlertFeed> {
  return api<OfficialAlertFeed>("/api/alerts/official");
}

export async function fetchDataSources(): Promise<{ sources: DataSource[]; summary: { connected: number; total: number } }> {
  return api<{ sources: DataSource[]; summary: { connected: number; total: number } }>("/api/ops/data-sources");
}

export async function fetchAudit(limit = 100): Promise<{ entries: AuditEntry[]; count: number }> {
  return api<{ entries: AuditEntry[]; count: number }>("/api/ops/audit", { query: { limit } });
}

/* ----------------------------- derived ------------------------------ */

export function nextStatus(s: string): string {
  const idx = INCIDENT_STATUSES.indexOf(s as IncidentStatus);
  if (idx < 0 || idx >= INCIDENT_STATUSES.length - 1) return s;
  return INCIDENT_STATUSES[idx + 1];
}

/** 1.0 equals the baseline 95th percentile; never shown without its unit. */
export function describeQuantity(quantity: number, unit: string): string {
  return `${Number.isInteger(quantity) ? quantity : quantity.toFixed(1)} ${unit}`;
}

/* ------------------------------ hooks ------------------------------- */

export type OpsStatus = "idle" | "loading" | "ready" | "unavailable" | "forbidden";

export interface OpsState<T> {
  status: OpsStatus;
  data: T | null;
  error: string | null;
}

function useOpsResource<T>(fetcher: () => Promise<T>, deps: unknown[] = [], enabled = true) {
  const [state, setState] = useState<OpsState<T>>({ status: "idle", data: null, error: null });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      // A permission the session does not hold is not a request to make: asking
      // the server for a resource the caller may not read only produces a 403.
      setState({ status: "idle", data: null, error: null });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, status: s.data ? s.status : "loading" }));
    fetcher()
      .then((data) => {
        if (alive) setState({ status: "ready", data, error: null });
      })
      .catch((e) => {
        if (!alive) return;
        const status = e instanceof Error && /FORBIDDEN|Insufficient/i.test(e.message) ? "forbidden" : "unavailable";
        setState({ status, data: null, error: e instanceof Error ? e.message : "request failed" });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  return { state, reload };
}

/** Whole-console state in one request, refetched after any mutation. */
export function useOpsSnapshot() {
  return useOpsResource<Snapshot>(fetchSnapshot);
}

export function useOpsTable<T>(table: OpsTable, query: Record<string, string> = {}) {
  const key = JSON.stringify(query);
  return useOpsResource<T[]>(() => fetchTable<T>(table, query), [table, key]);
}

/** Incidents the signed-in user may see: own reports for citizens, all for authority. */
export function useMyIncidents() {
  return useOpsResource<{ incidents: Incident[]; scope: string }>(fetchMyIncidents);
}

/**
 * Authority audit trail. `enabled` must be false for sessions without the
 * audit:read permission, so a citizen viewing a page that embeds the panel
 * does not fire a request the server will refuse.
 */
export function useAudit(limit = 100, enabled = true) {
  return useOpsResource<{ entries: AuditEntry[]; count: number }>(() => fetchAudit(limit), [limit], enabled);
}

export function useDataSources() {
  return useOpsResource(fetchDataSources);
}
