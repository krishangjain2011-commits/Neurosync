import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOffline } from "../context/OfflineContext";
import { useLang } from "../context/LangContext";
import { apiPost } from "../lib/api";
import FeatureTour from "../components/FeatureTour";

interface SentenceResult {
  sentence: string;
}

const PECS_CARDS = [
  { id: "eat",       emoji: "🍽️",  label: "Eat",        category: "Needs"    },
  { id: "drink",     emoji: "💧",  label: "Drink",       category: "Needs"    },
  { id: "toilet",    emoji: "🚽",  label: "Bathroom",    category: "Needs"    },
  { id: "sleep",     emoji: "😴",  label: "Sleep",       category: "Needs"    },
  { id: "pain",      emoji: "🤕",  label: "Hurts",       category: "Feelings" },
  { id: "happy",     emoji: "😊",  label: "Happy",       category: "Feelings" },
  { id: "sad",       emoji: "😢",  label: "Sad",         category: "Feelings" },
  { id: "scared",    emoji: "😨",  label: "Scared",      category: "Feelings" },
  { id: "angry",     emoji: "😠",  label: "Angry",       category: "Feelings" },
  { id: "tired",     emoji: "😫",  label: "Tired",       category: "Feelings" },
  { id: "calm",      emoji: "😌",  label: "Calm",        category: "Feelings" },
  { id: "play",      emoji: "🎮",  label: "Play",        category: "Activity" },
  { id: "music",     emoji: "🎵",  label: "Music",       category: "Activity" },
  { id: "outside",   emoji: "🌳",  label: "Outside",     category: "Activity" },
  { id: "book",      emoji: "📚",  label: "Book",        category: "Activity" },
  { id: "draw",      emoji: "🎨",  label: "Draw",        category: "Activity" },
  { id: "tv",        emoji: "📺",  label: "TV",          category: "Activity" },
  { id: "hug",       emoji: "🤗",  label: "Hug",         category: "Social"   },
  { id: "help",      emoji: "🙋",  label: "Help",        category: "Social"   },
  { id: "stop",      emoji: "✋",  label: "Stop",        category: "Social"   },
  { id: "more",      emoji: "➕",  label: "More",        category: "Social"   },
  { id: "finished",  emoji: "✅",  label: "Done",        category: "Social"   },
  { id: "home",      emoji: "🏠",  label: "Home",        category: "Places"   },
  { id: "school",    emoji: "🏫",  label: "School",      category: "Places"   },
  { id: "doctor",    emoji: "👨‍⚕️", label: "Doctor",      category: "Places"   },
  { id: "hot",       emoji: "🌡️",  label: "Hot",         category: "Sensory"  },
  { id: "cold",      emoji: "🥶",  label: "Cold",        category: "Sensory"  },
  { id: "loud",      emoji: "🔊",  label: "Loud",        category: "Sensory"  },
  { id: "quiet",     emoji: "🤫",  label: "Quiet",       category: "Sensory"  },
  { id: "light",     emoji: "💡",  label: "Light",       category: "Sensory"  },
];

export default function VisualBoardPage() {
  const { activeChild } = useAuth();
  const { t } = useLang();
  const { isOnline } = useOffline();
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState("Needs");
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [sentence, setSentence] = useState("");
  const [building, setBuilding] = useState(false);

  const childId = activeChild?.id;
  const categories = useMemo(() => Array.from(new Set(PECS_CARDS.map(card => card.category))), []);
  const selectedLabels = selectedCards
    .map(id => PECS_CARDS.find(card => card.id === id)?.label ?? "")
    .filter(Boolean);

  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore speech failures
    }
  };

  const toggleCard = (cardId: string) => {
    setSaved(false);
    setError("");
    setSelectedCards(prev => {
      const next = prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId];
      if (!prev.includes(cardId)) {
        const card = PECS_CARDS.find(c => c.id === cardId);
        if (card) speakText(card.label);
      }
      return next;
    });
  };

  const clearBoard = () => {
    setSelectedCards([]);
    setSaved(false);
    setError("");
  };

  const handleConfirm = async () => {
    if (!childId || !selectedCards.length) return;
    setSaving(true);
    setError("");
    try {
      await apiPost(`/api/children/${childId}/progress`, {
        metric_type: "visual_board",
        value: selectedCards.length,
      });
      setSaved(true);
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const buildSentence = async () => {
    if (!selectedLabels.length) return;
    setBuilding(true);
    setError("");
    try {
      const prompt =
        `Translate these communication board symbols into one short natural sentence ` +
        `that a child likely means: ${selectedLabels.join(", ")}. ` +
        `Return JSON only with a single field named sentence.`;

      const result = await apiPost<SentenceResult>("/api/gemini/structured", { prompt });
      if (!result?.sentence) throw new Error("AI did not return a sentence.");
      setSentence(result.sentence);
      speakText(result.sentence);
    } catch (err: any) {
      setError(err.message || "Sentence generation failed");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "1.5rem" }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.9rem", color: "var(--accent)", marginBottom: "0.35rem" }}>{t("visualBoardSubtitle")}</div>
            <h1 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.1, fontWeight: 800 }}>{t("visualBoardTitle")}</h1>
          </div>
          <button
            onClick={() => navigate(-1)}
            style={{ padding: "0.8rem 1rem", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", cursor: "pointer", fontWeight: 700 }}
          >Back</button>
        </div>

        <FeatureTour
          featureKey="tour_visual_board"
          icon="🖼️"
          title={t("visualBoardTitle")}
          summary="Build simple photo-sentence boards to help your child communicate wants and feelings."
          tips={[
            "Tap pictures to add them to the board.",
            "Use clear actions like Eat, Drink, or Help.",
            "Save the board so the app can remember when visual communication was used.",
          ]}
          accentColor="var(--purple)"
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.25rem" }}>
          <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "18px", padding: "1.25rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Card library</h2>
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>Tap a card to add or remove it from the visual board.</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {categories.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveCategory(category)}
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "999px",
                      border: `1px solid ${activeCategory === category ? "var(--accent)" : "var(--border)"}`,
                      background: activeCategory === category ? "var(--accent-light)" : "transparent",
                      color: activeCategory === category ? "var(--accent)" : "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                    }}
                  >{category}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))", gap: "0.75rem" }}>
              {PECS_CARDS.filter(card => card.category === activeCategory).map(card => {
                const active = selectedCards.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => toggleCard(card.id)}
                    style={{
                      borderRadius: "16px",
                      border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                      background: active ? "var(--accent-light)" : "var(--surface-2)",
                      color: active ? "var(--text-primary)" : "var(--text-secondary)",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.45rem",
                      cursor: "pointer",
                      minHeight: "100px",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <span style={{ fontSize: "1.55rem" }}>{card.emoji}</span>
                    <span style={{ fontSize: "0.94rem", fontWeight: 700 }}>{card.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "18px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Your board</h2>
              <p style={{ margin: "0.45rem 0 0", fontSize: "0.83rem", color: "var(--text-secondary)" }}>{t("visualBoardEmpty")}</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(80px,1fr))", gap: "0.65rem" }}>
              {selectedCards.length > 0 ? selectedLabels.map((label, idx) => (
                <div key={`${label}-${idx}`} style={{ padding: "0.85rem", borderRadius: "14px", background: "var(--surface-2)", border: "1px solid var(--border)", textAlign: "center", fontSize: "0.9rem", fontWeight: 600 }}>
                  {label}
                </div>
              )) : (
                <div style={{ gridColumn: "1 / -1", padding: "1rem", borderRadius: "14px", background: "var(--surface-2)", border: "1px dashed var(--border)", color: "var(--text-secondary)", textAlign: "center" }}>
                  {t("visualBoardEmpty")}
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.45rem" }}>{t("visualBoardResult")}</div>
              <p style={{ margin: 0, lineHeight: 1.7, color: "var(--text-secondary)" }}>
                {sentence
                  ? sentence
                  : selectedLabels.length > 0
                    ? `This board may mean: ${selectedLabels.join(" ")}.`
                    : "Select cards to see an interpretation."}
              </p>
            </div>

            {error && (
              <div style={{ color: "var(--red)", background: "var(--red-light)", padding: "0.9rem", borderRadius: "12px", fontSize: "0.85rem" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={buildSentence}
                disabled={!selectedCards.length || building}
                style={{
                  flex: 1,
                  minWidth: "120px",
                  padding: "0.95rem 1rem",
                  borderRadius: "12px",
                  border: "none",
                  background: "var(--accent)",
                  color: "white",
                  fontWeight: 700,
                  cursor: selectedCards.length && !building ? "pointer" : "not-allowed",
                }}
              >
                {building ? t("visualBoardBuilding") : t("visualBoardBuild")}
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!selectedCards.length || saving}
                style={{
                  flex: 1,
                  minWidth: "120px",
                  padding: "0.95rem 1rem",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontWeight: 700,
                  cursor: selectedCards.length && !saving ? "pointer" : "not-allowed",
                }}
              >
                {saving ? t("visualBoardBuilding") : t("visualBoardConfirm")}
              </button>
              <button
                type="button"
                onClick={clearBoard}
                style={{
                  flex: 1,
                  minWidth: "120px",
                  padding: "0.95rem 1rem",
                  borderRadius: "12px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {t("visualBoardClear")}
              </button>
            </div>

            {saved && (
              <div style={{ padding: "0.9rem", borderRadius: "12px", background: "var(--green-light)", color: "var(--green)", fontWeight: 600, textAlign: "center" }}>
                {t("visualBoardSaved")}
              </div>
            )}

            {!isOnline && (
              <div style={{ padding: "0.9rem", borderRadius: "12px", background: "var(--amber-light)", color: "var(--amber)", fontSize: "0.85rem", lineHeight: 1.6 }}>
                Offline mode: saving will work when your device returns online.
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
