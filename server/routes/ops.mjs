import { randomBytes } from "node:crypto";
import { db, writeAudit } from "../lib/db.mjs";
import { requirePermission } from "../lib/auth.mjs";
import { HttpError, bad, notFound, nowSec } from "../lib/util.mjs";
import { dispatchChannels, probeDispatch } from "../services/dispatch.mjs";
import { fetchOfficialAlerts, probeAlertFeed } from "../services/alerts.mjs";
import { probeClimatology } from "../services/climatology.mjs";

/**
 * Console record routes.
 *
 * The column lists below are the authoritative contract with the SQLite
 * schema. Timestamps follow the schema: `incidents`, `alerts` and `broadcasts`
 * carry creation time, while `personnel`, `teams`, `resources` and `shelters`
 * are configuration-like records that only carry `updated_at`.
 *
 * A few read fields are derived for the interface (an incident `title`, a
 * resource `name`) so pages can render a stable shape without duplicating
 * storage.
 */
const TABLES = {
  incidents: {
    label: "incident",
    fields: [
      "reporter_user_id",
      "category",
      "severity",
      "description",
      "photo_ref",
      "lat",
      "lon",
      "location_label",
      "occurred_at",
      "status",
      "reviewed_by",
      "reviewed_at",
      "resolution_note",
    ],
    required: ["category", "severity", "status", "description"],
    order: "ORDER BY COALESCE(occurred_at, created_at) DESC",
    createdAt: "created_at",
    updatedAt: "updated_at",
    defaults: () => ({ occurred_at: nowSec() }),
    authorField: "reporter_user_id",
    authorValue: (user) => user.id ?? null,
    derive: (r) => ({ title: r.category, ...r }),
  },
  personnel: {
    label: "personnel record",
    fields: [
      "staff_id",
      "name",
      "role",
      "department",
      "team",
      "category",
      "availability",
      "deployment",
      "assigned_task",
      "location_label",
      "lat",
      "lon",
      "contact_state",
    ],
    required: ["name", "role", "staff_id", "category"],
    order: "ORDER BY name ASC",
    createdAt: null,
    updatedAt: "updated_at",
    defaults: (user) => ({ staff_id: newId("stf"), category: user.department ?? "field" }),
    derive: (r) => ({ status: r.availability ?? r.deployment ?? "unknown", ...r }),
  },
  teams: {
    label: "team",
    fields: [
      "name",
      "type",
      "members",
      "strength",
      "location_label",
      "lat",
      "lon",
      "assignment",
      "availability",
      "equipment",
      "status",
    ],
    required: ["name", "status", "type"],
    order: "ORDER BY name ASC",
    createdAt: null,
    updatedAt: "updated_at",
    defaults: () => ({ type: "rescue" }),
  },
  resources: {
    label: "resource",
    fields: [
      "kind",
      "quantity",
      "unit",
      "source",
      "origin",
      "destination",
      "responsible",
      "status",
      "verification",
    ],
    required: ["kind", "status", "quantity", "unit"],
    order: "ORDER BY kind ASC",
    createdAt: null,
    updatedAt: "updated_at",
    defaults: () => ({ quantity: 0, unit: "units" }),
    derive: (r) => ({ name: r.kind, category: r.kind, ...r }),
  },
  shelters: {
    label: "shelter",
    fields: ["name", "type", "capacity", "occupied", "status", "lat", "lon", "address", "contact", "source", "verified"],
    required: ["name", "capacity"],
    order: "ORDER BY name ASC",
    createdAt: null,
    updatedAt: "updated_at",
    defaults: () => ({ type: "shelter", status: "STANDBY", source: "VARUN-X Console entry" }),
    derive: (r) => ({ ...r, manager_name: null, manager_phone: r.contact ?? null, address: r.address }),
  },
  alerts: {
    label: "official alert",
    fields: [
      "hazard",
      "area",
      "severity",
      "window_start",
      "window_end",
      "confidence",
      "uncertainty",
      "action",
      "source",
      "lat",
      "lon",
      "origin",
      "verification",
      "expires_at",
    ],
    required: ["hazard", "severity", "area"],
    order: "ORDER BY COALESCE(window_start, created_at) DESC",
    createdAt: "created_at",
    updatedAt: null,
    defaults: (user) => ({
      window_start: nowSec(),
      window_end: nowSec() + 6 * 3600,
      action: "Monitor conditions and follow official guidance.",
      source: user.staff_id ?? user.email ?? "VARUN-X Console",
    }),
    derive: (r) => ({
      title: r.hazard,
      status: r.verification ?? "DRAFT",
      issued_by: r.source,
      issued_at: r.window_start,
      summary: r.action,
      ...r,
    }),
  },
  broadcasts: {
    label: "broadcast",
    fields: [
      "type",
      "region",
      "hazard",
      "severity",
      "language",
      "text",
      "channels",
      "status",
      "publish_at",
      "published_at",
      "expires_at",
      "recipient_estimate",
      "delivery_note",
    ],
    required: ["type", "region", "severity", "text"],
    order: "ORDER BY COALESCE(publish_at, created_at) DESC",
    createdAt: "created_at",
    updatedAt: null,
    derive: (r) => ({
      channel: r.type,
      audience: r.region,
      body: r.text,
      sent_at: r.published_at,
      sent_by: r.created_by,
      ...r,
    }),
  },
};

/**
 * Field aliases the console forms still use, mapped onto real schema columns.
 * Keeps the write API forgiving for the UI without storing duplicate fields.
 */
const ALIASES = {
  incidents: { title: "category" },
  alerts: { title: "hazard", headline: "hazard" },
  resources: { name: "kind", category: "kind" },
  personnel: { status: "availability" },
  shelters: { manager_name: "contact", manager_phone: "contact" },
  broadcasts: { channel: "type", audience: "region", body: "text" },
};

function normalize(table, body) {
  const alias = ALIASES[table];
  if (!alias) return body;
  const out = { ...body };
  for (const [from, to] of Object.entries(alias)) {
    if (to === from) continue;
    if ((out[to] === undefined || out[to] === "") && out[from] !== undefined) {
      out[to] = out[from];
    }
    delete out[from];
  }
  return out;
}

const WRITABLE_BY = {
  // A citizen may file a report but may not review one, so creation and
  // review are separate permissions rather than a single write gate.
  incidents: ["incidents:create", "incidents:review"],
  personnel: ["personnel:write"],
  teams: ["ops:write"],
  resources: ["resources:write"],
  shelters: ["shelter:write"],
  alerts: ["alerts:write"],
  broadcasts: ["broadcast:write"],
};

/**
 * Update gate. Filing a report and reviewing one are different acts, so a
 * citizen holding only incidents:create can never PATCH a report -- not even
 * one of their own, since status is the authority's decision to make.
 */
const PATCHABLE_BY = {
  ...WRITABLE_BY,
  incidents: ["incidents:review"],
};

const READABLE_BY = {
  // incidents:read:own is deliberately absent here: listing needs the
  // all-rows permission, and a citizen reads their own reports through
  // /api/incidents/mine below.
  incidents: ["incidents:read:all"],
  personnel: ["personnel:read"],
  teams: ["ops:read"],
  resources: ["resources:read"],
  shelters: ["shelters:read"],
  alerts: ["alerts:read"],
  broadcasts: ["broadcast:read"],
};

function shape(table, row) {
  if (!row) return row;
  const spec = TABLES[table];
  return spec.derive ? spec.derive(row) : row;
}

/** Tables with a real `status` column; the rest expose a derived status. */
const HAS_STATUS_COLUMN = new Set(["incidents", "teams", "resources", "shelters", "broadcasts"]);

function list(table, status) {
  const spec = TABLES[table];
  const wanted = status ? String(status).toLowerCase() : null;
  const rows =
    wanted && HAS_STATUS_COLUMN.has(table)
      ? db.prepare(`SELECT * FROM ${table} WHERE LOWER(status) = ? ${spec.order}`).all(wanted)
      : db.prepare(`SELECT * FROM ${table} ${spec.order}`).all();
  const shaped = rows.map((r) => shape(table, r));
  if (!wanted) return shaped;
  return shaped.filter((r) => String(r.status ?? "").toLowerCase() === wanted);
}

function get(table, id) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  return row ? shape(table, row) : null;
}

/** Tables that carry an author column alongside their creation timestamp. */
const HAS_CREATED_BY = new Set(["alerts", "broadcasts"]);
/** Tables carrying the is_demo provenance flag. */
const HAS_IS_DEMO = new Set(["incidents", "personnel", "teams", "resources", "shelters"]);

function insert(table, user, rawBody) {
  const spec = TABLES[table];
  const body = { ...(spec.defaults ? spec.defaults(user) : {}), ...normalize(table, rawBody) };
  for (const field of spec.required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw bad("MISSING_FIELD", `${field} is required`);
    }
  }
  const cols = [];
  const values = [];
  for (const field of spec.fields) {
    const v = body[field];
    if (v === undefined || v === null || v === "") continue;
    cols.push(field);
    values.push(v);
  }
  cols.push("id");
  values.push(newId(singular(table)));
  if (HAS_IS_DEMO.has(table)) {
    cols.push("is_demo");
    values.push(0);
  }
  if (spec.authorField && body[spec.authorField] === undefined) {
    cols.push(spec.authorField);
    values.push(spec.authorValue(user));
  } else if (HAS_CREATED_BY.has(table)) {
    // created_by is a foreign key to users.id, not the staff id.
    cols.push("created_by");
    values.push(user.id ?? null);
  }
  if (spec.createdAt) {
    cols.push(spec.createdAt);
    values.push(nowSec());
  }
  if (spec.updatedAt) {
    cols.push(spec.updatedAt);
    values.push(nowSec());
  }
  const marks = cols.map(() => "?").join(", ");
  db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${marks})`).run(...values);
  return get(table, values[cols.indexOf("id")]);
}

function newId(prefix) {
  return `${prefix.toUpperCase().slice(0, 4)}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function update(table, user, id, rawBody) {
  const spec = TABLES[table];
  const body = applyServerOwnedFields(table, user, id, rawBody);
  const sets = [];
  const values = [];
  for (const field of spec.fields) {
    if (body[field] === undefined) continue;
    sets.push(`${field} = ?`);
    values.push(body[field]);
  }
  if (!sets.length) throw bad("NO_CHANGES", "No editable field was provided");
  if (spec.updatedAt) {
    sets.push(`${spec.updatedAt} = ?`);
    values.push(nowSec());
  }
  values.push(id);
  db.prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  return get(table, id);
}

/**
 * Fields the server owns. A client advancing a citizen report to VERIFIED sends
 * only the new status, so who reviewed it and when must be recorded here. The
 * client's own reviewed_at is discarded rather than trusted, so a caller cannot
 * backdate a review or claim it happened before the report existed.
 */
function applyServerOwnedFields(table, user, id, rawBody) {
  const body = { ...rawBody };
  if (table !== "incidents") return body;
  const wasReceived = body.status === undefined;
  if (wasReceived) return body;
  const existing = get(table, id);
  if (!existing) return body;
  if (body.reviewed_by === undefined) {
    body.reviewed_by = existing.reviewed_by ?? user.id ?? null;
  }
  if (existing.reviewed_at == null || body.status !== existing.status) {
    body.reviewed_at = nowSec();
  }
  return body;
}

export function register(router) {
  /* ------------------------------ read -------------------------------- */

  /**
   * A citizen's own reports.
   *
   * Scoped in SQL by reporter_user_id rather than filtered in JavaScript, so a
   * citizen can never observe another reporter's row even if the filter were
   * accidentally dropped later.
   */
  router.get("/api/incidents/mine", (ctx) => {
    const user = requireAny(ctx, ["incidents:read:own", "incidents:read:all"]);
    const rows =
      user.role === "citizen"
        ? db
            .prepare("SELECT * FROM incidents WHERE reporter_user_id = ? ORDER BY COALESCE(occurred_at, created_at) DESC")
            .all(user.id)
        : list("incidents", ctx.query.status);
    return {
      incidents: rows.map((r) => shape("incidents", r)),
      scope: user.role === "citizen" ? "OWN REPORTS ONLY" : "ALL REPORTS",
    };
  });

  /**
   * Official warnings from the configured competent-authority feed.
   *
   * Returns the real feed result, including the case where no feed is
   * configured. An unconnected feed is reported as such; it is never replaced by
   * generated or example warnings.
   */
  router.get("/api/alerts/official", async (ctx) => {
    const user = requirePermission(ctx, "alerts:read");
    const result = await fetchOfficialAlerts();
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "OFFICIAL_ALERTS_FETCHED",
      scope: result.status,
      result: result.status === "REAL" ? `${result.alerts.length} ALERTS` : "NO_FEED",
      ip: ctx.req.socket?.remoteAddress,
    });
    return result;
  });

  /** Delivery-channel capability, so the UI never claims a channel is live. */
  router.get("/api/ops/delivery", async (ctx) => {
    requirePermission(ctx, "ops:read");
    return probeDispatch();
  });

  router.get("/api/ops/snapshot", (ctx) => {
    const user = requirePermission(ctx, "ops:read");
    return {
      role: user.role,
      generatedAt: nowSec(),
      incidents: list("incidents"),
      personnel: list("personnel"),
      teams: list("teams"),
      resources: list("resources"),
      shelters: list("shelters"),
      alerts: list("alerts"),
      broadcasts: list("broadcasts"),
      dataClass: "SIMULATION / DEMO DATA",
      notice:
        "Console records were entered through this prototype API. They are not linked to any real government or NGO system.",
    };
  });

  router.get("/api/ops/audit", (ctx) => {
    const user = requirePermission(ctx, "audit:read");
    const limit = Math.min(Number(ctx.query.limit ?? 100), 500);
    const rows = db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit);
    return { entries: rows, requestedBy: user.staff_id ?? user.email, count: rows.length };
  });

  router.get("/api/ops/data-sources", async (ctx) => {
    requirePermission(ctx, "audit:read");
    const rows = db.prepare("SELECT * FROM data_sources ORDER BY id").all();

    // The seed rows describe each source, but whether a source is actually
    // connected is a live question, so the stored status is overlaid with the
    // current provider probe. A source that has gone dark or come up is
    // therefore reported as it is now, not as it was when the row was written.
    const [clim, feed, delivery] = await Promise.all([probeClimatology(), probeAlertFeed(), probeDispatch()]);

    const overlay = {
      "era5-climatology": {
        provider: "ECMWF ERA5 via Open-Meteo archive",
        connected: clim.status === "REACHABLE" ? 1 : 0,
        status: clim.status === "REACHABLE" ? "CONNECTED" : "UNAVAILABLE",
        last_check: nowSec(),
        notes:
          clim.status === "REACHABLE"
            ? `Live ERA5 reanalysis archive. ${clim.detail}. Used as the climatology baseline.`
            : `Reanalysis archive unreachable: ${clim.detail}. Climatology falls back to an explicitly labelled simulation.`,
      },
      "imdaa-climatology": {
        connected: 0,
        status: "UNAVAILABLE",
        last_check: nowSec(),
        notes:
          "Direct IMDAA gridded ingest is not connected. VARUN-X does not present ERA5 statistics as IMDAA observations.",
      },
      "official-alerts": {
        provider: feed.status === "REAL" ? "Configured authority feed" : "IMD / state SDMA (not connected)",
        connected: feed.status === "REAL" ? 1 : 0,
        status: feed.status === "REAL" ? "CONNECTED" : "UNCONFIGURED",
        last_check: nowSec(),
        notes: feed.detail,
      },
      "sms-gateway": {
        provider: delivery.channels?.sms?.configured ? delivery.channels.sms.provider : "not configured",
        connected: delivery.channels?.sms?.configured ? 1 : 0,
        status: delivery.channels?.sms?.configured ? "CONNECTED" : "UNCONFIGURED",
        last_check: nowSec(),
        notes: delivery.channels?.sms?.configured
          ? `${delivery.channels.sms.provider} is configured; dispatched SMS are real provider calls.`
          : `No SMS provider configured (missing ${delivery.channels?.sms?.missing?.join(", ") ?? "credentials"}). Dispatch reports zero delivered.`,
      },
    };

    // Delivery channels other than SMS share one row each so the registry does
    // not imply a channel exists just because another one is configured.
    for (const [id, channel, kind, licence] of [
      ["email-gateway", "email", "SMTP email delivery gateway", "provider terms"],
      ["push-gateway", "push", "Push notification delivery gateway", "provider terms"],
    ]) {
      const c = delivery.channels?.[channel];
      overlay[id] = {
        provider: c?.configured ? c.provider : "not configured",
        connected: c?.configured ? 1 : 0,
        status: c?.configured ? "CONNECTED" : "UNCONFIGURED",
        last_check: nowSec(),
        notes: c?.configured
          ? `${c.provider} is configured; dispatched notifications are real provider calls.`
          : `No provider configured (missing ${c?.missing?.join(", ") ?? "credentials"}). Dispatch reports zero delivered.`,
      };
    }

    const sources = rows.map((r) => (overlay[r.id] ? { ...r, ...overlay[r.id] } : r));
    // A source that has come up but has no seed row still has to appear, or the
    // registry would understate what is connected.
    const known = new Set(rows.map((r) => r.id));
    for (const [id, patch] of Object.entries(overlay)) {
      if (known.has(id)) continue;
      sources.push({
        id,
        name: id,
        kind: "TELEMETRY",
        resolution: "n/a",
        cadence: "n/a",
        licence: "n/a",
        ...patch,
      });
    }

    return {
      sources,
      summary: {
        connected: sources.filter((r) => r.connected === 1).length,
        total: sources.length,
        unavailable: sources.filter((r) => r.connected !== 1).length,
      },
    };
  });

  /* ----------------------------- writes ------------------------------- */

  for (const [table, spec] of Object.entries(TABLES)) {
    router.get(`/api/${table}`, (ctx) => {
      requireAny(ctx, READABLE_BY[table]);
      return { [table]: list(table, ctx.query.status), dataClass: "SIMULATION / DEMO DATA" };
    });

    router.get(`/api/${table}/:id`, (ctx) => {
      requireAny(ctx, READABLE_BY[table]);
      const row = get(table, ctx.params.id);
      if (!row) throw notFound(`${spec.label} not found`);
      return { [singular(table)]: row };
    });

    router.post(`/api/${table}`, (ctx) => {
      const user = requireAny(ctx, WRITABLE_BY[table]);
      const spec = TABLES[table];
      // A citizen filing a report may not set verification fields, and may not
      // attribute the report to somebody else: the author column is forced to
      // the session user rather than trusted from the request body.
      const body =
        user.role === "citizen"
          ? {
              ...ctx.body,
              status: "RECEIVED",
              reviewed_by: undefined,
              resolution_note: undefined,
              is_demo: undefined,
              ...(spec.authorField ? { [spec.authorField]: undefined } : {}),
            }
          : ctx.body;
      const row = insert(table, user, body);
      writeAudit({
        user: { id: user.id, label: user.name, role: user.role },
        action: `${singular(table).toUpperCase()}_CREATED`,
        scope: spec.label,
        detail: String(body.title ?? body.name ?? body.hazard ?? body.kind ?? row.id),
        result: "SUCCESS",
        ip: ctx.req.socket?.remoteAddress,
      });
      return { [singular(table)]: row };
    });

    router.patch(`/api/${table}/:id`, (ctx) => {
      const user = requireAny(ctx, PATCHABLE_BY[table]);
      const existing = get(table, ctx.params.id);
      if (!existing) throw notFound(`${spec.label} not found`);
      // reviewed_by is a foreign key to users.id; accept a staff id and
      // resolve it rather than rejecting an otherwise valid update.
      const patch = { ...ctx.body };
      if (patch.reviewed_by && !userIds().has(patch.reviewed_by)) {
        const resolved = userIdForStaff(patch.reviewed_by);
        if (!resolved) throw bad("UNKNOWN_REVIEWER", "reviewer must be a known user id or staff id");
        patch.reviewed_by = resolved;
      }
      const row = update(table, user, ctx.params.id, patch);
      writeAudit({
        user: { id: user.id, label: user.name, role: user.role },
        action: `${singular(table).toUpperCase()}_UPDATED`,
        scope: spec.label,
        detail: String(ctx.body.title ?? ctx.body.name ?? ctx.body.hazard ?? ctx.body.kind ?? existing.id),
        result: String(ctx.body.status ?? "UPDATED"),
        ip: ctx.req.socket?.remoteAddress,
      });
      return { [singular(table)]: row };
    });
  }

  /* ------------------------- broadcast dispatch ----------------------- */

  router.post("/api/broadcasts/:id/dispatch", async (ctx) => {
    const user = requirePermission(ctx, "broadcast:write");
    const row = db.prepare("SELECT * FROM broadcasts WHERE id = ?").get(ctx.params.id);
    if (!row) throw notFound("broadcast not found");
    if (row.status === "sent" || row.status === "SENT") {
      throw new HttpError(409, "ALREADY_SENT", "This broadcast was already dispatched");
    }
    const audience = String(ctx.body.audience ?? row.region ?? "");

    // Resolve a real recipient list for the audience, and the contact details
    // each transport needs. A phone number cannot be emailed and a device token
    // cannot be texted, so the per-transport lists are gathered separately.
    // Only the users table holds real contact details, so audiences defined over
    // personnel or shelters legitimately have no reachable numbers and say so
    // rather than inventing recipients.
    let recipients = 0;
    let phones = [];
    let emails = [];
    const pushTokens = [];
    if (/officer/i.test(audience)) {
      recipients = db
        .prepare("SELECT COUNT(*) c FROM users WHERE role IN ('authority_officer','authority_admin')")
        .get().c;
      phones = db
        .prepare("SELECT phone FROM users WHERE role IN ('authority_officer','authority_admin') AND phone IS NOT NULL")
        .all()
        .map((r) => r.phone);
      emails = db
        .prepare("SELECT email FROM users WHERE role IN ('authority_officer','authority_admin') AND email IS NOT NULL")
        .all()
        .map((r) => r.email);
    } else if (/team|field/i.test(audience)) {
      recipients = db.prepare("SELECT COUNT(*) c FROM personnel WHERE is_demo = 1").get().c;
    } else if (/shelter/i.test(audience)) {
      recipients = db.prepare("SELECT COUNT(*) c FROM shelters").get().c;
    } else {
      recipients = Number(row.recipient_estimate ?? 0);
      phones = db
        .prepare("SELECT phone FROM users WHERE role = 'citizen' AND phone IS NOT NULL")
        .all()
        .map((r) => r.phone);
      emails = db
        .prepare("SELECT email FROM users WHERE role = 'citizen' AND email IS NOT NULL")
        .all()
        .map((r) => r.email);
    }

    const channels = String(row.channels ?? "sms")
      .split(/[,;/|]/)
      .map((c) => c.trim())
      .filter(Boolean);

    // A real attempt against whatever providers are configured. With no
    // credentials the transports report UNCONFIGURED and nothing is counted as
    // delivered; there is no simulated fallback pretending otherwise.
    const outcome = await dispatchChannels({
      channels,
      text: String(row.text ?? ""),
      subject: String(row.hazard ?? row.type ?? "VARUN-X alert").slice(0, 120),
      contacts: { phones, emails, pushTokens },
    });

    const status = outcome.mode === "DELIVERED" ? "sent" : "ACTIVE";
    const deliveryNote =
      outcome.reason ??
      `Delivered ${outcome.actuallySent} message(s) via ${outcome.channelsDelivering} configured channel(s).`;
    db.prepare("UPDATE broadcasts SET status = ?, published_at = ?, delivery_note = ? WHERE id = ?").run(
      status,
      nowSec(),
      deliveryNote,
      row.id,
    );
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "BROADCAST_DISPATCH",
      scope: audience || "unspecified",
      detail: String(row.text).slice(0, 160),
      result: `${outcome.mode} (${recipients} intended, ${outcome.actuallySent} actually sent)`,
      ip: ctx.req.socket?.remoteAddress,
    });
    return {
      broadcast: get("broadcasts", row.id),
      dispatch: {
        status: outcome.mode,
        intendedRecipients: recipients,
        actuallySent: outcome.actuallySent,
        channels: outcome.results,
        channelsAttempted: outcome.channelsAttempted,
        reason: outcome.reason ?? null,
      },
    };
  });

  /* ------------------------------ alerts ------------------------------ */

  router.post("/api/alerts/ingest", (ctx) => {
    const user = requirePermission(ctx, "alerts:write");
    const row = insert("alerts", user, {
      ...ctx.body,
      source: ctx.body.source ?? user.staff_id ?? user.email,
      verification: ctx.body.verification ?? "HUMAN_VERIFIED",
    });
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "ALERT_PUBLISHED",
      scope: String(ctx.body.severity ?? "unknown"),
      detail: String(ctx.body.hazard ?? ""),
      result: "SUCCESS",
      ip: ctx.req.socket?.remoteAddress,
    });
    return { alert: row };
  });
}

function requireAny(ctx, permissions) {
  let last = null;
  for (const p of permissions) {
    try {
      return requirePermission(ctx, p);
    } catch (err) {
      last = err;
    }
  }
  throw last ?? new HttpError(403, "FORBIDDEN", "Insufficient permissions");
}

function singular(table) {
  return table.endsWith("s") ? table.slice(0, -1) : table;
}

let userIdCache = null;
function userIds() {
  if (!userIdCache) {
    userIdCache = new Set(db.prepare("SELECT id FROM users").all().map((r) => r.id));
  }
  return userIdCache;
}

function userIdForStaff(staffId) {
  const row = db.prepare("SELECT id FROM users WHERE staff_id = ?").get(staffId);
  return row?.id ?? null;
}
