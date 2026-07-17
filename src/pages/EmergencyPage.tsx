import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { apiPost } from "../lib/api";
import FeatureTour from "../components/FeatureTour";

const EMERGENCY_CONCERNS = [
  "Severe meltdown / self-harm",
  "Child is not breathing normally",
  "High fever / seizure",
  "Child is missing / wandered away",
  "Extreme aggression toward others",
  "Medication emergency",
  "Mental health crisis",
  "Child is unresponsive",
];

const HOTLINES = [
  { name: "Police / Ambulance",           number: "112",            desc: "All emergencies — unified national number",          color: "var(--red)"    },
  { name: "Ambulance",                    number: "108",            desc: "Medical emergency ambulance service",                color: "var(--red)"    },
  { name: "CHILDLINE India",             number: "1098",            desc: "Child helpline — 24/7, free, pan-India",             color: "var(--green)"  },
  { name: "Vandrevala Foundation",        number: "1860-2662-345", desc: "24/7 mental health & crisis helpline",               color: "var(--blue)"   },
  { name: "iCall — TISS",                number: "9152987821",     desc: "Psychosocial support & counselling",                 color: "var(--accent)" },
  { name: "National Disability Helpline", number: "1800-11-0031",  desc: "Disability support — toll-free",                     color: "var(--accent)" },
  { name: "NIMHANS Helpline",            number: "080-4611-0007",  desc: "Mental health — National Institute of Mental Health", color: "var(--blue)"   },
  { name: "Autism Society of India",     number: "044-2836-6818",  desc: "Autism-specific support & resources",                color: "var(--green)"  },
  { name: "ADHD Support India (CHADD)",  number: "044-2430-0014",  desc: "ADHD information & caregiver support",               color: "var(--amber)"  },
  { name: "Poison Control — AIIMS",      number: "011-2659-3677",  desc: "Medication / substance emergencies",                 color: "var(--red)"    },
];

interface Location {
  lat: number;
  lng: number;
}

export default function EmergencyPage() {
  const { activeChild } = useAuth();
  const [selectedConcern, setSelectedConcern] = useState("");
  const [customConcern, setCustomConcern] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [locationError, setLocationError] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");
  const [error, setError] = useState("");

  const requestLocation = () => {
    setLocationLoading(true);
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser.");
      setLocationLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLoading(false);
      },
      (err) => {
        setLocationError("Location access denied. Emergency response will be provided without location data.");
        setLocationLoading(false);
      },
      { timeout: 10000 }
    );
  };

  const getHelp = async () => {
    const concern = customConcern.trim() || selectedConcern;
    if (!concern) return;
    setLoading(true);
    setError("");
    setResponse("");

    try {
      const data = await apiPost<{ text: string }>("/api/gemini/emergency", {
        lat: location?.lat,
        lng: location?.lng,
        concern,
      });
      setResponse(data.text);
    } catch (err: any) {
      setError(err.message || "Request failed. Please call 911 for immediate emergencies.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "720px", margin: "0 auto" }}>
      <FeatureTour
        featureKey="emergency"
        icon="🚨"
        title="Emergency Support"
        summary="Provides immediate AI-guided steps for caregiving crises — meltdowns, self-harm, medical emergencies — alongside India-specific helpline numbers. Always call 112 for life-threatening situations."
        tips={[
          "India's unified emergency number is 112 (Police + Ambulance). Call immediately for life-threatening situations.",
          "CHILDLINE 1098 is free, 24/7, and pan-India — for any child welfare concern.",
          "Select your concern from the list or describe it in your own words.",
          "Share your location (optional) to get guidance specific to your area.",
          "iCall (9152987821) and Vandrevala Foundation offer free mental health support.",
        ]}
        accentColor="var(--red)"
      />
      {/* Header */}
      <div
        style={{
          padding: "1rem 1.25rem",
          backgroundColor: "var(--red-light)",
          border: "1.5px solid var(--red)",
          borderRadius: "12px",
          marginBottom: "1.5rem",
          display: "flex",
          gap: "0.75rem",
          alignItems: "flex-start",
        }}
      >
        <span style={{ fontSize: "1.5rem", flexShrink: 0 }}>🚨</span>
        <div>
          <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.25rem", fontWeight: 700, color: "var(--red)" }}>
            Emergency Support
          </h1>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
            For <strong>life-threatening emergencies, call 911 immediately.</strong> This tool provides AI-assisted guidance and local resource suggestions for caregiving crises.
          </p>
        </div>
      </div>

      {/* Hotlines — always visible */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 0.875rem", fontSize: "1.05rem", fontWeight: 700 }}>📞 Emergency Hotlines</h2>        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.6rem" }}>
          {HOTLINES.map((h) => (
            <div
              key={h.name}
              style={{
                padding: "0.75rem",
                backgroundColor: "var(--canvas)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                borderLeft: `3px solid ${h.color}`,
              }}
            >
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: h.color, marginBottom: "0.2rem" }}>{h.name}</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.2rem" }}>{h.number}</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{h.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Location */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.05rem", fontWeight: 600 }}>📍 Location (optional)</h2>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Sharing your location helps find nearby pediatric clinics and emergency services.
        </p>
        {location ? (
          <div
            style={{
              padding: "0.6rem 0.875rem",
              backgroundColor: "var(--green-light)",
              color: "var(--green)",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: 500,
            }}
          >
            ✅ Location captured: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
          </div>
        ) : (
          <div>
            <button
              className="btn-secondary"
              onClick={requestLocation}
              disabled={locationLoading}
            >
              {locationLoading ? "Getting location…" : "📍 Share My Location"}
            </button>
            {locationError && (
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                {locationError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Concern selector */}
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 0.875rem", fontSize: "1.05rem", fontWeight: 600 }}>🆘 What's happening?</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.4rem", marginBottom: "1rem" }}>
          {EMERGENCY_CONCERNS.map((c) => {
            const active = selectedConcern === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => { setSelectedConcern(active ? "" : c); setCustomConcern(""); }}
                style={{
                  padding: "0.55rem 0.75rem",
                  borderRadius: "8px",
                  border: `1.5px solid ${active ? "var(--red)" : "var(--border)"}`,
                  backgroundColor: active ? "var(--red-light)" : "var(--canvas)",
                  color: active ? "var(--red)" : "var(--text-secondary)",
                  fontSize: "0.8rem",
                  fontWeight: active ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.12s",
                }}
              >
                {c}
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: "1.25rem" }}>
          <label className="label">Or describe the situation</label>
          <textarea
            className="input"
            value={customConcern}
            onChange={(e) => { setCustomConcern(e.target.value); setSelectedConcern(""); }}
            placeholder="Describe what's happening in detail…"
            rows={3}
            style={{ resize: "vertical" }}
          />
        </div>

        <button
          className="btn-primary"
          onClick={getHelp}
          disabled={loading || (!selectedConcern && !customConcern.trim())}
          style={{ backgroundColor: "var(--red)", boxShadow: "0 2px 8px rgba(217, 79, 79, 0.3)" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#b83f3f")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--red)")}
        >
          {loading ? "Getting emergency guidance…" : "🆘 Get Emergency Guidance"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "10px", marginBottom: "1rem", fontSize: "0.875rem", fontWeight: 500 }}>
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1.5rem" }}>
          <div style={{ width: "20px", height: "20px", border: "2px solid var(--red-light)", borderTopColor: "var(--red)", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Generating emergency guidance…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <AnimatePresence>
        {response && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
            style={{ borderLeft: "3px solid var(--red)", backgroundColor: "var(--surface)" }}
          >
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
              🆘 Emergency Guidance
            </div>
            <div
              className="prose-neurosync"
              style={{ whiteSpace: "pre-wrap" }}
            >
              {response}
            </div>
            <div
              style={{
                marginTop: "1rem",
                padding: "0.6rem 0.875rem",
                backgroundColor: "var(--red-light)",
                borderRadius: "8px",
                fontSize: "0.78rem",
                color: "var(--red)",
                fontWeight: 500,
              }}
            >
              ⚕️ This is AI-generated guidance. Always consult a licensed medical professional for medical decisions. Call 911 for life-threatening emergencies.
            </div>
            <button className="btn-secondary" onClick={() => { setResponse(""); setSelectedConcern(""); setCustomConcern(""); }} style={{ marginTop: "0.875rem" }}>
              New Request
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
