import { db, permissionsFor, writeAudit } from "./db.mjs";
import { nowSec, token, verifySecret, hashSecret, sha256, unauthorized, forbidden, conflict } from "./util.mjs";

const SESSION_COOKIE = "varunx_sid";

const SESSION_TTL = {
  citizen: 60 * 60 * 12, // 12 h
  authority_viewer: 60 * 60 * 6,
  authority_officer: 60 * 45,
  authority_admin: 60 * 45,
};

export const MAX_FAILED_LOGINS = 8;
export const FAILED_WINDOW = 15 * 60;

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    email: row.email ?? null,
    phone: row.phone ?? null,
    name: row.name,
    department: row.department ?? null,
    staffId: row.staff_id ?? null,
    mfaEnabled: !!row.mfa_enabled,
    isDemo: !!row.is_demo,
    permissions: permissionsFor(row.role),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
  };
}

export function findUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) ?? null;
}

export function findUserByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email) ?? null;
}

export function findUserByPhone(phone) {
  const digits = String(phone).replace(/[^\d+]/g, "");
  return db.prepare("SELECT * FROM users WHERE phone = ?").get(digits) ?? null;
}

function recordLogin({ userId, identifier, outcome, reason, ip, userAgent }) {
  db.prepare(
    `INSERT INTO login_events (ts, user_id, identifier, outcome, reason, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(nowSec(), userId ?? null, identifier, outcome, reason ?? null, ip ?? null, userAgent ?? null);
}

/** Rate-limits repeated failed authentications per identifier. */
export function assertNotLocked(identifier) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS fails FROM login_events
       WHERE identifier = ? AND outcome = 'FAILED'
         AND ts > ?`,
    )
    .get(identifier, nowSec() - FAILED_WINDOW);
  if ((row?.fails ?? 0) >= MAX_FAILED_LOGINS) {
    throw conflict("Too many failed attempts. Try again later or use account recovery.");
  }
}

export function noteFailedLogin({ userId, identifier, reason, ip, userAgent }) {
  recordLogin({ userId, identifier, outcome: "FAILED", reason, ip, userAgent });
}

export function noteSuccessfulLogin({ userId, identifier, ip, userAgent }) {
  recordLogin({ userId, identifier, outcome: "SUCCESS", ip, userAgent });
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(nowSec(), userId);
}

export function recentLoginActivity(limit = 12) {
  return db
    .prepare(
      `SELECT e.ts, e.outcome, e.reason, e.ip, u.role, u.name, u.email
       FROM login_events e LEFT JOIN users u ON u.id = e.user_id
       ORDER BY e.ts DESC LIMIT ?`,
    )
    .all(limit)
    .map((r) => ({
      ts: r.ts,
      outcome: r.outcome,
      reason: r.reason ?? null,
      ip: r.ip ? maskIp(r.ip) : null,
      identity: r.name ?? r.email ?? "unknown",
      role: r.role ?? null,
    }));
}

export function maskIp(ip) {
  if (!ip) return null;
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::";
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;
  return `${parts[0]}.${parts[1]}.x.x`;
}

export function createSession(user, { ip, userAgent }) {
  const id = token(32);
  const created = nowSec();
  const ttl = SESSION_TTL[user.role] ?? SESSION_TTL.citizen;
  db.prepare(
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, user.id, created, created, created + ttl, ip ?? null, userAgent ?? null);
  return { id, expiresAt: created + ttl, ttl };
}

export function setSessionCookie(res, session) {
  res.setCookie(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "Lax",
    maxAge: session.ttl,
    secure: process.env.VARUNX_SECURE_COOKIES === "1",
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE);
}

export function revokeSession(sessionId) {
  db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").run(nowSec(), sessionId);
}

/** Resolves the current session to a user row, or null. Never throws. */
export function resolveSession(cookieValue) {
  if (!cookieValue) return null;
  const row = db
    .prepare(
      `SELECT s.id AS sid, s.expires_at, s.revoked_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(cookieValue);
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at < nowSec()) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(row.sid);
    return null;
  }
  if (row.status !== "active") return null;
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(nowSec(), row.sid);
  return row;
}

export function can(user, permission) {
  if (!user) return false;
  return permissionsFor(user.role).includes(permission);
}

export function requireUser(ctx) {
  const user = resolveSession(ctx.cookies[SESSION_COOKIE]);
  if (!user) throw unauthorized("Sign in to continue");
  return user;
}

export function optionalUser(ctx) {
  return resolveSession(ctx.cookies[SESSION_COOKIE]);
}

export function requirePermission(ctx, permission) {
  const user = requireUser(ctx);
  if (!can(user, permission)) {
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: `ACCESS_DENIED:${permission}`,
      scope: ctx.url.pathname,
      result: "DENIED",
      ip: ctx.req.socket?.remoteAddress,
    });
    throw forbidden(`Role ${user.role} lacks permission ${permission}`);
  }
  return user;
}

/* ----------------------------- OTP / MFA ----------------------------- */

export function createChallenge(user, { channel, destination, purpose, ttl = 300, code }) {
  const plain = code ?? String(Math.floor(100000 + Math.random() * 900000));
  const { salt, hash } = hashSecret(plain);
  const id = token(12);
  const created = nowSec();
  db.prepare(
    `INSERT INTO otp_challenges (id, user_id, channel, destination, purpose, code_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, user.id, channel, destination, purpose, `${salt}:${hash}`, created, created + ttl);
  return { id, code: plain, expiresAt: created + ttl };
}

export function consumeChallenge({ userId, purpose, channel, code }) {
  const row = db
    .prepare(
      `SELECT * FROM otp_challenges
       WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId, purpose, nowSec());
  if (!row) throw conflict("No active verification request. Request a new code.");
  if (channel && row.channel !== channel) {
    throw conflict(`This code was sent over ${row.channel}`);
  }
  if (row.attempts >= 5) throw conflict("Too many incorrect code attempts. Request a new code.");
  const [salt, hash] = row.code_hash.split(":");
  if (!verifySecret(String(code ?? ""), salt, hash)) {
    db.prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    throw conflict("Incorrect code");
  }
  db.prepare("UPDATE otp_challenges SET consumed_at = ? WHERE id = ?").run(nowSec(), row.id);
  return row;
}

export function verifyMfa(user, code) {
  if (!user.mfa_secret) return true;
  const [salt, hash] = user.mfa_secret.split(":");
  if (!verifySecret(String(code ?? ""), salt, hash)) {
    throw conflict("Incorrect verification code");
  }
  return true;
}

export function createPasswordReset(user, ttl = 900) {
  const plain = token(18);
  const id = token(10);
  const created = nowSec();
  db.prepare(
    `INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, user.id, sha256(plain), created, created + ttl);
  return { token: plain, expiresAt: created + ttl };
}

export function resetPasswordWithToken(plainToken, newPassword) {
  const row = db
    .prepare("SELECT * FROM password_resets WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?")
    .get(sha256(plainToken), nowSec());
  if (!row) throw conflict("Reset link is invalid or has expired");
  const { salt, hash } = hashSecret(newPassword);
  db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, row.user_id);
  db.prepare("UPDATE password_resets SET consumed_at = ? WHERE id = ?").run(nowSec(), row.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND revoked_at IS NULL").run(row.user_id);
  return row.user_id;
}

export function setUserPassword(user, newPassword) {
  const { salt, hash } = hashSecret(newPassword);
  db.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?").run(hash, salt, user.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND revoked_at IS NULL").run(user.id);
}

export function createUser({
  role,
  email,
  phone,
  name,
  password,
  department,
  staffId,
  mfaEnabled = false,
  isDemo = false,
}) {
  const id = `USR-${token(8).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12)}`;
  const { salt, hash } = hashSecret(password);
  const mfa = mfaEnabled ? hashSecret(String(Math.floor(100000 + Math.random() * 900000))) : null;
  db.prepare(
    `INSERT INTO users (id, role, email, phone, name, department, staff_id, password_hash, password_salt,
                        mfa_enabled, mfa_secret, is_demo, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
  ).run(
    id,
    role,
    email ?? null,
    phone ?? null,
    name,
    department ?? null,
    staffId ?? null,
    hash,
    salt,
    mfa ? 1 : 0,
    mfa ? `${mfa.salt}:${mfa.hash}` : null,
    isDemo ? 1 : 0,
    nowSec(),
  );
  return findUserById(id);
}

export { SESSION_COOKIE };
