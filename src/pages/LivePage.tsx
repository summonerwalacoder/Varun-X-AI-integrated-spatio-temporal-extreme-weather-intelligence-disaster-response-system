import { PageHead } from "../components/PageHead";
import { LiveWeatherPanel } from "../components/LiveWeatherPanel";
import { Badge } from "../components/primitives";

type Tone = "blue" | "cyan" | "amber" | "red" | "green" | "muted";

const DISTINCTION: Array<[string, Tone, string]> = [
  ["LIVE WEATHER", "green", "Real-time current conditions and provider forecast for your detected location."],
  ["NWP FORECAST", "blue", "Provider numerical weather prediction output made available to the intelligence chain."],
  ["VARUN-X ANOMALY", "amber", "Deviation against climatological baseline. Simulated unless a production engine is connected."],
  ["GNN TRACK", "muted", "AI-detected spatial and temporal evolution. Simulated in this prototype."],
  ["DIFFUSION REFINEMENT", "muted", "High-resolution model output. Simulated in this prototype."],
  ["OFFICIAL ALERT", "green", "Verified alert from an authoritative source. Feed not connected; none are shown."],
  ["SIMULATION / DEMO DATA", "amber", "Clearly labelled demonstration fields, never mixed with live weather."],
] as const;

export function LivePage() {
  return (
    <div>
      <PageHead
        kicker="LIVE INTELLIGENCE"
        title="Live Weather for Your Location"
        sub={
          <>
            VARUN-X bridges real observations with the AI intelligence chain while keeping them
            clearly separated. If the live provider is unreachable the page shows an unavailable
            state - it never substitutes fabricated weather.
          </>
        }
      />
      <div className="stack" style={{ gap: 8, marginBottom: 16 }}>
        {DISTINCTION.map(([lbl, tone, desc]) => (
          <div className="row-line" key={lbl}>
            <Badge tone={tone} dot>{lbl}</Badge>
            <span className="rl-s">{desc}</span>
          </div>
        ))}
      </div>
      <LiveWeatherPanel />
    </div>
  );
}