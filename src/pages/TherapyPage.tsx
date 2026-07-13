import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { apiPost, apiGet } from "../lib/api";
import FeatureTour from "../components/FeatureTour";

interface Slot { time: string; activity: string; type: "therapy"|"play"|"break"|"meal"|"learning"|"transition"; duration: string; materials?: string[]; tips?: string; }
interface Schedule { title: string; slots: Slot[]; parentTips: string[]; focusGoal: string; }

const TYPE_STYLE: Record<string, { bg: string; color: string; emoji: string }> = {
  therapy:    { bg: "var(--accent-light)",  color: "var(--accent)",  emoji: "🧩" },
  play:       { bg: "var(--green-light)",   color: "var(--green)",   emoji: "🎮" },
  break:      { bg: "var(--blue-light)",    color: "var(--blue)",    emoji: "☁️" },
  meal:       { bg: "var(--amber-light)",   color: "var(--amber)",   emoji: "🍽️" },
  learning:   { bg: "var(--surface-2)",     color: "var(--text-secondary)", emoji: "📖" },
  transition: { bg: "var(--red-light)",     color: "var(--red)",     emoji: "🔄" },
};

export default function TherapyPage() {
  const { activeChild } = useAuth();
  const childId = activeChild?.id;
  const [focusArea, setFocusArea]   = useState("");
  const [hours, setHours]           = useState("3");
  const [intensity, setIntensity]   = useState<"low"|"medium"|"high">("medium");
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [schedule, setSchedule]     = useState<Schedule | null>(null);
  const [history, setHistory]       = useState<any[]>([]);
  const [tab, setTab]               = useState<"generate"|"history">("generate");
  const [error, setError]           = useState("");

  useEffect(() => {
    if (!childId) return;
    apiGet<any[]>(`/api/children/${childId}/therapy`).then(setHistory).catch(() => {});
  }, [childId]);

  const generate = async () => {
    setLoading(true); setError(""); setSchedule(null);
    const p = activeChild?.onboarding_data as any;
    const prompt = `Create a daily routine schedule:
Child: ${p?.childName || "the child"}, age ${p?.childAge || "unknown"}
Diagnoses: ${p?.diagnoses?.join(", ") || "Not specified"}
Sensory triggers: ${p?.sensoryTriggers?.join(", ") || "None"}
Focus: ${focusArea || "general development"}, ${hours} hours, intensity: ${intensity}

Return JSON: { "title":"..","focusGoal":"..","slots":[{"time":"9:00 AM","activity":"..","type":"therapy|play|break|meal|learning|transition","duration":"15 minutes","materials":[],"tips":".."}],"parentTips":[] }`;
    try { setSchedule(await apiPost<Schedule>("/api/gemini/structured", { prompt })); }
    catch (err: any) { setError(err.message || "Generation failed."); }
    finally { setLoading(false); }
  };

  const save = async () => {
    if (!schedule || !childId) return;
    setSaving(true);
    try {
      await apiPost(`/api/children/${childId}/therapy`, { schedule });
      setHistory(await apiGet<any[]>(`/api/children/${childId}/therapy`));
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "760px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "1.5rem" }}>📅</span>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Daily Routine Planner</h1>
        </div>
        <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-secondary)" }}>AI-crafted timed therapy and play schedules.</p>
      </div>
      <FeatureTour
        featureKey="therapy"
        icon="📅"
        title="Daily Routine Planner"
        summary="Generates a structured daily schedule with timed therapy, play, meals, and breaks — tailored to your child's needs and the number of hours you have available."
        tips={[
          "Set a focus area (e.g. communication, motor skills) to tailor the schedule.",
          "Choose how many hours the routine should cover and the intensity level.",
          "Each slot shows the activity, duration, materials needed, and a sensory tip.",
          "Save schedules and revisit them under the History tab.",
          "Color-coded blocks: 🧩 therapy, 🎮 play, ☁️ break, 🍽️ meal, 📖 learning, 🔄 transition.",
        ]}
        accentColor="var(--accent)"
      />
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {(["generate","history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "0.45rem 1rem", borderRadius: "8px", border: `1.5px solid ${tab === t ? "var(--accent)" : "var(--border)"}`, backgroundColor: tab === t ? "var(--accent-light)" : "transparent", color: tab === t ? "var(--accent)" : "var(--text-secondary)", fontSize: "0.83rem", fontWeight: tab === t ? 600 : 400, cursor: "pointer" }}>
            {t === "generate" ? "Create Schedule" : `History (${history.length})`}
          </button>
        ))}
      </div>
      {tab === "generate" && (
        <>
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Session Parameters</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <label className="label">Focus area</label>
                <input className="input" value={focusArea} onChange={e => setFocusArea(e.target.value)} placeholder="e.g. communication, focus" />
              </div>
              <div>
                <label className="label">Duration (hours)</label>
                <select className="input" value={hours} onChange={e => setHours(e.target.value)} style={{ cursor: "pointer" }}>
                  {["1","2","3","4","6","8"].map(h => <option key={h} value={h}>{h}h</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label className="label">Activity intensity</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {(["low","medium","high"] as const).map(l => (
                  <button key={l} type="button" onClick={() => setIntensity(l)}
                    style={{ flex: 1, padding: "0.5rem", borderRadius: "8px", border: `1.5px solid ${intensity === l ? "var(--accent)" : "var(--border)"}`, backgroundColor: intensity === l ? "var(--accent-light)" : "var(--canvas)", color: intensity === l ? "var(--accent)" : "var(--text-secondary)", fontSize: "0.8rem", fontWeight: intensity === l ? 600 : 400, cursor: "pointer", textTransform: "capitalize" }}>
                    {l === "low" ? "🌿 Low" : l === "medium" ? "⚡ Medium" : "🔥 High"}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn-primary" onClick={generate} disabled={loading}>{loading ? "Building…" : "Generate Schedule →"}</button>
          </div>
          {error && <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "10px", marginBottom: "1rem", fontSize: "0.83rem" }}>{error}</div>}
          {loading && <div className="card" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem", justifyContent: "center" }}>
            <div style={{ width: "20px", height: "20px", border: "2px solid var(--accent-light)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Crafting schedule…</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>}
          <AnimatePresence>
            {schedule && !loading && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="card" style={{ marginBottom: "1rem", borderLeft: "3px solid var(--accent)" }}>
                  <h2 style={{ margin: "0 0 0.2rem", fontSize: "1rem", fontWeight: 700 }}>{schedule.title}</h2>
                  <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-secondary)" }}>🎯 {schedule.focusGoal}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginBottom: "1rem" }}>
                  {schedule.slots?.map((slot, i) => {
                    const st = TYPE_STYLE[slot.type] || TYPE_STYLE.break;
                    return (
                      <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                        style={{ display: "flex", gap: "0.75rem", padding: "0.75rem 1rem", borderRadius: "10px", backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
                        <div style={{ textAlign: "center", minWidth: "48px" }}>
                          <div style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--text-muted)" }}>{slot.time}</div>
                          <div style={{ fontSize: "0.63rem", color: "var(--text-muted)" }}>{slot.duration}</div>
                        </div>
                        <div style={{ width: "2px", backgroundColor: st.color, borderRadius: "1px", opacity: 0.4, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                            <span>{st.emoji}</span>
                            <span style={{ fontSize: "0.83rem", fontWeight: 600 }}>{slot.activity}</span>
                            <span style={{ padding: "0.12rem 0.4rem", backgroundColor: st.bg, color: st.color, borderRadius: "4px", fontSize: "0.65rem", fontWeight: 600, textTransform: "capitalize", marginLeft: "auto" }}>{slot.type}</span>
                          </div>
                          {slot.materials && slot.materials.length > 0 && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.15rem" }}>📦 {slot.materials.join(", ")}</div>}
                          {slot.tips && <div style={{ fontSize: "0.72rem", color: "var(--blue)", backgroundColor: "var(--blue-light)", padding: "0.25rem 0.45rem", borderRadius: "4px" }}>💡 {slot.tips}</div>}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                {schedule.parentTips?.length > 0 && (
                  <div className="card" style={{ marginBottom: "1rem", backgroundColor: "var(--amber-light)" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>💛 Caregiver Tips</div>
                    <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                      {schedule.parentTips.map((t, i) => <li key={i} style={{ fontSize: "0.83rem", marginBottom: "0.25rem" }}>{t}</li>)}
                    </ul>
                  </div>
                )}
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button className="btn-primary" onClick={save} disabled={saving || !childId}>{saving ? "Saving…" : "💾 Save"}</button>
                  <button className="btn-secondary" onClick={() => setSchedule(null)}>Create New</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
      {tab === "history" && (
        <div>
          {history.length === 0
            ? <div className="card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}><div style={{ fontSize: "2rem" }}>📅</div>No saved schedules yet.</div>
            : history.map((h, i) => (
                <div key={i} className="card" style={{ marginBottom: "0.875rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.83rem", fontWeight: 600 }}>{h.title || `Schedule #${history.length - i}`}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{new Date(h.created_at).toLocaleDateString()}</span>
                  </div>
                  <p style={{ margin: "0.3rem 0 0.75rem", fontSize: "0.78rem", color: "var(--text-secondary)" }}>{h.focusGoal}</p>
                  <button className="btn-secondary" style={{ fontSize: "0.78rem" }} onClick={() => { setSchedule(h); setTab("generate"); }}>View →</button>
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}
