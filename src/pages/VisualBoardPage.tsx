import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import FeatureTour from "../components/FeatureTour";

interface PecsCard {
  label: string;
  emoji: string;
  category: string;
  color: string;
}

const PECS_CARDS: PecsCard[] = [
  // Basic needs
  { label: "Eat",       emoji: "🍽️", category: "Needs",    color: "#FDF3E3" },
  { label: "Drink",     emoji: "💧", category: "Needs",    color: "#E8F0FD" },
  { label: "Bathroom",  emoji: "🚽", category: "Needs",    color: "#F5F3EE" },
  { label: "Sleep",     emoji: "😴", category: "Needs",    color: "#EDE9FB" },
  { label: "Help",      emoji: "🙋", category: "Needs",    color: "#FDE8E8" },
  { label: "More",      emoji: "➕", category: "Needs",    color: "#E6F5EE" },
  { label: "Stop",      emoji: "✋", category: "Needs",    color: "#FDE8E8" },
  { label: "All Done",  emoji: "✅", category: "Needs",    color: "#E6F5EE" },
  // Activities
  { label: "Play",      emoji: "🎮", category: "Activity", color: "#E6F5EE" },
  { label: "Read",      emoji: "📖", category: "Activity", color: "#FDF3E3" },
  { label: "Walk",      emoji: "🚶", category: "Activity", color: "#E8F0FD" },
  { label: "Music",     emoji: "🎵", category: "Activity", color: "#EDE9FB" },
  { label: "Draw",      emoji: "✏️", category: "Activity", color: "#FDF3E3" },
  { label: "Puzzle",    emoji: "🧩", category: "Activity", color: "#EDE9FB" },
  { label: "Swim",      emoji: "🏊", category: "Activity", color: "#E8F0FD" },
  { label: "Dance",     emoji: "💃", category: "Activity", color: "#FDE8E8" },
  // Feelings
  { label: "Happy",     emoji: "😊", category: "Feelings", color: "#E6F5EE" },
  { label: "Sad",       emoji: "😢", category: "Feelings", color: "#E8F0FD" },
  { label: "Angry",     emoji: "😠", category: "Feelings", color: "#FDE8E8" },
  { label: "Scared",    emoji: "😨", category: "Feelings", color: "#FDF3E3" },
  { label: "Tired",     emoji: "😪", category: "Feelings", color: "#EDE9FB" },
  { label: "Calm",      emoji: "😌", category: "Feelings", color: "#E6F5EE" },
  { label: "Excited",   emoji: "🤩", category: "Feelings", color: "#FDF3E3" },
  { label: "Hurt",      emoji: "🤕", category: "Feelings", color: "#FDE8E8" },
  // Places
  { label: "Home",      emoji: "🏠", category: "Places",   color: "#FDF3E3" },
  { label: "School",    emoji: "🏫", category: "Places",   color: "#E8F0FD" },
  { label: "Outside",   emoji: "🌳", category: "Places",   color: "#E6F5EE" },
  { label: "Car",       emoji: "🚗", category: "Places",   color: "#EDE9FB" },
  // People
  { label: "Mom",       emoji: "👩", category: "People",   color: "#FDE8E8" },
  { label: "Dad",       emoji: "👨", category: "People",   color: "#E8F0FD" },
  { label: "Doctor",    emoji: "👩‍⚕️", category: "People",  color: "#E6F5EE" },
  { label: "Teacher",   emoji: "👩‍🏫", category: "People",  color: "#FDF3E3" },
];

const CATEGORIES = ["All", ...Array.from(new Set(PECS_CARDS.map((c) => c.category)))];

export default function VisualBoardPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [selected, setSelected] = useState<PecsCard[]>([]);
  const [spoken, setSpoken] = useState<string | null>(null);

  const filtered = activeCategory === "All"
    ? PECS_CARDS
    : PECS_CARDS.filter((c) => c.category === activeCategory);

  const speakCard = (card: PecsCard) => {
    // Add to selection sentence
    setSelected((prev) => [...prev, card]);

    // Text-to-speech
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(card.label);
      utterance.rate = 0.85;
      utterance.pitch = 1.1;
      window.speechSynthesis.speak(utterance);
    }

    setSpoken(card.label);
    setTimeout(() => setSpoken(null), 1500);
  };

  const speakSentence = () => {
    if (selected.length === 0) return;
    const sentence = selected.map((c) => c.label).join(" ");
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.rate = 0.8;
      window.speechSynthesis.speak(utterance);
    }
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "900px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "1.5rem" }}>🖼️</span>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Visual Communication Board</h1>
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          PECS-style picture cards for non-verbal and augmentative communication. Tap a card to hear it spoken aloud.
        </p>
      </div>

      <FeatureTour
        featureKey="visual"
        icon="🖼️"
        title="Visual Communication Board"
        summary="PECS-style picture communication cards that speak aloud when tapped. Designed for non-verbal children or those who communicate better through images than words."
        tips={[
          "Tap any card to hear it spoken aloud using your device's text-to-speech.",
          "Build a sentence by tapping multiple cards — then tap 'Speak Sentence' to say them all.",
          "Filter cards by category: Needs, Activities, Feelings, Places, People.",
          "Works offline — no internet needed once the page has loaded.",
          "Show this screen directly to your child — the large colourful cards are designed for easy tapping.",
        ]}
        accentColor="var(--amber)"
      />

      {/* Sentence strip */}
      <div
        style={{
          padding: "0.875rem 1rem",
          backgroundColor: "var(--surface)",
          border: "2px solid var(--border)",
          borderRadius: "12px",
          marginBottom: "1.25rem",
          minHeight: "72px",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        {selected.length === 0 ? (
          <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Tap cards below to build a sentence…
          </span>
        ) : (
          <>
            {selected.map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "0.4rem 0.65rem",
                  backgroundColor: card.color,
                  border: "1.5px solid var(--border)",
                  borderRadius: "8px",
                  cursor: "pointer",
                  gap: "0.1rem",
                }}
                onClick={() => setSelected((prev) => prev.filter((_, idx) => idx !== i))}
                title="Tap to remove"
              >
                <span style={{ fontSize: "1.3rem" }}>{card.emoji}</span>
                <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--text-secondary)" }}>{card.label}</span>
              </motion.div>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
              <button className="btn-primary" onClick={speakSentence} style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}>
                🔊 Speak
              </button>
              <button className="btn-secondary" onClick={() => setSelected([])} style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}>
                Clear
              </button>
            </div>
          </>
        )}
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: "0.4rem 0.875rem",
              borderRadius: "999px",
              border: `1.5px solid ${activeCategory === cat ? "var(--accent)" : "var(--border)"}`,
              backgroundColor: activeCategory === cat ? "var(--accent-light)" : "var(--canvas)",
              color: activeCategory === cat ? "var(--accent)" : "var(--text-secondary)",
              fontSize: "0.82rem",
              fontWeight: activeCategory === cat ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.12s",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((card) => (
            <motion.button
              key={card.label}
              layout
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => speakCard(card)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "1rem 0.5rem",
                backgroundColor: card.color,
                border: `2px solid ${spoken === card.label ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "12px",
                cursor: "pointer",
                gap: "0.4rem",
                boxShadow: spoken === card.label ? "0 0 0 3px var(--accent-light)" : "none",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
              aria-label={card.label}
            >
              <span style={{ fontSize: "2rem", lineHeight: 1 }}>{card.emoji}</span>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-primary)", textAlign: "center", lineHeight: 1.2 }}>
                {card.label}
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      <p style={{ marginTop: "1.25rem", fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>
        Tap any card to add it to the sentence strip and hear it spoken. Browser speech synthesis required.
      </p>
    </div>
  );
}
