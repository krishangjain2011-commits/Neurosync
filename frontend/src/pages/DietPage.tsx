import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { apiPost, apiGet } from "../lib/api";
import FeatureTour from "../components/FeatureTour";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { FormGroup } from "../components/ui/FormGroup";
import { Input } from "../components/ui/Input";

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
    <div style={{ padding: "1.5rem", maxWidth: "900px", margin: "0 auto", backgroundColor: "var(--color-bg)" }}>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "var(--radius-lg)",
            background: "var(--gradient-primary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            boxShadow: "0 2px 8px rgba(192, 122, 94, 0.15)",
          }}>
            🥗
          </div>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-text)",
            }}>
              Diet Planner
            </h1>
            <p style={{
              margin: "0.25rem 0 0",
              fontSize: "0.85rem",
              color: "var(--color-text-muted)",
            }}>
              Sensory-aware, personalised weekly meal plans.
            </p>
          </div>
        </div>
      </div>

      <FeatureTour
        featureKey="diet"
        icon="🥗"
        title="Diet Planner"
        summary="Generates a personalised 7-day meal plan that accounts for your child's sensory sensitivities, texture preferences, and dietary restrictions. Plans are saved so you can refer back to them."
        tips={[
          "Select dietary restrictions (gluten-free, dairy-free, etc.) before generating.",
          "Choose texture preferences — important for children with oral sensory sensitivities.",
          "Each day shows breakfast, lunch, dinner, and snacks with allergen warnings.",
          "Tap 'Save Plan' to store it — view past plans under the History tab.",
        ]}
        accentColor="var(--color-primary)"
      />

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: "0.75rem",
        marginBottom: "2rem",
        borderBottom: `2px solid var(--color-secondary-soft)`,
        paddingBottom: "1rem",
      }}>
        {(["generate","history"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: tab === t ? "var(--color-primary)" : "transparent",
              color: tab === t ? "white" : "var(--color-text-muted)",
              fontSize: "0.9rem",
              fontWeight: tab === t ? 600 : 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (tab !== t) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-primary-soft)";
            }}
            onMouseLeave={(e) => {
              if (tab !== t) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            {t === "generate" ? "Generate Plan" : `History (${history.length})`}
          </button>
        ))}
      </div>

      {tab === "generate" && (
        <>
          <Card size="md" style={{ marginBottom: "1.5rem" }}>
            <h2 style={{
              margin: "0 0 1.5rem",
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "var(--color-text)",
            }}>
              Meal Plan Preferences
            </h2>

            <div style={{ marginBottom: "1.75rem" }}>
              <FormGroup label="Dietary restrictions">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                  {DIETARY.map(d => {
                    const active = dietary.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggle(dietary, setDietary, d)}
                        style={{
                          padding: "0.6rem 1rem",
                          borderRadius: "var(--radius-full)",
                          border: `2px solid ${active ? "var(--color-accent)" : "var(--color-secondary-soft)"}`,
                          backgroundColor: active ? "var(--color-accent-soft)" : "var(--color-surface)",
                          color: active ? "var(--color-accent-dark)" : "var(--color-text-muted)",
                          fontSize: "0.875rem",
                          fontWeight: active ? 600 : 500,
                          cursor: "pointer",
                          transition: "all 0.16s",
                        }}
                        onMouseEnter={(e) => {
                          if (!active) (e.currentTarget as HTMLElement).style.borderColor = "var(--color-accent)";
                        }}
                        onMouseLeave={(e) => {
                          if (!active) (e.currentTarget as HTMLElement).style.borderColor = "var(--color-secondary-soft)";
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </FormGroup>
            </div>

            <div style={{ marginBottom: "1.75rem" }}>
              <FormGroup label="Texture preferences">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                  {TEXTURES.map(t => {
                    const active = textures.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggle(textures, setTextures, t)}
                        style={{
                          padding: "0.6rem 1rem",
                          borderRadius: "var(--radius-full)",
                          border: `2px solid ${active ? "var(--color-secondary)" : "var(--color-secondary-soft)"}`,
                          backgroundColor: active ? "var(--color-secondary-soft)" : "var(--color-surface)",
                          color: active ? "var(--color-secondary-dark)" : "var(--color-text-muted)",
                          fontSize: "0.875rem",
                          fontWeight: active ? 600 : 500,
                          cursor: "pointer",
                          transition: "all 0.16s",
                        }}
                        onMouseEnter={(e) => {
                          if (!active) (e.currentTarget as HTMLElement).style.borderColor = "var(--color-secondary)";
                        }}
                        onMouseLeave={(e) => {
                          if (!active) (e.currentTarget as HTMLElement).style.borderColor = "var(--color-secondary-soft)";
                        }}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </FormGroup>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <FormGroup label="Additional notes" helperText="Any other mealtime considerations…">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any other mealtime considerations…"
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
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-secondary-soft)")}
                />
              </FormGroup>
            </div>

            <Button
              variant="primary"
              onClick={generate}
              disabled={loading}
              loading={loading}
              fullWidth
            >
              Generate 7-Day Plan →
            </Button>
          </Card>

          {error && <Alert type="error" style={{ marginBottom: "1.5rem" }}>{error}</Alert>}

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
                  border: `3px solid var(--color-primary-soft)`,
                  borderTopColor: "var(--color-primary)",
                  borderRadius: "var(--radius-full)",
                }}
              />
              <span style={{ fontSize: "0.9rem", color: "var(--color-text-muted)" }}>Building meal plan…</span>
            </Card>
          )}

          <AnimatePresence>
            {plan && !loading && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Card size="md" style={{
                  marginBottom: "1.5rem",
                  borderLeft: `4px solid var(--color-accent)`,
                  background: "linear-gradient(135deg, var(--color-accent-soft) 0%, var(--color-surface) 100%)",
                }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                    {plan.nutritionFocus?.map((f, i) => (
                      <span
                        key={i}
                        style={{
                          padding: "0.4rem 0.875rem",
                          backgroundColor: "var(--color-accent)",
                          color: "white",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.8rem",
                          fontWeight: 600,
                        }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                  <p style={{
                    margin: 0,
                    fontSize: "0.95rem",
                    color: "var(--color-text)",
                    lineHeight: 1.6,
                  }}>
                    {plan.generalNotes}
                  </p>
                </Card>

                <div style={{ display: "grid", gap: "1rem", marginBottom: "1.5rem" }}>
                  {plan.weeklyPlan?.map((d, i) => (
                    <Card key={i} size="md">
                      <div style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "1rem",
                      }}>
                        <h3 style={{
                          margin: 0,
                          fontSize: "1rem",
                          fontWeight: 700,
                          color: "var(--color-primary)",
                        }}>
                          {d.day}
                        </h3>
                        {d.allergenWarnings?.length > 0 && (
                          <span style={{
                            fontSize: "0.75rem",
                            padding: "0.4rem 0.75rem",
                            backgroundColor: "var(--color-warning-light)",
                            color: "var(--color-warning)",
                            borderRadius: "var(--radius-md)",
                            fontWeight: 600,
                          }}>
                            ⚠️ {d.allergenWarnings.join(", ")}
                          </span>
                        )}
                      </div>

                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "0.75rem",
                        marginBottom: "1rem",
                      }}>
                        {[
                          ["🌅", "Breakfast", d.breakfast],
                          ["☀️", "Lunch", d.lunch],
                          ["🌙", "Dinner", d.dinner],
                        ].map(([emoji, label, meal]) => (
                          <div
                            key={label as string}
                            style={{
                              padding: "0.875rem",
                              backgroundColor: "var(--color-secondary-soft)",
                              borderRadius: "var(--radius-lg)",
                              border: `1px solid var(--color-secondary-light, #B8CDE1)`,
                            }}
                          >
                            <div style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: "var(--color-secondary-dark)",
                              marginBottom: "0.4rem",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.3rem",
                            }}>
                              <span>{emoji}</span> {label}
                            </div>
                            <div style={{
                              fontSize: "0.85rem",
                              color: "var(--color-text)",
                              lineHeight: 1.5,
                            }}>
                              {meal}
                            </div>
                          </div>
                        ))}
                      </div>

                      {d.snacks?.length > 0 && (
                        <div style={{
                          fontSize: "0.85rem",
                          color: "var(--color-text-muted)",
                          marginBottom: "0.75rem",
                          paddingBottom: "0.75rem",
                          borderBottom: `1px solid var(--color-secondary-soft)`,
                        }}>
                          <strong style={{ color: "var(--color-text)" }}>🍎 Snacks:</strong> {d.snacks.join(" · ")}
                        </div>
                      )}

                      {d.sensoryNotes && (
                        <div style={{
                          fontSize: "0.8rem",
                          color: "var(--color-secondary-dark)",
                          backgroundColor: "var(--color-secondary-soft)",
                          padding: "0.75rem",
                          borderRadius: "var(--radius-md)",
                          borderLeft: `3px solid var(--color-secondary)`,
                        }}>
                          💡 <strong>Sensory note:</strong> {d.sensoryNotes}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button
                    variant="success"
                    onClick={save}
                    disabled={saving || !childId}
                    loading={saving}
                  >
                    💾 Save Plan
                  </Button>
                  <Button variant="secondary" onClick={() => setPlan(null)}>
                    Generate New
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {tab === "history" && (
        <div>
          {history.length === 0
            ? (
              <Card size="md" style={{
                textAlign: "center",
                padding: "3rem 2rem",
                color: "var(--color-text-muted)",
              }}>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📋</div>
                <p style={{ margin: 0, fontSize: "0.95rem" }}>No saved plans yet.</p>
              </Card>
            )
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {history.map((p, i) => (
                  <Card key={i} size="md">
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.75rem",
                    }}>
                      <span style={{
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}>
                        Plan #{history.length - i}
                      </span>
                      <span style={{
                        fontSize: "0.8rem",
                        color: "var(--color-text-muted)",
                      }}>
                        {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
                      {p.nutritionFocus?.map((f: string, j: number) => (
                        <span
                          key={j}
                          style={{
                            padding: "0.35rem 0.75rem",
                            backgroundColor: "var(--color-accent-soft)",
                            color: "var(--color-accent-dark)",
                            borderRadius: "var(--radius-full)",
                            fontSize: "0.75rem",
                            fontWeight: 500,
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setPlan(p); setTab("generate"); }}
                    >
                      View Plan →
                    </Button>
                  </Card>
                ))}
              </div>
            )
          }
        </div>
      )}
    </div>
  );
}
