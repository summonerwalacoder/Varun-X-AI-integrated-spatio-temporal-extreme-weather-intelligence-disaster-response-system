export function fmtTime(t: number | string, tz?: string): string {
  const d = typeof t === "number" ? new Date(t * 1000) : new Date(t);
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz ?? undefined,
    hour12: false,
  })
    .format(d)
    .replace("24:", "00:");
}

export function fmtDate(t: number | string, tz?: string): string {
  const d = typeof t === "number" ? new Date(t * 1000) : new Date(t);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: tz ?? undefined,
  }).format(d);
}

export function fmtDay(dt: number, tz: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: tz,
  }).format(new Date(dt * 1000));
}

export function relativeAge(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function formatCoord(lat: number, lon: number): string {
  return `${lat.toFixed(4)}N / ${Math.abs(lon).toFixed(4)}E`;
}