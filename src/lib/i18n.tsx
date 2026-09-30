import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "en" | "hi" | "hinglish";

const D: Record<string, Record<Lang, string>> = {
  /* ---- brand / chrome ---- */
  brand_tagline: {
    en: "AI WEATHER INTELLIGENCE",
    hi: "एआई मौसम इंटेलिजेंस",
    hinglish: "AI weather intelligence",
  },
  language: { en: "Language", hi: "भाषा", hinglish: "Language" },
  system_status: { en: "System Status", hi: "सिस्टम स्थिति", hinglish: "System status" },
  sign_out: { en: "Sign out", hi: "साइन आउट", hinglish: "Sign out" },
  public_view: { en: "PUBLIC VIEW", hi: "सार्वजनिक दृश्य", hinglish: "Public view" },
  citizen_view: { en: "CITIZEN VIEW", hi: "नागरिक दृश्य", hinglish: "Citizen view" },
  authority_readonly: { en: "AUTHORITY - READ-ONLY", hi: "प्राधिकरण - केवल पढ़ें", hinglish: "Authority - read-only" },
  authority_command: { en: "AUTHORITY - COMMAND", hi: "प्राधिकरण - नियंत्रण", hinglish: "Authority - command" },
  authority_login: { en: "Authority Login", hi: "प्राधिकरण लॉगिन", hinglish: "Authority login" },

  /* ---- navigation ---- */
  overview: { en: "Mission Control", hi: "मिशन नियंत्रण", hinglish: "Mission control" },
  dashboard: { en: "Dashboard", hi: "डैशबोर्ड", hinglish: "Dashboard" },
  live_weather: { en: "Live Weather", hi: "लाइव मौसम", hinglish: "Live weather" },
  forecast: { en: "Forecast", hi: "पूर्वानुमान", hinglish: "Forecast" },
  anomalies: { en: "Anomalies", hi: "विसंगतियाँ", hinglish: "Anomalies" },
  tracking: { en: "Tracking", hi: "ट्रैकिंग", hinglish: "Tracking" },
  downscaling: { en: "Downscaling", hi: "डाउनस्केलिंग", hinglish: "Downscaling" },
  risk: { en: "Risk", hi: "जोखिम", hinglish: "Risk" },
  alerts: { en: "Alerts", hi: "अलर्ट", hinglish: "Alerts" },
  safety: { en: "Safety & Help", hi: "सुरक्षा और सहायता", hinglish: "Safety & help" },
  emergency: { en: "Emergency Response", hi: "आपातकालीन प्रतिक्रिया", hinglish: "Emergency response" },
  broadcast: { en: "Broadcast", hi: "प्रसारण", hinglish: "Broadcast" },
  incidents: { en: "Incidents", hi: "घटनाएँ", hinglish: "Incidents" },
  report: { en: "Report", hi: "रिपोर्ट करें", hinglish: "Report" },
  personnel: { en: "Personnel", hi: "कर्मी", hinglish: "Personnel" },
  resources: { en: "Resources", hi: "संसाधन", hinglish: "Resources" },
  assistant: { en: "AI Assistant", hi: "एआई सहायक", hinglish: "AI assistant" },
  models: { en: "Data & Models", hi: "डेटा और मॉडल", hinglish: "Data & models" },
  system: { en: "System", hi: "सिस्टम", hinglish: "System" },

  /* ---- citizen dashboard ---- */
  citizen_dashboard: { en: "Citizen Dashboard", hi: "नागरिक डैशबोर्ड", hinglish: "Citizen dashboard" },
  weather_for_your_area: {
    en: "Live weather for your area",
    hi: "आपके क्षेत्र का लाइव मौसम",
    hinglish: "Live weather for your area",
  },
  current_location: { en: "CURRENT LOCATION", hi: "वर्तमान स्थान", hinglish: "Current location" },
  selected_location: { en: "SELECTED LOCATION", hi: "चयनित स्थान", hinglish: "Selected location" },
  use_my_location: { en: "Use My Location", hi: "मेरा स्थान उपयोग करें", hinglish: "Use my location" },
  select_location: { en: "Select Location Manually", hi: "स्थान मैन्युअल चुनें", hinglish: "Select location manually" },
  live_weather_unavailable: {
    en: "WEATHER DATA UNAVAILABLE",
    hi: "मौसम डेटा अनुपलब्ध",
    hinglish: "Weather data unavailable",
  },
  alerts_priority: {
    en: "Alerts for your area",
    hi: "आपके क्षेत्र के अलर्ट",
    hinglish: "Alerts for your area",
  },
  hazard_map: { en: "Hazard map", hi: "खतरा नक्शा", hinglish: "Hazard map" },
  report_incident: { en: "Report an incident", hi: "घटना की रिपोर्ट करें", hinglish: "Report an incident" },
  emergency_help: { en: "Emergency help", hi: "आपातकालीन सहायता", hinglish: "Emergency help" },
  safety_guidance: { en: "Safety guidance", hi: "सुरक्षा निर्देश", hinglish: "Safety guidance" },
  nearby_shelters: { en: "Nearby shelters", hi: "आस-पास के आश्रय", hinglish: "Nearby shelters" },
  road_closures: { en: "Road closures", hi: "सड़क बंदियाँ", hinglish: "Road closures" },
  verified_updates: { en: "Verified updates", hi: "सत्यापित अपडेट", hinglish: "Verified updates" },
  view_all: { en: "View all", hi: "सभी देखें", hinglish: "View all" },
  updated_at: { en: "Updated", hi: "अपडेट", hinglish: "Updated" },
  data_source: { en: "Source", hi: "स्रोत", hinglish: "Source" },

  /* ---- safety ---- */
  in_emergency: { en: "IN AN EMERGENCY", hi: "आपात स्थिति में", hinglish: "In an emergency" },
  follow_local: {
    en: "Follow local authority instructions.",
    hi: "स्थानीय प्रशासन के निर्देशों का पालन करें।",
    hinglish: "Follow local authority instructions.",
  },
  emergency_contacts: {
    en: "Emergency contacts",
    hi: "आपातकालीन संपर्क",
    hinglish: "Emergency contacts",
  },
  no_verified_info: {
    en: "No verified disaster information is currently published for your area.",
    hi: "आपके क्षेत्र के लिए फिलहाल कोई सत्यापित आपदा जानकारी प्रकाशित नहीं है।",
    hinglish: "No verified disaster information is currently published for your area.",
  },
  awaiting_authority: {
    en: "AWAITING AUTHORITY DATA",
    hi: "प्राधिकरण डेटा की प्रतीक्षा",
    hinglish: "Awaiting authority data",
  },

  /* ---- alert labels ---- */
  data_unavailable: {
    en: "WEATHER DATA UNAVAILABLE",
    hi: "मौसम डेटा अनुपलब्ध",
    hinglish: "Weather data unavailable",
  },
  simulation_mode: {
    en: "SIMULATION / DEMO MODE",
    hi: "सिमुलेशन / डेमो मोड",
    hinglish: "Simulation / demo mode",
  },
  no_active_alert: {
    en: "NO ACTIVE WEATHER ALERT",
    hi: "कोई सक्रिय मौसम अलर्ट नहीं",
    hinglish: "No active weather alert",
  },

  /* ---- auth portal ---- */
  access_portal: { en: "ACCESS PORTAL", hi: "प्रवेश द्वार", hinglish: "Access portal" },
  varun_x_sign_in: { en: "VARUN-X Sign In", hi: "VARUN-X में साइन इन", hinglish: "VARUN-X sign in" },
  choose_role: { en: "Choose a role", hi: "भूमिका चुनें", hinglish: "Choose a role" },
  common_user: { en: "COMMON USER", hi: "सामान्य उपयोगकर्ता", hinglish: "Common user" },
  authority: { en: "AUTHORITY", hi: "प्राधिकरण", hinglish: "Authority" },
  enter_citizen: { en: "Continue as Citizen", hi: "नागरिक के रूप में जारी रखें", hinglish: "Continue as citizen" },
  enter_authority: { en: "Authority Login", hi: "प्राधिकरण लॉगिन", hinglish: "Authority login" },
  demo_only: { en: "DEMO ONLY", hi: "केवल डेमो", hinglish: "Demo only" },
};

export type DictKey = keyof typeof D;

const KEY = "varun-x-lang";

function initialLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "hi" || v === "hinglish") return v;
  } catch {
    /* ignore */
  }
  return "en";
}

export class I18n {
  lang: Lang;
  constructor(lang: Lang) {
    this.lang = lang;
  }
  t(key: DictKey): string {
    return D[key]?.[this.lang] ?? D[key]?.en ?? key;
  }
}

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey) => string;
}

const LangCtx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  function setLang(next: Lang) {
    setLangState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  }
  const t = (key: DictKey) => D[key]?.[lang] ?? D[key]?.en ?? key;
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(LangCtx);
  if (!c) throw new Error("useI18n must be used inside I18nProvider");
  return c;
}

export const LANGS: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "hinglish", label: "Hinglish", native: "Hinglish" },
];

/** Regional languages architected but not yet implemented. */
export const ROADMAP_LANGS: string[] = [
  "Bengali",
  "Tamil",
  "Telugu",
  "Marathi",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Punjabi",
  "Odia",
  "Assamese",
  "Urdu",
];

export function langLabel(code: Lang): string {
  return LANGS.find((l) => l.code === code)?.native ?? "English";
}