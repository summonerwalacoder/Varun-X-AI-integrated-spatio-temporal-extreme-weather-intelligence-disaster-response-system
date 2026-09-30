import type { JSX } from "react";

export type IconName =
  | "radar"
  | "network"
  | "diffuse"
  | "graph"
  | "target"
  | "shield"
  | "siren"
  | "pin"
  | "search"
  | "locate"
  | "layers"
  | "play"
  | "pause"
  | "wave"
  | "grid"
  | "clock"
  | "signal"
  | "doc"
  | "lock"
  | "chevron"
  | "crosshair"
  | "drop"
  | "therm"
  | "wind"
  | "gauge"
  | "flag"
  | "people"
  | "truck"
  | "box"
  | "chat"
  | "data"
  | "server"
  | "alert"
  | "info"
  | "check"
  | "x"
  | "globe"
  | "plus"
  | "refresh"
  | "eye"
  | "home"
  | "ranks"
  | "phone"
  | "alpha"
  | "megaphone";

interface IIconProps {
  name: IconName;
  size?: number;
  className?: string;
  rotate?: number;
  "aria-hidden"?: boolean;
}

const PATHS: Record<IconName, JSX.Element> = {
  radar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" opacity="0.6" />
      <circle cx="12" cy="12" r="2.2" />
      <line x1="12" y1="12" x2="17.5" y2="6.5" />
    </>
  ),
  network: (
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="12" cy="18" r="2.4" />
      <line x1="8" y1="7" x2="11" y2="16.4" />
      <line x1="16" y1="7" x2="13" y2="16.4" />
      <line x1="8.4" y1="6" x2="15.6" y2="6" />
    </>
  ),
  diffuse: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="8" r="1.4" opacity="0.55" />
      <circle cx="14" cy="16" r="2.2" />
      <circle cx="7" cy="17" r="1.4" opacity="0.45" />
    </>
  ),
  graph: (
    <>
      <path d="M4 19L20 5" />
      <path d="M4 13A4.5 4.5 0 0 1 8.5 8.5" opacity="0.5" />
      <path d="M19 14a5 5 0 0 1-5 5" opacity="0.5" />
      <circle cx="8.5" cy="8.5" r="1.6" />
      <circle cx="14" cy="19" r="1.6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" opacity="0.7" />
      <circle cx="12" cy="12" r="1.2" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 2.6v5.2c0 4.6-3 7.9-7 9.7-4-1.8-7-5.1-7-9.7V5.6L12 3z" />
      <path d="M9 11.5l2.2 2.2L15 9.6" />
    </>
  ),
  siren: (
    <>
      <rect x="7" y="11" width="10" height="8" />
      <path d="M5.5 16.5v-3M18.5 16.5v-3M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx="12" cy="17.5" r="1" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.2-6.5-10a6.5 6.5 0 0 1 13 0c0 4.8-6.5 10-6.5 10z" />
      <circle cx="12" cy="10.6" r="2.2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <line x1="15" y1="15" x2="20.5" y2="20.5" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2" />
      <line x1="12" y1="1.5" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="22.5" y2="12" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" opacity="0.6" />
      <path d="M3 17l9 5 9-5" opacity="0.35" />
    </>
  ),
  play: <path d="M7 5l12 7-12 7V5z" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="3.6" height="14" rx="0.8" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="0.8" />
    </>
  ),
  wave: (
    <>
      <path d="M3 12c2.5-3 5-3 7.5 0s5 3 7.5 0 2.5-2 3-1.5" />
      <path d="M3 17c2.5-3 5-3 7.5 0s5 3 7.5 0 2.5-2 3-1.5" opacity="0.5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="0.8" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="0.8" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="0.8" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="0.8" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  signal: (
    <>
      <path d="M4 18V14" />
      <path d="M9 18V10" />
      <path d="M14 18V6" />
      <path d="M19 18V3" />
    </>
  ),
  doc: (
    <>
      <path d="M6 3h8l4 4v14H6V3z" />
      <path d="M14 3v4h4" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="1" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
      <circle cx="12" cy="15" r="1.3" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  crosshair: (
    <>
      <circle cx="12" cy="12" r="5.5" />
      <line x1="12" y1="1.5" x2="12" y2="6.5" />
      <line x1="12" y1="17.5" x2="12" y2="22.5" />
      <line x1="1.5" y1="12" x2="6.5" y2="12" />
      <line x1="17.5" y1="12" x2="22.5" y2="12" />
    </>
  ),
  drop: (
    <>
      <path d="M12 3.5c3.7 4.2 5.5 7.5 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 11 8.3 7.7 12 3.5z" />
    </>
  ),
  therm: (
    <>
      <path d="M10 13.5V6a2 2 0 0 1 4 0v7.5a4 4 0 1 1-4 0z" />
      <circle cx="12" cy="17" r="1.6" />
    </>
  ),
  wind: (
    <>
      <path d="M3 8h9.5a2.8 2.8 0 1 0-2.6-3.8" />
      <path d="M3 12h14.5a2.8 2.8 0 1 1-2.6 3.8" opacity="0.7" />
      <path d="M3 16h6" opacity="0.5" />
    </>
  ),
  gauge: (
    <>
      <path d="M4 18a9 9 0 0 1 16 0" />
      <line x1="12" y1="18" x2="12" y2="10" />
      <line x1="12" y1="10" x2="16" y2="12.5" />
      <path d="M4 18H2.8M21 18h1.2" opacity="0.5" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4h11l-2.5 3.5L17 11H6" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c.5-3.2 2.8-5 5.5-5s5 1.8 5.5 5" />
      <circle cx="17" cy="9.5" r="2.4" opacity="0.6" />
      <path d="M16.5 14.9c2.2.4 3.5 1.9 4 4.6" opacity="0.6" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h11v9H3z" />
      <path d="M14 9h4l3 3v3h-7" />
      <circle cx="7" cy="17" r="1.8" />
      <circle cx="17" cy="17" r="1.8" />
    </>
  ),
  box: (
    <>
      <path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </>
  ),
  chat: (
    <>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 4v-4a2 2 0 0 1-1-1.73V6z" />
      <line x1="8" y1="9" x2="16" y2="9" />
      <line x1="8" y1="12" x2="13" y2="12" />
    </>
  ),
  data: (
    <>
      <rect x="3" y="5" width="18" height="7" rx="1" />
      <rect x="3" y="14" width="18" height="7" rx="1" />
      <line x1="7" y1="8.5" x2="12" y2="8.5" />
      <line x1="7" y1="17.5" x2="10" y2="17.5" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="3.5" width="16" height="6" rx="1" />
      <rect x="4" y="14.5" width="16" height="6" rx="1" />
      <circle cx="7.5" cy="6.5" r="0.9" />
      <circle cx="7.5" cy="17.5" r="0.9" />
      <line x1="11" y1="6.5" x2="18" y2="6.5" />
      <line x1="11" y1="17.5" x2="15" y2="17.5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3L3 20h18L12 3z" />
      <line x1="12" y1="10" x2="12" y2="15" />
      <circle cx="12" cy="17.5" r="0.9" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="7.8" r="0.9" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5L19.5 6.5" />,
  x: (
    <>
      <path d="M6 6l12 12M18 6L6 18" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3.4 9h17.2M3.4 15h17.2" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 3.5V7h-3.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  home: (
    <>
      <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9z" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  ranks: (
    <>
      <path d="M3 18V6M8 18V9M13 18v-7M18 18v-4" />
    </>
  ),
  phone: (
    <>
      <path d="M6.5 3.5h3l1.5 5-2.2 1.7a13 13 0 0 0 4.5 4.5l1.7-2.2 5 1.5v3a2 2 0 0 1-2.2 2A15.8 15.8 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />
    </>
  ),
  alpha: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 16V8h7v8M8.5 12h7" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 10v4M6 8v8l5 2.5v-13L6 8z" />
      <path d="M11 10.5h9M19 7.5l1-2M19 13.5l1 2" />
    </>
  ),
};

export function Icon({ name, size = 18, className, rotate, ...rest }: IIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
      aria-hidden={rest["aria-hidden"] ?? true}
    >
      {PATHS[name]}
    </svg>
  );
}