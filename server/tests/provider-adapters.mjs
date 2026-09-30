/**
 * Provider adapter tests: real ERA5 reanalysis, CAP/RSS official alert parsing
 * and delivery transports. These run against the live archive and local
 * fixtures, so a parser regression or a provider going dark is caught.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = "file:///C:/Users/ASUS/Documents/Default%20Project/varun-x";

let pass = 0;
let fail = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ` :: ${extra}` : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ` :: ${extra}` : ""}`);
  }
}

console.log("\n== ERA5 reanalysis climatology ==");
const { getClimatology, probeClimatology } = await import(`${BASE}/server/services/climatology.mjs`);
const clim = await getClimatology(28.6139, 77.209);
ok("climatology reaches the reanalysis archive", clim.status === "REAL", `status ${clim.status}`);
ok("baseline is labelled ERA5", clim.mode === "ERA5_REANALYSIS", clim.mode);
ok("baseline names its source", /ERA5/i.test(clim.source ?? ""), clim.source);
ok("a multi-year sample was drawn", (clim.sampledDays ?? 0) > 300, `${clim.sampledDays} days`);
ok("precipitation statistics are plausible for Delhi monsoon", clim.precipMean > 0.5 && clim.precipMean < 20, `mean ${clim.precipMean} mm/day, p95 ${clim.precip95}`);
ok("p95 exceeds the mean", clim.precip95 > clim.precipMean, `p95 ${clim.precip95} > mean ${clim.precipMean}`);
ok("spread is non-zero", clim.precipSd > 0, `sd ${clim.precipSd}`);
ok("temperature statistics are plausible", clim.tempMean > 5 && clim.tempMean < 45, `mean ${clim.tempMean} degC`);
ok("probe reports reachable", (await probeClimatology()).status === "REACHABLE");

const clim2 = await getClimatology(19.076, 72.8777);
ok("a second location produces its own baseline", clim2.status === "REAL" && clim2.tempMean !== clim.tempMean, `Mumbai ${clim2.tempMean} degC vs Delhi ${clim.tempMean} degC`);

console.log("\n== official alert CAP/RSS parsing ==");
const { fetchOfficialAlerts } = await import(`${BASE}/server/services/alerts.mjs`);

// With the channel explicitly disabled the result must be an explicit
// unavailable state rather than a fallback feed or fabricated alerts.
process.env.VARUNX_ALERT_FEED_URL = "off";
const unconfigured = await fetchOfficialAlerts();
ok("a disabled feed reports UNAVAILABLE, not fake alerts", unconfigured.status === "UNAVAILABLE" && unconfigured.configured === false);
ok("unavailable reason names the missing configuration", /VARUNX_ALERT_FEED_URL/.test(unconfigured.reason ?? ""), String(unconfigured.reason).slice(0, 80));
ok("unavailable result carries no alerts", !unconfigured.alerts || unconfigured.alerts.length === 0);
ok("a disabled feed is not silently replaced by a default", !unconfigured.source, String(unconfigured.source));

const capXml = readFileSync(join(HERE, "fixtures", "imd-cap-sample.xml"), "utf8");
const rssXml = readFileSync(join(HERE, "fixtures", "imd-rss-sample.xml"), "utf8");

// Serve the fixtures over a loopback HTTP server to exercise the real fetch path.
import { createServer } from "node:http";
const server = createServer((req, res) => {
  if (req.url === "/cap.xml") {
    res.writeHead(200, { "content-type": "application/cap+xml" });
    res.end(capXml);
  } else if (req.url === "/rss.xml") {
    res.writeHead(200, { "content-type": "application/rss+xml" });
    res.end(rssXml);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

process.env.VARUNX_ALERT_FEED_URL = `http://127.0.0.1:${port}/cap.xml`;
const capResult = await fetchOfficialAlerts();
ok("CAP feed is parsed", capResult.status === "REAL" && capResult.alerts.length === 1, `format ${capResult.format}, ${capResult.alerts.length} alert(s)`);
const capAlert = capResult.alerts?.[0] ?? {};
ok("CAP event mapped to hazard", capAlert.hazard === "Heavy Rainfall Warning", String(capAlert.hazard));
ok("CAP severity 'Severe' mapped to critical", capAlert.severity === "critical", String(capAlert.severity));
ok("CAP description decoded from CDATA", /extremely heavy/i.test(capAlert.description ?? ""), String(capAlert.description).slice(0, 60));
ok("CAP instruction preserved", /Shelter in place/i.test(capAlert.instruction ?? ""));
ok("CAP sender becomes the authority", capAlert.authority === "IMD", String(capAlert.authority));
ok("CAP onset parsed to a timestamp", Number.isFinite(capAlert.issuedAt), String(capAlert.issuedAt));
ok("CAP expiry parsed", Number.isFinite(capAlert.expiresAt), String(capAlert.expiresAt));
ok("alerts are labelled OFFICIAL ALERT", capAlert.dataClass === "OFFICIAL ALERT", String(capAlert.dataClass));

process.env.VARUNX_ALERT_FEED_URL = `http://127.0.0.1:${port}/rss.xml`;
const rssResult = await fetchOfficialAlerts();
ok("RSS feed is parsed", rssResult.status === "REAL" && rssResult.alerts.length === 1, `${rssResult.alerts.length} alert(s)`);
ok("RSS item from IMD is accepted", rssResult.alerts[0]?.authority === "IMD", String(rssResult.alerts[0]?.authority));
ok("RSS item from an unattributed source is REJECTED", !rssResult.alerts.some((a) => a.authority === "Random Blog"), "rumour dropped");
ok("RSS severity 'Extreme' mapped to critical", rssResult.alerts[0]?.severity === "critical", String(rssResult.alerts[0]?.severity));

process.env.VARUNX_ALERT_FEED_URL = "http://127.0.0.1:${port}/missing.xml";
const missing = await fetchOfficialAlerts();
ok("an unreachable feed reports UNAVAILABLE", missing.status === "UNAVAILABLE" && missing.configured === true, String(missing.reason).slice(0, 60));
ok("unreachable feed returns no alerts", !missing.alerts || missing.alerts.length === 0);
server.close();
delete process.env.VARUNX_ALERT_FEED_URL;

console.log("\n== CAP/GeoJSON parsing ==");
// The NWS publishes the CAP message model as GeoJSON, so that serialisation has
// to be recognised and must keep rejecting non-agency senders.
process.env.VARUNX_ALERT_FEED_URL = "off";
const nwsGeojson = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      properties: {
        id: "urn:oid:2.49.0.1.840.0-TEST-1",
        senderName: "NWS ANCHORAGE AK",
        event: "Winter Storm Warning",
        headline: "Winter Storm Warning issued for the Kenai Peninsula",
        severity: "Severe",
        urgency: "Immediate",
        certainty: "Likely",
        areaDesc: "Kenai Peninsula, AK",
        description: "Heavy snow expected.",
        instruction: "Travel should be delayed.",
        onset: "2026-09-29T12:00:00+00:00",
        expires: "2026-09-30T12:00:00+00:00",
      },
    },
    {
      properties: {
        id: "urn:oid:2.49.0.1.840.0-TEST-2",
        senderName: "NWS ANCHORAGE AK",
        event: "Test Message",
        description: "Monitoring message only. Please disregard.",
        severity: "Unknown",
      },
    },
    {
      properties: {
        id: "rumour",
        senderName: "Random Blog",
        event: "Cyclone inbound!",
        description: "Share before it is deleted.",
        severity: "Extreme",
      },
    },
  ],
});
const geoServer = createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/geo+json" });
  res.end(nwsGeojson);
});
await new Promise((r) => geoServer.listen(0, "127.0.0.1", r));
process.env.VARUNX_ALERT_FEED_URL = `http://127.0.0.1:${geoServer.address().port}/alerts`;
const geo = await fetchOfficialAlerts();
ok("CAP/GeoJSON feed is recognised", geo.status === "REAL" && geo.format === "CAP/GeoJSON", `format ${geo.format}`);
ok("only the genuine warning is kept", geo.alerts.length === 1, `${geo.alerts.length} alert(s)`);
ok("office-qualified sender resolves to the agency", geo.alerts[0]?.authority === "NWS ANCHORAGE AK", String(geo.alerts[0]?.authority));
ok("event mapped to hazard", geo.alerts[0]?.hazard === "Winter Storm Warning", String(geo.alerts[0]?.hazard));
ok("severe maps to critical", geo.alerts[0]?.severity === "critical", String(geo.alerts[0]?.severity));
ok("onset parsed from ISO-8601", Number.isFinite(geo.alerts[0]?.issuedAt), String(geo.alerts[0]?.issuedAt));
ok("expiry parsed from ISO-8601", Number.isFinite(geo.alerts[0]?.expiresAt), String(geo.alerts[0]?.expiresAt));
ok("agency test message is dropped", !geo.alerts.some((a) => a.hazard === "Test Message"), "test message filtered");
ok("non-agency sender is rejected", !geo.alerts.some((a) => a.authority === "Random Blog"), "rumour filtered");
ok("every alert carries the feed scope", geo.alerts.every((a) => typeof a.feedScope === "string" && a.feedScope.length > 0), String(geo.alerts[0]?.feedScope).slice(0, 50));
geoServer.close();
delete process.env.VARUNX_ALERT_FEED_URL;

console.log("\n== live default official feed ==");
const live = await fetchOfficialAlerts();
ok("a working official feed is connected by default", live.status === "REAL", `status ${live.status}`);
ok("default feed needs no key or registration", live.source === "https://api.weather.gov/alerts/active", String(live.source));
ok("default feed is labelled CAP/GeoJSON", live.format === "CAP/GeoJSON", String(live.format));
ok("default feed is not claimed to be Indian", /not an Indian authority/i.test(String(live.scope)), String(live.scope).slice(0, 70));
ok("default feed yields real warnings", (live.alerts?.length ?? 0) > 0, `${live.alerts?.length} alert(s)`);
ok("live alerts keep their issuing office", live.alerts.every((a) => typeof a.authority === "string" && a.authority.length > 0));
ok("live alerts are labelled OFFICIAL ALERT", live.alerts.every((a) => a.dataClass === "OFFICIAL ALERT"));
ok("live alerts all carry the non-Indian scope label", live.alerts.every((a) => /not an Indian authority/i.test(a.feedScope ?? "")));

console.log("\n== delivery transports ==");
const { channelStatus, dispatchChannels, probeDispatch } = await import(`${BASE}/server/services/dispatch.mjs`);
const status = channelStatus();
ok("sms reports Twilio with its missing keys named", status.sms.provider === "Twilio" && status.sms.missing.length === 3, JSON.stringify(status.sms.missing));
ok("email reports SMTP with its missing keys named", status.email.provider === "SMTP" && status.email.missing.length === 2, JSON.stringify(status.email.missing));
ok("push reports FCM with its missing key named", status.push.provider.includes("Firebase") && status.push.missing.length === 1, JSON.stringify(status.push.missing));
ok("no channel claims to be configured", Object.values(status).every((c) => c.configured === false));

const unconfiguredDispatch = await dispatchChannels({
  channels: ["sms"],
  text: "test",
  contacts: { phones: ["+919999999999"], emails: [], pushTokens: [] },
});
ok("unconfigured dispatch reports NOT_CONFIGURED", unconfiguredDispatch.mode === "NOT_CONFIGURED", unconfiguredDispatch.mode);
ok("unconfigured dispatch sends nothing", unconfiguredDispatch.actuallySent === 0, `sent ${unconfiguredDispatch.actuallySent}`);
ok("unconfigured dispatch names the missing provider", /Twilio|SMTP|FCM|credentials/i.test(unconfiguredDispatch.reason ?? ""), String(unconfiguredDispatch.reason).slice(0, 70));
ok("per-channel result is reported", unconfiguredDispatch.results[0]?.status === "UNCONFIGURED" && unconfiguredDispatch.results[0]?.attempted === 1, JSON.stringify(unconfiguredDispatch.results[0]));
ok("dispatch probe reports UNCONFIGURED", (await probeDispatch()).status === "UNCONFIGURED");

console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
process.exit(fail === 0 ? 0 : 1);
