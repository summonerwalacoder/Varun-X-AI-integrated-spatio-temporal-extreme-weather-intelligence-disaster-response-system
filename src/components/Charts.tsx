import {
  ResponsiveContainer,
  Line,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { WeatherResponse } from "../lib/weather";
import type { AnalysisEvent } from "../lib/analysis";
import { fmtTime } from "../lib/format";

const AXIS = {
  stroke: "#6F7A84",
  fontSize: 10.5,
  fontFamily: "'IBM Plex Mono', monospace",
} as const;

function TooltipDark({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 4, padding: "6px 10px" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ fontFamily: "var(--mono)", fontSize: 11, color: p.color ?? "var(--text-2)" }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

export function HourlyTempChart({ data }: { data: WeatherResponse }) {
  const rows = data.hourly.time.slice(0, 48).map((t, i) => ({
    time: fmtTime(t, data.timezone),
    temp: Math.round(data.hourly.temperature_2m[i]),
    prob: Math.round(data.hourly.precipitation_probability[i]),
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={rows} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="pop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4C8DFF" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#4C8DFF" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#21282f" strokeDasharray="3 3" />
        <XAxis dataKey="time" stroke={AXIS.stroke} fontSize={AXIS.fontSize} fontFamily={AXIS.fontFamily} interval={5} />
        <YAxis yAxisId="temp" stroke={AXIS.stroke} fontSize={AXIS.fontSize} fontFamily={AXIS.fontFamily} unit="°" domain={["auto", "auto"]} />
        <YAxis yAxisId="prob" orientation="right" stroke={AXIS.stroke} fontSize={AXIS.fontSize} fontFamily={AXIS.fontFamily} unit="%" domain={[0, 100]} width={44} />
        <Tooltip content={<TooltipDark />} />
        <Area yAxisId="prob" dataKey="prob" name="Rain prob" stroke="#4C8DFF" fill="url(#pop)" strokeWidth={1.4} />
        <Line yAxisId="temp" dataKey="temp" name="Temp °C" stroke="#42C6D9" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Intensity of a server-detected object across the frames it was actually
 * present in. No spread band is drawn: the prototype server returns no
 * per-frame uncertainty, and a band is never invented to fill the gap.
 */
export function RiskEvolutionChart({ event }: { event: AnalysisEvent }) {
  const rows = event.track.map((p) => ({
    time: p.tLabel,
    hours: p.hours,
    intensity: Math.round(p.intensity * 10) / 10,
  }));
  if (rows.length < 2) {
    return (
      <p className="small muted" style={{ padding: "18px 14px", margin: 0 }}>
        The server detected this object in {rows.length === 1 ? "one frame" : "no frames"}, so there
        is no evolution to plot. A trend line is not drawn for a single point.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={rows} margin={{ top: 6, right: 10, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E5A93D" stopOpacity={0.32} />
            <stop offset="100%" stopColor="#E5A93D" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#21282f" strokeDasharray="3 3" />
        <XAxis dataKey="time" stroke={AXIS.stroke} fontSize={AXIS.fontSize} fontFamily={AXIS.fontFamily} />
        <YAxis stroke={AXIS.stroke} fontSize={AXIS.fontSize} fontFamily={AXIS.fontFamily} />
        <Tooltip content={<TooltipDark />} />
        <Area dataKey="intensity" name="intensity" stroke="#D95C5C" strokeWidth={2.2} fill="url(#band)" dot={{ r: 3, fill: "#D95C5C", strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}