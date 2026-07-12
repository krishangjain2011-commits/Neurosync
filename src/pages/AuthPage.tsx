import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";

export default function AuthPage() {
  const { login, register } = useAuth();
  const { t, lang, setLang, supportedLanguages } = useLang();
  const navigate = useNavigate();
  const [mode, setMode]               = useState<"login" | "register">("login");
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, { displayName, preferredLanguage: lang, role: "parent" });
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
      background: "linear-gradient(135deg, #FDF4E8 0%, #F3EEFF 50%, #FDF8F3 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem",
    }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        style={{
          width: "100%", maxWidth: "400px",
          background: "linear-gradient(160deg, #FFFFFF 0%, var(--surface) 100%)",
          border: "1px solid var(--border)", borderRadius: "20px",
          padding: "2rem", boxShadow: "var(--shadow-lg)",
        }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <div style={{
            width: "56px", height: "56px", borderRadius: "16px",
            background: "linear-gradient(135deg, var(--accent) 0%, var(--honey) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.6rem", margin: "0 auto 0.75rem",
            boxShadow: "0 4px 16px rgba(139,92,246,0.35)",
          }}>🧠</div>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700, color: "var(--text-primary)" }}>NeuroSync</h1>
          <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {t("appTagline")}
          </p>
        </div>

        {/* Language switcher */}
        <div style={{ display: "flex", gap: "0.4rem", justifyContent: "center", marginBottom: "1.25rem" }}>
          {supportedLanguages.map(l => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              style={{
                padding: "0.3rem 0.75rem", borderRadius: "999px",
                border: `1.5px solid ${lang === l.code ? "var(--accent)" : "var(--border)"}`,
                backgroundColor: lang === l.code ? "var(--accent-light)" : "transparent",
                color: lang === l.code ? "var(--accent)" : "var(--text-muted)",
                fontSize: "0.78rem", fontWeight: lang === l.code ? 700 : 400,
                cursor: "pointer", transition: "all 0.12s",
              }}
            >
              {l.nativeLabel}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", backgroundColor: "var(--surface-2)", borderRadius: "8px", padding: "3px", marginBottom: "1.5rem" }}>
          {(["login", "register"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }}
              style={{ flex: 1, padding: "0.45rem", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "0.83rem", fontWeight: mode === m ? 600 : 400, backgroundColor: mode === m ? "var(--canvas)" : "transparent", color: mode === m ? "var(--accent)" : "var(--text-muted)", boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
              {m === "login" ? t("signIn") : t("createAccount")}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {mode === "register" && (
            <div>
              <label className="label">{t("yourName")}</label>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("namePlaceholder")} />
            </div>
          )}

          <div>
            <label className="label">{t("emailAddress")}</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("emailPlaceholder")} required autoComplete="email" />
          </div>

          <div>
            <label className="label">{t("password")}</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? t("passwordPlaceholderNew") : t("passwordPlaceholderLogin")}
              required minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>

          {mode === "register" && (
            <div>
              <label className="label">{t("preferredLanguage")}</label>
              <select className="input" value={lang} onChange={(e) => setLang(e.target.value as any)} style={{ cursor: "pointer" }}>
                {supportedLanguages.map((l) => (
                  <option key={l.code} value={l.code}>{l.nativeLabel} — {l.label}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div style={{ padding: "0.6rem 0.875rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "8px", fontSize: "0.83rem" }}>
              {error}
            </div>
          )}

          <button className="btn-primary" type="submit" disabled={loading} style={{ justifyContent: "center", marginTop: "0.25rem" }}>
            {loading
              ? <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ width: "13px", height: "13px", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.6s linear infinite", display: "inline-block" }} />
                  {mode === "login" ? t("signingIn") : t("creatingAccount")}
                </span>
              : mode === "login" ? t("signIn") : t("createAccount")
            }
          </button>
        </form>

        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center", marginTop: "1.25rem", lineHeight: 1.6, whiteSpace: "pre-line" }}>
          {t("authDisclaimer")}
        </p>
      </motion.div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
