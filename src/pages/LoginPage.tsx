import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PageHead } from "../components/PageHead";
import { Panel, Badge } from "../components/primitives";
import { Icon } from "../components/Icon";
import { BrandMark } from "../components/Layout";
import { useSession } from "../lib/session";
import type { ServerUser } from "../lib/session";
import { api, ApiError } from "../lib/api";

type Tab = "citizen" | "authority";
type CitizenMode = "password" | "otp" | "register";

type DemoAccount = {
  role: string;
  identifier: string;
  password: string | null;
  mfa: string | null;
  label: string;
};

function errText(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

export function LoginPage() {
  const {
    signInCitizen,
    requestCitizenOtp,
    signInCitizenOtp,
    registerCitizen,
    signInAuthority,
    verifyAuthorityMfa,
    demoMode,
  } = useSession();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>("citizen");
  const [citizenMode, setCitizenMode] = useState<CitizenMode>("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("+910000000001");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [reg, setReg] = useState({ name: "", email: "", phone: "", password: "" });

  const [authorityId, setAuthorityId] = useState("");
  const [authorityPw, setAuthorityPw] = useState("");
  const [mfaStage, setMfaStage] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaDevCode, setMfaDevCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<{ accounts: DemoAccount[] }>("/api/auth/demo-accounts")
      .then((res) => {
        if (active) setAccounts(res.accounts);
      })
      .catch(() => {
        /* demo hints are optional */
      });
    return () => {
      active = false;
    };
  }, []);

  const routeAfter = useCallback(
    (user: ServerUser) => {
      if (user.role === "citizen") void navigate("/citizen");
      else void navigate("/overview");
    },
    [navigate],
  );

  function resetMessages() {
    setError(null);
    setNotice(null);
  }

  async function submitCitizenPassword(e: FormEvent) {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const s = await signInCitizen(identifier.trim(), password);
      routeAfter(s.user);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    resetMessages();
    setBusy(true);
    try {
      const res = await requestCitizenOtp(phone.trim());
      setOtpSent(true);
      setDevCode(res.devCode ?? null);
      setNotice(res.demoNotice ?? "Verification code requested.");
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: FormEvent) {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const s = await signInCitizenOtp(phone.trim(), otp.trim());
      routeAfter(s.user);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitRegister(e: FormEvent) {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      await registerCitizen({
        name: reg.name.trim(),
        email: reg.email.trim(),
        phone: reg.phone.trim() || undefined,
        password: reg.password,
      });
      setNotice("Account created. Sign in with your email and password.");
      setCitizenMode("password");
      setIdentifier(reg.email.trim());
      setPassword("");
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitAuthority(e: FormEvent) {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const res = await signInAuthority(authorityId.trim(), authorityPw);
      if (res.mfaRequired) {
        setMfaStage(true);
        setMfaDevCode(res.devCode ?? null);
        setNotice(res.demoNotice ?? "Enter the verification code.");
      } else if (res.user) {
        routeAfter(res.user);
      }
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e: FormEvent) {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const s = await verifyAuthorityMfa(authorityId.trim(), mfaCode.trim());
      routeAfter(s.user);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  function fillAccount(a: DemoAccount) {
    resetMessages();
    if (a.role === "citizen") {
      setTab("citizen");
      setCitizenMode("password");
      setIdentifier(a.identifier);
      setPassword(a.password ?? "");
    } else {
      setTab("authority");
      setAuthorityId(a.identifier);
      setAuthorityPw(a.password ?? "");
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: 1080, paddingTop: 28, paddingBottom: 48 }}>
      <div className="brand" style={{ marginBottom: 22 }}>
        <span className="brand-mark">
          <BrandMark size={34} />
        </span>
        <span>
          <div className="brand-name">VARUN-X</div>
          <div className="brand-sub">AI-POWERED EXTREME WEATHER INTELLIGENCE</div>
        </span>
      </div>

      <PageHead
        kicker="SECURE ACCESS PORTAL"
        title="Sign in to VARUN-X"
        sub="Access is role-based. Citizen access shows live weather for your location. Authority access is verified against the server and enables operations modules."
        right={<Badge tone="muted">PROTOTYPE</Badge>}
      />

      <div className="grid-2c">
        <Panel
          title="SIGN IN"
          meta={tab === "citizen" ? "CITIZEN / PUBLIC" : "AUTHORITY STAFF"}
          flush
        >
          <div style={{ padding: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button
                type="button"
                className={`btn ${tab === "citizen" ? "btn-primary" : "btn-outline"}`}
                onClick={() => {
                  setTab("citizen");
                  resetMessages();
                }}
              >
                <Icon name="home" size={14} /> CITIZEN
              </button>
              <button
                type="button"
                className={`btn ${tab === "authority" ? "btn-primary" : "btn-outline"}`}
                onClick={() => {
                  setTab("authority");
                  resetMessages();
                  setMfaStage(false);
                }}
              >
                <Icon name="lock" size={14} /> AUTHORITY
              </button>
            </div>

            {notice && (
              <p className="small" style={{ margin: "0 0 12px", color: "var(--cyan)" }}>
                {notice}
              </p>
            )}
            {error && (
              <p className="small" style={{ margin: "0 0 12px", color: "var(--red)" }} role="alert">
                {error}
              </p>
            )}

            {tab === "citizen" && citizenMode === "password" && (
              <form onSubmit={submitCitizenPassword} className="stack" style={{ gap: 14 }}>
                <div className="field">
                  <label className="label" htmlFor="c-id">
                    EMAIL OR MOBILE NUMBER
                  </label>
                  <input
                    id="c-id"
                    className="input"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    autoComplete="username"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="c-pw">
                    PASSWORD
                  </label>
                  <input
                    id="c-pw"
                    className="input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  <Icon name="home" size={14} /> {busy ? "SIGNING IN..." : "SIGN IN AS CITIZEN"}
                </button>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCitizenMode("otp")}>
                    Use mobile OTP
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCitizenMode("register")}>
                    Create an account
                  </button>
                </div>
              </form>
            )}

            {tab === "citizen" && citizenMode === "otp" && (
              <form onSubmit={submitOtp} className="stack" style={{ gap: 14 }}>
                <div className="field">
                  <label className="label" htmlFor="c-phone">
                    MOBILE NUMBER
                  </label>
                  <input
                    id="c-phone"
                    className="input"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                  />
                </div>
                {otpSent && (
                  <div className="field">
                    <label className="label" htmlFor="c-otp">
                      VERIFICATION CODE
                    </label>
                    <input
                      id="c-otp"
                      className="input"
                      type="text"
                      inputMode="numeric"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      autoComplete="one-time-code"
                    />
                  </div>
                )}
                {devCode && (
                  <p className="small mono" style={{ margin: 0, color: "var(--amber)" }}>
                    DEMO CODE: {devCode}
                  </p>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-outline" onClick={sendOtp} disabled={busy}>
                    {otpSent ? "RESEND CODE" : "SEND CODE"}
                  </button>
                  {otpSent && (
                    <button className="btn btn-primary" type="submit" disabled={busy}>
                      <Icon name="shield" size={14} /> VERIFY AND SIGN IN
                    </button>
                  )}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCitizenMode("password")}>
                  Back to password sign in
                </button>
              </form>
            )}

            {tab === "citizen" && citizenMode === "register" && (
              <form onSubmit={submitRegister} className="stack" style={{ gap: 14 }}>
                <div className="field">
                  <label className="label" htmlFor="r-name">
                    FULL NAME
                  </label>
                  <input
                    id="r-name"
                    className="input"
                    value={reg.name}
                    onChange={(e) => setReg({ ...reg, name: e.target.value })}
                    autoComplete="name"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="r-email">
                    EMAIL
                  </label>
                  <input
                    id="r-email"
                    className="input"
                    type="email"
                    value={reg.email}
                    onChange={(e) => setReg({ ...reg, email: e.target.value })}
                    autoComplete="email"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="r-phone">
                    MOBILE (OPTIONAL)
                  </label>
                  <input
                    id="r-phone"
                    className="input"
                    type="tel"
                    value={reg.phone}
                    onChange={(e) => setReg({ ...reg, phone: e.target.value })}
                    autoComplete="tel"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="r-pw">
                    PASSWORD (MIN 8 CHARACTERS)
                  </label>
                  <input
                    id="r-pw"
                    className="input"
                    type="password"
                    value={reg.password}
                    onChange={(e) => setReg({ ...reg, password: e.target.value })}
                    autoComplete="new-password"
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  <Icon name="shield" size={14} /> CREATE ACCOUNT
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCitizenMode("password")}>
                  Back to sign in
                </button>
              </form>
            )}

            {tab === "authority" && !mfaStage && (
              <form onSubmit={submitAuthority} className="stack" style={{ gap: 14 }}>
                <div className="field">
                  <label className="label" htmlFor="a-id">
                    AUTHORITY EMAIL
                  </label>
                  <input
                    id="a-id"
                    className="input"
                    type="email"
                    value={authorityId}
                    onChange={(e) => setAuthorityId(e.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="a-pw">
                    PASSWORD
                  </label>
                  <input
                    id="a-pw"
                    className="input"
                    type="password"
                    value={authorityPw}
                    onChange={(e) => setAuthorityPw(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  <Icon name="lock" size={14} /> {busy ? "VERIFYING..." : "AUTHORITY SIGN IN"}
                </button>
              </form>
            )}

            {tab === "authority" && mfaStage && (
              <form onSubmit={submitMfa} className="stack" style={{ gap: 14 }}>
                <p className="small muted" style={{ margin: 0 }}>
                  Password verified. Enter the second-factor code to complete sign-in.
                </p>
                {mfaDevCode && (
                  <p className="small mono" style={{ margin: 0, color: "var(--amber)" }}>
                    DEMO MFA CODE: {mfaDevCode}
                  </p>
                )}
                <div className="field">
                  <label className="label" htmlFor="a-mfa">
                    VERIFICATION CODE
                  </label>
                  <input
                    id="a-mfa"
                    className="input"
                    inputMode="numeric"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    autoComplete="one-time-code"
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  <Icon name="shield" size={14} /> {busy ? "VERIFYING..." : "COMPLETE SIGN IN"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setMfaStage(false);
                    setMfaCode("");
                  }}
                >
                  Back
                </button>
              </form>
            )}
          </div>
        </Panel>

        <div className="stack" style={{ gap: 16 }}>
          {demoMode && accounts.length > 0 && (
            <Panel title="DEMO AUTHENTICATION" meta="PROTOTYPE ONLY">
              <p className="small muted" style={{ marginTop: 0 }}>
                These accounts exist only in the local prototype database. They are not real people
                and grant no real authority.
              </p>
              <div className="stack" style={{ gap: 10 }}>
                {accounts.map((a) => (
                  <div key={a.identifier} className="row-line" style={{ alignItems: "center" }}>
                    <span className="rl-l">
                      <span>
                        <div className="rl-t">{a.label}</div>
                        <div className="rl-s mono">
                          {a.identifier}
                          {a.password ? ` · ${a.password}` : ""}
                          {a.mfa ? ` · MFA ${a.mfa}` : ""}
                        </div>
                      </span>
                    </span>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => fillAccount(a)}>
                      FILL
                    </button>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel title="DATA AND PRIVACY NOTICE">
            <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Location is requested only after you sign in, and only when a page needs it.</li>
              <li>Live weather is retrieved server-side from the configured provider.</li>
              <li>No credential, provider key, or session token is stored in browser storage.</li>
              <li>Simulated model stages and the absence of official alert channels are labelled throughout.</li>
            </ul>
          </Panel>
        </div>
      </div>

      <p className="small muted" style={{ marginTop: 24 }}>
        VARUN-X is a prototype decision-support system. It is not an official warning service and
        does not replace IMD, NDMA, SDMA or any other competent authority.
      </p>
    </div>
  );
}
