import { useEffect, useRef, useState } from "react";
import { PageHead } from "../components/PageHead";
import { Panel, Badge } from "../components/primitives";
import { Icon } from "../components/Icon";
import { useWeather } from "../lib/useWeather";
import {
  fetchSuggestions,
  sourceLine,
  useAssistant,
  type AssistantReply,
  type SuggestedQuestion,
} from "../lib/assistant";

type Msg = {
  id: number;
  who: "user" | "bot";
  text: string;
  src?: string;
};

export function AssistantPage() {
  const weather = useWeather();
  const { send, pending, error } = useAssistant();
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 1,
      who: "bot",
      text: "VARUN-X AI assistant online. I answer from live provider data and labelled VARUN-X model output, and I say so explicitly when a required data source is unavailable. I never invent weather conditions, alerts or statistics.",
      src: "SOURCE: SYSTEM",
    },
  ]);
  // Suggestions come from the server intent router so the chips cannot drift
  // from what the assistant actually routes. Nothing is authored here.
  const [suggested, setSuggested] = useState<SuggestedQuestion[]>([]);
  const [input, setInput] = useState("");
  const [lang, setLang] = useState<AssistantReply["lang"]>("en");
  const logRef = useRef<HTMLDivElement>(null);
  const seq = useRef(2);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [msgs]);

  useEffect(() => {
    let alive = true;
    fetchSuggestions()
      .then((list) => {
        if (alive) setSuggested(list);
      })
      .catch(() => {
        // The chips are a convenience; the input box still works without them.
        if (alive) setSuggested([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const s = weather.state;
  const hasLive = s.status === "ready" && !!s.coords;

  async function send2(q: string) {
    const question = q.trim();
    if (!question || pending) return;
    const id = (seq.current += 2);
    setMsgs((m) => [...m, { id: id - 1, who: "user", text: question }]);
    setInput("");

    const result = await send(question, {
      lat: s.coords?.lat ?? null,
      lon: s.coords?.lon ?? null,
      place: s.place,
      lang,
    });

    if (!result) {
      setMsgs((m) => [
        ...m,
        {
          id,
          who: "bot",
          text: "The VARUN-X assistant service could not be reached, so I have no answer for you. I will not substitute a stored response.",
          src: "SOURCE: ASSISTANT SERVICE UNREACHABLE",
        },
      ]);
      return;
    }
    if (result.suggested?.length) setSuggested(result.suggested);
    setMsgs((m) => [
      ...m,
      { id, who: "bot", text: result.reply.text, src: sourceLine(result.reply) },
    ]);
  }

  return (
    <div>
      <PageHead
        kicker="AI DISASTER ASSISTANT"
        title="VARUN-X AI"
        sub="Weather and disaster information assistant grounded in available verified system data. When data is unavailable it says so."
        right={<Badge tone="muted">DECISION SUPPORT ONLY</Badge>}
      />
      <div className="grid-2c">
        <Panel
          title="CONVERSATION"
          meta={
            hasLive ? (
              <span className="mono">LIVE DATA: CONNECTED · {s.coords!.lat.toFixed(2)}, {s.coords!.lon.toFixed(2)}</span>
            ) : s.status === "unavailable" ? (
              <span className="mono" style={{ color: "var(--amber)" }}>LIVE DATA: UNAVAILABLE</span>
            ) : (
              <span className="mono">LIVE DATA: NOT REQUESTED</span>
            )
          }
          flush
        >
          <div className="chat" ref={logRef} style={{ padding: 14, maxHeight: 520, overflowY: "auto" }}>
            {msgs.map((m) => (
              <div key={m.id} className={`msg ${m.who}`}>
                {m.text}
                {m.src && <span className="src">{m.src}</span>}
              </div>
            ))}
            {pending && <div className="msg bot pulse">Consulting the VARUN-X data services…</div>}
          </div>
          {error && (
            <div className="small" style={{ padding: "0 12px 8px", color: "var(--red)" }}>
              {error}
            </div>
          )}
          <div style={{ borderTop: "1px solid var(--border-soft)", padding: 12, display: "flex", gap: 8 }}>
            <select
              className="select"
              value={lang}
              onChange={(e) => setLang(e.target.value as AssistantReply["lang"])}
              aria-label="Reply language"
              style={{ maxWidth: 130 }}
            >
              <option value="en">English</option>
              <option value="hinglish">Hinglish</option>
              <option value="hi">हिन्दी</option>
            </select>
            <input
              className="input"
              placeholder="Ask about weather, anomaly, risk, precautions..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void send2(input);
              }}
              aria-label="Message"
            />
            <button className="btn btn-primary" onClick={() => void send2(input)} disabled={pending || !input.trim()}>
              <Icon name="chat" size={14} /> Send
            </button>
          </div>
        </Panel>

        <div className="console-stack">
          <Panel title="SUGGESTED QUESTIONS" meta="FROM THE SERVER INTENT ROUTER">
            <div className="stack" style={{ gap: 8 }}>
              {suggested.map((sq) => {
                const text = sq[lang] || sq.en;
                return (
                  <button key={sq.id} className="suggestion" onClick={() => void send2(text)} disabled={pending}>
                    {text}
                  </button>
                );
              })}
            </div>
          </Panel>
          <Panel title="CAPABILITIES">
            <div className="list-2">
              {["Explain anomalies", "Explain risk", "Location-specific answers", "Precautions", "Summarise forecasts", "Answer in English, Hindi or Hinglish", "Plain-language science"].map((c) => (
                <div key={c} className="row-line" style={{ padding: "6px 0" }}>
                  <span className="rl-s" style={{ color: "var(--text-2)" }}>{c}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="GUARDRAILS">
            <p className="small muted" style={{ margin: 0 }}>
              Never invent weather conditions, casualty numbers, government information or model
              predictions. Simulation is always labelled. Official instructions take precedence
              over assistant output.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}