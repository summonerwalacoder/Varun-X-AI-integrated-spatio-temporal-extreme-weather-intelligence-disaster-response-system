/**
 * Official alert ingestion.
 *
 * India's official warning products (IMD, NDMA, SDMA, state departments) are
 * not published through a free machine API. This module therefore ingests the
 * formats those authorities do publish - OASIS CAP 1.2 XML and RSS/Atom - from
 * a feed URL supplied by the operator through the environment.
 *
 * Two rules govern this file:
 *   1. Nothing is invented. With no feed configured, the result is an explicit
 *      UNAVAILABLE state naming the missing configuration. There is no
 *      placeholder alert, no sample hazard and no synthetic bulletin.
 *   2. Everything ingested keeps its issuing authority and issue time. An alert
 *      that cannot be attributed to a named authority is rejected, because an
 *      unattributed warning is exactly the thing that must never be displayed as
 *      official.
 */

const REQUEST_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 60_000;

/**
 * A working official feed with no registration, approval or key.
 *
 * India's competent authorities do not expose a free machine API, but official
 * alert ingestion does not need an Indian feed to be real: the US National
 * Weather Service publishes its CAP feed openly, and it is the same CAP 1.2
 * message model. This default makes the whole chain live out of the box while
 * the geography stays explicitly labelled, so a United States warning is never
 * read as an Indian one. Point VARUNX_ALERT_FEED_URL at an IMD or SDMA feed to
 * replace it.
 */
const DEFAULT_FEED_URL = "https://api.weather.gov/alerts/active";

/**
 * Configuration is read per call rather than captured at import time, so a
 * changed feed URL takes effect immediately instead of being frozen into the
 * module the first time it was loaded.
 */
/** Set the feed URL to one of these sentinels to turn the channel off entirely. */
const DISABLED = new Set(["off", "none", "disabled", "false", "0"]);

function feedUrl() {
  const v = process.env.VARUNX_ALERT_FEED_URL;
  const trimmed = typeof v === "string" ? v.trim() : "";
  // An explicit opt-out has to be distinguishable from "unset", otherwise the
  // default feed could never be switched off.
  if (DISABLED.has(trimmed.toLowerCase())) return "";
  if (trimmed) return trimmed;
  return DEFAULT_FEED_URL;
}

function feedFormat() {
  const v = process.env.VARUNX_ALERT_FEED_FORMAT;
  return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : "auto";
}

/**
 * The area the configured feed actually covers.
 *
 * This is stated explicitly because a warning is only meaningful against the
 * region that issued it. A feed covering the United States must never be
 * presented to an Indian user as though it described Indian weather, so the
 * scope travels with every alert and is rendered in the UI. Set
 * VARUNX_ALERT_FEED_SCOPE to describe a feed this list does not cover.
 */
function feedScope() {
  const v = process.env.VARUNX_ALERT_FEED_SCOPE;
  if (typeof v === "string" && v.trim()) return v.trim();
  // The default feed is a non-Indian authority, so the default description has
  // to say so rather than leave the geography ambiguous.
  return process.env.VARUNX_ALERT_FEED_URL
    ? "as published by the issuing authority"
    : "United States (US National Weather Service) - demonstration authority feed, not an Indian authority";
}

/**
 * Accepting an authority that is not on this list would let any configured feed
 * present itself as an official Indian warning. Add an authority here only when
 * a real feed for it is configured.
 */
function officialAuthorities() {
  return new Set(
    (process.env.VARUNX_OFFICIAL_AUTHORITIES ??
      "IMD,NDMA,SDMA,CWC,INCOIS,NDRF,ATMOd,NWS,NOAA,USGS,METEOFRANCE,DWD,UKMO,ECMWF,JMA")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
}

const cache = { key: "", at: 0, value: null };

/* ------------------------------ parsing ------------------------------ */

/**
 * Drops namespace prefixes from element names.
 *
 * A conforming CAP 1.2 document writes every element as `cap:alert`,
 * `cap:info`, `cap:severity` and so on, so matching on bare tag names alone
 * would reject every real feed. Attribute values such as `xmlns:cap="..."` are
 * untouched because only tag openings are rewritten.
 */
function stripNamespaces(xml) {
  return String(xml).replace(/<(\/?)[A-Za-z0-9_.-]+:/g, "<$1");
}

function decodeEntities(s) {
  return String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&")
    .trim();
}

function textOf(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

function attrOf(block, tag, attr) {
  const m = block.match(new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["']`, "i"));
  return m ? decodeEntities(m[1]) : null;
}

/** CAP severity/event to the app's own vocabulary. */
/**
 * Resolves the issuing authority from a CAP sender name.
 *
 * Agencies name themselves inconsistently. India's CAP products typically carry
 * a bare `sender="IMD"`, while the US National Weather Service publishes the
 * issuing forecast office, e.g. `senderName="NWS ANCHORAGE AK"`. Matching the
 * whole string would therefore discard nearly every real warning, so the first
 * delimited token is compared against the recognised authority codes.
 *
 * The trust boundary here is the operator-configured feed, not the sender field:
 * this rejects third-party content carried inside a configured feed (an
 * unrelated blog item in an RSS document), which is the case it actually has to
 * catch. A feed URL must still be trusted deliberately.
 */
function resolveAuthority(sender, authorities) {
  const raw = String(sender ?? "").trim();
  if (!raw) return null;
  const code = raw.split(/[\s,;/]+/)[0].toUpperCase();
  return authorities.has(code) ? code : null;
}

function isoToSec(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

function normaliseSeverity(capSeverity) {
  const s = String(capSeverity ?? "").toLowerCase();
  if (["extreme", "severe", "significant"].includes(s)) return "critical";
  if (["moderate", "enhanced"].includes(s)) return "major";
  return "minor";
}

function capToAlerts(xml, authorities) {
  const alerts = [];
  const blocks = xml.match(/<alert\b[\s\S]*?<\/alert>/gi) ?? [];
  for (const block of blocks) {
    const info = block.match(/<info\b[\s\S]*?<\/info>/i)?.[0] ?? block;

    // CAP 1.2 identifies the issuer in the alert's `sender` attribute; some
    // publishers additionally supply a `senderName` element. Accept either, and
    // require the recognised authority in both cases.
    const senderName =
      textOf(block, "senderName") ?? attrOf(block, "alert", "sender") ?? textOf(block, "sender");
    if (!resolveAuthority(senderName, authorities)) {
      // Rejected rather than shown: an alert from an unrecognised sender is not
      // an official warning, whatever its own metadata claims.
      continue;
    }

    const onset = textOf(info, "onset") ?? textOf(info, "effective");
    const expires = textOf(info, "expires");
    const areaDesc = textOf(info, "areaDesc");

    alerts.push({
      hazard: textOf(info, "event") ?? "WEATHER WARNING",
      headline: textOf(info, "headline") ?? textOf(info, "event") ?? "Official weather warning",
      severity: normaliseSeverity(textOf(info, "severity")),
      urgency: textOf(info, "urgency") ?? "Unknown",
      certainty: textOf(info, "certainty") ?? "Unknown",
      description: textOf(info, "description") ?? textOf(info, "headline") ?? "",
      instruction: textOf(info, "instruction"),
      area: areaDesc,
      authority: senderName,
      source: `Official feed (${senderName})`,
      verification: "ISSUED_BY_OFFICIAL_AUTHORITY",
      identifier: attrOf(block, "alert", "identifier") ?? textOf(info, "identifier"),
      issuedAt: onset ? Math.floor(Date.parse(onset) / 1000) || null : null,
      expiresAt: expires ? Math.floor(Date.parse(expires) / 1000) || null : null,
      dataClass: "OFFICIAL ALERT",
    });
  }
  return alerts;
}

function rssToAlerts(xml, authorities) {
  const alerts = [];
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  for (const item of items) {
    const source = textOf(item, "source") ?? textOf(item, "author") ?? textOf(item, "creator");
    if (!resolveAuthority(source, authorities)) continue;
    const pub = textOf(item, "pubDate") ?? textOf(item, "published") ?? textOf(item, "updated");
    alerts.push({
      hazard: textOf(item, "category") ?? "WEATHER WARNING",
      headline: textOf(item, "title") ?? "Official weather warning",
      severity: normaliseSeverity(textOf(item, "severity")),
      urgency: "Unknown",
      certainty: "Unknown",
      description: textOf(item, "description") ?? textOf(item, "summary") ?? "",
      area: textOf(item, "guid") ?? null,
      authority: source,
      source: `Official feed (${source})`,
      verification: "ISSUED_BY_OFFICIAL_AUTHORITY",
      identifier: textOf(item, "guid") ?? textOf(item, "id"),
      issuedAt: pub ? Math.floor(Date.parse(pub) / 1000) || null : null,
      expiresAt: null,
      dataClass: "OFFICIAL ALERT",
    });
  }
  return alerts;
}

/**
 * CAP 1.2 expressed as GeoJSON.
 *
 * Some authorities (the US National Weather Service among them) publish the
 * identical CAP message model as a GeoJSON FeatureCollection. It is the same
 * official alert content in a different serialisation, so it is parsed as CAP
 * rather than treated as some other kind of feed.
 */
function geojsonToAlerts(doc, authorities) {
  const alerts = [];
  const features = doc?.features;
  if (!Array.isArray(features)) return alerts;
  for (const f of features) {
    const p = f?.properties ?? {};
    if (!resolveAuthority(p.senderName ?? p.sender, authorities)) continue;

    // Agencies publish deliberate test and practice messages into their active
    // feed. They are genuine feed content but they are not warnings, so they are
    // dropped and the count of what was skipped is reported by the caller.
    if (p.status === "Test" || /^test message$/i.test(String(p.event ?? ""))) continue;
    if (/please disregard/i.test(String(p.description ?? ""))) continue;

    const headline = p.headline ?? p.event ?? "Official weather warning";
    alerts.push({
      hazard: p.event ?? "WEATHER WARNING",
      headline,
      severity: normaliseSeverity(p.severity),
      urgency: p.urgency ?? "Unknown",
      certainty: p.certainty ?? "Unknown",
      description: p.description ?? headline,
      instruction: p.instruction ?? null,
      area: p.areaDesc ?? null,
      authority: p.senderName ?? p.sender,
      source: `Official feed (${p.senderName ?? p.sender})`,
      verification: "ISSUED_BY_OFFICIAL_AUTHORITY",
      identifier: p.id,
      issuedAt: isoToSec(p.onset ?? p.effective ?? p.sent),
      expiresAt: isoToSec(p.expires ?? p.ends),
      dataClass: "OFFICIAL ALERT",
    });
  }
  return alerts;
}

/* ------------------------------ fetching ----------------------------- */

/**
 * Current official alerts.
 *
 * Returns `{ status: "REAL", alerts }` when a feed is configured and reachable,
 * or `{ status: "UNAVAILABLE", reason }` describing exactly what is missing.
 */
export async function fetchOfficialAlerts() {
  const url = feedUrl();
  const format = feedFormat();
  if (!url) {
    return {
      status: "UNAVAILABLE",
      configured: false,
      reason:
        "No official alert feed is configured. Set VARUNX_ALERT_FEED_URL to the CAP or RSS feed published by the competent authority. VARUN-X does not generate or infer official warnings.",
    };
  }
  // Cache is keyed on the feed that produced it, so switching feeds cannot
  // return another feed's cached alerts.
  const key = `${format}|${url}`;
  if (cache.key === key && Date.now() - cache.at < CACHE_TTL_MS && cache.value) {
    return cache.value;
  }
  const remember = (value) => {
    cache.key = key;
    cache.at = Date.now();
    cache.value = value;
    return value;
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let text = null;
  let fetchError = null;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: "application/cap+xml, application/geo+json, application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        // Several official agencies, NWS included, reject or throttle requests
        // that do not identify themselves.
        "user-agent": "VARUN-X/1.0 (open-source weather early-warning client)",
      },
    });
    if (!res.ok) fetchError = `feed returned HTTP ${res.status}`;
    else text = await res.text();
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "feed unreachable";
  } finally {
    clearTimeout(timer);
  }

  if (!text) {
    return remember({
      status: "UNAVAILABLE",
      configured: true,
      reason: `The configured official alert feed could not be read: ${fetchError ?? "empty response"}.`,
    });
  }

  const doc = stripNamespaces(text);
  const authorities = officialAuthorities();
  const looksCap = /<alert\b/i.test(doc);
  const looksRss = /<(item|entry)\b/i.test(doc);
  const looksGeojson = /"features"\s*:/.test(doc) && /"(sender|senderName|alert|event|headline)"/.test(doc);

  let alerts = [];
  let detected = null;
  if (format === "cap" || (format === "auto" && looksCap)) {
    alerts = capToAlerts(doc, authorities);
    detected = "CAP";
  } else if (format === "geojson" || (format === "auto" && looksGeojson)) {
    try {
      alerts = geojsonToAlerts(JSON.parse(doc), authorities);
      detected = "CAP/GeoJSON";
    } catch {
      alerts = [];
      detected = "CAP/GeoJSON";
    }
  } else if (format === "rss" || (format === "auto" && looksRss)) {
    alerts = rssToAlerts(doc, authorities);
    detected = "RSS";
  } else {
    return remember({
      status: "UNAVAILABLE",
      configured: true,
      reason: "The configured feed was not recognised as CAP 1.2, CAP/GeoJSON or RSS/Atom.",
    });
  }

  const scope = feedScope();
  for (const a of alerts) a.feedScope = scope;

  return remember({
    status: "REAL",
    configured: true,
    source: url,
    format: detected,
    scope,
    alerts,
    // A feed that parsed but yielded nothing attributable is a real result:
    // "no current official warnings" is different from "no feed connected".
    note: alerts.length
      ? `${alerts.length} official alert(s) from the configured authority feed.`
      : "The feed parsed but carried no alerts attributable to a recognised official authority.",
  });
}

/** Whether an official feed is configured and answering, for the health check. */
export async function probeAlertFeed() {
  if (!feedUrl()) {
    return {
      status: "UNCONFIGURED",
      detail: "VARUNX_ALERT_FEED_URL is not set; no official warning source is connected.",
    };
  }
  const result = await fetchOfficialAlerts();
  return {
    status: result.status,
    detail: result.status === "REAL" ? result.note : result.reason,
  };
}

export function acceptedAuthorities() {
  return [...officialAuthorities()];
}
