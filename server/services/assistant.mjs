/**
 * VARUN-X assistant.
 *
 * The assistant is a deterministic, evidence-grounded responder. Every answer
 * quotes the live weather payload or the analysis payload it was built from.
 * It never invents a condition, a number, an alert or an event, and it
 * refuses cleanly when the supporting data is missing.
 */

import { fetchForecast, reverseGeocode } from "./weather.mjs";
import { getAnalysis } from "./intelligence.mjs";
import { wmoLabel } from "./codes.mjs";

const SAFETY = {
  flashflood: {
    en: [
      "Move to higher ground immediately and avoid low-lying roads.",
      "Do not walk or drive through flowing water. Turn Around, Do Not Drown.",
      "Keep emergency kit, medicines and important documents ready.",
      "Follow instructions issued by local disaster-management authorities.",
    ],
    hi: [
      "तुरंत ऊंची जगह पर जाएं और निचले इलाकों की सड़कों से बचें।",
      "बहते पानी में न चलें और न ही वाहन चलाएं।",
      "आपातकालीन किट, दवाइयां और जरूरी दस्तावेज तैयार रखें।",
      "स्थानीय आपदा प्रबंधन प्राधिकरण के निर्देशों का पालन करें।",
    ],
    hinglish: [
      "Turant unchi jagah par jaayein, neeche ke area ki sadak se bachein.",
      "Bhaate paani mein na chalen aur na gaadi chalayein.",
      "Emergency kit, dawaiyan aur zaroori dastavez saath rakhein.",
      "Local disaster management authority ke instruction follow karein.",
    ],
  },
  heat: {
    en: [
      "Drink water regularly through the day even if you do not feel thirsty.",
      "Avoid outdoor work during the hottest hours of the day.",
      "Keep roofs and cool rooms open at night for ventilation.",
      "Check on elderly, children and people with medical conditions.",
    ],
    hi: [
      "दिन भर नियमित पानी पीते रहें, भले ही प्यास न लगे।",
      "दिन के सबसे गर्म समय में बाहर के काम से बचें।",
      "रात में छतें और ठंडे कमरे खुले रखें।",
      "बुज़ुर्गों, बच्चों और बीमार लोगों की देखभाल करें।",
    ],
    hinglish: [
      "Din bhar paani peete rahein, chahe pyaas na lage.",
      "Din ke sabse gharme samay mein bahar ke kaam se bachein.",
      "Raat mein chhat aur thande kamre khule rakhein.",
      "Budhe, bachche aur bimar logon ki dekhbhal karein.",
    ],
  },
  cold: {
    en: [
      "Keep vulnerable people warm and away from draughts.",
      "Use insulated clothing and cover exposed limbs at night.",
      "Arrange heating for livestock where conditions allow.",
    ],
    hi: [
      "अधिक संवेदनशील लोगों को ठंड से बचाकर गर्म रखें।",
      "रात में गर्म कपड़े पहनें और खुले अंग ढकें।",
      "जहतु संभव हो पशुओं के लिए गर्मी की व्यवस्था करें।",
    ],
    hinglish: [
      "Kamzor logon ko thande se bachakar garm rakhein.",
      "Raat mein garm kapde pehnein.",
      "Jahan ho sake jaanwaron ke liye garmi ki vyavastha karein.",
    ],
  },
  wind: {
    en: [
      "Secure loose objects, hoardings and rooftop equipment.",
      "Stay away from trees, temporary structures and overhead lines.",
      "Suspend outdoor activity while the wind is strong.",
    ],
    hi: [
      "ढीली वस्तुओं, बोर्डों और छत के उपकरणों को सुरक्षित करें।",
      "पेड़ों, अस्थायी संरचनाओं और ऊपर की तारों से दूर रहें।",
      "तेज़ हवा के दौरान बाहरी गतिविधि रोकें।",
    ],
    hinglish: [
      "Loose cheezein, boards aur rooftop equipment secure karein.",
      "Ped, temporary structure aur overhead wires se door rahein.",
      "Tez hawa ke dauraan bahar ka kaam band karein.",
    ],
  },
  general: {
    en: [
      "Keep your emergency kit ready and keep your phone charged.",
      "Monitor verified updates from official sources.",
      "Follow instructions from competent local authorities over any app output.",
    ],
    hi: [
      "आपातकालीन किट तैयार रखें और फोन चार्ज रखें।",
      "आधिकारिक स्रोतों से सत्यापित अद्यतन देखते रहें।",
      "किसी भी ऐप के आउटपुट से अधिक स्थानीय प्राधिकरण के निर्देश मानें।",
    ],
    hinglish: [
      "Emergency kit ready rakhein aur phone charged rakhein.",
      "Official source se verified updates dekhte rahein.",
      "Kisi bhi app output se zyada local authority ka instruction maanein.",
    ],
  },
};

const REFUSAL = {
  en: "I do not have verified live data for this request. VARUN-X does not invent weather information.",
  hi: "इस अनुरोध के लिए मेरे पास सत्यापित लाइव डेटा नहीं है। VARUN-X मौसम की जानकारी नहीं गढ़ता करता।",
  hinglish: "Is request ke liye mere paas verified live data nahi hai. VARUN-X weather invent nahi karta.",
};

const NO_ALERT = {
  en: "NO ACTIVE WEATHER ALERT. No official alert feed is connected to VARUN-X, so the absence of an alert here does not mean an all-clear. Check your state disaster-management authority directly.",
  hi: "कोई सक्रिय मौसम चेतावनी नहीं। VARUN-X से कोई आधिकारिक चेतावनी फ़ीड जुड़ी नहीं है, इसलिए यहाँ चेतावनी न होने का अर्थ सुरक्षित स्थिति नहीं है। अपने राज्य आपदा प्रबंधन प्राधिकरण से सीधे जांचें।",
  hinglish: "Koi active weather alert nahi. VARUN-X se official alert feed connected nahi hai, isliye alert na hone ka matlab all-clear nahi. Apne state disaster management authority se seedha check karein.",
};

const EXPLANATIONS = {
  anomaly: {
    en: "A weather anomaly is a departure from the usual conditions for that place and time of year. VARUN-X compares the forecast against a climatological baseline and reports how unusual it is in standard deviations.",
    hi: "मौसम विषमता किसी स्थान और समय के सामान्य स्थितियों से अलग होना है। VARUN-X पूर्वानुमान की तुलना जलवायु आधार से करता है और मानक विचलन में असामान्यता बताता है।",
    hinglish: "Weather anomaly matlab kisi jagah aur samay ke aam conditions se difference. VARUN-X forecast ko climatology se compare karke standard deviation mein batata hai.",
  },
  efi: {
    en: "The Extremal Forecast Index estimates how likely an extreme threshold is to be exceeded. VARUN-X computes it from a simulated ensemble here, because no real ensemble feed is connected. Read it as a relative signal, not a probability of an official warning.",
    hi: "चरम पूर्वानुमान सूचकांक बताता है कि चरम सीमा पार होने की संभावना कितनी है। चूंकि वास्तविक एन्सेंबल फ़ीड जुड़ी नहीं है, VARUN-X इसे अनुकरणित एन्सेंबल से निकालता है। इसे सापेक्ष संकेत मानें, आधिकारिक चेतावनी की प्रायिकता नहीं।",
    hinglish: "EFI batata hai ki extreme threshold cross hone ki kitni sambhavna hai. Real ensemble feed connected na hone ki wajah se VARUN-X ise simulated ensemble se nikalta hai. Ise relative signal samjhein, official warning ki probability nahi.",
  },
  gnn: {
    en: "The graph tracker treats the forecast field as connected geographic nodes. Two rounds of neighbour message passing score every node, and the highest-scoring connected cluster is followed through time to give the trajectory and the footprint.",
    hi: "ग्राफ ट्रैकर पूर्वानुमान क्षेत्र को जुड़े हुए भौगोलिक नोड्स के रूप में देखता है। पड़ोसी संदेश आदान-प्रदान के दो चक्र हर नोड को अंक देते हैं, और सबसे अधिक अंक वाला समूह समय के साथ ट्रैक किया जाता है।",
    hinglish: "Graph tracker forecast field ko connected geographic nodes ki tarah dekhta hai. Do round ke neighbour message passing se har node score hota hai, aur sabse high-scoring cluster ko time ke saath track kiya jata hai.",
  },
  diffusion: {
    en: "Refinement only runs over the region the tracker flagged. The coarse 12 km field is upsampled, correlated fine-scale structure is added, and every draw is projected back onto physical constraints before the mean, probability and spread fields are published.",
    hi: "परिशोधन केवल ट्रैकर द्वारा चिन्हित क्षेत्र पर चलता है। 12 किमी क्षेत्र को बढ़ाया जाता है, सूक्ष्म पैमाने की संरचना जोड़ी जाती है, और प्रत्येक ड्रॉ को भौतिक बाधाओं पर वापस प्रक्षेपित किया जाता है।",
    hinglish: "Refinement sirf tracker ke flagged region par chalta hai. 12 km field upsample hota hai, fine-scale structure add hoti hai, aur har draw ko physical constraints par project kiya jata hai.",
  },
};

const FALLBACK = {
  en: "I can explain live conditions, forecast outlook, tracked anomalies, risk and safety actions for your location. Ask one of the suggested questions.",
  hi: "मैं आपके स्थान की लाइव स्थिति, पूर्वानुमान, ट्रैक की गई विषमता, जोखिम और सुरक्षा कार्रवाई बता सकता हूं। इनमें से कोई प्रश्न पूछें।",
  hinglish: "Main aapke location ki live condition, forecast, tracked anomaly, risk aur safety action bata sakta hoon. Inme se koi sawaal poochhein.",
};

function pickLanguage(lang) {
  if (lang === "hi" || lang === "hinglish") return lang;
  return "en";
}

function safetyFor(hazard, lang) {
  const key =
    hazard === "heatwave"
      ? "heat"
      : hazard === "coldwave"
        ? "cold"
        : hazard === "severe-storm"
          ? "wind"
          : hazard === "extreme-rainfall"
            ? "flashflood"
            : "general";
  return SAFETY[key][lang];
}

function fmtHour(ts, timezone) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone || undefined,
  }).format(new Date(ts * 1000));
}

function fmtDay(ts, timezone) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: timezone || undefined,
  }).format(new Date(ts * 1000));
}

function norm(q) {
  return String(q ?? "")
    .toLowerCase()
    // \p{M} keeps combining marks. Devanagari vowel signs are category Mc/Mn,
    // not \p{L}, so dropping them would silently destroy Hindi input.
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Intent selection.
 *
 * `strength` breaks ties between intents that all match a question. A question
 * naming one specific subject ("official alert", "risk level", "EFI") must not
 * be answered by a broad intent that merely noticed a common word like
 * "current" or "area".
 */
const SPECIFIC = 3;
const GENERAL = 2;

function pickIntent(q) {
  let best = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    if (!intent.match.test(q)) continue;
    const score = intent.strength ?? GENERAL;
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
    if (bestScore === SPECIFIC) break;
  }
  return best;
}

const INTENTS = [
  {
    id: "anomaly-explainer",
    strength: SPECIFIC,
    match: /(anomaly|vishmata|uddeshya)/,
    build: async (ctx) => ({
      kind: "explanation",
      text: EXPLANATIONS.anomaly[ctx.lang],
      sources: ["analysis.baseline"],
    }),
  },
  {
    id: "efi-explainer",
    strength: SPECIFIC,
    // Word-boundaried so it does not match the "efi" inside "refinement".
    match: /\befi\b|extremal forecast|extreme forecast index/,
    build: async (ctx) => ({
      kind: "explanation",
      text: EXPLANATIONS.efi[ctx.lang],
      sources: ["analysis.risk.efiPeak"],
    }),
  },
  {
    id: "gnn-explainer",
    strength: SPECIFIC,
    match: /(gnn|graph neural|kaise track|how.*track)/,
    build: async (ctx) => ({ kind: "explanation", text: EXPLANATIONS.gnn[ctx.lang], sources: ["analysis.events"] }),
  },
  {
    id: "diffusion-explainer",
    strength: SPECIFIC,
    match: /(diffusion|downscal|refine|refinement|5 km|5km)/,
    build: async (ctx) => ({
      kind: "explanation",
      text: EXPLANATIONS.diffusion[ctx.lang],
      sources: ["analysis.domain"],
    }),
  },
  {
    id: "safety",
    strength: SPECIFIC,
    match: /(kya kar[un]?e?|kya karu|what should i do|kya karna| precaution|सुरक्षा|\bsafe\b|bachao|bachana|what to do|how do i protect|क्या करना|करना चाहिए|बच)/,
    build: async (ctx) => {
      const hazard = ctx.analysis?.events?.[0]?.hazard ?? "general";
      const steps = safetyFor(hazard, ctx.lang);
      const head =
        hazard === "general"
          ? "General preparedness steps:"
          : `Steps for the currently tracked hazard (${hazard.replace("-", " ")}):`;
      return {
        kind: "safety",
        text: `${head}\n- ${steps.join("\n- ")}`,
        sources: ["analysis.events", "safety.playbook"],
      };
    },
  },
  {
    id: "live-now",
    match: /(abhi|right now|current(ly)?|present|meri jagah|my area|yahan|kya ho raha|kya chal raha|what is happening|what.s happening|अभी|मेरे क्षेत्र|मेरे इलाके)/,
    build: async (ctx) => {
      const w = ctx.weather;
      if (!w) return { kind: "refusal", text: REFUSAL[ctx.lang], sources: [] };
      const c = w.current;
      const place = ctx.place ? `${ctx.place.name}${ctx.place.state ? `, ${ctx.place.state}` : ""}` : "your location";
      const line =
        ctx.lang === "en"
          ? `At ${place} the provider model currently reports ${c.temperature_2m} degC, ${wmoLabel(c.weather_code).toLowerCase()}, wind ${c.wind_speed_10m} km/h from ${c.wind_direction_10m} deg, humidity ${c.relative_humidity_2m}%, pressure ${Math.round(c.pressure_msl)} hPa. Valid ${fmtHour(c.time, w.timezone)}.`
          : ctx.lang === "hi"
            ? `${place} पर प्रोवाइडर मॉडल वर्तमान में ${c.temperature_2m} डिग्री सेल्सियस, ${wmoLabel(c.weather_code)}, हवा ${c.wind_speed_10m} किमी/घंटा, नमी ${c.relative_humidity_2m}%, दबाव ${Math.round(c.pressure_msl)} hPa बताता है।`
            : `${place} par provider model abhi ${c.temperature_2m} degC, ${wmoLabel(c.weather_code).toLowerCase()}, wind ${c.wind_speed_10m} km/h, humidity ${c.relative_humidity_2m}%, pressure ${Math.round(c.pressure_msl)} hPa bata raha hai.`;
      return { kind: "observation", text: line, sources: ["weather.current"] };
    },
  },
  {
    id: "forecast",
    match: /(forecast|badlavne ka|pichhle|next.*hour|aage|kya hoga|what.*happen|expect|पूर्वानुमान|कल|अगले)/,
    build: async (ctx) => {
      const w = ctx.weather;
      if (!w) return { kind: "refusal", text: REFUSAL[ctx.lang], sources: [] };
      const idx = w.hourly.time.findIndex((t) => t >= Math.floor(Date.now() / 1000));
      const start = idx < 0 ? 0 : idx;
      const lines = [];
      for (let k = 0; k < 4; k++) {
        const i = start + k * 6;
        if (i >= w.hourly.time.length) break;
        lines.push(
          `${fmtDay(w.hourly.time[i], w.timezone)} ${fmtHour(w.hourly.time[i], w.timezone)} - ${w.hourly.temperature_2m[i]} degC, precip ${w.hourly.precipitation[i]} mm, probability ${w.hourly.precipitation_probability[i]}%, wind ${w.hourly.wind_speed_10m[i]} km/h`,
        );
      }
      const head =
        ctx.lang === "en"
          ? "Provider model forecast, 6-hour steps from now:"
          : ctx.lang === "hi"
            ? "प्रोवाइडर मॉडल पूर्वानुमान, अभी से 6 घंटे के अंतराल पर:"
            : "Provider model forecast, abhi se 6-ghante ke antal par:";
      return { kind: "forecast", text: `${head}\n- ${lines.join("\n- ")}`, sources: ["weather.hourly"] };
    },
  },
  {
    id: "rain-risk",
    strength: SPECIFIC,
    match: /(barish|rain|rainfall|heavy rain|baarish|मूसलाना|वर्षा|बारिश)/,
    build: async (ctx) => {
      const w = ctx.weather;
      const a = ctx.analysis;
      if (!w) return { kind: "refusal", text: REFUSAL[ctx.lang], sources: [] };
      const idx = w.hourly.time.findIndex((t) => t >= Math.floor(Date.now() / 1000));
      const start = idx < 0 ? 0 : idx;
      let total = 0;
      let maxProb = 0;
      for (let i = start; i < Math.min(start + 24, w.hourly.time.length); i++) {
        total += w.hourly.precipitation[i] ?? 0;
        maxProb = Math.max(maxProb, w.hourly.precipitation_probability[i] ?? 0);
      }
      const sev = a?.events?.[0]?.tier === "CLIMATOLOGICAL" ? "climatologically significant" : "not climatologically significant";
      const text =
        ctx.lang === "en"
          ? `Next 24 hours: model precipitation total ${total.toFixed(1)} mm, peak hourly probability ${maxProb}%. VARUN-X tracking for this window is ${sev}. Provider forecast only, not a verified warning.`
          : ctx.lang === "hi"
            ? `अगले 24 घंटे: मॉडल वर्षा कुल ${total.toFixed(1)} मिमी, अधिकतम घंटीय संभावना ${maxProb}%। इस अवधि के लिए VARUN-X ट्रैकिंग ${sev} है। यह केवल प्रदाता पूर्वानुमान है, सत्यापित चेतावनी नहीं।`
            : `Next 24 ghante: model precipitation total ${total.toFixed(1)} mm, peak hourly probability ${maxProb}%. VARUN-X tracking is ${sev} for this window. Ye sirf provider forecast hai, verified warning nahi.`;
      return { kind: "forecast", text, sources: ["weather.hourly", "analysis.events"] };
    },
  },
  {
    id: "risk",
    strength: SPECIFIC,
    match: /(risk|khatra|dar|danger|kitna severe|severity|जोखिम|खतरा)/,
    build: async (ctx) => {
      const a = ctx.analysis;
      if (!a) return { kind: "refusal", text: REFUSAL[ctx.lang], sources: [] };
      if (!a.events.length) {
        return {
          kind: "analysis",
          text:
            ctx.lang === "en"
              ? "No extreme object was detected in the 240 km analysis window around your location across T-24h to T+72h. Risk level reported as LOW. This is a model statement, not a guarantee of safe conditions."
              : ctx.lang === "hi"
                ? "आपके स्थान के आसपास 240 किमी विश्लेषण क्षेत्र में T-24h से T+72h तक कोई चरम वस्तु नहीं मिली। जोखिम स्तर LOW है। यह मॉडल का कथन है, सुरक्षा की गारंटी नहीं।"
                : "Aapke location ke aas paas 240 km analysis window mein T-24h se T+72h tak koi extreme object detect nahi hua. Risk level LOW hai. Ye model ka statement hai, guarantee nahi.",
          sources: ["analysis.risk"],
        };
      }
      const e = a.events[0];
      const text =
        ctx.lang === "en"
          ? `Tracked object ${e.title}. Risk ${e.risk.toUpperCase()}, detection tier ${e.tier}, peak severity ${e.peakIntensity} (1.0 equals the baseline 95th percentile), footprint ${e.areaKm2} km2, radius ${e.radiusKm} km, confidence ${e.confidence}. ${a.exposure.status === "UNAVAILABLE" ? "Exposure data is unavailable, so no population impact is stated." : ""}`
          : ctx.lang === "hi"
            ? `ट्रैक की गई वस्तु ${e.title}। जोखिम ${e.risk.toUpperCase()}, टियर ${e.tier}, अधिकतम गंभीरता ${e.peakIntensity} (1.0 = आधार का 95वाँ प्रतिशत), पदचिह्न ${e.areaKm2} वर्ग किमी, त्रिज्या ${e.radiusKm} किमी, आत्मविश्वास ${e.confidence}। जनसंख्या प्रभाव बताया नहीं गया क्योंकि एक्सपोज़र डेटा उपलब्ध नहीं है।`
            : `Tracked object ${e.title}. Risk ${e.risk.toUpperCase()}, tier ${e.tier}, peak severity ${e.peakIntensity} (1.0 = baseline 95th percentile), footprint ${e.areaKm2} km2, radius ${e.radiusKm} km, confidence ${e.confidence}. Population impact nahi bataya gaya kyunki exposure data unavailable hai.`;
      return { kind: "analysis", text, sources: ["analysis.events", "analysis.risk"] };
    },
  },
  {
    id: "alert",
    strength: SPECIFIC,
    match: /(alert|warning|chetan|चेतावनी|suraksha)/,
    build: async (ctx) => ({ kind: "alert", text: NO_ALERT[ctx.lang], sources: ["data_sources.official-alerts"] }),
  },
];

export async function answer({ question, lat, lon, lang, place }) {
  const language = pickLanguage(lang);
  const q = norm(question);
  if (!q) {
    return { kind: "fallback", text: FALLBACK[language], sources: [], lang: language };
  }

  const wantsHindi = lang === "hi" && /hindi|हिंदी|हिन्दी/.test(q);

  let weather = null;
  let analysis = null;
  const needWeather = INTENTS.some((i) => ["live-now", "forecast", "rain-risk"].includes(i.id) && i.match.test(q));
  const needAnalysis = INTENTS.some(
    (i) => ["risk", "safety", "rain-risk", "gnn-explainer", "diffusion-explainer", "efi-explainer", "anomaly-explainer"].includes(i.id) && i.match.test(q),
  );

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    if (needWeather) {
      try {
        weather = await fetchForecast(lat, lon);
      } catch {
        weather = null;
      }
    }
    if (needAnalysis) {
      try {
        analysis = await getAnalysis(lat, lon, place?.name ?? null);
      } catch {
        analysis = null;
      }
    }
  }

  const ctx = { lang: language, weather, analysis, place, lat, lon };
  // Intents backed by retrieved provider/analysis data outrank the static
  // explainers, so "what is happening in my area right now" answers from live
  // data instead of returning the anomaly explainer.
  const match = pickIntent(q);
  if (match) {
    const result = await match.build(ctx);
    return {
      ...result,
      place: place ? { name: place.name ?? null, state: place.state ?? null } : null,
      lang: wantsHindi ? "hi" : language,
      grounding: {
        liveWeather: !!weather,
        analysis: !!analysis,
        intent: match.id,
        note: weather
          ? "Live provider model output retrieved for this answer."
          : "No live provider output was used for this answer.",
      },
    };
  }

  // unknown question: still answer from real data when available, never guess
  let fallbackText = FALLBACK[language];
  if (Number.isFinite(lat) && Number.isFinite(lon) && !weather) {
    try {
      weather = await fetchForecast(lat, lon);
      const c = weather.current;
      fallbackText =
        language === "en"
          ? `I could not match that to a specific VARUN-X capability, but here is the live provider model output for your location: ${c.temperature_2m} degC, ${wmoLabel(c.weather_code).toLowerCase()}, wind ${c.wind_speed_10m} km/h, humidity ${c.relative_humidity_2m}%. Ask about alerts, anomalies, risk, safety or the forecast.`
          : language === "hi"
            ? `इस प्रश्न को मैं किसी विशेष VARUN-X क्षमता से नहीं जोड़ पाया, लेकिन आपके स्थान का लाइव प्रदाता आउटपुट है: ${c.temperature_2m} डिग्री सेल्सियस, ${wmoLabel(c.weather_code)}, हवा ${c.wind_speed_10m} किमी/घंटा, नमी ${c.relative_humidity_2m}%। चेतावनी, विषमता, जोखिम, सुरक्षा या पूर्वानुमान के बारे में पूछें।`
            : `Is sawaal ko main kisi specific VARUN-X capability se nahi jod paya, lekin aapke location ka live provider output hai: ${c.temperature_2m} degC, ${wmoLabel(c.weather_code).toLowerCase()}, wind ${c.wind_speed_10m} km/h, humidity ${c.relative_humidity_2m}%. Alert, anomaly, risk, safety ya forecast ke baare mein poochhein.`;
    } catch {
      fallbackText = REFUSAL[language];
    }
  }
  return {
    kind: "fallback",
    text: fallbackText,
    sources: weather ? ["weather.current"] : [],
    place: place ? { name: place.name ?? null, state: place.state ?? null } : null,
    lang: language,
    grounding: { liveWeather: !!weather, analysis: false, note: weather ? "Live provider model output retrieved." : "No live data available." },
  };
}

export const SUGGESTED_QUESTIONS = [
  { id: "q1", en: "What is happening in my area right now?", hi: "मेरे क्षेत्र में अभी क्या हो रहा है?", hinglish: "Mere area mein abhi kya ho raha hai?" },
  { id: "q2", en: "Is extreme rainfall expected in the next 24 hours?", hi: "क्या अगले 24 घंटों में चरम वर्षा की संभावना है?", hinglish: "Kya next 24 ghante mein extreme rainfall ka chance hai?" },
  { id: "q3", en: "What does a weather anomaly mean?", hi: "मौसम विषमता का क्या अर्थ है?", hinglish: "Weather anomaly ka kya matlab hai?" },
  { id: "q4", en: "What should I do during a flash flood?", hi: "फ्लैश बाढ़ के दौरान मुझे क्या करना चाहिए?", hinglish: "Flash flood mein mujhe kya karna chahiye?" },
  { id: "q5", en: "What is the current risk level and why?", hi: "वर्तमान जोखिम स्तर क्या है और क्यों?", hinglish: "Current risk level kya hai aur kyun?" },
  { id: "q6", en: "Explain the GNN tracking and diffusion refinement stages in simple words.", hi: "GNN ट्रैकिंग और डिफ्यूज़न रिफाइनमेंट को आसान भाषा में समझाइए।", hinglish: "GNN tracking aur diffusion refinement ko simple bhasha mein samjhao." },
  { id: "q7", en: "Is there any official weather alert for my area?", hi: "क्या मेरे क्षेत्र के लिए कोई आधिकारिक चेतावनी है?", hinglish: "Kya mere area ke liye koi official alert hai?" },
];
