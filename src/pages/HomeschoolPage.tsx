import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { apiPost } from "../lib/api";

interface LessonStep {
  step: number;
  title: string;
  instruction: string;
  learningStyle: "visual" | "auditory" | "kinesthetic";
  materials?: string[];
  duration: string;
  accommodations?: string;
}

interface LessonPlan {
  subject: string;
  topic: string;
  difficulty: string;
  objectives: string[];
  steps: LessonStep[];
  assessmentIdeas: string[];
  parentNotes: string;
}

const SUBJECTS = ["Math", "Reading", "Writing", "Science", "Social Studies", "Art", "Music", "Life Skills", "Communication"];
const DIFFICULTIES = ["Beginner", "Elementary", "Intermediate", "Advanced"];
const LEARNING_STYLES = ["Visual", "Auditory", "Kinesthetic", "Multi-modal"];

const STYLE_ICONS: Record<string, { emoji: string; color: string; bg: string }> = {
  visual:     { emoji: "👁️", color: "var(--accent)",  bg: "var(--accent-light)" },
  auditory:   { emoji: "👂", color: "var(--green)",   bg: "var(--green-light)"  },
  kinesthetic:{ emoji: "✋", color: "var(--amber)",   bg: "var(--amber-light)"  },
};

export default function HomeschoolPage() {
  const { activeChild } = useAuth();
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("Elementary");
  const [learningStyle, setLearningStyle] = useState("Multi-modal");
  const [loading, setLoading] = useState(false);
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!subject) return;
    setLoading(true);
    setError("");
    setLesson(null);

    const childProfile = activeChild?.onboarding_data as any;
    const prompt = `Create a detailed homeschool lesson plan for a neurodiverse child:

Child profile:
- Name: ${childProfile?.childName || "the child"}
- Age: ${childProfile?.childAge || "unknown"}
- Diagnoses: ${childProfile?.diagnoses?.join(", ") || "Not specified"}
- Learning strengths: ${childProfile?.strengths?.join(", ") || "Not specified"}
- Sensory considerations: ${childProfile?.sensoryTriggers?.join(", ") || "None specified"}

Lesson parameters:
- Subject: ${subject}
- Topic: ${topic || subject + " fundamentals"}
- Difficulty: ${difficulty}
- Primary learning style: ${learningStyle}

Create an engaging, neurodiversity-friendly lesson plan with clear, digestible steps. 
Include accommodations for the child's specific needs.

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
    } catch (err: any) {
      setError(err.message || "Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "760px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "1.5rem" }}>📚</span>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Homeschooling Helper</h1>
        </div>
        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Multi-modal lesson plans tailored to visual, auditory, and kinesthetic learning styles.
        </p>
      </div>

      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Lesson Setup</h2>

        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Subject</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {SUBJECTS.map((s) => (
              <button key={s} type="button" onClick={() => setSubject(s === subject ? "" : s)}
                style={{ padding: "0.4rem 0.75rem", borderRadius: "8px", border: `1.5px solid ${subject === s ? "var(--accent)" : "var(--border)"}`, backgroundColor: subject === s ? "var(--accent-light)" : "var(--canvas)", color: subject === s ? "var(--accent)" : "var(--text-secondary)", fontSize: "0.82rem", fontWeight: subject === s ? 600 : 400, cursor: "pointer", transition: "all 0.12s" }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Specific topic (optional)</label>
          <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={subject ? `e.g. ${subject === "Math" ? "counting to 20" : subject === "Reading" ? "sight words" : "specific concept"}` : "Select a subject first"} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
          <div>
            <label className="label">Difficulty level</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {DIFFICULTIES.map((d) => (
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
              {LEARNING_STYLES.map((ls) => (
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
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "2rem" }}>
          <div style={{ width: "20px", height: "20px", border: "2px solid var(--accent-light)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Creating personalized lesson plan…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      <AnimatePresence>
        {lesson && !loading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            {/* Header */}
            <div className="card" style={{ marginBottom: "1rem", borderLeft: "3px solid var(--accent)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ margin: "0 0 0.25rem", fontSize: "1rem", fontWeight: 700 }}>
                    {lesson.subject}: {lesson.topic}
                  </h2>
                  <span style={{ padding: "0.2rem 0.6rem", backgroundColor: "var(--accent-light)", color: "var(--accent)", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 600 }}>
                    {lesson.difficulty}
                  </span>
                </div>
              </div>

              {lesson.objectives?.length > 0 && (
                <div style={{ marginTop: "0.875rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                    Learning Objectives
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                    {lesson.objectives.map((obj, i) => (
                      <li key={i} style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "0.2rem" }}>{obj}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Steps */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
              {lesson.steps?.map((step, i) => {
                const styleInfo = STYLE_ICONS[step.learningStyle] || STYLE_ICONS.visual;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{ padding: "1rem", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
                      <div style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: styleInfo.bg, color: styleInfo.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, flexShrink: 0 }}>
                        {step.step}
                      </div>
                      <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600, flex: 1 }}>{step.title}</h3>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <span style={{ fontSize: "0.8rem" }}>{styleInfo.emoji}</span>
                        <span style={{ padding: "0.15rem 0.5rem", backgroundColor: styleInfo.bg, color: styleInfo.color, borderRadius: "4px", fontSize: "0.68rem", fontWeight: 600, textTransform: "capitalize" }}>
                          {step.learningStyle}
                        </span>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>• {step.duration}</span>
                      </div>
                    </div>

                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.6 }}>
                      {step.instruction}
                    </p>

                    {step.materials && step.materials.length > 0 && (
                      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                        📦 <strong>Materials:</strong> {step.materials.join(", ")}
                      </div>
                    )}

                    {step.accommodations && (
                      <div style={{ fontSize: "0.78rem", color: "var(--green)", backgroundColor: "var(--green-light)", padding: "0.35rem 0.6rem", borderRadius: "5px" }}>
                        ✅ <strong>Accommodation:</strong> {step.accommodations}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Assessment ideas */}
            {lesson.assessmentIdeas?.length > 0 && (
              <div className="card" style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                  📊 Assessment Ideas
                </div>
                <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  {lesson.assessmentIdeas.map((idea, i) => (
                    <li key={i} style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>{idea}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Parent notes */}
            {lesson.parentNotes && (
              <div className="card" style={{ backgroundColor: "var(--amber-light)", marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                  💛 Caregiver Notes
                </div>
                <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-primary)", lineHeight: 1.6 }}>
                  {lesson.parentNotes}
                </p>
              </div>
            )}

            <button className="btn-secondary" onClick={() => setLesson(null)}>Generate Another Lesson</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
