import { db, writeAudit, DEMO_ACCOUNTS } from "../lib/db.mjs";
import {
  assertNotLocked,
  clearSessionCookie,
  consumeChallenge,
  createChallenge,
  createPasswordReset,
  createSession,
  createUser,
  findUserByEmail,
  findUserByPhone,
  noteFailedLogin,
  noteSuccessfulLogin,
  publicUser,
  recentLoginActivity,
  requirePermission,
  resetPasswordWithToken,
  resolveSession,
  revokeSession,
  setSessionCookie,
  setUserPassword,
  verifyMfa,
} from "../lib/auth.mjs";
import { HttpError, bad, unauthorized, nowSec, verifySecret } from "../lib/util.mjs";

const DEMO_MODE = process.env.VARUNX_DEMO_AUTH !== "0";
const DEMO_CITIZEN_OTP = "000000";

function clientIp(req) {
  return req.socket?.remoteAddress ?? null;
}

function identifierOf(body) {
  return String(body.identifier ?? body.email ?? body.phone ?? "").trim();
}

/** Roles allowed to reach each login surface. */
const CITIZEN_ROLES = ["citizen"];
const AUTHORITY_ROLES = ["authority_viewer", "authority_officer", "authority_admin"];

function login({ ctx, body, roles, scope }) {
  const identifier = identifierOf(body);
  const password = String(body.password ?? "");
  if (!identifier || !password) {
    throw bad("MISSING_CREDENTIALS", "Both an identifier and a password are required");
  }
  assertNotLocked(identifier.toLowerCase());

  const user = identifier.includes("@") ? findUserByEmail(identifier) : findUserByPhone(identifier);
  const generic = new HttpError(401, "INVALID_CREDENTIALS", "Identifier or password is incorrect");

  if (!user || !roles.includes(user.role) || user.status !== "active") {
    noteFailedLogin({
      userId: user?.id,
      identifier: identifier.toLowerCase(),
      reason: "unknown identifier or role mismatch",
      ip: clientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"],
    });
    writeAudit({
      user: user ? { id: user.id, label: user.name, role: user.role } : { label: identifier },
      action: "LOGIN_FAILED",
      scope,
      result: "DENIED",
      ip: clientIp(ctx.req),
    });
    throw generic;
  }

  if (!verifySecret(password, user.password_salt, user.password_hash)) {
    noteFailedLogin({
      userId: user.id,
      identifier: identifier.toLowerCase(),
      reason: "bad password",
      ip: clientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"],
    });
    throw generic;
  }

  return { user, identifier };
}

export function register(router) {
  /* ------------------------------ session ----------------------------- */

  router.get("/api/auth/session", (ctx) => {
    const user = resolveSession(ctx.cookies.varunx_sid);
    if (!user) return { authenticated: false, user: null, demoMode: DEMO_MODE };
    return {
      authenticated: true,
      user: publicUser(user),
      demoMode: DEMO_MODE,
      serverTime: nowSec(),
    };
  });

  /* --------------------------- citizen login -------------------------- */

  router.post("/api/auth/citizen/login", (ctx) => {
    const { user, identifier } = login({ ctx, body: ctx.body, roles: CITIZEN_ROLES, scope: "citizen" });
    const session = createSession(user, {
      ip: clientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"],
    });
    setSessionCookie(ctx, session);
    noteSuccessfulLogin({
      userId: user.id,
      identifier: identifier.toLowerCase(),
      ip: clientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"],
    });
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "LOGIN",
      scope: "citizen",
      result: "SUCCESS",
      ip: clientIp(ctx.req),
    });
    return { user: publicUser(user), expiresAt: session.expiresAt };
  });

  router.post("/api/auth/citizen/register", (ctx) => {
    const email = String(ctx.body.email ?? "").trim().toLowerCase();
    const phone = String(ctx.body.phone ?? "").trim();
    const name = String(ctx.body.name ?? "").trim();
    const password = String(ctx.body.password ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad("INVALID_EMAIL", "Enter a valid email address");
    if (name.length < 2) throw bad("INVALID_NAME", "Enter your name");
    if (password.length < 8) throw bad("WEAK_PASSWORD", "Use at least 8 characters");
    if (findUserByEmail(email)) throw bad("EMAIL_TAKEN", "That email is already registered");
    if (phone && findUserByPhone(phone)) throw bad("PHONE_TAKEN", "That mobile number is already registered");
    const user = createUser({ role: "citizen", email, phone: phone || null, name, password });
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "ACCOUNT_CREATED",
      scope: "citizen",
      result: "SUCCESS",
      ip: clientIp(ctx.req),
    });
    return { user: publicUser(user) };
  });

  router.post("/api/auth/citizen/otp/request", (ctx) => {
    const phone = String(ctx.body.phone ?? "").trim();
    if (!phone) throw bad("MISSING_PHONE", "Mobile number is required");
    const user = findUserByPhone(phone);
    // Never disclose whether the number is registered.
    if (!user) return { sent: true, expiresIn: 300 };
    const challenge = createChallenge(user, {
      channel: "sms",
      destination: phone,
      purpose: "citizen-login",
      // Demo accounts use a fixed, documented code so the printed hint and the
      // accepted code never diverge. Real accounts get a random code.
      code: user.is_demo ? DEMO_CITIZEN_OTP : undefined,
    });
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "OTP_REQUESTED",
      scope: maskPhone(phone),
      result: "SENT",
      ip: clientIp(ctx.req),
    });
    return {
      sent: true,
      expiresIn: challenge.expiresAt - nowSec(),
      devCode: DEMO_MODE ? challenge.code : undefined,
      demoNotice: DEMO_MODE
        ? "DEMO AUTHENTICATION: no SMS gateway is connected, so the code is returned in this response instead of being sent."
        : null,
    };
  });

  router.post("/api/auth/citizen/otp/verify", (ctx) => {
    const phone = String(ctx.body.phone ?? "").trim();
    const user = findUserByPhone(phone);
    if (!user) throw unauthorized("That mobile number is not registered");
    consumeChallenge({ userId: user.id, purpose: "citizen-login", channel: "sms", code: ctx.body.code });
    const session = createSession(user, { ip: clientIp(ctx.req), userAgent: ctx.req.headers["user-agent"] });
    setSessionCookie(ctx, session);
    noteSuccessfulLogin({
      userId: user.id,
      identifier: maskPhone(phone),
      ip: clientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"],
    });
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "LOGIN_OTP",
      scope: maskPhone(phone),
      result: "SUCCESS",
      ip: clientIp(ctx.req),
    });
    return { user: publicUser(user), expiresAt: session.expiresAt };
  });

  /* --------------------------- authority login ------------------------ */

  router.post("/api/auth/authority/login", (ctx) => {
    // Viewers, officers and admins all authenticate here; the session's
    // permission set is what limits what they can do afterwards.
    const { user, identifier } = login({
      ctx,
      body: ctx.body,
      roles: AUTHORITY_ROLES,
      scope: "mission-control",
    });
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "AUTHORITY_LOGIN_PASSWORD",
      scope: "mission-control",
      result: "PASSWORD_VERIFIED",
      ip: clientIp(ctx.req),
    });
    if (!user.mfa_enabled) {
      const session = createSession(user, { ip: clientIp(ctx.req), userAgent: ctx.req.headers["user-agent"] });
      setSessionCookie(ctx, session);
      noteSuccessfulLogin({
        userId: user.id,
        identifier: identifier.toLowerCase(),
        ip: clientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"],
      });
      return { user: publicUser(user), mfaRequired: false, expiresAt: session.expiresAt };
    }
    const challenge = createChallenge(user, {
      channel: "authenticator",
      destination: user.staff_id ?? user.email,
      purpose: "authority-mfa",
      // Demo accounts keep a fixed, documented second factor so the printed
      // hint and the accepted code never diverge.
      code: user.is_demo ? demoMfaCodeFor(user) : undefined,
    });
    return {
      mfaRequired: true,
      challengeExpiresIn: challenge.expiresAt - nowSec(),
      devCode: DEMO_MODE ? challenge.code : undefined,
      demoNotice: DEMO_MODE
        ? "DEMO AUTHENTICATION: no MFA provider is connected, so the code is returned in this response."
        : null,
    };
  });

  router.post("/api/auth/authority/mfa", (ctx) => {
    const identifier = identifierOf(ctx.body);
    const user = identifier.includes("@") ? findUserByEmail(identifier) : findUserByPhone(identifier);
    if (!user || !AUTHORITY_ROLES.includes(user.role)) throw unauthorized("Verification failed");
    consumeChallenge({ userId: user.id, purpose: "authority-mfa", code: ctx.body.code });
    verifyMfa(user, ctx.body.code);
    const session = createSession(user, { ip: clientIp(ctx.req), userAgent: ctx.req.headers["user-agent"] });
    setSessionCookie(ctx, session);
    noteSuccessfulLogin({
      userId: user.id,
      identifier: identifier.toLowerCase(),
      ip: clientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"],
    });
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "AUTHORITY_LOGIN",
      scope: "mission-control",
      result: "SUCCESS",
      ip: clientIp(ctx.req),
    });
    return { user: publicUser(user), expiresAt: session.expiresAt };
  });

  /* --------------------------- password flow -------------------------- */

  router.post("/api/auth/password/forgot", (ctx) => {
    const identifier = identifierOf(ctx.body);
    const user = identifier.includes("@") ? findUserByEmail(identifier) : findUserByPhone(identifier);
    const reset = user
      ? createPasswordReset(user)
      : { token: null };
    writeAudit({
      user: user ? { id: user.id, label: user.name, role: user.role } : { label: identifier },
      action: "PASSWORD_RESET_REQUESTED",
      scope: "account",
      result: user ? "ISSUED" : "NO_MATCH",
      ip: clientIp(ctx.req),
    });
    return {
      sent: true,
      devToken: DEMO_MODE ? reset.token : undefined,
      demoNotice: DEMO_MODE
        ? "DEMO AUTHENTICATION: no email provider is connected, so the reset token is returned in this response."
        : null,
    };
  });

  router.post("/api/auth/password/reset", (ctx) => {
    const tokenValue = String(ctx.body.token ?? "");
    const password = String(ctx.body.password ?? "");
    if (password.length < 8) throw bad("WEAK_PASSWORD", "Use at least 8 characters");
    const userId = resetPasswordWithToken(tokenValue, password);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    writeAudit({
      user: { id: userId, label: user?.name, role: user?.role },
      action: "PASSWORD_RESET",
      scope: "account",
      result: "SUCCESS",
      ip: clientIp(ctx.req),
    });
    return { reset: true };
  });

  router.post("/api/auth/change-password", (ctx) => {
    const user = requirePermission(ctx, "weather:read");
    const current = String(ctx.body.current ?? "");
    const next = String(ctx.body.new ?? "");
    if (next.length < 8) throw bad("WEAK_PASSWORD", "Use at least 8 characters");
    if (!verifySecret(current, user.password_salt, user.password_hash)) {
      throw unauthorized("Current password is incorrect");
    }
    setUserPassword(user, next);
    clearSessionCookie(ctx);
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "PASSWORD_CHANGED",
      scope: "account",
      result: "SUCCESS",
      ip: clientIp(ctx.req),
    });
    return { changed: true, message: "Password changed. Sign in again." };
  });

  /* ------------------------------ logout ------------------------------ */

  router.post("/api/auth/logout", (ctx) => {
    const sid = ctx.cookies.varunx_sid;
    if (sid) {
      const row = db.prepare("SELECT user_id FROM sessions WHERE id = ?").get(sid);
      if (row) {
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(row.user_id);
        revokeSession(sid);
        writeAudit({
          user: user ? { id: user.id, label: user.name, role: user.role } : null,
          action: "LOGOUT",
          scope: "session",
          result: "REVOKED",
          ip: clientIp(ctx.req),
        });
      }
    }
    clearSessionCookie(ctx);
    return { signedOut: true };
  });

  /* ------------------------ admin: activity log ----------------------- */

  router.get("/api/auth/activity", (ctx) => {
    requirePermission(ctx, "audit:read");
    return { events: recentLoginActivity(25) };
  });

  router.get("/api/auth/demo-accounts", () => ({
    demoMode: DEMO_MODE,
    notice:
      "DEMO AUTHENTICATION. These accounts exist only in this prototype database. They are not real people, not a real organisation and grant no real authority.",
    accounts: [
      { role: "citizen", identifier: "citizen@varunx.demo", password: "Citizen@2026", mfa: null, label: "Demo Citizen" },
      { role: "citizen", identifier: "+910000000001", password: null, mfa: "any 6 digits (returned on screen)", label: "Demo Citizen (mobile OTP)" },
      { role: "authority_officer", identifier: "officer@varunx.demo", password: "Officer@2026", mfa: "123456", label: "Demo Response Officer" },
      { role: "authority_viewer", identifier: "analyst@varunx.demo", password: "Analyst@2026", mfa: "123456", label: "Demo Forecast Analyst" },
    ],
  }));
}

function maskPhone(phone) {
  const s = String(phone);
  if (s.length < 5) return "***";
  return `${s.slice(0, 3)}****${s.slice(-2)}`;
}

/** The documented demo second factor, used so hints and accepted codes match. */
function demoMfaCodeFor(user) {
  const account = DEMO_ACCOUNTS.find((a) => a.email === user.email);
  return account?.mfa ?? "123456";
}
