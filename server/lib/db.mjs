import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { nowSec, hashSecret } from "./util.mjs";

const DB_PATH =
  process.env.VARUNX_DB_PATH ??
  resolve(process.cwd(), "varun-x-data", "varun-x.sqlite");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

/* ------------------------------------------------------------------ *
 * Roles
 *   citizen           public weather, alerts, reporting, assistant
 *   authority_viewer  read-only operational intelligence
 *   authority_officer full operations: personnel, resources, alerts
 *   authority_admin   officers + account/audit administration
 * Authority permissions are decided here and re-checked in every route.
 * ------------------------------------------------------------------ */
export const ROLES = ["citizen", "authority_viewer", "authority_officer", "authority_admin"];

export const PERMISSIONS = {
  citizen: [
    "weather:read",
    "alerts:read",
    "incidents:create",
    "incidents:read:own",
    "shelters:read",
    "assistant:use",
    "intelligence:read",
  ],
  /**
   * Forecast analyst: the intelligence chain plus a read-only incident report.
   *
   * The response layer (personnel rosters, resource inventory, broadcasts) is
   * deliberately absent. Those are officer surfaces, and the app now hides them
   * for this role, so granting them here would leave the API as a way around
   * that boundary. `ops:read` and `audit:read` stay because the analyst's own
   * overview and incident report are built from them.
   */
  authority_viewer: [
    "weather:read",
    "alerts:read",
    "shelters:read",
    "assistant:use",
    "intelligence:read",
    "incidents:read:all",
    "ops:read",
    "audit:read",
  ],
  authority_officer: [
    "weather:read",
    "alerts:read",
    "shelters:read",
    "assistant:use",
    "intelligence:read",
    "incidents:read:all",
    "incidents:review",
    "personnel:read",
    "personnel:write",
    "resources:read",
    "resources:write",
    "broadcast:read",
    "broadcast:write",
    "alerts:write",
    "ops:read",
    "ops:write",
    "shelter:write",
    "audit:read",
  ],
  authority_admin: [
    "weather:read",
    "alerts:read",
    "shelters:read",
    "assistant:use",
    "intelligence:read",
    "incidents:read:all",
    "incidents:review",
    "personnel:read",
    "personnel:write",
    "resources:read",
    "resources:write",
    "broadcast:read",
    "broadcast:write",
    "alerts:write",
    "ops:read",
    "ops:write",
    "shelter:write",
    "audit:read",
    "audit:read:all",
  ],
};

export function permissionsFor(role) {
  return PERMISSIONS[role] ?? [];
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  role          TEXT NOT NULL,
  email         TEXT UNIQUE,
  phone         TEXT UNIQUE,
  name          TEXT NOT NULL,
  department    TEXT,
  staff_id      TEXT,
  password_hash TEXT,
  password_salt TEXT,
  mfa_enabled   INTEGER NOT NULL DEFAULT 0,
  mfa_secret    TEXT,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  locale        TEXT NOT NULL DEFAULT 'en',
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  ip           TEXT,
  user_agent   TEXT,
  revoked_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS login_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  user_id    TEXT,
  identifier TEXT NOT NULL,
  outcome    TEXT NOT NULL,
  reason     TEXT,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_login_events_ts ON login_events(ts DESC);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel     TEXT NOT NULL,
  destination TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE TABLE IF NOT EXISTS incidents (
  id               TEXT PRIMARY KEY,
  reporter_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  category         TEXT NOT NULL,
  severity         TEXT NOT NULL,
  description      TEXT NOT NULL,
  photo_ref        TEXT,
  lat              REAL,
  lon              REAL,
  location_label   TEXT,
  occurred_at      INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'RECEIVED',
  reviewed_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      INTEGER,
  resolution_note  TEXT,
  is_demo          INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents(reporter_user_id);

CREATE TABLE IF NOT EXISTS personnel (
  id            TEXT PRIMARY KEY,
  staff_id      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL,
  department    TEXT,
  team          TEXT,
  category      TEXT NOT NULL,
  availability  TEXT NOT NULL DEFAULT 'AVAILABLE',
  deployment    TEXT NOT NULL DEFAULT 'UNDEPLOYED',
  assigned_task TEXT,
  location_label TEXT,
  lat           REAL,
  lon           REAL,
  contact_state TEXT NOT NULL DEFAULT 'NOT CONTACTED',
  is_demo       INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  members       TEXT,
  strength      INTEGER NOT NULL DEFAULT 0,
  location_label TEXT,
  lat           REAL,
  lon           REAL,
  assignment    TEXT,
  availability  TEXT NOT NULL DEFAULT 'AVAILABLE',
  equipment     TEXT,
  status        TEXT NOT NULL DEFAULT 'AVAILABLE',
  is_demo       INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS resources (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  quantity     REAL NOT NULL,
  unit         TEXT NOT NULL,
  source       TEXT,
  origin       TEXT,
  destination  TEXT,
  responsible  TEXT,
  status       TEXT NOT NULL DEFAULT 'RECEIVED',
  verification TEXT NOT NULL DEFAULT 'UNVERIFIED',
  is_demo      INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  history      TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);

CREATE TABLE IF NOT EXISTS shelters (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  capacity    INTEGER NOT NULL,
  occupied    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'STANDBY',
  lat         REAL,
  lon         REAL,
  address     TEXT,
  contact     TEXT,
  source      TEXT NOT NULL,
  verified    INTEGER NOT NULL DEFAULT 0,
  is_demo     INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  region      TEXT NOT NULL,
  hazard      TEXT,
  severity    TEXT NOT NULL,
  language    TEXT NOT NULL DEFAULT 'English',
  text        TEXT NOT NULL,
  channels    TEXT NOT NULL DEFAULT 'DASHBOARD',
  status      TEXT NOT NULL DEFAULT 'DRAFT',
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL,
  publish_at  INTEGER,
  published_at INTEGER,
  expires_at  INTEGER,
  recipient_estimate INTEGER,
  delivery_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);

CREATE TABLE IF NOT EXISTS alerts (
  id            TEXT PRIMARY KEY,
  hazard        TEXT NOT NULL,
  area          TEXT NOT NULL,
  severity      TEXT NOT NULL,
  window_start  INTEGER NOT NULL,
  window_end    INTEGER NOT NULL,
  confidence    REAL,
  uncertainty   TEXT,
  action        TEXT NOT NULL,
  source        TEXT NOT NULL,
  lat           REAL,
  lon           REAL,
  origin        TEXT NOT NULL DEFAULT 'VARUN-X MODEL OUTPUT',
  verification  TEXT NOT NULL DEFAULT 'UNVERIFIED',
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  user_id    TEXT,
  user_label TEXT NOT NULL,
  role       TEXT,
  action     TEXT NOT NULL,
  scope      TEXT NOT NULL,
  result     TEXT NOT NULL,
  detail     TEXT,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);

CREATE TABLE IF NOT EXISTS data_sources (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  provider    TEXT NOT NULL,
  resolution  TEXT,
  cadence     TEXT,
  licence     TEXT,
  connected   INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  last_check  INTEGER,
  notes       TEXT
);
`);

/* Lightweight additive migration for prototype databases created earlier. */
function addColumnIfMissing(table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
addColumnIfMissing("audit_log", "detail", "TEXT");
addColumnIfMissing("alerts", "source", "TEXT");
addColumnIfMissing("incidents", "source", "TEXT");

/* Append-only audit trail: USER -> ACTION -> TIMESTAMP -> SCOPE -> RESULT */
const insertAudit = db.prepare(
  `INSERT INTO audit_log (ts, user_id, user_label, role, action, scope, result, detail, ip)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

export function writeAudit({ user, action, scope, result, detail, ip }) {
  insertAudit.run(
    nowSec(),
    user?.id ?? null,
    user?.label ?? "system",
    user?.role ?? null,
    action,
    scope,
    result,
    detail ?? null,
    ip ?? null,
  );
}

const DEMO_CITIZEN = {
  id: "USR-DEMO-CITIZEN-0001",
  role: "citizen",
  email: "citizen@varunx.demo",
  phone: "+910000000001",
  name: "Demo Citizen",
  password: "Citizen@2026",
};

const DEMO_OFFICER = {
  id: "USR-DEMO-OFFICER-001",
  role: "authority_officer",
  email: "officer@varunx.demo",
  phone: "+910000000010",
  name: "Demo Response Officer",
  department: "VARUN-X Operations (prototype)",
  staffId: "VX-OPS-0001",
  password: "Officer@2026",
  mfa: "123456",
};

const DEMO_VIEWER = {
  id: "USR-DEMO-VIEWER-0001",
  role: "authority_viewer",
  email: "analyst@varunx.demo",
  name: "Demo Forecast Analyst",
  department: "VARUN-X Operations (prototype)",
  staffId: "VX-ANA-0001",
  password: "Analyst@2026",
  mfa: "123456",
};

const insertUser = db.prepare(
  `INSERT OR IGNORE INTO users
     (id, role, email, phone, name, department, staff_id, password_hash, password_salt,
      mfa_enabled, mfa_secret, is_demo, status, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?)`,
);

const ts = nowSec();
for (const seed of [DEMO_CITIZEN, DEMO_OFFICER, DEMO_VIEWER]) {
  const { salt, hash } = hashSecret(seed.password);
  const mfa = seed.mfa ? hashSecret(seed.mfa) : null;
  insertUser.run(
    seed.id,
    seed.role,
    seed.email ?? null,
    seed.phone ?? null,
    seed.name,
    seed.department ?? null,
    seed.staffId ?? null,
    hash,
    salt,
    mfa ? 1 : 0,
    mfa ? `${mfa.salt}:${mfa.hash}` : null,
    ts,
  );
}

const insertSource = db.prepare(
  `INSERT OR IGNORE INTO data_sources
     (id, name, kind, provider, resolution, cadence, licence, connected, status, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const SOURCES = [
  [
    "open-meteo-forecast",
    "Open-Meteo NWP forecast",
    "FORECAST",
    "Open-Meteo (ECMWF / national model mix)",
    "~11 km model grid",
    "hourly",
    "CC BY 4.0 (non-commercial terms apply)",
    1,
    "CONNECTED",
    "Live model output proxied server-side. Not an observation.",
  ],
  [
    "open-meteo-geocoding",
    "Open-Meteo geocoding",
    "GEOCODING",
    "Open-Meteo / GeoNames",
    "point",
    "on demand",
    "CC BY 4.0",
    1,
    "CONNECTED",
    "Forward and reverse place lookup.",
  ],
  [
    "nominatim-reverse",
    "Nominatim reverse geocoding",
    "GEOCODING",
    "OpenStreetMap Nominatim",
    "point",
    "on demand",
    "ODbL",
    1,
    "CONNECTED",
    "Fallback for locality name resolution.",
  ],
  [
    "era5-climatology",
    "ERA5 reanalysis climatology",
    "HISTORICAL",
    "ECMWF / CDS",
    "~31 km",
    "hourly archive",
    "Copernicus licence",
    0,
    "UNAVAILABLE",
    "Not connected. Climatology stage runs in SIMULATION and is labelled as such.",
  ],
  [
    "imdaa-climatology",
    "IMDAA gridded observations climatology",
    "HISTORICAL",
    "India Meteorological Department",
    "~0.1 deg",
    "daily archive",
    "IMD terms",
    0,
    "UNAVAILABLE",
    "Not connected. Climatology stage runs in SIMULATION and is labelled as such.",
  ],
  [
    "nwp-ensemble",
    "NWP ensemble members (NCUM / NEPS-G)",
    "FORECAST",
    "IMD / NCUM",
    "~9 km",
    "6 hourly cycles",
    "IMD terms",
    0,
    "UNAVAILABLE",
    "No real ensemble feed connected. EFI is computed from a SIMULATED ensemble.",
  ],
  [
    "gnn-tracking",
    "VARUN-X GNN extreme-object tracker",
    "MODEL OUTPUT",
    "VARUN-X research implementation",
    "native model grid",
    "per forecast cycle",
    "internal research",
    1,
    "SIMULATION",
    "Graph message passing over the model grid. Operates on real forecast input; parameterisation is a prototype surrogate.",
  ],
  [
    "diffusion-downscale",
    "VARUN-X conditional diffusion refiner",
    "MODEL OUTPUT",
    "VARUN-X research implementation",
    "~12 km in -> ~5 km out",
    "on demand, target region only",
    "internal research",
    1,
    "SIMULATION",
    "Physics-constrained stochastic refinement. Probabilistic output, not a deterministic forecast.",
  ],
  [
    "official-alerts",
    "Official weather alert authority feed",
    "OFFICIAL",
    "IMD / state SDMA (not connected)",
    "admin region",
    "event driven",
    "varies",
    0,
    "UNAVAILABLE",
    "No official alert feed configured. VARUN-X never manufactures official alerts.",
  ],
  [
    "sms-gateway",
    "SMS delivery gateway",
    "TELEMETRY",
    "not configured",
    "n/a",
    "n/a",
    "n/a",
    0,
    "UNAVAILABLE",
    "No SMS provider connected. Broadcast delivery counts are not reported as real.",
  ],
];

for (const row of SOURCES) insertSource.run(...row);

const insertShelter = db.prepare(
  `INSERT OR IGNORE INTO shelters
     (id, name, type, capacity, occupied, status, lat, lon, address, contact, source, verified, is_demo, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
);

const shelters = [
  ["SHL-DEMO-01", "Prototype Shelter A", "Community shelter", 500, 342, "OPERATIONAL", 27.176, 78.008, "Prototype record", null, "SIMULATED", 0],
  ["SHL-DEMO-02", "Prototype Shelter B", "Community shelter", 300, 118, "OPERATIONAL", 27.35, 77.72, "Prototype record", null, "SIMULATED", 0],
  ["SHL-DEMO-03", "Prototype Relief Camp C", "Relief camp", 250, 0, "STANDBY", 26.98, 78.19, "Prototype record", null, "SIMULATED", 0],
];
for (const s of shelters) insertShelter.run(...s, ts);

const insertPersonnel = db.prepare(
  `INSERT OR IGNORE INTO personnel
     (id, staff_id, name, role, department, team, category, availability, deployment,
      assigned_task, location_label, lat, lon, contact_state, is_demo, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
);

const personnel = [
  ["PPL-DEMO-01", "VX-MED-001", "Demo Medic 01", "Medical Officer", "Medical", "Alpha", "Medical", "ON DUTY", "STANDBY", "Sector medical standby", "Prototype base", 27.18, 78.01, "NOT CONTACTED"],
  ["PPL-DEMO-02", "VX-SAR-001", "Demo Rescuer 01", "Search and Rescue", "Rescue", "Bravo", "Search & Rescue", "ON DUTY", "DEPLOYED", "Road access survey", "Sector east", 27.3, 78.1, "CONTACTED"],
  ["PPL-DEMO-03", "VX-FIR-001", "Demo Firefighter 01", "Fire Officer", "Fire", "Charlie", "Fire", "ON DUTY", "STANDBY", null, "Prototype base", 27.1, 77.95, "NOT CONTACTED"],
  ["PPL-DEMO-04", "VX-POL-001", "Demo Police 01", "Law and Order", "Police", "Delta", "Police", "ON DUTY", "DEPLOYED", "Access control point", "Sector north", 27.25, 78.0, "CONTACTED"],
  ["PPL-DEMO-05", "VX-LOG-001", "Demo Logistics 01", "Logistics Officer", "Logistics", "Echo", "Logistics", "ON DUTY", "STANDBY", null, "Prototype base", 27.15, 78.05, "NOT CONTACTED"],
  ["PPL-DEMO-06", "VX-COM-001", "Demo Communications 01", "Communications Tech", "Communications", "Foxtrot", "Communications", "ON DUTY", "STANDBY", null, "Prototype base", 27.2, 77.98, "NOT CONTACTED"],
];
for (const p of personnel) insertPersonnel.run(...p, ts);

const insertTeam = db.prepare(
  `INSERT OR IGNORE INTO teams
     (id, name, type, members, strength, location_label, lat, lon, assignment,
      availability, equipment, status, is_demo, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
);

const teams = [
  ["TEAM-DEMO-ALPHA", "Team Alpha", "Medical", "Medic 01", 6, "Prototype base", 27.18, 78.01, "Medical standby", "ON DUTY", "Medical kit, oxygen", "AVAILABLE"],
  ["TEAM-DEMO-BRAVO", "Team Bravo", "Search & Rescue", "Rescuer 01", 8, "Sector east", 27.3, 78.1, "Road access survey", "ON DUTY", "Rope kit, inflatable", "DEPLOYED"],
  ["TEAM-DEMO-CHARLIE", "Team Charlie", "Fire", "Firefighter 01", 10, "Prototype base", 27.1, 77.95, null, "ON DUTY", "Pump, hoses", "AVAILABLE"],
];
for (const t of teams) insertTeam.run(...t, ts);

const insertResource = db.prepare(
  `INSERT OR IGNORE INTO resources
     (id, kind, quantity, unit, source, origin, destination, responsible, status,
      verification, is_demo, updated_at, history)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
);

const resources = [
  ["RES-DEMO-01", "Water", 12000, "litres", "SIMULATED", "Prototype depot", "Sector east", "Demo Logistics Officer", "ALLOCATED", "UNVERIFIED"],
  ["RES-DEMO-02", "Food", 4000, "rations", "SIMULATED", "Prototype depot", "Shelter A", "Demo Logistics Officer", "RECEIVED", "UNVERIFIED"],
  ["RES-DEMO-03", "Medical supplies", 220, "kits", "SIMULATED", "Prototype depot", null, "Demo Medic 01", "RECEIVED", "UNVERIFIED"],
  ["RES-DEMO-04", "Blankets", 1800, "units", "SIMULATED", "Prototype depot", null, "Demo Logistics Officer", "RECEIVED", "UNVERIFIED"],
  ["RES-DEMO-05", "Boats", 6, "units", "SIMULATED", "Prototype staging", "Flood sector", "Demo Rescue Lead", "DISPATCHED", "UNVERIFIED"],
  ["RES-DEMO-06", "Vehicles", 9, "units", "SIMULATED", "Prototype staging", null, "Demo Logistics Officer", "ALLOCATED", "UNVERIFIED"],
];
for (const r of resources) insertResource.run(...r, ts, "[]");

export const DEMO_ACCOUNTS = [DEMO_CITIZEN, DEMO_OFFICER, DEMO_VIEWER];
export { DB_PATH };
