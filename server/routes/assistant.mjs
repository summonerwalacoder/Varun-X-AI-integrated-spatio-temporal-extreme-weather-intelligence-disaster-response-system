import { requirePermission } from "../lib/auth.mjs";
import { bad, parseCoord } from "../lib/util.mjs";
import { answer, SUGGESTED_QUESTIONS } from "../services/assistant.mjs";
import { writeAudit } from "../lib/db.mjs";

export function register(router) {
  router.post("/api/assistant/ask", async (ctx) => {
    const user = requirePermission(ctx, "weather:read");
    const question = String(ctx.body.question ?? "").trim();
    if (!question) throw bad("EMPTY_QUESTION", "Type a question first");
    if (question.length > 600) throw bad("QUESTION_TOO_LONG", "Keep the question under 600 characters");
    const lat = parseCoord(ctx.body.lat, "lat");
    const lon = parseCoord(ctx.body.lon, "lon");
    const lang = String(ctx.body.lang ?? "en");
    // The service reads place.name / place.state, so accept either a place
    // object or a bare name paired with a separate state field.
    const raw = ctx.body.place;
    const name = raw && typeof raw === "object" ? raw.name : raw;
    const place = name
      ? {
          name: String(name).slice(0, 120),
          state: String((raw && typeof raw === "object" ? raw.state : ctx.body.state) ?? "").slice(0, 120),
        }
      : null;
    const reply = await answer({
      question,
      lat,
      lon,
      lang,
      place,
    });
    writeAudit({
      user: { id: user.id, label: user.name, role: user.role },
      action: "ASSISTANT_QUERY",
      scope: reply.kind,
      detail: question.slice(0, 160),
      result: reply.grounding?.liveWeather ? "GROUNDED_IN_LIVE_DATA" : "NO_LIVE_DATA",
      ip: ctx.req.socket?.remoteAddress,
    });
    return { reply, suggested: SUGGESTED_QUESTIONS };
  });
}
