import { Link } from "react-router-dom";
import { PageHead } from "../components/PageHead";
import { Panel, Badge, SectionHead, DataState } from "../components/primitives";
import { Icon } from "../components/Icon";
import { useWeather } from "../lib/useWeather";
import { wmo } from "../lib/weather";

const EMERGENCY_NUMBERS: Array<{ number: string; label: string; type: string }> = [
  { number: "112", label: "NATIONAL EMERGENCY NUMBER", type: "Police / Fire / Ambulance" },
  { number: "100", label: "POLICE", type: "Law enforcement" },
  { number: "101", label: "FIRE", type: "Fire and rescue" },
  { number: "102", label: "AMBULANCE", type: "Medical transport" },
  { number: "1078", label: "DISASTER HELPLINE", type: "State disaster management" },
];

const ACTIONS: Array<{ h: string; d: string }> = [
  {
    h: "DURING FLASH FLOOD / EXTREME RAIN",
    d: "Move to higher ground immediately. Never cross fast-moving or flooded water, even in a vehicle. Move important documents, livestock and valuable items to elevated locations. Follow official authority instructions on evacuation.",
  },
  {
    h: "DURING CYCLONE / SEVERE STORM",
    d: "Stay indoors away from windows. Store drinking water and essential supplies. If advised to evacuate, leave early with essential documents and medication. Avoid open fields and water bodies.",
  },
  {
    h: "DURING HEATWAVE",
    d: "Avoid direct sun during peak hours. Drink water regularly. Watch for dizziness, nausea or confusion and seek medical help if present. Never leave children or animals in parked vehicles.",
  },
  {
    h: "DURING COLD WAVE",
    d: "Layer clothing and stay indoors during peak cold. Ensure safe heating and ventilation. Check on elderly and vulnerable neighbours.",
  },
  {
    h: "ELECTRICAL FAILURE / SAFETY",
    d: "Report fallen or damaged power lines to the utility, never touch them. Assume any downed line is live. Use torchlight, not candles with exposed flame.",
  },
];

export function SafetyPage() {
  const { state } = useWeather();
  const ready = state.status === "ready" && !!state.data;

  return (
    <div>
      <PageHead
        kicker="SAFETY & HELP"
        title="Safety and emergency help"
        sub="General protective guidance is educational and follows standard public-safety practice. In an actual emergency, follow local authority instructions. Verify contact numbers locally before use."
        right={<Badge tone="red" dot>FOLLOW LOCAL AUTHORITY</Badge>}
      />

      <section className="section">
        <Panel title="IN AN EMERGENCY" meta="VARUN-X IS DECISION SUPPORT, NOT AN EMERGENCY SERVICE" flush>
          <div style={{ padding: 16, background: "rgba(217,92,92,0.08)" }}>
            <p style={{ margin: 0, fontFamily: "var(--mono)", letterSpacing: "0.06em", color: "var(--text)", fontSize: 13 }}>
              IN A DISASTER: FOLLOW LOCAL AUTHORITY INSTRUCTIONS FIRST. THE PROTOTYPE DOES NOT PLACE
              EMERGENCY CALLS OR DISPATCH RESCUERS.
            </p>
          </div>
        </Panel>

        <Panel title="EMERGENCY CONTACTS" meta="NATIONAL NUMBERS · VERIFY LOCAL NUMBERS BEFORE FIELD USE" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Service</th>
                  <th>Channel</th>
                </tr>
              </thead>
              <tbody>
                {EMERGENCY_NUMBERS.map((c) => (
                  <tr key={c.number}>
                    <td className="mono-val">{c.number}</td>
                    <td className="mono-val">{c.label}</td>
                    <td className="muted small">{c.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ padding: "6px 12px", margin: 0 }}>
            Local authority numbers must be verified before field use.
          </p>
        </Panel>
      </section>

      <section className="section">
        <SectionHead
          num="// GUIDANCE"
          title="Protective actions by hazard"
          sub="Generic public-safety guidance. It is not a verified advisory for any specific area unless backed by an official authority notice."
        />
        <div className="two-col">
          {ACTIONS.map((a, i) => (
            <Panel key={a.h} title={`${String(i + 1).padStart(2, "0")} · ${a.h}`}>
              <p className="small text-2" style={{ margin: 0, lineHeight: 1.6 }}>{a.d}</p>
            </Panel>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHead
          num="// LOCAL"
          title="Your area"
          sub={ready && state.place ? `Live provider data is loaded for ${state.place.name}${state.place.state ? `, ${state.place.state}` : ""}.` : "Load your location to see area-specific weather information."}
        />
        <div className="grid-2c">
          <Panel title="CURRENT CONDITIONS" meta="LIVE PROVIDER DATA">
            {ready && state.data ? (
              <div className="stack" style={{ gap: 8 }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 34, fontWeight: 700 }}>
                  {Math.round(state.data.current.temperature_2m)}
                  <span style={{ fontSize: 16, color: "var(--text-2)" }}>°C</span>
                  <span className="small muted" style={{ marginLeft: 10 }}>
                    {wmo(state.data.current.weather_code).label}
                  </span>
                </div>
                <p className="small muted" style={{ margin: 0 }}>
                  Weather information on this panel is real provider data for your selected location.
                </p>
              </div>
            ) : (
              <DataState
                icon="locate"
                title="LIVE DATA NOT LOADED"
                desc="Allow location access or select a location on the Live page."
              />
            )}
          </Panel>
          <div className="console-stack">
            <Panel title="AI DISASTER ASSISTANT">
              <p className="small muted" style={{ marginBottom: 12 }}>
                Ask what is happening in your area, what an anomaly means, or what to do during a flash
                flood. The assistant only uses available verified data and says so when data is missing.
              </p>
              <Link className="btn btn-primary" to="/assistant">
                <Icon name="chat" size={14} /> Ask VARUN-X AI
              </Link>
            </Panel>
            <Panel title="NEARBY SHELTERS AND SAFE ZONES">
              <DataState
                icon="pin"
                title="AWAITING AUTHORITY DATA"
                desc="Shelter and safe-zone locations are published only from a verified authority feed."
              />
            </Panel>
          </div>
        </div>
        <Panel title="ROAD CLOSURES" style={{ marginTop: 16 }} meta="VERIFIED DATA ONLY">
          <DataState
            icon="alert"
            title="NO VERIFIED ROAD CLOSURES"
            desc="Road closure information is displayed only when verified authority data is available."
          />
        </Panel>
      </section>

      <section className="section">
        <SectionHead num="// RULES" title="Information honesty" />
        <p className="small muted">
          This page never fabricates shelter locations, road closures, casualty figures or contact
          numbers. General guidance is educational; official instructions take precedence.
        </p>
      </section>
    </div>
  );
}