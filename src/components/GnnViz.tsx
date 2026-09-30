import { useEffect, useRef } from "react";
import { normField } from "../lib/fields";
import type { Field } from "../lib/analysis";
import { Legend } from "./primitives";

/** Minimal shape the graph needs from a server event. */
export interface MapTrackLike {
  id: string;
  track: { tLabel: string; hours: number; lat: number; lon: number; intensity: number }[];
}

function valColor(v: number) {
  if (v > 0.72) return "rgba(217,92,92,0.95)";
  if (v > 0.42) return "rgba(229,169,61,0.95)";
  if (v > 0.18) return "rgba(76,141,255,0.85)";
  return "rgba(66,198,217,0.6)";
}

/**
 * Renders the server's field for the selected frame as a graph of
 * geographically-ordered nodes with neighbour edges, plus the detected
 * object and its step-to-step motion. Purely a view of the grid the
 * server returned: no field is generated here.
 */
export function GnnViz({
  field: rawField,
  event,
  frameLabel,
  timeIdx,
  width = 560,
  height = 380,
}: {
  /** Server grid for the selected frame; null draws an explicit empty state. */
  field: Field | null;
  /** Minimal shape needed to draw the object marker and motion arrow. */
  event: MapTrackLike | null;
  frameLabel: string;
  timeIdx: number;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const field = rawField ? normField(rawField) : null;

  useEffect(() => {
    const cnv = ref.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d");
    if (!ctx) return;
    const W = width;
    const H = height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f1215";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(154,164,173,0.75)";
    ctx.font = "10px 'IBM Plex Mono', monospace";

    if (!field) {
      // No grid for this frame: say so on the canvas rather than drawing an
      // empty graph that reads as "nothing was detected".
      ctx.fillText("NO FIELD FOR THIS FRAME", 10, 18);
      ctx.fillText(`TIME ${frameLabel}`, 10, 32);
      return;
    }

    const xf = (lon: number) => ((lon - field.lonMin) / (field.lonMax - field.lonMin)) * W;
    const yf = (lat: number) => (1 - (lat - field.latMin) / (field.latMax - field.latMin)) * H;

    const step = 4;
    const cols = Math.floor(field.w / step);
    const rows = Math.floor(field.h / step);

    const nodes: Array<{ x: number; y: number; v: number }> = [];
    let maxV = 0;
    let maxX = 0;
    let maxY = 0;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const ci = i * step;
        const cj = j * step;
        const lon = field.lonMin + (ci / field.w) * (field.lonMax - field.lonMin);
        const lat = field.latMax - ((cj + 1) / field.h) * (field.latMax - field.latMin);
        const v = field.data[(cj + 1) * field.w + ci];
        const x = xf(lon);
        const y = yf(lat);
        nodes.push({ x, y, v });
        if (v > maxV) {
          maxV = v;
          maxX = x;
          maxY = y;
        }
      }
    }

    // faint grid
    ctx.strokeStyle = "rgba(42,49,56,0.5)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * W;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      const y = (i / 8) * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // edges between neighbours
    ctx.lineWidth = 1;
    for (const n of nodes) {
      if (n.v < 0.08) continue;
      const nn = nodes.find(
        (m) => m !== n && Math.hypot(m.x - n.x, m.y - n.y) < 30 && m.v > 0.08,
      );
      if (!nn) continue;
      ctx.strokeStyle = `rgba(66,198,217,${0.12 + n.v * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(n.x, n.y);
      ctx.lineTo(nn.x, nn.y);
      ctx.stroke();
    }

    // nodes
    for (const n of nodes) {
      if (n.v < 0.04) continue;
      const r = Math.max(1.5, 2 + n.v * 5);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = valColor(n.v);
      ctx.fill();
    }

    // extreme-object cluster highlight
    ctx.strokeStyle = "rgba(217,92,92,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(maxX, maxY, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(maxX - 34, maxY);
    ctx.lineTo(maxX - 12, maxY);
    ctx.moveTo(maxX + 12, maxY);
    ctx.lineTo(maxX + 34, maxY);
    ctx.moveTo(maxX, maxY - 34);
    ctx.lineTo(maxX, maxY - 12);
    ctx.moveTo(maxX, maxY + 12);
    ctx.lineTo(maxX, maxY + 34);
    ctx.stroke();

    // motion arrow from previous step
    const at = timeIdx < 0 ? (event?.track.length ?? 0) - 1 : timeIdx;
    if (event && at > 0) {
      const prev = event.track[at - 1];
      const cur = event.track[at];
      if (prev && cur) {
        const ox = xf(prev.lon);
        const oy = yf(prev.lat);
        const tx = xf(cur.lon);
        const ty = yf(cur.lat);
        const ang = Math.atan2(ty - oy, tx - ox);
        ctx.strokeStyle = "rgba(229,169,61,0.9)";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(ox - Math.cos(ang) * 12, oy - Math.sin(ang) * 12);
        ctx.lineTo(tx - Math.cos(ang) * 5, ty - Math.sin(ang) * 5);
        ctx.stroke();
        const a1 = ang + Math.PI - 0.45;
        const a2 = ang + Math.PI + 0.45;
        ctx.beginPath();
        ctx.moveTo(tx - Math.cos(ang) * 5, ty - Math.sin(ang) * 5);
        ctx.lineTo(tx + Math.cos(a1) * 9, ty + Math.sin(a1) * 9);
        ctx.moveTo(tx - Math.cos(ang) * 5, ty - Math.sin(ang) * 5);
        ctx.lineTo(tx + Math.cos(a2) * 9, ty + Math.sin(a2) * 9);
        ctx.stroke();
        ctx.fillStyle = "rgba(229,169,61,0.95)";
        ctx.font = "10px 'IBM Plex Mono', monospace";
        ctx.fillText("MOTION", tx + 8, ty - 10);
      }
    }

    ctx.fillStyle = "rgba(154,164,173,0.75)";
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillText(event?.id ?? "NO OBJECT", 10, 18);
    ctx.fillText("NODES " + nodes.length, 10, 32);
    ctx.fillText("TIME " + frameLabel, 10, 46);
  }, [field, event, frameLabel, timeIdx, width, height]);

  return (
    <div>
      <canvas ref={ref} width={width} height={height} className="canvas-frame" aria-label="GNN graph visualization" role="img" />
      <div style={{ marginTop: 10 }}>
        <Legend
          items={[
            { c: "rgba(66,198,217,0.7)", l: "NORMAL" },
            { c: "rgba(76,141,255,0.85)", l: "ELEVATED" },
            { c: "rgba(229,169,61,0.9)", l: "HIGH" },
            { c: "rgba(217,92,92,0.95)", l: "EXTREME" },
          ]}
        />
      </div>
    </div>
  );
}