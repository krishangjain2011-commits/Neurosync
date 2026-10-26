import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { apiPost } from "../lib/api";
import FeatureTour from "../components/FeatureTour";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { FormGroup } from "../components/ui/FormGroup";

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
  { name: "Police / Ambulance",           number: "112",            desc: "All emergencies — unified national number",          color: "var(--color-error)"     },
  { name: "Ambulance",                    number: "108",            desc: "Medical emergency ambulance service",                color: "var(--color-error)"     },
  { name: "CHILDLINE India",             number: "1098",            desc: "Child helpline — 24/7, free, pan-India",             color: "var(--color-success)"   },
  { name: "Vandrevala Foundation",        number: "1860-2662-345", desc: "24/7 mental health & crisis helpline",               color: "var(--color-secondary)" },
  { name: "iCall — TISS",                number: "9152987821",     desc: "Psychosocial support & counselling",                 color: "var(--color-accent)"    },
  { name: "National Disability Helpline", number: "1800-11-0031",  desc: "Disability support — toll-free",                     color: "var(--color-accent)"    },
  { name: "NIMHANS Helpline",            number: "080-4611-0007",  desc: "Mental health — National Institute of Mental Health", color: "var(--color-secondary)" },
  { name: "Autism Society of India",     number: "044-2836-6818",  desc: "Autism-specific support & resources",                color: "var(--color-success)"   },
  { name: "ADHD Support India (CHADD)",  number: "044-2430-0014",  desc: "ADHD information & caregiver support",               color: "var(--color-warning)"   },
  { name: "Poison Control — AIIMS",      number: "011-2659-3677",  desc: "Medication / substance emergencies",                 color: "var(--color-error)"     },
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
    <div style={{ padding: "1.5rem", maxWidth: "900px", margin: "0 auto", backgroundColor: "var(--color-bg)" }}>
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
        accentColor="var(--color-error)"
      />

      {/* Header — Prominent emergency alert */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          padding: "1.5rem",
          backgroundColor: "var(--color-error-light)",
          border: `2px solid var(--color-error)`,
          borderRadius: "var(--radius-lg)",
          marginBottom: "2rem",
          display: "flex",
          gap: "1rem",
          alignItems: "flex-start",
        }}
      >
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          style={{ fontSize: "2rem", flexShrink: 0 }}
        >
          🚨
        </motion.div>
        <div>
          <h1 style={{
            margin: "0 0 0.5rem",
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "var(--color-error)",
          }}>
            Emergency Support
          </h1>
          <p style={{
            margin: 0,
            fontSize: "0.95rem",
            color: "var(--color-text)",
            lineHeight: 1.6,
          }}>
            For <strong>life-threatening emergencies, call 112 immediately.</strong> This tool provides AI-assisted guidance and local resource suggestions for caregiving crises.
          </p>
        </div>
      </motion.div>

      {/* Hotlines — prominent display */}
      <Card size="md" style={{ marginBottom: "2rem" }}>
        <h2 style={{
          margin: "0 0 1.25rem",
          fontSize: "1.2rem",
          fontWeight: 700,
          color: "var(--color-text)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}>
          📞 Emergency Hotlines
        </h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: "1rem",
        }}>
          {HOTLINES.map((h) => (
            <motion.div
              key={h.name}
              whileHover={{ scale: 1.02 }}
              style={{
                padding: "1rem",
                backgroundColor: "var(--color-surface)",
                border: `2px solid ${h.color}`,
                borderRadius: "var(--radius-lg)",
                borderLeft: `5px solid ${h.color}`,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 12px ${h.color}33`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              <div style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                color: h.color,
                marginBottom: "0.4rem",
              }}>
                {h.name}
              </div>
              <div style={{
                fontSize: "1.3rem",
                fontWeight: 700,
                color: "var(--color-text)",
                marginBottom: "0.4rem",
                fontFamily: "monospace",
              }}>
                {h.number}
              </div>
              <div style={{
                fontSize: "0.8rem",
                color: "var(--color-text-muted)",
                lineHeight: 1.5,
              }}>
                {h.desc}
              </div>
            </motion.div>
          ))}
        </div>
      </Card>

      {/* Location */}
      <Card size="md" style={{ marginBottom: "2rem" }}>
        <h2 style={{
          margin: "0 0 1rem",
          fontSize: "1.1rem",
          fontWeight: 700,
          color: "var(--color-text)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}>
          📍 Location (optional)
        </h2>
        <p style={{
          margin: "0 0 1rem",
          fontSize: "0.9rem",
          color: "var(--color-text-muted)",
          lineHeight: 1.6,
        }}>
          Sharing your location helps find nearby pediatric clinics and emergency services.
        </p>
        {location ? (
          <div
            style={{
              padding: "0.875rem 1rem",
              backgroundColor: "var(--color-success-light)",
              color: "var(--color-success)",
              borderRadius: "var(--radius-lg)",
              fontSize: "0.85rem",
              fontWeight: 600,
              border: `1px solid var(--color-success)`,
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>✅</span> Location captured: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
          </div>
        ) : (
          <div>
            <Button
              variant="secondary"
              onClick={requestLocation}
              disabled={locationLoading}
            >
              {locationLoading ? "📍 Getting location…" : "📍 Share My Location"}
            </Button>
            {locationError && (
              <p style={{
                margin: "0.75rem 0 0",
                fontSize: "0.8rem",
                color: "var(--color-text-muted)",
                lineHeight: 1.5,
              }}>
                {locationError}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Concern selector */}
      <Card size="md" style={{ marginBottom: "2rem" }}>
        <h2 style={{
          margin: "0 0 1.25rem",
          fontSize: "1.1rem",
          fontWeight: 700,
          color: "var(--color-text)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}>
          🆘 What's happening?
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}>
          {EMERGENCY_CONCERNS.map((c) => {
            const active = selectedConcern === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setSelectedConcern(active ? "" : c);
                  setCustomConcern("");
                }}
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-md)",
                  border: `2px solid ${active ? "var(--color-error)" : "var(--color-secondary-soft)"}`,
                  backgroundColor: active ? "var(--color-error-light)" : "var(--color-surface)",
                  color: active ? "var(--color-error)" : "var(--color-text-muted)",
                  fontSize: "0.85rem",
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.16s",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--color-error)";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-error-light)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--color-secondary-soft)";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-surface)";
                  }
                }}
              >
                {c}
              </button>
            );
          })}
        </div>

        <FormGroup label="Or describe the situation" helperText="Describe what's happening in detail…">
          <textarea
            value={customConcern}
            onChange={(e) => {
              setCustomConcern(e.target.value);
              setSelectedConcern("");
            }}
            placeholder="Describe what's happening in detail…"
            rows={3}
            style={{
              width: "100%",
              padding: "0.875rem 1rem",
              border: `1.5px solid var(--color-secondary-soft)`,
              borderRadius: "var(--radius-lg)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              fontSize: "0.95rem",
              fontFamily: "var(--font-body)",
              resize: "vertical",
              outline: "none",
              fontWeight: 400,
              transition: "border-color 0.16s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-error)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-secondary-soft)")}
          />
        </FormGroup>

        <Button
          variant="primary"
          onClick={getHelp}
          disabled={loading || (!selectedConcern && !customConcern.trim())}
          fullWidth
          style={{
            marginTop: "1.5rem",
            background: "var(--color-error)",
            boxShadow: "0 4px 12px rgba(220, 38, 38, 0.2)",
          }}
        >
          {loading ? "🆘 Getting emergency guidance…" : "🆘 Get Emergency Guidance"}
        </Button>
      </Card>

      {error && <Alert type="error" style={{ marginBottom: "1.5rem" }}>⚠️ {error}</Alert>}

      {loading && (
        <Card size="md" style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          padding: "2rem",
          justifyContent: "center",
        }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            style={{
              width: "24px",
              height: "24px",
              border: `3px solid var(--color-error-light)`,
              borderTopColor: "var(--color-error)",
              borderRadius: "var(--radius-full)",
            }}
          />
          <span style={{ fontSize: "0.9rem", color: "var(--color-text-muted)" }}>Generating emergency guidance…</span>
        </Card>
      )}

      <AnimatePresence>
        {response && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card size="md" style={{
              borderLeft: `4px solid var(--color-error)`,
              backgroundColor: "var(--color-surface)",
            }}>
              <div style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "var(--color-error)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "1rem",
              }}>
                🆘 Emergency Guidance
              </div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "0.95rem",
                  color: "var(--color-text)",
                  lineHeight: 1.7,
                  marginBottom: "1.5rem",
                }}
              >
                {response}
              </div>
              <Alert type="error">
                ⚕️ This is AI-generated guidance. Always consult a licensed medical professional for medical decisions. Call 112 for life-threatening emergencies.
              </Alert>
              <Button
                variant="secondary"
                onClick={() => {
                  setResponse("");
                  setSelectedConcern("");
                  setCustomConcern("");
                }}
                style={{ marginTop: "1rem" }}
              >
                New Request
              </Button>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
