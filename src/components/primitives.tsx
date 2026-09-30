import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";
import type { RiskLevel } from "../lib/analysis";

export function Panel({
  title,
  meta,
  children,
  className = "",
  flush,
  style,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className={`panel ${className}`} style={style}>
      {(title || meta) && (
        <div className="panel-h">
          <span className="pt">{title}</span>
          {meta && <span className="pm">{meta}</span>}
        </div>
      )}
      <div className={flush ? "panel-b flush" : "panel-b"}>{children}</div>
    </section>
  );
}

export function SectionHead({
  num,
  title,
  sub,
  right,
}: {
  num?: string;
  title: string;
  sub?: string;
  /** Optional badge or status slot on the right of the heading. */
  right?: ReactNode;
}) {
  return (
    <div className="section-head">
      {num && <span className="section-num">{num}</span>}
      <div>
        <h2 className="section-title">{title}</h2>
        {sub && <p className="section-sub">{sub}</p>}
      </div>
      {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}

export function Badge({
  tone,
  children,
  dot,
}: {
  tone: "blue" | "cyan" | "amber" | "red" | "green" | "muted";
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className={`dot dot-${tone === "muted" ? "muted" : tone}`} />}
      {children}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  const tone: Record<RiskLevel, "green" | "blue" | "amber" | "red"> = {
    low: "green",
    moderate: "blue",
    high: "amber",
    critical: "red",
  };
  return <Badge tone={tone[risk]}>{risk.toUpperCase()}</Badge>;
}

export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: string;
}) {
  return (
    <div className="metric">
      <div className="m-label">{label}</div>
      <div className="m-value">{value}</div>
      {note && <div className="m-note">{note}</div>}
    </div>
  );
}

export function KV({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DataState({
  icon,
  title,
  desc,
  action,
}: {
  icon?: IconName;
  title: string;
  desc: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="data-state" role="status">
      {icon && <Icon name={icon} size={30} className="muted" />}
      <div className="ds-title">{title}</div>
      {desc && <div className="ds-desc">{desc}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

export function Legend({ items }: { items: Array<{ c: string; l: string }> }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span className="li" key={it.l}>
          <span className="sw" style={{ background: it.c }} />
          {it.l}
        </span>
      ))}
    </div>
  );
}

export function StatusDot({ color }: { color: string }) {
  return <span className={`dot dot-${color}`} aria-hidden />;
}

export function BadgeMono({ text, tone = "muted" }: { text: string; tone?: "blue" | "cyan" | "amber" | "red" | "green" | "muted" }) {
  return <Badge tone={tone}>{text}</Badge>;
}