import { Navigate, Route, Routes } from "react-router-dom";
import { useSession, isCommand } from "./lib/session";

import type { ReactNode } from "react";
import { Layout } from "./components/Layout";
import { AuthorityGate } from "./components/RoleGate";
import { LoginPage } from "./pages/LoginPage";
import { Overview } from "./pages/Overview";
import { CitizenDashboard } from "./pages/CitizenDashboard";
import { SafetyPage } from "./pages/SafetyPage";
import { LivePage } from "./pages/LivePage";
import { ForecastsPage } from "./pages/ForecastsPage";
import { AnomaliesPage } from "./pages/AnomaliesPage";
import { TrackingPage } from "./pages/TrackingPage";
import { DownscalePage } from "./pages/DownscalePage";
import { RiskPage } from "./pages/RiskPage";
import { AlertsPage } from "./pages/AlertsPage";
import { EmergencyPage } from "./pages/EmergencyPage";
import { BroadcastPage } from "./pages/BroadcastPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { PersonnelPage } from "./pages/PersonnelPage";
import { ResourcesPage } from "./pages/ResourcesPage";
import { AssistantPage } from "./pages/AssistantPage";
import { ModelsPage } from "./pages/ModelsPage";
import { SystemPage } from "./pages/SystemPage";
import { LegalPage } from "./pages/LegalPage";
import { NotFound } from "./pages/NotFound";

import { WeatherProvider } from "./lib/useWeather";

function Authority({ children }: { children: ReactNode }) {
  return <AuthorityGate>{children}</AuthorityGate>;
}

/**
 * Wraps the operations layer so only a command officer can open it.
 *
 * The nav already hides these routes from a forecast analyst, but a route guard
 * is the real boundary: hiding a link is not access control, and typing the URL
 * would otherwise render the response console to a read-only analyst.
 */
function OperationsOnly({ children }: { children: ReactNode }) {
  const { session } = useSession();
  if (!isCommand(session)) return <Navigate to="/overview" replace />;
  return <AuthorityGate>{children}</AuthorityGate>;
}

function Splash() {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div className="spinner" aria-hidden />
      <div className="small mono muted">VERIFYING SESSION...</div>
    </div>
  );
}

export default function App() {
  const { session, loading } = useSession();

  if (loading) return <Splash />;
  if (!session) return <LoginPage />;

  const home = session.serverRole === "citizen" ? "/citizen" : "/overview";

  return (
    <Layout>
      {/* One location for the whole app, so every panel and every analysis
          request refers to the same coordinates. */}
      <WeatherProvider>
        <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />

        <Route path="/citizen" element={<CitizenDashboard />} />
        <Route path="/safety" element={<SafetyPage />} />

        <Route path="/live" element={<LivePage />} />
        <Route path="/forecasts" element={<ForecastsPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/models" element={<ModelsPage />} />
        <Route path="/system" element={<SystemPage />} />

        <Route path="/overview" element={<Authority><Overview /></Authority>} />
        <Route path="/anomalies" element={<Authority><AnomaliesPage /></Authority>} />
        <Route path="/tracking" element={<Authority><TrackingPage /></Authority>} />
        <Route path="/downscaling" element={<Authority><DownscalePage /></Authority>} />
        <Route path="/risk" element={<Authority><RiskPage /></Authority>} />
        <Route path="/emergency" element={<OperationsOnly><EmergencyPage /></OperationsOnly>} />
        <Route path="/broadcast" element={<OperationsOnly><BroadcastPage /></OperationsOnly>} />
        <Route path="/personnel" element={<OperationsOnly><PersonnelPage /></OperationsOnly>} />
        <Route path="/resources" element={<OperationsOnly><ResourcesPage /></OperationsOnly>} />

        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
        <Route path="/responsible-ai" element={<LegalPage kind="responsible-ai" />} />
        <Route path="/data-usage" element={<LegalPage kind="data-usage" />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </WeatherProvider>
    </Layout>
  );
}
