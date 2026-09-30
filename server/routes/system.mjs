import { db } from "../lib/db.mjs";
import { publicUser, requirePermission, optionalUser } from "../lib/auth.mjs";
import { nowSec } from "../lib/util.mjs";
import { probeWeatherProvider, providerInfo } from "../services/weather.mjs";
import { probeClimatology } from "../services/climatology.mjs";
import { probeAlertFeed } from "../services/alerts.mjs";
import { probeDispatch } from "../services/dispatch.mjs";
import { PIPELINE_STAGES, HAZARD_META } from "../services/intelligence.mjs";
import { SUGGESTED_QUESTIONS } from "../services/assistant.mjs";

const CAPABILITIES = {
  citizen: [
    "Live weather for the device location or an explicitly selected location",
    "Provider model forecast and hourly outlook",
    "Anomaly, risk and probability views for the analysis window",
    "Safety actions and official-alert status",
    "Grounded assistant answers in English, Hindi and Hinglish",
  ],
  authority_viewer: [
    "Everything a citizen sees, plus the console read-only view",
    "Tracked-object table, evidence and provenance",
    "Data-source register and pipeline stage status",
    "Refinement inspection (coarse versus refined fields)",
  ],
  authority_officer: [
    "Everything a viewer sees, plus write access to console records",
    "Incident, resource, team, shelter and personnel updates",
    "Broadcast drafting and simulated dispatch",
    "Official-alert publication into the local prototype register",
  ],
  authority_admin: [
    "Everything an officer sees, plus user administration",
    "Audit log and login activity review",
  ],
};

export function register(router) {
  router.get("/api/system/health", async (ctx) => {
    const weather = await probeWeatherProvider();
    const clim = await probeClimatology();
    const feed = await probeAlertFeed();
    const delivery = await probeDispatch();
    return {
      status: "ok",
      serverTime: nowSec(),
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      liveWeather: weather.reachable ? "REACHABLE" : "UNREACHABLE",
      weatherDetail: weather.reachable ? `${weather.latencyMs} ms` : weather.error,
      reanalysis: clim.status,
      reanalysisDetail: clim.detail,
      officialAlerts: feed.status,
      officialAlertDetail: feed.detail,
      messageDelivery: delivery.status,
      messageDeliveryDetail: delivery.detail,
      database: (() => {
        try {
          db.prepare("SELECT 1").get();
          return "OK";
        } catch (err) {
          return `ERROR: ${err.message}`;
        }
      })(),
    };
  });

  router.get("/api/system/me", (ctx) => {
    const user = optionalUser(ctx);
    if (!user) return { authenticated: false };
    return {
      authenticated: true,
      user: publicUser(user),
      capabilities: CAPABILITIES[user.role] ?? [],
      permissions: user.permissions,
      dataClassNotice:
        "NWP input is live provider data. Climatology, ensemble, GNN and diffusion stages are labelled SIMULATION. Official-alert and SMS channels are not connected.",
    };
  });

  router.get("/api/system/model-card", (ctx) => {
    requirePermission(ctx, "weather:read");
    const rows = db.prepare("SELECT * FROM data_sources ORDER BY id").all();
    return {
      name: "VARUN-X",
      role: "Disaster intelligence prototype for extreme-weather object tracking and refinement",
      pipeline: PIPELINE_STAGES,
      hazards: Object.fromEntries(
        Object.entries(HAZARD_META).map(([key, value]) => [key, value.title]),
      ),
      liveInputs: rows.filter((r) => r.status === "CONNECTED").map((r) => r.name),
      simulatedInputs: rows.filter((r) => r.status === "SIMULATION").map((r) => r.name),
      plannedInputs: rows.filter((r) => r.status === "UNAVAILABLE").map((r) => `${r.name} (${r.status})`),
      limitations: rows.filter((r) => r.notes).map((r) => r.notes),
      disclaimer:
        "This is a prototype decision-support system. It is not an official warning service. It does not replace IMD, NDMA, SDMA, CWC or any other competent authority.",
    };
  });

  router.get("/api/system/suggested-questions", (ctx) => {
    requirePermission(ctx, "weather:read");
    return { questions: SUGGESTED_QUESTIONS };
  });

  router.get("/api/system/data-sources", (ctx) => {
    requirePermission(ctx, "weather:read");
    const rows = db.prepare("SELECT * FROM data_sources ORDER BY id").all();
    return { sources: rows };
  });
}
