import { PageHead } from "../components/PageHead";
import { Panel, Badge } from "../components/primitives";

type Kind = "privacy" | "terms" | "responsible-ai" | "data-usage";

interface Doc {
  kicker: string;
  title: string;
  intro: string;
  sections: Array<{ h: string; body: string[] }>;
}

const DOCS: Record<Kind, Doc> = {
  privacy: {
    kicker: "LEGAL",
    title: "Privacy Policy",
    intro:
      "This policy explains how the VARUN-X prototype handles location, user inputs and citizen reports.",
    sections: [
      {
        h: "Location permission",
        body: [
          "VARUN-X requests browser geolocation only when you trigger live weather retrieval. Coordinates are used to query the weather provider and reverse-geocoding service for your current location.",
          "Precise coordinates are not written to persistent storage by this prototype. Reloading the page clears in-memory location state.",
        ],
      },
      {
        h: "Citizen reports",
        body: [
          "Citizen incident reports may contain a location, a description, a category, severity and an optional image. Reports enter a review workflow and are never automatically marked as verified.",
          "Public views of reports must not expose personally identifiable information beyond what is necessary for coordination.",
        ],
      },
      {
        h: "Personal information",
        body: [
          "This prototype does not require account registration for public features. Authority login is a demonstration entry point and does not process real credentials in this build.",
        ],
      },
      {
        h: "Third-party services",
        body: [
          "Live weather, reverse geocoding, radar tiles and map tiles are retrieved from third-party providers (Open-Meteo, BigDataCloud/Nominatim, RainViewer, CARTO/OpenStreetMap). Requests to these services transmit your IP address and, where applicable, coordinate values under each provider's own privacy terms.",
        ],
      },
      {
        h: "Data retention",
        body: [
          "Prototype state lives in the browser session only. No server-side personal data store is part of this build.",
        ],
      },
      {
        h: "Contact",
        body: [
          "Privacy concerns regarding this prototype should be raised with the deploying team before any production use.",
        ],
      },
    ],
  },
  terms: {
    kicker: "LEGAL",
    title: "Terms of Service",
    intro: "Terms governing use of the VARUN-X prototype.",
    sections: [
      {
        h: "Nature of the service",
        body: [
          "VARUN-X is a technology prototype demonstrating a weather-intelligence and disaster-response workflow. It is not an operational meteorological service.",
        ],
      },
      {
        h: "No operational prediction claims",
        body: [
          "The system must not be understood as operationally predicting real disasters unless and until it is connected to trained production models and verified data pipelines.",
          "Live weather values come from a third-party provider and are shown as such. Model, anomaly, GNN, diffusion and risk fields in this build are labelled simulations.",
        ],
      },
      {
        h: "Official instructions take precedence",
        body: [
          "Nothing produced by VARUN-X overrides instructions from competent authorities. In any emergency, follow official guidance.",
        ],
      },
      {
        h: "Accuracy and availability",
        body: [
          "No guarantee of accuracy, completeness or availability is offered. Data may be unavailable; the interface is designed to show unavailable states rather than substitute fabricated values.",
        ],
      },
      {
        h: "Acceptable use",
        body: [
          "Do not use the prototype to present its outputs as verified government information, official warnings or verified casualty statistics.",
        ],
      },
      {
        h: "Liability",
        body: [
          "Use of this prototype is at your own risk. To the extent permitted by law, the developers accept no liability for decisions taken on the basis of demonstration data.",
        ],
      },
    ],
  },
  "responsible-ai": {
    kicker: "RESPONSIBLE AI",
    title: "Responsible AI",
    intro: "Commitments that govern every AI-touched surface of VARUN-X.",
    sections: [
      {
        h: "Decision support, not authority",
        body: [
          "AI predictions are decision-support information. Official instructions from competent authorities take precedence over any model output or assistant response.",
        ],
      },
      {
        h: "Uncertainty is communicated",
        body: [
          "Forecast uncertainty and ensemble spread are surfaced alongside point estimates. Probabilistic outputs are described as probabilistic predictions, never as certainties.",
        ],
      },
      {
        h: "Verification of human signals",
        body: [
          "Citizen reports require verification. Clustering of reports produces an AI-generated signal requiring authority verification and is never presented as ground truth.",
        ],
      },
      {
        h: "No fabrication",
        body: [
          "The AI must not fabricate unavailable information. When live data, an alert feed or a model output is unavailable, the interface states so explicitly.",
        ],
      },
      {
        h: "Provenance labelling",
        body: [
          "Model outputs are timestamped. Model predictions are clearly distinguished from verified observations, provider forecasts, official alerts and simulation data.",
        ],
      },
      {
        h: "Human oversight",
        body: [
          "Emergency decisions require human authority review. VARUN-X does not make autonomous emergency decisions.",
        ],
      },
    ],
  },
  "data-usage": {
    kicker: "LEGAL",
    title: "Data Usage",
    intro: "What data the prototype reads, derives and labels.",
    sections: [
      {
        h: "Live weather data",
        body: [
          "Current conditions, hourly and seven-day forecast values are retrieved from the Open-Meteo API for the coordinates you provide (GPS or manually selected). If the provider is unreachable, the interface shows an unavailable state and does not fabricate values.",
        ],
      },
      {
        h: "Radar and map tiles",
        body: [
          "Precipitation radar frames come from the RainViewer public API. Basemap tiles come from CARTO via OpenStreetMap contributors. Both are labelled in-map.",
        ],
      },
      {
        h: "Simulation data",
        body: [
          "Anomaly, GNN, diffusion, risk-evolution and exposure probability fields in this build are generated deterministically from seeded inputs. They are labelled SIMULATION or DEMO and must never be presented as live model inference.",
        ],
      },
      {
        h: "Model provenance fields",
        body: [
          "Each model output surface is intended to carry model, input, timestamp, resolution, confidence/uncertainty and source. Where a value cannot be sourced it is shown as PENDING rather than estimated.",
        ],
      },
      {
        h: "Derived vs observed",
        body: [
          "Observed values are never derived or adjusted. Derived quantities are labelled as derived. Simulation is labelled as simulation. The four categories remain separable: real live data, AI model output, simulation data, official alerts.",
        ],
      },
    ],
  },
};

export function LegalPage({ kind }: { kind: Kind }) {
  const doc = DOCS[kind];
  return (
    <div>
      <PageHead
        kicker={doc.kicker}
        title={doc.title}
        sub={doc.intro}
        right={<Badge tone="muted">PROTOTYPE POLICY</Badge>}
      />
      <Panel title={doc.title.toUpperCase()} meta="LAST REVIEWED: PROTOTYPE BUILD">
        <div className="prose">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {s.body.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </section>
          ))}
        </div>
      </Panel>
    </div>
  );
}