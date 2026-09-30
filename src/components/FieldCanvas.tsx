import { useEffect, useRef } from "react";
import type { Field, FieldKind } from "../lib/analysis";
import { normField, PALETTE, rampColor } from "../lib/fields";

export function FieldCanvas({
  field,
  width = 520,
  height = 360,
  label,
}: {
  field: Field;
  width?: number;
  height?: number;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cnv = ref.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d");
    if (!ctx) return;
    const norm = normField(field);
    const img = ctx.createImageData(width, height);
    const pal = PALETTE[field.kind] ?? PALETTE.risk;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = Math.min(norm.w - 1, Math.floor((x / width) * norm.w));
        const sy = Math.min(norm.h - 1, Math.floor((y / height) * norm.h));
        const v = norm.data[sy * norm.w + sx];
        const i = (y * width + x) * 4;
        if (v <= 0.01) {
          img.data[i + 3] = 0;
          continue;
        }
        const [r, g, b] = rampColor(field.kind, v);
        const a = Math.min(1, pal.aBase + v * pal.aMax);
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [field, width, height]);

  return (
    <div className="canvas-frame" style={{ position: "relative" }}>
      <canvas ref={ref} width={width} height={height} className="canvas-frame" aria-label={label} role="img" />
      {label && (
        <span className="compare-label" style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(11,13,15,0.85)", border: "1px solid var(--border)", borderRadius: 3, padding: "4px 8px", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-2)" }}>
          {label}
        </span>
      )}
    </div>
  );
}

export function LegendRamp({
  kind,
  labels,
  className = "",
}: {
  kind: FieldKind;
  labels: string[];
  className?: string;
}) {
  const stops = PALETTE[kind].stops;
  const grad = `linear-gradient(90deg, ${stops
    .map(
      ([p, [r, g, b]]) =>
        `rgba(${r},${g},${b},1) ${Math.round(p * 100)}%`,
    )
    .join(", ")})`;
  return (
    <div className={className} style={{ fontSize: 10.5, fontFamily: "var(--mono)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)" }}>
      <div style={{ height: 8, borderRadius: 2, background: grad, marginBottom: 6 }} />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}