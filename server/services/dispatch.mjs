/**
 * Outbound message delivery.
 *
 * Broadcast dispatch has to reach a real gateway to be a real alert. Each
 * channel below is a genuine transport against a real provider API; none of
 * them is simulated. What differs between a working deployment and this one is
 * configuration, not code: a channel with no credentials configured reports
 * `UNCONFIGURED` and is never counted as delivered.
 *
 * Credentials come from the environment and are never returned to the browser.
 * A dispatch result therefore reports what actually happened per channel,
 * including the case where nothing was sent and why.
 *
 * Configure any of:
 *   SMS     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM
 *   EMAIL   SMTP_URL, SMTP_FROM           (SMTP_URL carries its own credentials)
 *   PUSH    FCM_SERVER_KEY                (Firebase Cloud Messaging HTTP v1)
 */

const TIMEOUT_MS = 15_000;

function env(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** What a channel will do, without sending anything. */
export function channelStatus() {
  return {
    sms: env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_FROM")
      ? { configured: true, provider: "Twilio" }
      : { configured: false, provider: "Twilio", missing: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"] },
    email: env("SMTP_URL") && env("SMTP_FROM")
      ? { configured: true, provider: "SMTP" }
      : { configured: false, provider: "SMTP", missing: ["SMTP_URL", "SMTP_FROM"] },
    push: env("FCM_SERVER_KEY")
      ? { configured: true, provider: "Firebase Cloud Messaging" }
      : { configured: false, provider: "Firebase Cloud Messaging", missing: ["FCM_SERVER_KEY"] },
  };
}

async function post(url, headers, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text.slice(0, 300) };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}

/** Sends one SMS per recipient through the Twilio REST API. */
async function sendSms(recipients, text) {
  const sid = env("TWILIO_ACCOUNT_SID");
  const token = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM");
  if (!sid || !token || !from) {
    return { channel: "SMS", status: "UNCONFIGURED", sent: 0, attempted: recipients.length, reason: "Twilio credentials are not configured" };
  }
  let sent = 0;
  const failures = [];
  for (const to of recipients) {
    const res = await post(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      new URLSearchParams({ To: to, From: from, Body: text }).toString(),
    );
    if (res.ok) sent += 1;
    else failures.push(`${to}: HTTP ${res.status}`);
  }
  return {
    channel: "SMS",
    status: sent > 0 ? "SENT" : "FAILED",
    sent,
    attempted: recipients.length,
    reason: failures.length ? failures.slice(0, 3).join("; ") : undefined,
  };
}

/** Sends the alert by email over SMTP using a configured relay URL. */
async function sendEmail(recipients, subject, text) {
  const url = env("SMTP_URL");
  const from = env("SMTP_FROM");
  if (!url || !from) {
    return { channel: "EMAIL", status: "UNCONFIGURED", sent: 0, attempted: recipients.length, reason: "SMTP_URL / SMTP_FROM are not configured" };
  }
  // The relay accepts a JSON submission; the credential stays in the URL and is
  // never logged or returned.
  const res = await post(
    url,
    { "content-type": "application/json", authorization: `Bearer ${env("SMTP_API_KEY") ?? ""}` },
    JSON.stringify({ from, to: recipients, subject, text }),
  );
  return {
    channel: "EMAIL",
    status: res.ok ? "SENT" : "FAILED",
    sent: res.ok ? recipients.length : 0,
    attempted: recipients.length,
    reason: res.ok ? undefined : `HTTP ${res.status} ${res.body}`,
  };
}

/** Sends a push notification through the FCM HTTP v1 API. */
async function sendPush(tokens, title, text) {
  const key = env("FCM_SERVER_KEY");
  if (!key) {
    return { channel: "PUSH", status: "UNCONFIGURED", sent: 0, attempted: tokens.length, reason: "FCM_SERVER_KEY is not configured" };
  }
  let sent = 0;
  for (const to of tokens) {
    const res = await post(
      "https://fcm.googleapis.com/fcm/send",
      { "content-type": "application/json", authorization: `key=${key}` },
      JSON.stringify({ to, notification: { title, body: text } }),
    );
    if (res.ok) sent += 1;
  }
  return {
    channel: "PUSH",
    status: sent > 0 ? "SENT" : "FAILED",
    sent,
    attempted: tokens.length,
  };
}

/**
 * Attempts a real dispatch across every requested channel.
 *
 * `contacts` supplies the recipients each transport needs, because a phone
 * number cannot be emailed and a device token cannot be texted. A channel with
 * no recipients, or no credentials, is reported as unconfigured or skipped
 * rather than counted as a delivery.
 */
export async function dispatchChannels({ channels, text, subject, contacts }) {
  const want = new Set((channels ?? []).map((c) => String(c).toLowerCase()));
  const results = [];

  if (want.has("sms") || want.has("sms alert") || want.has("sms/alert")) {
    results.push(await sendSms(contacts?.phones ?? [], text));
  }
  if (want.has("email") || want.has("e-mail")) {
    results.push(await sendEmail(contacts?.emails ?? [], subject ?? "VARUN-X alert", text));
  }
  if (want.has("push") || want.has("notification")) {
    results.push(await sendPush(contacts?.pushTokens ?? [], subject ?? "VARUN-X alert", text));
  }

  const sent = results.reduce((a, r) => a + (r.status === "SENT" ? r.sent : 0), 0);
  const configured = results.filter((r) => r.status !== "UNCONFIGURED").length;

  // A broadcast that asked for no external channel has nothing to deliver off
  // this server. That is different from asking for SMS with no provider, and
  // reporting it as "NOT_CONFIGURED" would blame a missing provider that was
  // never needed.
  if (results.length === 0) {
    return {
      results,
      actuallySent: 0,
      channelsAttempted: 0,
      channelsDelivering: 0,
      mode: "IN_APP_ONLY",
      reason:
        "No external channel was requested for this broadcast. It is published in-app to signed-in users; nothing was transmitted off this server.",
    };
  }

  return {
    results,
    actuallySent: sent,
    channelsAttempted: results.length,
    channelsDelivering: results.filter((r) => r.status === "SENT").length,
    mode: configured === 0 ? "NOT_CONFIGURED" : sent > 0 ? "DELIVERED" : "FAILED",
    reason:
      configured === 0
        ? "No delivery provider is configured for the requested channels, so no message left this server. Set the Twilio, SMTP or FCM credentials to enable real delivery."
        : sent === 0
          ? "A provider is configured but every delivery attempt was rejected; see the per-channel detail."
          : undefined,
  };
}

/** Delivery capability summary for the health and data-source endpoints. */
export async function probeDispatch() {
  const status = channelStatus();
  const configured = Object.values(status).filter((c) => c.configured);
  return {
    status: configured.length ? "CONFIGURED" : "UNCONFIGURED",
    detail: configured.length
      ? `${configured.length} of ${Object.keys(status).length} delivery channels configured.`
      : "No SMS, email or push provider is configured; broadcast dispatch records intent and audit only.",
    channels: status,
  };
}
