import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOffline } from "../context/OfflineContext";
import { useLang } from "../context/LangContext";
import { apiPost } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
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
    <div style={{ minHeight: "100vh", padding: "1.5rem", backgroundColor: "#FBF8F3" }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.9rem", color: "#C07A5E", marginBottom: "0.35rem" }}>{t("visualBoardSubtitle")}</div>
            <h1 style={{ margin: 0, fontSize: "2rem", lineHeight: 1.1, fontWeight: 800, color: "#2D3748" }}>{t("visualBoardTitle")}</h1>
          </div>
          <Button variant="outline" onClick={() => navigate(-1)}>Back</Button>
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
          accentColor="#8DA28B"
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.25rem" }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Card library</h2>
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "#6B7280" }}>Tap a card to add or remove it from the visual board.</p>
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
                      border: `1px solid ${activeCategory === category ? "#C07A5E" : "#D1D5DB"}`,
                      background: activeCategory === category ? "#FFE5D9" : "transparent",
                      color: activeCategory === category ? "#C07A5E" : "#6B7280",
                      cursor: "pointer",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      transition: "all 0.15s ease",
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
                      border: `2px solid ${active ? "#C07A5E" : "#E5E7EB"}`,
                      background: active ? "#FFE5D9" : "#F9FAFB",
                      color: active ? "#C07A5E" : "#1F2937",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.45rem",
                      cursor: "pointer",
                      minHeight: "100px",
                      transition: "all 0.15s ease",
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ fontSize: "1.55rem" }}>{card.emoji}</span>
                    <span style={{ fontSize: "0.94rem", fontWeight: 700 }}>{card.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>Your board</h2>
              <p style={{ margin: "0.45rem 0 0", fontSize: "0.83rem", color: "#6B7280" }}>{t("visualBoardEmpty")}</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(80px,1fr))", gap: "0.65rem", marginTop: "1rem" }}>
              {selectedCards.length > 0 ? selectedLabels.map((label, idx) => (
                <div key={`${label}-${idx}`} style={{ padding: "0.85rem", borderRadius: "14px", background: "#E8F5F0", border: "1px solid #D1D5DB", textAlign: "center", fontSize: "0.9rem", fontWeight: 600, color: "#047857" }}>
                  {label}
                </div>
              )) : (
                <div style={{ gridColumn: "1 / -1", padding: "1rem", borderRadius: "14px", background: "#F3F4F6", border: "1px dashed #D1D5DB", color: "#6B7280", textAlign: "center" }}>
                  {t("visualBoardEmpty")}
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: "1rem", marginTop: "1rem" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1F2937", marginBottom: "0.45rem" }}>{t("visualBoardResult")}</div>
              <p style={{ margin: 0, lineHeight: 1.7, color: "#6B7280", fontSize: "0.9rem" }}>
                {sentence
                  ? sentence
                  : selectedLabels.length > 0
                    ? `This board may mean: ${selectedLabels.join(" ")}.`
                    : "Select cards to see an interpretation."}
              </p>
            </div>

            {error && (
              <div style={{ marginTop: "1rem" }}>
                <Alert type="error" icon="❌">{error}</Alert>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
              <Button
                variant="primary"
                onClick={buildSentence}
                disabled={!selectedCards.length || building}
                style={{ flex: 1, minWidth: "120px" }}
              >
                {building ? t("visualBoardBuilding") : t("visualBoardBuild")}
              </Button>
              <Button
                variant="outline"
                onClick={handleConfirm}
                disabled={!selectedCards.length || saving}
                style={{ flex: 1, minWidth: "120px" }}
              >
                {saving ? t("visualBoardBuilding") : t("visualBoardConfirm")}
              </Button>
              <Button
                variant="ghost"
                onClick={clearBoard}
                style={{ flex: 1, minWidth: "120px" }}
              >
                {t("visualBoardClear")}
              </Button>
            </div>

            {saved && (
              <div style={{ marginTop: "1rem", padding: "0.9rem", borderRadius: "12px", background: "#D1F2EB", color: "#047857", fontWeight: 600, textAlign: "center", fontSize: "0.9rem" }}>
                {t("visualBoardSaved")}
              </div>
            )}

            {!isOnline && (
              <Alert type="warning" icon="⚠️" style={{ marginTop: "1rem" }}>
                Offline mode: saving will work when your device returns online.
              </Alert>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
