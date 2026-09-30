import { useEffect, useMemo, useState } from "react";
import { PageHead } from "../components/PageHead";
import { Panel, Badge, SectionHead, DataState } from "../components/primitives";
import { Icon } from "../components/Icon";
import { useWeather } from "../lib/useWeather";
import { fmtTime } from "../lib/format";
import { RISK_LABEL, useAnalysis } from "../lib/analysis";
import { isAuthority, useSession } from "../lib/session";
import { fetchOfficialAlerts, type OfficialAlertFeed } from "../lib/ops";

type AlertRow = {
  id: string;
  ts: number;
  severity: "green" | "blue" | "amber" | "red";
  origin: string;
  badge: "green" | "cyan" | "amber" | "red" | "blue" | "muted";
  title: string;
  confidence: string;
  sim?: boolean;
  ack: boolean;
};

const ORIGINS: Array<{ l: string; badge: "green" | "cyan" | "amber" | "blue" | "muted"; d: string }> = [
  { l: "LIVE WEATHER", badge: "green", d: "Real provider data (Open-Meteo)." },
  { l: "NWP FORECAST", badge: "blue", d: "Provider forecast triggers." },
  { l: "VARUN-X ANOMALY", badge: "amber", d: "Simulated model output." },
  { l: "GNN TRACK", badge: "amber", d: "Simulated model output." },
  { l: "DIFFUSION REFINEMENT", badge: "amber", d: "Simulated model output." },
  { l: "OFFICIAL ALERT", badge: "amber", d: "Only from a connected authority feed." },
  { l: "SIMULATION-DEMO DATA", badge: "muted", d: "Deterministic demo signals." },
];

const SEVERITY_LABEL: Record<string, string> = {
  green: "GREEN",
  blue: "BLUE",
  amber: "AMBER",
  red: "RED",
};

function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * Warnings published by the competent authority.
 *
 * Read from the server, which returns `UNAVAILABLE` with a reason when no
 * official feed is configured. No fallback row is ever synthesised: an
 * unconnected authority source is shown as unconnected, not as "all clear".
 */
function useOfficialFeed(enabled: boolean) {
  const [state, setState] = useState<{ loading: boolean; data: OfficialAlertFeed | null; error: string | null }>({
    loading: true,
    data: null,
    error: null,
  });
  useEffect(() => {
    if (!enabled) {
      setState({ loading: false, data: null, error: null });
      return;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    void fetchOfficialAlerts()
      .then((data) => {
        if (alive) setState({ loading: false, data, error: null });
      })
      .catch((e) => {
        if (alive) setState({ loading: false, data: null, error: e instanceof Error ? e.message : "request failed" });
      });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}

export function AlertsPage() {
  const { state, retry } = useWeather();
  const [acked, setAcked] = useState<Record<string, boolean>>({});
  const now = useNow();

    const { session } = useSession();
  const authorityRead = isAuthority(session);
  const official = useOfficialFeed(authorityRead);
  const { state: analysisState, reload: reloadAnalysis } = useAnalysis({
    lat: state.coords?.lat ?? null,
    lon: state.coords?.lon ?? null,
    place: state.place?.name ?? null,
    mode: state.mode,
    enabled: state.status === "ready" && !!state.coords,
  });

  function acknowledge(r: AlertRow) {
    if (acked[r.id]) return;
    setAcked((a) => ({ ...a, [r.id]: true }));
  }

  const liveRows: AlertRow[] = useMemo(() => {
    const rows: AlertRow[] = [];
    if (state.status !== "ready" || !state.data) return rows;
    const pop = Math.max(...state.data.hourly.precipitation_probability.slice(0, 6));
    const t = state.data.current;
    let idx = 0;
    if (pop >= 60) {
      rows.push({
        id: `LIVE-${idx++}`,
        ts: now,
        severity: "amber",
        origin: "LIVE WEATHER",
        badge: "green",
        title: `RAIN ADVISORY - ${pop}% POP IN NEXT 6 H`,
        confidence: "PROVIDER FORECAST",
        ack: false,
      });
    }
    if (t.temperature_2m >= 40) {
      rows.push({
        id: `LIVE-${idx++}`,
        ts: now,
        severity: "amber",
        origin: "LIVE WEATHER",
        badge: "green",
        title: "HEAT ADVISORY - TEMPERATURE AT THRESHOLD",
        confidence: "PROVIDER CURRENT",
        ack: false,
      });
    }
    if (t.wind_speed_10m >= 50) {
      rows.push({
        id: `LIVE-${idx++}`,
        ts: now,
        severity: "amber",
        origin: "LIVE WEATHER",
        badge: "green",
        title: "WIND ADVISORY - GUSTS AT THRESHOLD",
        confidence: "PROVIDER CURRENT",
        ack: false,
      });
    }
    if (rows.length === 0) {
      rows.push({
        id: "LIVE-0",
        ts: now,
        severity: "green",
        origin: "LIVE WEATHER",
        badge: "green",
        title: "NO ACTIVE WEATHER ALERT",
        confidence: "PROVIDER CURRENT",
        ack: false,
      });
    }
    return rows;
  }, [state, now]);

  const officialRows: AlertRow[] = useMemo(() => {
    const feed = official.data;
    if (!feed || feed.status !== "REAL" || !feed.alerts?.length) return [];
    return feed.alerts.map((a, i) => ({
      id: `OFFICIAL-${a.identifier ?? i}`,
      ts: a.issuedAt ?? now,
      severity: a.severity === "critical" ? ("red" as const) : a.severity === "major" ? ("amber" as const) : ("blue" as const),
      origin: "OFFICIAL ALERT",
      badge: "red" as const,
      title: a.headline || a.hazard,
      confidence: `${a.authority} · ${a.urgency}/${a.certainty}`.toUpperCase(),      ack: false,
    }));
  }, [official.data, now]);

  const modelRows: AlertRow[] = useMemo(() => {
    const analysis = analysisState.analysis;
    if (!analysis?.events.length) return [];
    const at = Math.floor(analysis.generatedAt / 1000);
    return analysis.events.map((ev, i) => ({
      id: `VARUNX-${i + 1}`,
      ts: at,
      severity: (ev.risk === "moderate" ? "blue" : ev.risk) as "green" | "blue" | "amber" | "red",
      origin:
        ev.hazard === "cyclone"
          ? "GNN TRACK"
          : ev.hazard === "heatwave"
            ? "DIFFUSION REFINEMENT"
            : "VARUN-X ANOMALY",
      badge: "amber" as const,
      title: `${ev.title.toUpperCase()} - ${ev.id} · ${ev.region} · ${RISK_LABEL[ev.risk]}`,
      confidence: `${(ev.confidence * 100).toFixed(0)}%`,
      sim: true,
      ack: false,
    }));
  }, [analysisState.analysis]);

  /**
   * The authority channel's real state.
   *
   * An unconnected feed is reported as unconnected with the reason the server
   * gave. It is never rendered as an absence of warnings, because "no feed
   * connected" and "no warnings in force" are different facts.
   */
  const officialPanel = !authorityRead ? (
    <DataState
      icon="lock"
      title="AUTHORITY FEED REQUIRES AUTHORITY ACCESS"
      desc="Official authority warnings are read through an authority-scoped server endpoint."
    />
  ) : official.loading ? (
    <DataState icon="siren" title="READING AUTHORITY FEED" desc="Requesting current official warnings from the server." />
  ) : official.error ? (
    <DataState icon="alert" title="AUTHORITY FEED UNREACHABLE" desc={official.error} />
  ) : official.data?.status === "REAL" ? (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row-line">
        <Badge tone="green" dot>{official.data.alerts?.length ?? 0} LIVE OFFICIAL WARNINGS</Badge>
        <span className="rl-s mono">{official.data.format}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        <span className="mono-val">{official.data.source}</span> — {official.data.note}
      </p>
      {official.data.scope && (
        <p className="small" style={{ margin: 0, color: "var(--amber)" }}>
          <strong>COVERAGE:</strong> {official.data.scope}. These warnings describe that area, not
          the region shown elsewhere in VARUN-X. Point the feed at your own authority to change it.
        </p>
      )}
    </div>
  ) : (
    <DataState
      icon="siren"
      title="OFFICIAL ALERT FEED NOT CONNECTED"
      desc={official.data?.reason ?? "No official authority feed is configured. Official alerts are never fabricated."}
    />
  );

  return (
    <div>
      <PageHead
        kicker="SMART ALERTS"
        title="Alert Stream"
        sub="Alerts are separated by origin. Live alerts derive from the live weather provider. Model outputs are simulated and labelled. Official authority alerts are shown only from a connected authority feed."
        right={<Badge tone="muted">SMART ALERTS</Badge>}
      />
      <section className="section">
        <Panel title="ALERT ORIGINS" meta="CATEGORY OF SOURCES" flush>
          <div className="list-2" style={{ padding: 12 }}>
            {ORIGINS.map((o) => (
              <div className="row-line" key={o.l}>
                <span className="rl-l">
                  <Badge tone={o.badge}>{o.l}</Badge>
                </span>
                <span className="rl-s">{o.d}</span>
              </div>
            ))}
          </div>
        </Panel>

        {state.status === "ready" && state.data || officialRows.length > 0 ? (
          <Panel
            title="ALERT REGISTRY"
            meta={
              <span className="mono">
                {state.place ? `${state.place.name}, ${state.place.state ?? ""}` : "NO LOCAL REGION"} · {fmtTime(now)}
              </span>
            }
            flush
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Severity</th>
                    <th>Origin</th>
                    <th>Title</th>
                    <th>Conf.</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...officialRows, ...liveRows, ...modelRows].map((r) => (
                    <tr key={r.id}>
                      <td className="mono-val">{fmtTime(r.ts)}</td>
                      <td>
                        <Badge tone={r.severity}>{SEVERITY_LABEL[r.severity]}</Badge>
                      </td>
                      <td>
                        <Badge tone={r.badge}>{r.origin}</Badge>
                      </td>
                      <td>
                        {r.title}
                        {r.sim && <span className="muted small mono" style={{ marginLeft: 6 }}>SIM</span>}
                      </td>
                      <td className="mono-val">{r.confidence}</td>
                      <td>
                        <Badge tone={acked[r.id] ? "blue" : "muted"}>
                          {acked[r.id] ? "ACKNOWLEDGED" : "OPEN"}
                        </Badge>
                      </td>
                      <td>
                        <button
                          className="btn btn-outline btn-sm"
                          disabled={acked[r.id]}
                          onClick={() => acknowledge(r)}
                        >
                          <Icon name="check" size={12} /> Acknowledge
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ padding: "6px 12px", margin: 0 }}>
              OFFICIAL ALERT rows come from the connected authority feed and are the only rows issued
              by an official body. LIVE rows are computed from real provider data at your location.
              VARUN-X rows are model output produced by the analysis service and are not official
              alerts.
            </p>
            <div className="row-line" style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
              <div className="rl-l">
                <Badge tone={analysisState.status === "ready" ? "cyan" : analysisState.status === "unavailable" ? "red" : "muted"} dot>
                  {analysisState.status === "ready" ? "VARUN-X ANALYSIS READY" : analysisState.status === "loading" ? "ANALYSIS RUNNING" : analysisState.status === "unavailable" ? "ANALYSIS UNAVAILABLE" : "ANALYSIS IDLE"}
                </Badge>
                <span className="rl-s">
                  {analysisState.status === "unavailable"
                    ? analysisState.error ?? "The analysis service did not respond. No model signal is shown in its place."
                    : analysisState.status === "ready" && !modelRows.length
                      ? "The analysis found no extreme object in the T-24h to T+72h window for this location."
                      : analysisState.status === "ready"
                        ? `Risk level ${RISK_LABEL[analysisState.analysis!.risk.level]} · tier ${analysisState.analysis!.risk.tier} · refreshed from the server.`
                        : "Run the VARUN-X analysis for this location."}
                </span>
              </div>
              {analysisState.status === "unavailable" && (
                <button className="btn btn-outline btn-sm" onClick={() => void reloadAnalysis()}>
                  <Icon name="refresh" size={12} /> Retry analysis
                </button>
              )}
            </div>
          </Panel>
        ) : state.status === "unavailable" || state.status === "geolocation-denied" || state.status === "geolocation-unavailable" ? (
          <Panel title="LIVE ALERTS">
            <DataState
              icon="alert"
              title="LIVE ALERTS UNAVAILABLE"
              desc="The live weather provider is unreachable for this session. Live alerts cannot be computed and are not fabricated."
              action={
                <button className="btn btn-primary" onClick={retry}>
                  <Icon name="refresh" size={14} /> Retry live data
                </button>
              }
            />
          </Panel>
        ) : (
          <Panel title="LIVE ALERTS">
            <DataState
              icon="locate"
              title="LIVE ALERTS PENDING LOCATION"
              desc="Allow location access or select a location on the Live page to enable live alert detection."
              action={
                <Icon name="locate" size={14} />
              }
            />
          </Panel>
        )}

        <div className="grid-2c" style={{ marginTop: 14 }}>
          <Panel
          title="OFFICIAL AUTHORITY ALERTS"
          meta={
            official.data?.status === "REAL" ? (
              <Badge tone="green" dot>FEED LIVE</Badge>
            ) : authorityRead ? (
              <Badge tone="muted">NO FEED</Badge>
            ) : undefined
          }
        >
          {officialPanel}
        </Panel>
          <Panel title="SEVERITY SCALE" meta="CONFIRMED BY AUTHORITY">
            <div className="stack">
              {(
                [
                  ["green", "GREEN - Normal conditions. No special action."],
                  ["blue", "BLUE - Watch. Be aware of developing conditions."],
                  ["amber", "AMBER - Alert. Prepare for possible action."],
                  ["red", "RED - Warning. Take protective action."],
                ] as Array<[AlertRow["severity"], string]>
              ).map(([t, d]) => (
                <div className="row-line" key={t}>
                  <Badge tone={t}>{SEVERITY_LABEL[t]}</Badge>
                  <span className="rl-s">{d}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <SectionHead
          num="// RULES"
          title="Severity and limits"
          sub="Live alerts use provider thresholds only. Confidence is disclosure, not verification."
        />
        <p className="small muted">
          The interface never escalates an alert beyond provider data. Official warning language and
          authority thresholds are applied only when an authority channel is connected.
        </p>
      </section>
    </div>
  );
}