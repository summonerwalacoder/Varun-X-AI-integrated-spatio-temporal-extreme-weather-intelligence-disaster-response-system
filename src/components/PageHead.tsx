import type { ReactNode } from "react";

export function PageHead({
  kicker,
  title,
  sub,
  right,
}: {
  kicker: string;
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 22,
        paddingBottom: 18,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: 6,
          }}
        >
          {kicker}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "0.01em" }}>{title}</h1>
        {sub && <div style={{ marginTop: 6, color: "var(--text-2)", fontSize: 13.5, maxWidth: 760 }}>{sub}</div>}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}