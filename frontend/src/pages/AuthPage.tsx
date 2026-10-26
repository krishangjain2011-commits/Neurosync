import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { storeSession, storeAppData } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { Input } from "../components/ui/Input";
import { FormGroup } from "../components/ui/FormGroup";

type UseCase = "autistic_child" | "caregiver_burnout" | null;
type Screen = "usecase" | "details";

export default function AuthPage() {
  const { login } = useAuth();
  const { t, lang, setLang, supportedLanguages } = useLang();
  const navigate = useNavigate();

  const [screen, setScreen] = useState<Screen>("usecase");
  const [useCase, setUseCase] = useState<UseCase>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const role = useCase === "autistic_child" ? "parent" : "caregiver";
      
      const response = await fetch("/api/guest-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName,
          preferredLanguage: lang,
          role,
          useCase,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Sign in failed");
      }

      const data = await response.json();
      
      storeSession(data.token, { 
        email: data.email, 
        role: data.role, 
        displayName: data.displayName 
      });
      
      const meResponse = await fetch("/api/me", {
        headers: { "Authorization": `Bearer ${data.token}` },
      });
      
      if (meResponse.ok) {
        const userData = await meResponse.json();
        storeAppData({ 
          user: userData, 
          activeChildId: userData.children?.[0]?.id ?? null 
        });
      }
      
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
      backgroundColor: "#FBF8F3",
      background: "linear-gradient(135deg, #FBF8F3 0%, #FFFFFF 100%)",
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ width: "100%", maxWidth: "500px", position: "relative", zIndex: 1 }}
      >
        <Card size="lg">
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "1rem",
                background: "linear-gradient(135deg, #C07A5E, #C07A5E)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "2rem",
                margin: "0 auto 1rem",
                boxShadow: "0 10px 25px rgba(192, 122, 94, 0.2)",
              }}
            >
              🧠
            </div>
            <h1 style={{ fontSize: "2rem", fontWeight: "700", color: "#2D3748", margin: "0 0 0.5rem" }}>
              NeuroSync
            </h1>
            <p style={{ fontSize: "0.9375rem", color: "#6B7280", margin: 0 }}>
              {t("appTagline")}
            </p>
          </div>

          {/* Language Selector */}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginBottom: "2rem" }}>
            {supportedLanguages.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code)}
                style={{
                  padding: "0.375rem 1rem",
                  borderRadius: "999px",
                  border: `1.5px solid ${lang === l.code ? "#C07A5E" : "#6B7280"}`,
                  backgroundColor: lang === l.code ? "#FFE5D9" : "transparent",
                  color: lang === l.code ? "#C07A5E" : "#6B7280",
                  fontSize: "0.875rem",
                  fontWeight: lang === l.code ? "600" : "400",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "#C07A5E";
                  (e.currentTarget as HTMLElement).style.backgroundColor = "#FFE5D9";
                }}
                onMouseLeave={(e) => {
                  if (lang !== l.code) {
                    (e.currentTarget as HTMLElement).style.borderColor = "#6B7280";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }
                }}
              >
                {l.nativeLabel}
              </button>
            ))}
          </div>

          {/* USE CASE SELECTION */}
          {screen === "usecase" && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "600", color: "#2D3748", marginBottom: "0.75rem" }}>
                {t("howCanWeHelp")}
              </h2>
              <p style={{ fontSize: "0.9375rem", color: "#6B7280", marginBottom: "1.5rem" }}>
                {t("selectYourRoleDescription")}
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* Parent/Caregiver Option */}
                <button
                  type="button"
                  onClick={() => {
                    setUseCase("autistic_child");
                    setScreen("details");
                  }}
                  style={{
                    padding: "1.25rem",
                    borderRadius: "1rem",
                    border: "2px solid #6B7280",
                    backgroundColor: "#FFFFFF",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "#C07A5E";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "#FFE5D9";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(192, 122, 94, 0.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "#6B7280";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "#FFFFFF";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  <div style={{ fontSize: "2.5rem" }}>👨‍👩‍👧</div>
                  <div>
                    <div style={{ fontSize: "1rem", fontWeight: "600", color: "#2D3748" }}>
                      {t("roleParentCaregiver")}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#6B7280", marginTop: "0.25rem" }}>
                      {t("roleAutisticChildDesc")}
                    </div>
                  </div>
                </button>

                {/* Caregiver Wellness Option */}
                <button
                  type="button"
                  onClick={() => {
                    setUseCase("caregiver_burnout");
                    setScreen("details");
                  }}
                  style={{
                    padding: "1.25rem",
                    borderRadius: "1rem",
                    border: "2px solid #6B7280",
                    backgroundColor: "#FFFFFF",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "#5B7B94";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "#E0E9F0";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(91, 123, 148, 0.15)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = "#6B7280";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "#FFFFFF";
                    (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  }}
                >
                  <div style={{ fontSize: "2.5rem" }}>💪</div>
                  <div>
                    <div style={{ fontSize: "1rem", fontWeight: "600", color: "#2D3748" }}>
                      {t("roleCaregiverWellness")}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#6B7280", marginTop: "0.25rem" }}>
                      {t("roleCaregiverBurnoutDesc")}
                    </div>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {/* DETAILS ENTRY */}
          {screen === "details" && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <button
                type="button"
                onClick={() => {
                  setScreen("usecase");
                  setError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "#C07A5E",
                  cursor: "pointer",
                  fontSize: "0.9375rem",
                  fontWeight: "600",
                  marginBottom: "1.5rem",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--color-primary-dark)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#C07A5E";
                }}
              >
                ← {t("back")}
              </button>

              <h2 style={{ fontSize: "1.25rem", fontWeight: "600", color: "#2D3748", marginBottom: "1.5rem" }}>
                {useCase === "autistic_child" ? t("tellUsAboutChild") : t("tellUsAboutYourself")}
              </h2>

              <form onSubmit={handleContinue} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <FormGroup
                  label={t("yourName")}
                  required
                >
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={useCase === "autistic_child" ? t("childNamePlaceholder") : t("yourNamePlaceholder")}
                    required
                    autoFocus
                  />
                </FormGroup>

                <FormGroup
                  label={t("emailAddress")}
                  required
                >
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("emailPlaceholder")}
                    required
                    autoComplete="email"
                  />
                </FormGroup>

                {error && (
                  <Alert type="error" icon="⚠️" title="Error">
                    {error}
                  </Alert>
                )}

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={loading}
                  type="submit"
                >
                  {t("continue")}
                </Button>
              </form>
            </motion.div>
          )}

          {/* Disclaimer */}
          <p
            style={{
              fontSize: "0.75rem",
              color: "#6B7280",
              textAlign: "center",
              marginTop: "1.5rem",
              lineHeight: "1.6",
            }}
          >
            {t("authDisclaimer")}
          </p>
        </Card>
      </motion.div>
    </div>
  );
}
