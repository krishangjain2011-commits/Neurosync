import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी (Hindi)" },
  { code: "ta", label: "தமிழ் (Tamil)" },
  { code: "te", label: "తెలుగు (Telugu)" },
  { code: "kn", label: "ಕನ್ನಡ (Kannada)" },
  { code: "ml", label: "മലയാളം (Malayalam)" },
  { code: "bn", label: "বাংলা (Bengali)" },
  { code: "mr", label: "मराठी (Marathi)" },
  { code: "gu", label: "ગુજરાતી (Gujarati)" },
];

export default function AuthPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode]                   = useState<"login" | "register">("login");
  const [email, setEmail]                 = useState("");
  const [password, setPassword]           = useState("");
  const [displayName, setDisplayName]     = useState("");
  const [preferredLanguage, setLang]      = useState("en");
  const [error, setError]                 = useState("");
  const [loading, setLoading]             = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, { displayName, preferredLanguage, role: "parent" });
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
      display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem"
    }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        style={{
          width: "100%", maxWidth: "400px",
          background: "linear-gradient(160deg, #FFFFFF 0%, var(--surface) 100%)",
          border: "1px solid var(--border)", borderRadius: "20px",
          padding: "2rem", boxShadow: "var(--shadow-lg)",
        }}>

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
            AI Digital Caretaker · Autism · ADHD · Dyslexia
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", backgroundColor: "var(--surface-2)", borderRadius: "8px", padding: "3px", marginBottom: "1.5rem" }}>
          {(["login", "register"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }}
              style={{ flex: 1, padding: "0.45rem", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "0.83rem", fontWeight: mode === m ? 600 : 400, backgroundColor: mode === m ? "var(--canvas)" : "transparent", color: mode === m ? "var(--accent)" : "var(--text-muted)", boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
              {m === "login" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {mode === "register" && (
            <div>
              <label className="label">Your name</label>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Priya Sharma" />
            </div>
          )}

          <div>
            <label className="label">Email address</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="caregiver@email.com" required autoComplete="email" />
          </div>

          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "register" ? "Minimum 8 characters" : "Your password"} required minLength={mode === "register" ? 8 : undefined} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </div>

          {mode === "register" && (
            <div>
              <label className="label">Preferred language</label>
              <select className="input" value={preferredLanguage} onChange={(e) => setLang(e.target.value)} style={{ cursor: "pointer" }}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
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
                  {mode === "login" ? "Signing in…" : "Creating account…"}
                </span>
              : mode === "login" ? "Sign In" : "Create Account"
            }
          </button>
        </form>

        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center", marginTop: "1.25rem", lineHeight: 1.5 }}>
          Data stored locally. Never shared with third parties.<br />
          NeuroSync does not provide medical diagnoses.
        </p>
      </motion.div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
