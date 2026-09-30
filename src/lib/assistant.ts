/* ============================================================
   VARUN-X assistant client (server-authoritative)

   Every reply is produced by the server's intent router, which
   decides what data to retrieve and refuses to answer when the
   required data is missing. The browser holds no canned answers,
   so a failure here can never be mistaken for a real answer.
   ============================================================ */

import { useCallback, useState } from "react";
import { api } from "./api";

export type AssistantKind =
  | "observation"
  | "forecast"
  | "analysis"
  | "safety"
  | "explanation"
  | "refusal"
  | "fallback";

export interface AssistantGrounding {
  liveWeather: boolean;
  analysis: boolean;
  intent?: string;
  note: string;
}

export interface AssistantReply {
  kind: AssistantKind;
  text: string;
  sources: string[];
  lang: "en" | "hi" | "hinglish";
  grounding?: AssistantGrounding;
}

export interface SuggestedQuestion {
  id: string;
  en: string;
  hi: string;
  hinglish: string;
}

export interface AskOptions {
  lat?: number | null;
  lon?: number | null;
  place?: { name?: string | null; state?: string | null } | null;
  lang?: AssistantReply["lang"];
}

export interface AskResult {
  reply: AssistantReply;
  suggested: SuggestedQuestion[];
}

export async function ask(question: string, opts: AskOptions = {}): Promise<AskResult> {
  return api<AskResult>("/api/assistant/ask", {
    method: "POST",
    body: {
      question,
      lat: opts.lat ?? null,
      lon: opts.lon ?? null,
      place: opts.place?.name ?? null,
      state: opts.place?.state ?? null,
      lang: opts.lang ?? "en",
    },
  });
}

/**
 * The suggestion chips are owned by the server's intent router, so the page
 * never authors its own examples and cannot drift from what is routed.
 */
export async function fetchSuggestions(signal?: AbortSignal): Promise<SuggestedQuestion[]> {
  const res = await api<{ questions: SuggestedQuestion[] }>("/api/system/suggested-questions", { signal });
  return res.questions ?? [];
}

/**
 * Renders the provenance of a reply. The distinction between live provider
 * data, model output and a refusal is the whole point of this panel, so it is
 * always shown rather than collapsed.
 */
export function sourceLine(reply: AssistantReply): string {
  const g = reply.grounding;
  if (reply.kind === "refusal") return "SOURCE: REQUIRED DATA UNAVAILABLE";
  if (!g) return `SOURCE: ${reply.sources?.join(", ") || "SERVER"}`;
  const parts: string[] = [];
  if (g.liveWeather) parts.push("LIVE PROVIDER");
  if (g.analysis) parts.push("VARUN-X ANALYSIS");
  if (!parts.length) return "SOURCE: STATIC KNOWLEDGE";
  return `SOURCE: ${parts.join(" + ")}${g.intent ? ` · ${g.intent.toUpperCase()}` : ""}`;
}

export function useAssistant() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (question: string, opts: AskOptions): Promise<AskResult | null> => {
    setPending(true);
    setError(null);
    try {
      return await ask(question, opts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The assistant service did not respond.");
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  return { send, pending, error };
}
