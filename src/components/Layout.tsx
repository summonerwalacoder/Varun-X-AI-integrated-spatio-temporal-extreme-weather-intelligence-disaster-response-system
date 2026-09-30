import { Link, NavLink, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { useI18n, LANGS, type Lang, type DictKey } from "../lib/i18n";
import { useSession, isAuthority, isCommand } from "../lib/session";
import type { ReactNode } from "react";

type NavItem = { to: string; label: DictKey; icon: IconName; danger?: boolean };

/* Citizen navigation: simple, mobile-first, emergency-focused. */
const CITIZEN_NAV: NavItem[] = [
  { to: "/citizen", label: "dashboard", icon: "home" },
  { to: "/alerts", label: "alerts", icon: "alert" },
  { to: "/live", label: "live_weather", icon: "radar" },
  { to: "/forecasts", label: "forecast", icon: "wave" },
  { to: "/safety", label: "safety", icon: "shield" },
  { to: "/incidents", label: "report", icon: "flag" },
  { to: "/assistant", label: "assistant", icon: "chat" },
  { to: "/models", label: "models", icon: "data" },
  { to: "/system", label: "system", icon: "server" },
];

/* Authority navigation: full mission-control surface. */
const AUTHORITY_NAV: NavItem[] = [
  { to: "/overview", label: "overview", icon: "home" },
  { to: "/live", label: "live_weather", icon: "radar" },
  { to: "/forecasts", label: "forecast", icon: "wave" },
  { to: "/anomalies", label: "anomalies", icon: "crosshair" },
  { to: "/tracking", label: "tracking", icon: "target" },
  { to: "/downscaling", label: "downscaling", icon: "grid" },
  { to: "/risk", label: "risk", icon: "gauge" },
  { to: "/alerts", label: "alerts", icon: "alert" },
  { to: "/emergency", label: "emergency", icon: "siren", danger: true },
  { to: "/broadcast", label: "broadcast", icon: "megaphone", danger: true },
  { to: "/incidents", label: "incidents", icon: "pin" },
  { to: "/personnel", label: "personnel", icon: "people" },
  { to: "/resources", label: "resources", icon: "truck" },
  { to: "/assistant", label: "assistant", icon: "chat" },
  { to: "/models", label: "models", icon: "data" },
  { to: "/system", label: "system", icon: "server" },
];

/**
 * Operations routes that only a command officer may reach.
 *
 * A forecast analyst analyses the same intelligence the officer acts on, so the
 * intelligence pages stay shared. The response layer is what differs: dispatch,
 * ground staffing and inventory are officer surfaces, and hiding them in the nav
 * alone would leave them reachable by typing the URL. This list is the single
 * source of truth for both the nav and the route guard.
 */
const OPERATIONS_PATHS = new Set([
  "/emergency",
  "/broadcast",
  "/personnel",
  "/resources",
]);

/**
 * Forecast-analyst surface: the intelligence chain plus the read-only incident
 * report, with no response controls.
 */
const ANALYST_NAV: NavItem[] = AUTHORITY_NAV.filter((n) => !OPERATIONS_PATHS.has(n.to));

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
      <path
        d="M20 3 34 11v18L20 37 6 29V11L20 3Z"
        fill="none"
        stroke="#4C8DFF"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M12 26a8 8 0 0 1 16 0"
        stroke="#42C6D9"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="20" cy="17" r="4.4" fill="#42C6D9" />
      <path d="M20 6v5" stroke="#42C6D9" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RoleBadge({ role }: { role: "citizen" | "authority_viewer" | "authority_officer" | "authority_admin" }) {
  if (role === "citizen") return <span className="badge badge-blue">CITIZEN</span>;
  if (role === "authority_viewer")
    return (
      <span className="badge badge-blue">
        <span className="dot dot-blue" /> AUTHORITY - VIEWER
      </span>
    );
  return (
    <span className="badge badge-red">
      <span className="dot dot-red" /> {role === "authority_admin" ? "AUTHORITY - ADMIN" : "AUTHORITY - OFFICER"}
    </span>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { session, signOut } = useSession();
  const { lang, setLang, t } = useI18n();

  const authority = isAuthority(session);
  const operator = isCommand(session);
  const nav = !authority ? CITIZEN_NAV : operator ? AUTHORITY_NAV : ANALYST_NAV;
  const home = authority ? "/overview" : "/citizen";

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Link to={session ? home : "/"} className="brand" aria-label="VARUN-X home">
            <span className="brand-mark">
              <BrandMark />
            </span>
            <span>
              <div className="brand-name">VARUN-X</div>
              <div className="brand-sub">{t("brand_tagline")}</div>
            </span>
          </Link>
          <div className="topbar-right">
            <Link to="/system" className="btn btn-ghost btn-sm" aria-label="System status">
              <Icon name="server" size={14} />
              <span className="hide-sm">{t("system_status")}</span>
            </Link>
            <label className="lang-select">
              <span className="visually-hidden">{t("language")}</span>
              <select
                className="input"
                style={{ width: "auto", padding: "5px 28px 5px 8px", height: 30 }}
                value={lang}
                onChange={(e) => setLang(e.target.value as Lang)}
              >
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native}
                  </option>
                ))}
              </select>
            </label>
            {session ? (
              <div className="topbar-right" style={{ display: "contents" }}>
                <RoleBadge role={session.serverRole} />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    void signOut().then(() => navigate("/"));
                  }}
                >
                  <Icon name="lock" size={14} />
                  {t("sign_out")}
                </button>
              </div>
            ) : (
              <button className="btn btn-outline btn-sm" onClick={() => navigate("/")}>
                <Icon name="lock" size={14} />
                {t("authority_login")}
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="navbar" aria-label="Primary">
        <div className="wrap navbar-inner">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""} ${n.danger ? "danger" : ""}`
              }
            >
              <Icon name={n.icon} size={14} />
              {t(n.label)}
            </NavLink>
          ))}
        </div>
      </nav>

      <main className="main" id="main">
        <div className="wrap">{children}</div>
      </main>

      <footer className="footer">
        <div className="wrap">
          <div className="footer-grid">
            <div>
              <div className="brand" style={{ color: "var(--text)" }}>
                <BrandMark />
                <span>
                  <div className="brand-name">VARUN-X</div>
                  <div className="brand-sub">AI-POWERED EXTREME WEATHER INTELLIGENCE</div>
                </span>
              </div>
              <p className="muted small" style={{ marginTop: 14, maxWidth: 380 }}>
                Spatio-temporal forecast intelligence and disaster response. Detects extreme
                anomalies, tracks their evolution, refines high-risk regions, and delivers
                targeted warnings to authorities and communities.
              </p>
            </div>
            <div>
              <h4>Platform</h4>
              <ul>
                <li><Link to={authority ? "/overview" : "/citizen"}>{authority ? "Mission Control" : "Citizen Dashboard"}</Link></li>
                <li><Link to="/live">Live Intelligence</Link></li>
                <li><Link to="/forecasts">Forecasts</Link></li>
                <li><Link to="/alerts">Alerts</Link></li>
                <li><Link to="/tracking">GNN Tracking</Link></li>
                <li><Link to="/downscaling">Diffusion Downscaling</Link></li>
              </ul>
            </div>
            <div>
              <h4>Operations</h4>
              <ul>
                {operator && <li><Link to="/emergency">Emergency Response</Link></li>}
                <li><Link to="/incidents">Citizen Reports</Link></li>
                {operator && <li><Link to="/personnel">Personnel</Link></li>}
                {operator && <li><Link to="/resources">Resources</Link></li>}
                <li><Link to="/assistant">AI Assistant</Link></li>
                <li><Link to="/models">Data & Models</Link></li>
              </ul>
            </div>
            <div>
              <h4>Legal & Responsible AI</h4>
              <ul>
                <li><Link to="/privacy">Privacy Policy</Link></li>
                <li><Link to="/terms">Terms of Service</Link></li>
                <li><Link to="/responsible-ai">Responsible AI</Link></li>
                <li><Link to="/data-usage">Data Usage</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>VARUN-X · prototype build · {new Date().getFullYear()}</span>
            <span className="mono">REAL DATA · <span className="text-2">DEMO / SIMULATION LABELLED</span></span>
          </div>
        </div>
      </footer>
    </>
  );
}

export function BackLink() {
  const navigate = useNavigate();
  return (
    <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
      <Icon name="chevron" size={14} rotate={180} />
      Back
    </button>
  );
}