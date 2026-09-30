/**
 * Live integration contract checks for the official-alert feed and the
 * delivery transports. Runs against a started API with a real login session.
 */

const BASE = "http://127.0.0.1:8787";
let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? ` :: ${extra}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ` :: ${extra}` : ""}`); }
}

/**
 * The session is an HttpOnly cookie, not a bearer token, so the cookie jar is
 * carried through exactly as a browser would.
 */
const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function absorb(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
async function call(path, opts = {}) {
  const headers = { "content-type": "application/json", ...(opts.headers ?? {}) };
  const cookies = cookieHeader();
  if (cookies) headers.cookie = cookies;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  absorb(res);
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

/** Authority sign-in is two steps: password, then the MFA challenge. */
async function authorityLogin(identifier, password, code) {
  const pw = await call("/api/auth/authority/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  if (pw.status !== 200) return pw;
  return call("/api/auth/authority/mfa", {
    method: "POST",
    body: JSON.stringify({ identifier, code }),
  });
}

console.log("== unauthenticated access is refused ==");
const anonFeed = await call("/api/alerts/official");
ok("official feed refuses an anonymous caller", anonFeed.status === 401 || anonFeed.status === 403, `HTTP ${anonFeed.status}`);
const anonDelivery = await call("/api/ops/delivery");
ok("delivery capability refuses an anonymous caller", anonDelivery.status === 401 || anonDelivery.status === 403, `HTTP ${anonDelivery.status}`);

const login = await authorityLogin("officer@varunx.demo", "Officer@2026", "123456");
ok("officer logs in with password + MFA", login.status === 200 && !!login.body?.user, `HTTP ${login.status}`);

console.log("\n== official alert feed ==");
const feed = await call("/api/alerts/official");
ok("officer can read the official feed endpoint", feed.status === 200, `HTTP ${feed.status}`);
// A working official feed is connected by default, so the live result is
// asserted rather than the previously unconfigured one.
ok("a real official feed is connected", feed.body?.status === "REAL", feed.body?.status);
ok("the feed identifies a real source", /https?:\/\//.test(feed.body?.source ?? ""), String(feed.body?.source));
ok("the feed reports its serialisation", ["CAP", "RSS", "CAP/GeoJSON"].includes(feed.body?.format), String(feed.body?.format));
ok("the feed declares the area it covers", typeof feed.body?.scope === "string" && feed.body.scope.length > 0, String(feed.body?.scope).slice(0, 60));
ok("live warnings are returned", (feed.body?.alerts?.length ?? 0) > 0, `${feed.body?.alerts?.length} alert(s)`);
ok("every warning is attributed to a named authority", feed.body?.alerts?.every((a) => typeof a.authority === "string" && a.authority.length > 0));
ok("every warning is labelled OFFICIAL ALERT", feed.body?.alerts?.every((a) => a.dataClass === "OFFICIAL ALERT"));
ok("every warning carries the feed scope", feed.body?.alerts?.every((a) => typeof a.feedScope === "string" && a.feedScope.length > 0));
ok("no warning claims VARUN-X authorship", feed.body?.alerts?.every((a) => !/VARUN-X/i.test(a.authority ?? "")));

console.log("\n== delivery capability ==");
const delivery = await call("/api/ops/delivery");
ok("delivery status endpoint answers", delivery.status === 200, `HTTP ${delivery.status}`);
ok("reports UNCONFIGURED with no credentials", delivery.body?.status === "UNCONFIGURED", delivery.body?.status);
ok("sms names Twilio", delivery.body?.channels?.sms?.provider === "Twilio", JSON.stringify(delivery.body?.channels?.sms?.missing));
ok("email names SMTP", delivery.body?.channels?.email?.provider === "SMTP");
ok("push names Firebase", /Firebase/.test(delivery.body?.channels?.push?.provider ?? ""));
ok("no channel claims to be live", Object.values(delivery.body?.channels ?? {}).every((c) => c.configured === false));

console.log("\n== real dispatch through the API ==");
const created = await call("/api/broadcasts", {
  method: "POST",
  body: JSON.stringify({
    type: "EVACUATION", region: "DELHI NCR", severity: "CRITICAL", language: "English",
    text: "Integration check: shelter in place and keep drains clear.", channels: "SMS,EMAIL,PUSH", status: "DRAFT",
  }),
});
ok("officer can create a broadcast", created.status === 200 && !!created.body?.broadcast?.id, `HTTP ${created.status}`);
const bid = created.body?.broadcast?.id;
ok("channels are persisted from the request", created.body?.broadcast?.channels === "SMS,EMAIL,PUSH", String(created.body?.broadcast?.channels));

const dispatched = await call(`/api/broadcasts/${encodeURIComponent(bid)}/dispatch`, { method: "POST" });
ok("dispatch endpoint answers", dispatched.status === 200, `HTTP ${dispatched.status}`);
const d = dispatched.body?.dispatch;
ok("dispatch reports NOT_CONFIGURED, not SIMULATED", d?.status === "NOT_CONFIGURED", String(d?.status));
ok("nothing is counted as delivered", d?.actuallySent === 0, `sent ${d?.actuallySent}`);
ok("intended recipients are still counted", typeof d?.intendedRecipients === "number", String(d?.intendedRecipients));
ok("all three channels are reported", d?.channels?.length === 3, JSON.stringify(d?.channels?.map((c) => `${c.channel}:${c.status}`)));
ok("each channel reports UNCONFIGURED", d?.channels?.every((c) => c.status === "UNCONFIGURED"));
ok("SMS names the missing provider", /Twilio/.test(d?.channels?.[0]?.reason ?? ""), String(d?.channels?.[0]?.reason).slice(0, 60));
ok("EMAIL names the missing provider", /SMTP/.test(d?.channels?.[1]?.reason ?? ""), String(d?.channels?.[1]?.reason).slice(0, 60));
ok("PUSH names the missing provider", /FCM/.test(d?.channels?.[2]?.reason ?? ""), String(d?.channels?.[2]?.reason).slice(0, 60));
ok("broadcast status is ACTIVE", dispatched.body?.broadcast?.status === "ACTIVE", String(dispatched.body?.broadcast?.status));
ok("delivery note records the zero count", /NOT_CONFIGURED|No SMS|configured/i.test(dispatched.body?.broadcast?.delivery_note ?? ""), String(dispatched.body?.broadcast?.delivery_note).slice(0, 80));

console.log("\n== dispatch is audited ==");
const audit = await call("/api/ops/audit?limit=40");
const entry = audit.body?.entries?.find((e) => e.action === "BROADCAST_DISPATCH");
ok("dispatch wrote an audit entry", !!entry, entry ? entry.result : "none found");
ok("audit records the truthful outcome", /NOT_CONFIGURED/.test(entry?.result ?? ""), String(entry?.result));
ok("audit records zero actually sent", /0 actually sent/.test(entry?.result ?? ""), String(entry?.result));
const feedAudit = audit.body?.entries?.find((e) => e.action === "OFFICIAL_ALERTS_FETCHED");
ok("official feed access is audited", !!feedAudit, feedAudit ? `${feedAudit.scope} / ${feedAudit.result}` : "none found");

console.log("\n== viewer cannot dispatch ==");
// Sign in as the viewer, replacing the officer's cookie so the two roles are
// tested as genuinely separate sessions.
jar.clear();
const vLogin = await authorityLogin("analyst@varunx.demo", "Analyst@2026", "123456");
ok("viewer logs in", vLogin.status === 200 && !!vLogin.body?.user, `HTTP ${vLogin.status}`);

const vDispatch = await call(`/api/broadcasts/${encodeURIComponent(bid)}/dispatch`, { method: "POST" });
ok("viewer is refused broadcast:write", vDispatch.status === 403, `HTTP ${vDispatch.status}`);
const vDelivery = await call("/api/ops/delivery");
ok("viewer may read delivery capability", vDelivery.status === 200, `HTTP ${vDelivery.status}`);
const vFeed = await call("/api/alerts/official");
ok("viewer may read the official feed", vFeed.status === 200, `HTTP ${vFeed.status}`);

console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
process.exit(fail === 0 ? 0 : 1);
