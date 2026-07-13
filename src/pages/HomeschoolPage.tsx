import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { apiPost, apiGet, apiDelete } from "../lib/api";
import FeatureTour from "../components/FeatureTour";

// ── Types ──────────────────────────────────────────────────────────────────

interface LessonStep {
  step: number; title: string; instruction: string;
  learningStyle: "visual" | "auditory" | "kinesthetic";
  materials?: string[]; duration: string; accommodations?: string;
}
interface LessonPlan {
  subject: string; topic: string; difficulty: string;
  objectives: string[]; steps: LessonStep[];
  assessmentIdeas: string[]; parentNotes: string;
}
interface FlaggedPatterns {
  b_d_reversals?: number; p_q_reversals?: number;
  other_reversals?: string[]; phonetic_substitutions?: string[];
  spacing_irregular?: boolean; sizing_inconsistent?: boolean;
  observations?: string;
}
interface HWSample {
  id: number; rawTranscription?: string; interpretedText?: string;
  raw_transcription?: string; interpreted_text?: string;
  flaggedPatterns?: FlaggedPatterns; flagged_patterns?: FlaggedPatterns;
  reversalCount?: number; phoneticCount?: number;
  caregiver_confirmed_text?: string; created_at?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SUBJECTS = ["Math","Reading","Writing","Science","Social Studies","Art","Music","Life Skills","Communication"];
const DIFFICULTIES = ["Beginner","Elementary","Intermediate","Advanced"];
const LEARNING_STYLES = ["Visual","Auditory","Kinesthetic","Multi-modal"];
const STYLE_ICONS: Record<string, { emoji: string; color: string; bg: string }> = {
  visual:      { emoji: "👁️", color: "var(--accent)",  bg: "var(--accent-light)" },
  auditory:    { emoji: "👂", color: "var(--green)",   bg: "var(--green-light)"  },
  kinesthetic: { emoji: "✋", color: "var(--amber)",   bg: "var(--amber-light)"  },
};

// ── Tab types ──────────────────────────────────────────────────────────────
type Tab = "lesson" | "handwriting";

// ── Handwriting sub-tool ───────────────────────────────────────────────────

function HandwritingTool({ childId }: { childId: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [retainImage, setRetainImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HWSample | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState<HWSample[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState("");

  const loadHistory = async () => {
    try {
      const data = await apiGet<HWSample[]>(`/api/children/${childId}/handwriting`);
      setHistory(data);
      setShowHistory(true);
    } catch (e: any) { setError(e.message); }
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!preview) return;
    setLoading(true); setError(""); setResult(null); setConfirmed(false); setConfirmText("");
    try {
      const data = await apiPost<HWSample>(`/api/children/${childId}/handwriting`, {
        imageData: preview, retainImage,
      });
      setResult(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const confirm = async () => {
    if (!result?.id || !confirmText.trim()) return;
    await apiPost(`/api/children/${childId}/handwriting/${result.id}`, { confirmedText: confirmText });
    setConfirmed(true);
  };

  const deleteSample = async (id: number) => {
    await apiDelete(`/api/children/${childId}/handwriting/${id}`);
    setHistory(h => h.filter(s => s.id !== id));
  };

  const fp = result?.flaggedPatterns ?? {};
  const reversals = (fp.b_d_reversals ?? 0) + (fp.p_q_reversals ?? 0) + (fp.other_reversals?.length ?? 0);
  const phonetic  = fp.phonetic_substitutions?.length ?? 0;

  return (
    <div>
      {/* Upload area */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 600 }}>✍️ Upload Handwriting Sample</h3>
        <p style={{ margin: "0 0 1rem", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Take a photo of your child's written work — homework, a note, or a worksheet.
          The AI will give you a literal reading and a corrected interpretation, noting any patterns like letter reversals.
        </p>

        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          style={{ border: "2px dashed var(--border)", borderRadius: "10px", padding: "1.5rem", textAlign: "center",
            cursor: "pointer", backgroundColor: "var(--canvas)", marginBottom: "0.75rem",
            transition: "border-color 0.12s" }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent)")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
        >
          {preview
            ? <img src={preview} alt="Preview" style={{ maxHeight: "200px", maxWidth: "100%", borderRadius: "6px", objectFit: "contain" }} />
            : <div>
                <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📷</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Click to upload or drag & drop</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>JPEG, PNG, WebP</div>
              </div>
          }
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

        {/* Retain image toggle */}
        <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem", cursor: "pointer" }}>
          <input type="checkbox" checked={retainImage} onChange={e => setRetainImage(e.target.checked)}
            style={{ width: "15px", height: "15px", accentColor: "var(--accent)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.79rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Keep image stored (by default only the text + patterns are saved — the photo is discarded after analysis)
          </span>
        </label>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={analyze} disabled={!preview || loading}>
            {loading ? "Analysing…" : "Analyse Handwriting →"}
          </button>
          {preview && <button className="btn-secondary" onClick={() => { setPreview(null); setResult(null); }}>Clear</button>}
          <button className="btn-secondary" onClick={loadHistory} style={{ marginLeft: "auto" }}>View History</button>
        </div>
      </div>

      {error && <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.83rem" }}>{error}</div>}

      {loading && (
        <div className="card" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1.5rem", marginBottom: "1rem" }}>
          <div style={{ width: "18px", height: "18px", border: "2px solid var(--accent-light)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Reading handwriting with dyslexia-aware AI…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>

            {/* Side-by-side readings */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.875rem", marginBottom: "1rem" }}>
              <div className="card" style={{ borderTop: "3px solid var(--text-muted)" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                  📝 Literal Reading
                </div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {result.rawTranscription}
                </p>
              </div>
              <div className="card" style={{ borderTop: "3px solid var(--accent)" }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                  ✨ Interpreted Reading
                </div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {result.interpretedText}
                </p>
              </div>
            </div>

            {/* Flagged patterns — shown as simple non-alarming tags */}
            <div className="card" style={{ marginBottom: "1rem", backgroundColor: "var(--amber-light)" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
                🔍 Patterns Noticed
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: fp.observations ? "0.75rem" : 0 }}>
                {reversals > 0 && (
                  <span style={{ padding: "0.25rem 0.65rem", backgroundColor: "white", borderRadius: "999px", fontSize: "0.78rem", color: "var(--amber)", fontWeight: 600, border: "1px solid var(--amber)" }}>
                    {reversals} letter reversal{reversals !== 1 ? "s" : ""} noticed
                  </span>
                )}
                {phonetic > 0 && (
                  <span style={{ padding: "0.25rem 0.65rem", backgroundColor: "white", borderRadius: "999px", fontSize: "0.78rem", color: "var(--blue)", fontWeight: 600, border: "1px solid var(--blue)" }}>
                    {phonetic} phonetic spelling{phonetic !== 1 ? "s" : ""}
                  </span>
                )}
                {fp.spacing_irregular && (
                  <span style={{ padding: "0.25rem 0.65rem", backgroundColor: "white", borderRadius: "999px", fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 600, border: "1px solid var(--border)" }}>
                    Irregular spacing
                  </span>
                )}
                {fp.sizing_inconsistent && (
                  <span style={{ padding: "0.25rem 0.65rem", backgroundColor: "white", borderRadius: "999px", fontSize: "0.78rem", color: "var(--text-secondary)", fontWeight: 600, border: "1px solid var(--border)" }}>
                    Inconsistent sizing
                  </span>
                )}
                {reversals === 0 && phonetic === 0 && !fp.spacing_irregular && !fp.sizing_inconsistent && (
                  <span style={{ padding: "0.25rem 0.65rem", backgroundColor: "white", borderRadius: "999px", fontSize: "0.78rem", color: "var(--green)", fontWeight: 600, border: "1px solid var(--green)" }}>
                    No significant patterns noticed
                  </span>
                )}
              </div>
              {fp.phonetic_substitutions && fp.phonetic_substitutions.length > 0 && (
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                  Phonetic examples: {fp.phonetic_substitutions.join(" · ")}
                </div>
              )}
              {fp.observations && (
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-primary)", lineHeight: 1.6, fontStyle: "italic" }}>
                  "{fp.observations}"
                </p>
              )}
              <p style={{ margin: "0.75rem 0 0", fontSize: "0.75rem", color: "var(--amber)", lineHeight: 1.5 }}>
                💡 These patterns are tracked over time in the Progress Tracker. Share trends with a learning specialist — not a clinical assessment.
              </p>
            </div>

            {/* Caregiver confirmation */}
            {!confirmed ? (
              <div className="card" style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                  ✏️ Confirm or Correct the Interpretation
                </div>
                <p style={{ margin: "0 0 0.6rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  If you know what your child meant to write, type it below. This helps improve accuracy for future samples.
                </p>
                <textarea value={confirmText} onChange={e => setConfirmText(e.target.value)} rows={2}
                  placeholder="What did the child actually mean to write?"
                  style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border)", backgroundColor: "var(--canvas)", color: "var(--text-primary)", fontSize: "0.875rem", fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.6rem" }}>
                  <button className="btn-primary" onClick={confirm} disabled={!confirmText.trim()}>Save Confirmation</button>
                  <button className="btn-secondary" onClick={() => setConfirmed(true)}>Skip</button>
                </div>
              </div>
            ) : (
              <div style={{ padding: "0.6rem 0.875rem", backgroundColor: "var(--green-light)", color: "var(--green)", borderRadius: "8px", fontSize: "0.83rem", marginBottom: "1rem", fontWeight: 500 }}>
                ✅ {confirmText.trim() ? "Confirmation saved." : "Skipped."} Pattern data has been added to the Progress Tracker.
              </div>
            )}

            <button className="btn-secondary" onClick={() => { setResult(null); setPreview(null); setConfirmed(false); setConfirmText(""); }}>
              Analyse Another Sample
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History panel */}
      <AnimatePresence>
        {showHistory && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  📂 Past Samples ({history.length})
                </div>
                <button onClick={() => setShowHistory(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "1rem" }}>✕</button>
              </div>
              {history.length === 0
                ? <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-muted)" }}>No samples yet.</p>
                : history.map(s => {
                    const sfp = s.flagged_patterns ?? {};
                    const sr = (sfp.b_d_reversals ?? 0) + (sfp.p_q_reversals ?? 0) + (sfp.other_reversals?.length ?? 0);
                    const sp = sfp.phonetic_substitutions?.length ?? 0;
                    return (
                      <div key={s.id} style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.75rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            {s.created_at ? new Date(s.created_at).toLocaleDateString("en-IN") : "—"}
                          </span>
                          <button onClick={() => deleteSample(s.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", fontSize: "0.75rem" }}>
                            Delete
                          </button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.4rem" }}>
                          <div style={{ fontSize: "0.79rem" }}>
                            <strong style={{ color: "var(--text-muted)" }}>Literal:</strong>{" "}
                            <span style={{ color: "var(--text-primary)" }}>{(s.raw_transcription ?? "").slice(0, 80)}{(s.raw_transcription ?? "").length > 80 ? "…" : ""}</span>
                          </div>
                          <div style={{ fontSize: "0.79rem" }}>
                            <strong style={{ color: "var(--accent)" }}>Interpreted:</strong>{" "}
                            <span style={{ color: "var(--text-primary)" }}>{(s.interpreted_text ?? "").slice(0, 80)}{(s.interpreted_text ?? "").length > 80 ? "…" : ""}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                          {sr > 0 && <span style={{ padding: "0.15rem 0.5rem", backgroundColor: "var(--amber-light)", color: "var(--amber)", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 600 }}>{sr} reversal{sr !== 1 ? "s" : ""}</span>}
                          {sp > 0 && <span style={{ padding: "0.15rem 0.5rem", backgroundColor: "var(--blue-light)", color: "var(--blue)", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 600 }}>{sp} phonetic</span>}
                          {s.caregiver_confirmed_text && <span style={{ padding: "0.15rem 0.5rem", backgroundColor: "var(--green-light)", color: "var(--green)", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 600 }}>✓ Confirmed</span>}
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function HomeschoolPage() {
  const { activeChild } = useAuth();
  const [tab, setTab] = useState<Tab>("lesson");

  // Lesson planner state
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("Elementary");
  const [learningStyle, setLearningStyle] = useState("Multi-modal");
  const [loading, setLoading] = useState(false);
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!subject) return;
    setLoading(true); setError(""); setLesson(null);
    const p = activeChild?.onboarding_data as any;
    const prompt = `Create a detailed homeschool lesson plan for a neurodiverse child.

Child profile:
- Name: ${p?.childName || "the child"}
- Age: ${p?.childAge || "unknown"}
- Diagnoses: ${p?.diagnoses?.join(", ") || "Not specified"}
- Learning strengths: ${p?.strengths?.join(", ") || "Not specified"}
- Sensory considerations: ${p?.sensoryTriggers?.join(", ") || "None specified"}

Lesson parameters:
- Subject: ${subject}
- Topic: ${topic || subject + " fundamentals"}
- Difficulty: ${difficulty}
- Primary learning style: ${learningStyle}

Return as JSON:
{
  "subject": "${subject}",
  "topic": "specific topic",
  "difficulty": "${difficulty}",
  "objectives": ["objective 1", "objective 2"],
  "steps": [
    {
      "step": 1,
      "title": "step title",
      "instruction": "detailed, clear instruction",
      "learningStyle": "visual|auditory|kinesthetic",
      "materials": ["item 1"],
      "duration": "10 minutes",
      "accommodations": "specific accommodation for this child"
    }
  ],
  "assessmentIdeas": ["idea 1", "idea 2"],
  "parentNotes": "overall guidance for the caregiver"
}`;
    try {
      const data = await apiPost<LessonPlan>("/api/gemini/structured", { prompt });
      setLesson(data);
    } catch (e: any) {
      setError(e.message || "Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "780px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "1.5rem" }}>📚</span>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Homeschooling Helper</h1>
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Multi-modal lesson plans · Dyslexia-aware handwriting interpreter
        </p>
      </div>

      <FeatureTour
        featureKey="homeschool"
        icon="📚"
        title="Homeschooling Helper"
        summary="Two tools in one: an AI lesson planner that creates multi-modal activities tailored to your child's learning style, and a dyslexia-aware handwriting interpreter that reads your child's written work and tracks letter reversal patterns over time."
        tips={[
          "Lesson Planner: pick a subject, topic, and difficulty — the AI creates a step-by-step lesson with visual, auditory, and kinesthetic activities.",
          "Each lesson step includes materials needed, duration, and a specific accommodation for your child.",
          "Handwriting Interpreter: upload or photograph your child's written work to get a literal + corrected reading side by side.",
          "Patterns like b/d reversals and phonetic spellings are shown as simple tags — never as scores or severity ratings.",
          "Pattern counts are automatically added to the Progress Tracker so you can see trends over weeks.",
          "Handwriting Interpreter requires a free Gemini API key (aistudio.google.com) for image analysis.",
        ]}
        accentColor="var(--blue)"
      />

      {/* Tab switcher */}
      <div style={{ display: "flex", backgroundColor: "var(--surface-2)", borderRadius: "10px", padding: "3px", marginBottom: "1.5rem", gap: "2px" }}>
        {([
          { id: "lesson",      label: "📖 Lesson Planner" },
          { id: "handwriting", label: "✍️ Handwriting Interpreter" },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: "0.5rem 0.75rem", borderRadius: "8px", border: "none",
              cursor: "pointer", fontSize: "0.83rem", fontWeight: tab === t.id ? 600 : 400,
              backgroundColor: tab === t.id ? "var(--canvas)" : "transparent",
              color: tab === t.id ? "var(--accent)" : "var(--text-muted)",
              boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.15s",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Handwriting tab */}
      {tab === "handwriting" && activeChild && (
        <HandwritingTool childId={activeChild.id} />
      )}

      {/* Lesson Planner tab */}
      {tab === "lesson" && (
        <>
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Lesson Setup</h2>

            <div style={{ marginBottom: "1rem" }}>
              <label className="label">Subject</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {SUBJECTS.map(s => (
                  <button key={s} type="button" onClick={() => setSubject(s === subject ? "" : s)}
                    style={{ padding: "0.4rem 0.75rem", borderRadius: "8px", border: `1.5px solid ${subject === s ? "var(--accent)" : "var(--border)"}`, backgroundColor: subject === s ? "var(--accent-light)" : "var(--canvas)", color: subject === s ? "var(--accent)" : "var(--text-secondary)", fontSize: "0.82rem", fontWeight: subject === s ? 600 : 400, cursor: "pointer", transition: "all 0.12s" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label className="label">Specific topic (optional)</label>
              <input className="input" value={topic} onChange={e => setTopic(e.target.value)}
                placeholder={subject ? `e.g. ${subject === "Math" ? "counting to 20" : subject === "Reading" ? "sight words" : "specific concept"}` : "Select a subject first"} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <label className="label">Difficulty level</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {DIFFICULTIES.map(d => (
                    <button key={d} type="button" onClick={() => setDifficulty(d)}
                      style={{ padding: "0.45rem 0.75rem", borderRadius: "7px", border: `1.5px solid ${difficulty === d ? "var(--accent)" : "var(--border)"}`, backgroundColor: difficulty === d ? "var(--accent-light)" : "var(--canvas)", color: difficulty === d ? "var(--accent)" : "var(--text-secondary)", fontSize: "0.82rem", fontWeight: difficulty === d ? 600 : 400, cursor: "pointer", textAlign: "left", transition: "all 0.12s" }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Learning style focus</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {LEARNING_STYLES.map(ls => (
                    <button key={ls} type="button" onClick={() => setLearningStyle(ls)}
                      style={{ padding: "0.45rem 0.75rem", borderRadius: "7px", border: `1.5px solid ${learningStyle === ls ? "var(--blue)" : "var(--border)"}`, backgroundColor: learningStyle === ls ? "var(--blue-light)" : "var(--canvas)", color: learningStyle === ls ? "var(--blue)" : "var(--text-secondary)", fontSize: "0.82rem", fontWeight: learningStyle === ls ? 600 : 400, cursor: "pointer", textAlign: "left", transition: "all 0.12s" }}>
                      {ls}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button className="btn-primary" onClick={generate} disabled={loading || !subject}>
              {loading ? "Building lesson plan…" : "Generate Lesson Plan →"}
            </button>
          </div>

          {error && <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "10px", marginBottom: "1rem", fontSize: "0.85rem" }}>{error}</div>}

          {loading && (
            <div className="card" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem" }}>
              <div style={{ width: "20px", height: "20px", border: "2px solid var(--accent-light)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Creating personalised lesson plan…</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          <AnimatePresence>
            {lesson && !loading && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="card" style={{ marginBottom: "1rem", borderLeft: "3px solid var(--accent)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h2 style={{ margin: "0 0 0.25rem", fontSize: "1rem", fontWeight: 700 }}>{lesson.subject}: {lesson.topic}</h2>
                      <span style={{ padding: "0.2rem 0.6rem", backgroundColor: "var(--accent-light)", color: "var(--accent)", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 600 }}>{lesson.difficulty}</span>
                    </div>
                  </div>
                  {lesson.objectives?.length > 0 && (
                    <div style={{ marginTop: "0.875rem" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>Learning Objectives</div>
                      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                        {lesson.objectives.map((o, i) => <li key={i} style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "0.2rem" }}>{o}</li>)}
                      </ul>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                  {lesson.steps?.map((step, i) => {
                    const si = STYLE_ICONS[step.learningStyle] || STYLE_ICONS.visual;
                    return (
                      <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        style={{ padding: "1rem", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
                          <div style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: si.bg, color: si.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, flexShrink: 0 }}>{step.step}</div>
                          <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, flex: 1 }}>{step.title}</h3>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <span style={{ fontSize: "0.8rem" }}>{si.emoji}</span>
                            <span style={{ padding: "0.15rem 0.5rem", backgroundColor: si.bg, color: si.color, borderRadius: "4px", fontSize: "0.68rem", fontWeight: 600, textTransform: "capitalize" }}>{step.learningStyle}</span>
                            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>• {step.duration}</span>
                          </div>
                        </div>
                        <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.6 }}>{step.instruction}</p>
                        {step.materials && step.materials.length > 0 && (
                          <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>📦 <strong>Materials:</strong> {step.materials.join(", ")}</div>
                        )}
                        {step.accommodations && (
                          <div style={{ fontSize: "0.78rem", color: "var(--green)", backgroundColor: "var(--green-light)", padding: "0.35rem 0.6rem", borderRadius: "5px" }}>✅ <strong>Accommodation:</strong> {step.accommodations}</div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                {lesson.assessmentIdeas?.length > 0 && (
                  <div className="card" style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>📊 Assessment Ideas</div>
                    <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                      {lesson.assessmentIdeas.map((idea, i) => <li key={i} style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>{idea}</li>)}
                    </ul>
                  </div>
                )}

                {lesson.parentNotes && (
                  <div className="card" style={{ backgroundColor: "var(--amber-light)", marginBottom: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>💛 Caregiver Notes</div>
                    <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.6 }}>{lesson.parentNotes}</p>
                  </div>
                )}

                <button className="btn-secondary" onClick={() => setLesson(null)}>Generate Another Lesson</button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
