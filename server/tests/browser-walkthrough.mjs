/**
 * Browser walkthrough: signs in through the real UI, opens every page in a real
 * browser, and fails on anything a user would see as broken.
 *
 * The earlier version of this test injected a session cookie and passed 254
 * checks while actually rendering the login page every time, so two guards are
 * built in here:
 *   - the session is established by filling the real login form
 *   - every page must produce distinct content, so a route that silently falls
 *     back to a shared shell is caught instead of passing trivially
 */

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";

const BASE = process.env.BASE ?? "http://localhost:5199";
const CHROME = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const SHOTS = process.env.SHOTS ?? "C:/Users/ASUS/AppData/Local/Temp/opencode/shots";
mkdirSync(SHOTS, { recursive: true });

const CITIZEN_PAGES = [
  ["/citizen", "Citizen dashboard"],
  ["/safety", "Safety actions"],
  ["/live", "Live weather"],
  ["/forecasts", "Forecast comparison"],
  ["/alerts", "Alerts"],
  ["/incidents", "My incidents"],
  ["/assistant", "Assistant"],
  ["/models", "Model card"],
  ["/system", "System data sources"],
  ["/privacy", "Privacy"],
  ["/terms", "Terms"],
  ["/responsible-ai", "Responsible AI"],
  ["/data-usage", "Data usage"],
];

const OFFICER_PAGES = [
  ["/overview", "Mission control"],
  ["/anomalies", "Anomalies"],
  ["/tracking", "Tracking"],
  ["/downscaling", "Downscaling"],
  ["/risk", "Risk"],
  ["/emergency", "Emergency operations"],
  ["/broadcast", "Broadcast console"],
  ["/personnel", "Personnel"],
  ["/resources", "Resources"],
  ...CITIZEN_PAGES,
];

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${extra ? ` :: ${extra}` : ""}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name}${extra ? ` :: ${extra}` : ""}`);
  }
}

async function readPage(page) {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script, style, noscript").forEach((n) => n.remove());
    return {
      text: clone.innerText || "",
      h1: document.querySelector("h1")?.innerText ?? null,
      passwordInputs: document.querySelectorAll('input[type="password"]').length,
      canvases: document.querySelectorAll("canvas").length,
    };
  });
}

async function loginAsCitizen(page) {
  await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" });
  await page.waitForSelector("#c-id", { timeout: 20000 });
  await page.fill("#c-id", "citizen@varunx.demo");
  await page.fill("#c-pw", "Citizen@2026");
  await page.click('button[type="submit"]:has-text("SIGN IN AS CITIZEN")');
  await page.waitForFunction(() => !document.querySelector("#c-id"), { timeout: 25000 });
  const who = await page.evaluate(async () => (await (await fetch("/api/auth/session")).json())?.user?.role);
  ok("citizen signed in through the UI", who === "citizen", `session role ${who}`);
}

async function loginAsAuthority(page, email, password, code) {
  await page.goto(`${BASE}/#/`, { waitUntil: "networkidle" });
  await page.click('button:has-text("AUTHORITY")');
  await page.waitForSelector("#a-id", { timeout: 20000 });
  await page.fill("#a-id", email);
  await page.fill("#a-pw", password);
  await page.click('button[type="submit"]:has-text("AUTHORITY SIGN IN")');
  await page.waitForSelector("#a-mfa", { timeout: 25000 });
  await page.fill("#a-mfa", code);
  await page.click('button[type="submit"]:has-text("COMPLETE SIGN IN")');
  await page.waitForFunction(() => !document.querySelector("#a-mfa"), { timeout: 25000 });
  const who = await page.evaluate(async () => (await (await fetch("/api/auth/session")).json())?.user?.role);
  ok(`authority signed in through the UI (${email})`, String(who).startsWith("authority"), `session role ${who}`);
}

async function walk(page, pages, shotPrefix) {
  const hashes = new Map();
  for (const [path, name] of pages) {
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const badResponses = [];

    const onConsole = (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    };
    const onPageError = (e) => pageErrors.push(e.message);
    const onFailed = (r) => {
      if (/tile|basemaps|openstreetmap|leaflet/.test(r.url())) return;
      failedRequests.push(`${r.method()} ${r.url()} -> ${r.failure()?.errorText ?? r.status()}`);
    };
    // A 4xx the app swallowed still shows up in the console, but without a URL.
    const onResponse = async (r) => {
      if (r.status() < 400) return;
      if (!r.url().includes("/api/")) return;
      let detail = "";
      try {
        detail = JSON.stringify(await r.json()).slice(0, 160);
      } catch {
        detail = r.statusText();
      }
      badResponses.push(`${r.status()} ${r.url().replace(BASE, "")} ${detail}`);
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("requestfailed", onFailed);
    page.on("response", onResponse);

    const resp = await page.goto(`${BASE}/#${path}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(2500);
    const info = await readPage(page);
    const status = resp?.status() ?? 0;
    const overlay = await page.locator("vite-error-overlay").count();

    // The app uses hash routing, so changing route is a same-document
    // navigation and playwright reports no HTTP response (status 0). Only the
    // first real document load carries a status.
    ok(
      `${name} loaded (no 4xx/5xx document)`,
      status === 0 || (status >= 200 && status < 400),
      `status ${status}`,
    );
    // A login form on an authenticated route means the session never took.
    ok(`${name} is not the login page`, info.passwordInputs === 0 && !/sign in as citizen|authority sign in/i.test(info.text), `pw inputs ${info.passwordInputs}`);
    ok(`${name} rendered real content`, info.text.trim().length > 200, `${info.text.trim().length} chars, h1 "${(info.h1 ?? "-").slice(0, 30)}"`);
    ok(`${name} has no error overlay`, overlay === 0);
    ok(`${name} no uncaught exceptions`, pageErrors.length === 0, pageErrors.join(" | "));
    ok(`${name} no console errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | ").slice(0, 300));
    ok(`${name} no failed requests`, failedRequests.length === 0, failedRequests.slice(0, 3).join(" | ").slice(0, 300));
    ok(`${name} no 4xx/5xx API responses`, badResponses.length === 0, badResponses.slice(0, 3).join(" | ").slice(0, 400));
    ok(
      `${name} no react crash boundary`,
      !/something went wrong|minified react error/i.test(info.text),
      info.text.slice(0, 100).replace(/\s+/g, " "),
    );

    const leaks = [];
    for (const [label, re] of [
      ["NaN", /\bNaN\b/],
      ["undefined", /\bundefined\b/],
      ["[object Object]", /\[object Object\]/],
      ["Infinity", /\bInfinity\b/],
    ]) {
      if (re.test(info.text)) {
        const at = info.text.search(re);
        leaks.push(`${label} near "${info.text.slice(Math.max(0, at - 45), at + 45).replace(/\s+/g, " ")}"`);
      }
    }
    ok(`${name} no leaked placeholder values`, leaks.length === 0, leaks.join(" | "));

    // Distinctness: two different routes must not render identical content.
    const hash = createHash("sha1").update(info.text).digest("hex").slice(0, 10);
    const prior = hashes.get(hash);
    ok(`${name} renders content unique to this route`, !prior, prior ? `identical to ${prior}` : `hash ${hash}`);
    hashes.set(hash, name);

    await page.screenshot({ path: `${SHOTS}/${shotPrefix}-${path.replace(/\//g, "_")}.png`, fullPage: true });
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onFailed);
    page.off("response", onResponse);
  }
  return hashes;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

try {
  console.log("\n== signed out ==");
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await c.newPage();
    await p.goto(`${BASE}/#/`, { waitUntil: "networkidle" });
    const info = await readPage(p);
    ok("signed-out visitor sees the login page", /sign in as citizen/i.test(info.text), `h1 "${(info.h1 ?? "-").slice(0, 40)}"`);
    await c.close();
  }

  console.log("\n== citizen session ==");
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await c.newPage();
    await loginAsCitizen(p);
    await walk(p, CITIZEN_PAGES, "citizen");
    await c.close();
  }

  console.log("\n== authority officer session ==");
  {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await c.newPage();
    await loginAsAuthority(p, "officer@varunx.demo", "Officer@2026", "123456");
    await walk(p, OFFICER_PAGES, "officer");
    await c.close();
  }

  console.log("\n== role gating ==");
  {
    // A citizen must not reach the authority layer at all.
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await c.newPage();
    await loginAsCitizen(p);
    await p.goto(`${BASE}/#/personnel`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    const info = await readPage(p);
    ok("citizen is blocked from the authority layer", /authority access required|access restricted/i.test(info.text), info.text.slice(0, 80).replace(/\s+/g, " "));
    await c.close();
  }
  {
    // A viewer is an authority session, so it may read the console, but it must
    // not be offered command controls it cannot execute.
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p = await c.newPage();
    await loginAsAuthority(p, "analyst@varunx.demo", "Analyst@2026", "123456");
    await p.goto(`${BASE}/#/personnel`, { waitUntil: "networkidle" });
    await p.waitForTimeout(2500);
    const info = await readPage(p);
    // A forecast analyst is redirected off the operations layer rather than
    // shown a read-only version of it: the roster is an officer surface.
    ok(
      "analyst is redirected off the operations console",
      /MISSION CONTROL|Mission Control/i.test(info.text) && !/PERSONNEL ROSTER|ADD PERSONNEL/i.test(info.text),
      `${info.text.length} chars`,
    );
    // Scoped to actual controls: the overview names capabilities like
    // "publish alert" in prose, which is not a command control.
    const commandButtons = await p.evaluate(() =>
      [...document.querySelectorAll("button, a.btn, [role='button']")]
        .map((b) => (b.textContent ?? "").trim())
        .filter((t) => /ADD PERSONNEL|ALLOCATE|DISPATCH BROADCAST|PUBLISH ALERT/i.test(t)),
    );
    ok("analyst is offered no command controls", commandButtons.length === 0, commandButtons.join(", ") || "no execute buttons rendered");
    await c.close();
  }
} finally {
  await browser.close();
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
if (failures.length) {
  console.log("failures:");
  for (const f of failures) console.log(`  - ${f}`);
}
console.log(`screenshots: ${SHOTS}`);
process.exit(fail === 0 ? 0 : 1);
