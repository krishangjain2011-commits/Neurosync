import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TourProps {
  featureKey: string;   // unique key stored in localStorage e.g. "tour_chat"
  icon: string;
  title: string;
  summary: string;
  tips: string[];
  accentColor?: string;
}

/**
 * FeatureTour — a dismissible first-visit banner shown once per feature.
 * Once dismissed it never appears again (stored in localStorage).
 * The user can also re-open it with the small "?" button that stays visible.
 */
export default function FeatureTour({
  featureKey, icon, title, summary, tips, accentColor = "var(--accent)",
}: TourProps) {
  const storageKey = `neurosync_tour_${featureKey}`;
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(storageKey);
    if (!seen) { setVisible(true); setExpanded(true); }
  }, [storageKey]);

  const dismiss = () => {
    localStorage.setItem(storageKey, "1");
    setVisible(false);
    setExpanded(false);
  };

  const reopen = () => {
    setVisible(true);
    setExpanded(true);
  };

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <AnimatePresence>
        {visible && expanded && (
          <motion.div
            key="banner"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{
              background: `linear-gradient(135deg, ${accentColor}18 0%, var(--honey-light) 100%)`,
              border: `1.5px solid ${accentColor}44`,
              borderRadius: "14px",
              padding: "1rem 1.125rem",
              position: "relative",
            }}
          >
            {/* Close */}
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              style={{
                position: "absolute", top: "0.6rem", right: "0.6rem",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", fontSize: "1.1rem", lineHeight: 1,
                padding: "0.15rem 0.35rem", borderRadius: "5px",
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--surface-2)")}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              ✕
            </button>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "1.3rem" }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "var(--text-primary)" }}>{title}</div>
                <div style={{ fontSize: "0.72rem", color: accentColor, fontWeight: 600 }}>Quick guide</div>
              </div>
            </div>

            {/* Summary */}
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>
              {summary}
            </p>

            {/* Tips */}
            <ul style={{ margin: "0 0 0.875rem", paddingLeft: "1.25rem" }}>
              {tips.map((tip, i) => (
                <li key={i} style={{ fontSize: "0.8rem", color: "var(--text-primary)", marginBottom: "0.3rem", lineHeight: 1.55 }}>
                  {tip}
                </li>
              ))}
            </ul>

            <button
              onClick={dismiss}
              style={{
                padding: "0.35rem 0.9rem", borderRadius: "7px", border: "none",
                backgroundColor: accentColor, color: "white",
                fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
              }}
            >
              Got it →
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Re-open hint button — always visible after first dismiss */}
      {!expanded && (
        <button
          onClick={reopen}
          title={`About ${title}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.35rem",
            padding: "0.2rem 0.6rem", borderRadius: "999px",
            border: `1px solid ${accentColor}55`,
            backgroundColor: `${accentColor}10`,
            color: accentColor, fontSize: "0.72rem", fontWeight: 600,
            cursor: "pointer", marginBottom: "0.5rem",
          }}
        >
          {icon} About this feature
        </button>
      )}
    </div>
  );
}
