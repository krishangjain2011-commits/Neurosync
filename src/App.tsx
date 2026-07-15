import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { OfflineProvider } from "./context/OfflineContext";
import { LangProvider, useLang } from "./context/LangContext";
import Layout from "./components/Layout";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import ChatPage from "./pages/ChatPage";
import BehaviorPage from "./pages/BehaviorPage";
import DietPage from "./pages/DietPage";
import TherapyPage from "./pages/TherapyPage";
import HomeschoolPage from "./pages/HomeschoolPage";
import EmergencyPage from "./pages/EmergencyPage";
import InsightsPage from "./pages/InsightsPage";
import ProgressPage from "./pages/ProgressPage";
import ReportsPage from "./pages/ReportsPage";

function Spinner() {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", backgroundColor: "var(--canvas)", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ width: "36px", height: "36px", borderRadius: "50%", border: "3px solid var(--accent-light)", borderTopColor: "var(--accent)", animation: "spin 0.7s linear infinite" }} />
      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>{t("loading")}</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, activeChild } = useAuth();

  if (loading) return <Spinner />;

  if (!user) {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<Navigate to="/auth" replace />} />
      </Routes>
    );
  }

  // District admin goes straight to insights
  if (user.role === "district_admin") {
    return (
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/insights" replace />} />
          <Route path="insights" element={<InsightsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/insights" replace />} />
      </Routes>
    );
  }

  // Regular users need at least one child profile
  if (!activeChild) {
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/chat" replace />} />
        <Route path="chat"       element={<ChatPage />} />
        <Route path="behavior"   element={<BehaviorPage />} />
        <Route path="diet"       element={<DietPage />} />
        <Route path="therapy"    element={<TherapyPage />} />
        <Route path="homeschool" element={<HomeschoolPage />} />
        <Route path="emergency"  element={<EmergencyPage />} />
        <Route path="progress"   element={<ProgressPage />} />
        <Route path="reports"    element={<ReportsPage />} />
        <Route path="add-child"  element={<OnboardingPage addMode />} />
      </Route>
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <OfflineProvider>
          <AppRoutes />
        </OfflineProvider>
      </AuthProvider>
    </LangProvider>
  );
}
