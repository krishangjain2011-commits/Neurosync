import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { apiPost, apiGet } from "../lib/api";

interface DayMeal { day: string; breakfast: string; lunch: string; dinner: string; snacks: string[]; sensoryNotes: string; allergenWarnings: string[]; }
interface DietPlan { weeklyPlan: DayMeal[]; generalNotes: string; nutritionFocus: string[]; }

const DIETARY = ["Gluten-free","Dairy-free","Nut-free","Low-sugar","High-protein","Egg-free","Soy-free","Soft textures only"];
const TEXTURES = ["Smooth / pureed","Soft foods only","No mixed textures","Crunchy preferred","No extreme temperatures","No strong smells"];

export default function DietPage() {
  const { activeChild } = useAuth();
  const childId = activeChild?.id;
  const [dietary, setDietary]   = useState<string[]>([]);
  const [textures, setTextures] = useState<string[]>([]);
  const [notes, setNotes]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [plan, setPlan]         = useState<DietPlan | null>(null);
  const [history, setHistory]   = useState<any[]>([]);
  const [tab, setTab]           = useState<"generate" | "history">("generate");
  const [error, setError]       = useState("");

  useEffect(() => {
    if (!childId) return;
    apiGet<any[]>(`/api/children/${childId}/diet`).then(setHistory).catch(() => {});
  }, [childId]);

  const toggle = (arr: string[], setArr: any, v: string) => setArr((p: string[]) => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);

  const generate = async () => {
    setLoading(true); setError(""); setPlan(null);
    const profile = activeChild?.onboarding_data as any;
    const prompt = `Generate a 7-day sensory-aware meal plan for a child:
Diagnoses: ${profile?.diagnoses?.join(", ") || "Not specified"}
Sensory triggers: ${profile?.sensoryTriggers?.join(", ") || "None"}
Dietary restrictions: ${dietary.join(", ") || "None"}
Texture preferences: ${textures.join(", ") || "None"}
Notes: ${notes || "None"}

Return JSON: { "weeklyPlan": [{ "day":"Monday","breakfast":"..","lunch":"..","dinner":"..","snacks":[],"sensoryNotes":"..","allergenWarnings":[] }], "generalNotes":"..","nutritionFocus":[] }`;
    try { setPlan(await apiPost<DietPlan>("/api/gemini/structured", { prompt })); }
    catch (err: any) { setError(err.message || "Generation failed."); }
    finally { setLoading(false); }
  };

  const save = async () => {
    if (!plan || !childId) return;
    setSaving(true);
    try {
      await apiPost(`/api/children/${childId}/diet`, { plan });
      setHistory(await apiGet<any[]>(`/api/children/${childId}/diet`));
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: "1.5rem", maxWidth: "800px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "1.5rem" }}>🥗</span>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Diet Planner</h1>
        </div>
        <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-secondary)" }}>Sensory-aware, structured weekly meal plans.</p>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {(["generate","history"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "0.45rem 1rem", borderRadius: "8px", border: `1.5px solid ${tab === t ? "var(--accent)" : "var(--border)"}`, backgroundColor: tab === t ? "var(--accent-light)" : "transparent", color: tab === t ? "var(--accent)" : "var(--text-secondary)", fontSize: "0.83rem", fontWeight: tab === t ? 600 : 400, cursor: "pointer" }}>
            {t === "generate" ? "Generate Plan" : `History (${history.length})`}
          </button>
        ))}
      </div>

      {tab === "generate" && (
        <>
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Preferences</h2>
            <div style={{ marginBottom: "1rem" }}>
              <label className="label">Dietary restrictions</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {DIETARY.map(d => { const a = dietary.includes(d); return (
                  <button key={d} type="button" onClick={() => toggle(dietary, setDietary, d)}
                    style={{ padding: "0.35rem 0.65rem", borderRadius: "999px", border: `1.5px solid ${a ? "var(--green)" : "var(--border)"}`, backgroundColor: a ? "var(--green-light)" : "var(--canvas)", color: a ? "var(--green)" : "var(--text-secondary)", fontSize: "0.75rem", fontWeight: a ? 600 : 400, cursor: "pointer", transition: "all 0.12s" }}>{d}</button>
                ); })}
              </div>
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <label className="label">Texture preferences</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {TEXTURES.map(t => { const a = textures.includes(t); return (
                  <button key={t} type="button" onClick={() => toggle(textures, setTextures, t)}
                    style={{ padding: "0.35rem 0.65rem", borderRadius: "999px", border: `1.5px solid ${a ? "var(--blue)" : "var(--border)"}`, backgroundColor: a ? "var(--blue-light)" : "var(--canvas)", color: a ? "var(--blue)" : "var(--text-secondary)", fontSize: "0.75rem", fontWeight: a ? 600 : 400, cursor: "pointer", transition: "all 0.12s" }}>{t}</button>
                ); })}
              </div>
            </div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label className="label">Notes</label>
              <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any other mealtime considerations…" rows={2} style={{ resize: "vertical" }} />
            </div>
            <button className="btn-primary" onClick={generate} disabled={loading}>{loading ? "Generating…" : "Generate 7-Day Plan →"}</button>
          </div>
          {error && <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "10px", marginBottom: "1rem", fontSize: "0.83rem" }}>{error}</div>}
          {loading && <div className="card" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem", justifyContent: "center" }}>
            <div style={{ width: "20px", height: "20px", border: "2px solid var(--accent-light)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Building meal plan…</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>}
          <AnimatePresence>
            {plan && !loading && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div className="card" style={{ marginBottom: "1rem", borderLeft: "3px solid var(--green)" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.5rem" }}>
                    {plan.nutritionFocus?.map((f, i) => <span key={i} style={{ padding: "0.15rem 0.5rem", backgroundColor: "var(--green-light)", color: "var(--green)", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 500 }}>{f}</span>)}
                  </div>
                  <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{plan.generalNotes}</p>
                </div>
                <div style={{ display: "grid", gap: "0.875rem" }}>
                  {plan.weeklyPlan?.map((d, i) => (
                    <div key={i} className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                        <h3 style={{ margin: 0, fontSize: "0.88rem", fontWeight: 700, color: "var(--accent)" }}>{d.day}</h3>
                        {d.allergenWarnings?.length > 0 && <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem", backgroundColor: "var(--amber-light)", color: "var(--amber)", borderRadius: "4px", fontWeight: 500 }}>⚠️ {d.allergenWarnings.join(", ")}</span>}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginBottom: "0.5rem" }}>
                        {[["🌅", "Breakfast", d.breakfast],["☀️","Lunch",d.lunch],["🌙","Dinner",d.dinner]].map(([e,l,m]) => (
                          <div key={l as string} style={{ padding: "0.5rem", backgroundColor: "var(--canvas)", borderRadius: "7px", border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.2rem" }}>{e} {l}</div>
                            <div style={{ fontSize: "0.78rem" }}>{m}</div>
                          </div>
                        ))}
                      </div>
                      {d.snacks?.length > 0 && <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>🍎 <strong>Snacks:</strong> {d.snacks.join(" · ")}</div>}
                      {d.sensoryNotes && <div style={{ fontSize: "0.75rem", color: "var(--blue)", backgroundColor: "var(--blue-light)", padding: "0.35rem 0.55rem", borderRadius: "5px" }}>💡 {d.sensoryNotes}</div>}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
                  <button className="btn-primary" onClick={save} disabled={saving || !childId}>{saving ? "Saving…" : "💾 Save Plan"}</button>
                  <button className="btn-secondary" onClick={() => setPlan(null)}>Generate New</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {tab === "history" && (
        <div>
          {history.length === 0
            ? <div className="card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}><div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📋</div>No saved plans yet.</div>
            : <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                {history.map((p, i) => (
                  <div key={i} className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.83rem", fontWeight: 600 }}>Plan #{history.length - i}</span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                      {p.nutritionFocus?.map((f: string, j: number) => <span key={j} style={{ padding: "0.15rem 0.45rem", backgroundColor: "var(--green-light)", color: "var(--green)", borderRadius: "999px", fontSize: "0.7rem" }}>{f}</span>)}
                    </div>
                    <button className="btn-secondary" style={{ marginTop: "0.75rem", fontSize: "0.78rem" }} onClick={() => { setPlan(p); setTab("generate"); }}>View Plan →</button>
                  </div>
                ))}
              </div>
          }
        </div>
      )}
    </div>
  );
}
