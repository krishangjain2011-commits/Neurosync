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

interface Slot { time: string; activity: string; type: "therapy"|"play"|"break"|"meal"|"learning"|"transition"; duration: string; materials?: string[]; tips?: string; }
interface Schedule { title: string; slots: Slot[]; parentTips: string[]; focusGoal: string; }

const TYPE_STYLE: Record<string, { bg: string; color: string; emoji: string }> = {
  therapy:    { bg: "var(--color-accent-soft)",       color: "var(--color-accent)",       emoji: "🧩" },
  play:       { bg: "var(--color-success-light)",     color: "var(--color-success)",      emoji: "🎮" },
  break:      { bg: "var(--color-secondary-soft)",    color: "var(--color-secondary)",    emoji: "☁️" },
  meal:       { bg: "var(--color-warning-light)",     color: "var(--color-warning)",      emoji: "🍽️" },
  learning:   { bg: "var(--color-primary-soft)",      color: "var(--color-primary)",      emoji: "📖" },
  transition: { bg: "var(--color-error-light)",       color: "var(--color-error)",        emoji: "🔄" },
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
    <div style={{ padding: "1.5rem", maxWidth: "900px", margin: "0 auto", backgroundColor: "var(--color-bg)" }}>
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "var(--radius-lg)",
            background: "var(--gradient-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            boxShadow: "0 2px 8px rgba(91, 123, 148, 0.15)",
          }}>
            📅
          </div>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--color-text)",
            }}>
              Daily Routine Planner
            </h1>
            <p style={{
              margin: "0.25rem 0 0",
              fontSize: "0.85rem",
              color: "var(--color-text-muted)",
            }}>
              AI-crafted timed therapy and play schedules.
            </p>
          </div>
        </div>
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
        accentColor="var(--color-secondary)"
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
              backgroundColor: tab === t ? "var(--color-secondary)" : "transparent",
              color: tab === t ? "white" : "var(--color-text-muted)",
              fontSize: "0.9rem",
              fontWeight: tab === t ? 600 : 500,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              if (tab !== t) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--color-secondary-soft)";
            }}
            onMouseLeave={(e) => {
              if (tab !== t) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            }}
          >
            {t === "generate" ? "Create Schedule" : `History (${history.length})`}
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
              Session Parameters
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              <FormGroup label="Focus area">
                <Input
                  value={focusArea}
                  onChange={e => setFocusArea(e.target.value)}
                  placeholder="e.g. communication, focus"
                />
              </FormGroup>
              <FormGroup label="Duration (hours)">
                <select
                  value={hours}
                  onChange={e => setHours(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.625rem 0.875rem",
                    borderRadius: "var(--radius-md)",
                    border: `1.5px solid var(--color-secondary-soft)`,
                    backgroundColor: "var(--color-surface)",
                    color: "var(--color-text)",
                    fontSize: "0.95rem",
                    fontFamily: "var(--font-body)",
                    cursor: "pointer",
                    outline: "none",
                    transition: "border-color 0.16s",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--color-secondary)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--color-secondary-soft)")}
                >
                  {["1","2","3","4","6","8"].map(h => <option key={h} value={h}>{h}h</option>)}
                </select>
              </FormGroup>
            </div>

            <FormGroup label="Activity intensity">
              <div style={{ display: "flex", gap: "0.75rem" }}>
                {(["low","medium","high"] as const).map(l => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setIntensity(l)}
                    style={{
                      flex: 1,
                      padding: "0.6rem",
                      borderRadius: "var(--radius-md)",
                      border: `2px solid ${intensity === l ? "var(--color-secondary)" : "var(--color-secondary-soft)"}`,
                      backgroundColor: intensity === l ? "var(--color-secondary-soft)" : "var(--color-surface)",
                      color: intensity === l ? "var(--color-secondary-dark)" : "var(--color-text-muted)",
                      fontSize: "0.85rem",
                      fontWeight: intensity === l ? 600 : 500,
                      cursor: "pointer",
                      transition: "all 0.16s",
                    }}
                  >
                    {l === "low" ? "🌿 Low" : l === "medium" ? "⚡ Medium" : "🔥 High"}
                  </button>
                ))}
              </div>
            </FormGroup>

            <Button
              variant="primary"
              onClick={generate}
              disabled={loading}
              loading={loading}
              fullWidth
              style={{ marginTop: "1.5rem" }}
            >
              Generate Schedule →
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
                  border: `3px solid var(--color-secondary-soft)`,
                  borderTopColor: "var(--color-secondary)",
                  borderRadius: "var(--radius-full)",
                }}
              />
              <span style={{ fontSize: "0.9rem", color: "var(--color-text-muted)" }}>Crafting schedule…</span>
            </Card>
          )}

          <AnimatePresence>
            {schedule && !loading && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Card size="md" style={{
                  marginBottom: "1.5rem",
                  borderLeft: `4px solid var(--color-secondary)`,
                  background: "linear-gradient(135deg, var(--color-secondary-soft) 0%, var(--color-surface) 100%)",
                }}>
                  <h2 style={{
                    margin: "0 0 0.5rem",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "var(--color-secondary-dark)",
                  }}>
                    {schedule.title}
                  </h2>
                  <p style={{
                    margin: 0,
                    fontSize: "0.9rem",
                    color: "var(--color-text-muted)",
                  }}>
                    🎯 {schedule.focusGoal}
                  </p>
                </Card>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
                  {schedule.slots?.map((slot, i) => {
                    const st = TYPE_STYLE[slot.type] || TYPE_STYLE.break;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        style={{
                          display: "flex",
                          gap: "1rem",
                          padding: "1rem",
                          borderRadius: "var(--radius-lg)",
                          backgroundColor: "var(--color-surface)",
                          border: `1.5px solid ${st.color}`,
                          borderLeft: `4px solid ${st.color}`,
                        }}
                      >
                        <div style={{ textAlign: "center", minWidth: "56px", flexShrink: 0 }}>
                          <div style={{
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            color: "var(--color-secondary)",
                          }}>
                            {slot.time}
                          </div>
                          <div style={{
                            fontSize: "0.7rem",
                            color: "var(--color-text-muted)",
                            marginTop: "0.2rem",
                          }}>
                            {slot.duration}
                          </div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.6rem",
                            marginBottom: "0.5rem",
                          }}>
                            <span style={{ fontSize: "1.2rem" }}>{st.emoji}</span>
                            <span style={{
                              fontSize: "0.9rem",
                              fontWeight: 600,
                              color: "var(--color-text)",
                            }}>
                              {slot.activity}
                            </span>
                            <span style={{
                              marginLeft: "auto",
                              padding: "0.3rem 0.75rem",
                              backgroundColor: st.bg,
                              color: st.color,
                              borderRadius: "var(--radius-full)",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              textTransform: "capitalize",
                            }}>
                              {slot.type}
                            </span>
                          </div>
                          {slot.materials && slot.materials.length > 0 && (
                            <div style={{
                              fontSize: "0.8rem",
                              color: "var(--color-text-muted)",
                              marginBottom: "0.4rem",
                            }}>
                              📦 {slot.materials.join(", ")}
                            </div>
                          )}
                          {slot.tips && (
                            <div style={{
                              fontSize: "0.8rem",
                              color: "var(--color-secondary-dark)",
                              backgroundColor: "var(--color-secondary-soft)",
                              padding: "0.4rem 0.6rem",
                              borderRadius: "var(--radius-md)",
                              borderLeft: `2px solid var(--color-secondary)`,
                            }}>
                              💡 {slot.tips}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {schedule.parentTips?.length > 0 && (
                  <Card size="md" style={{
                    marginBottom: "1.5rem",
                    backgroundColor: "var(--color-warning-light)",
                    borderLeft: `4px solid var(--color-warning)`,
                  }}>
                    <div style={{
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: "var(--color-warning)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: "0.75rem",
                    }}>
                      💛 Caregiver Tips
                    </div>
                    <ul style={{
                      margin: 0,
                      paddingLeft: "1.5rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}>
                      {schedule.parentTips.map((t, i) => (
                        <li key={i} style={{
                          fontSize: "0.85rem",
                          color: "var(--color-text)",
                          lineHeight: 1.5,
                        }}>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <Button
                    variant="success"
                    onClick={save}
                    disabled={saving || !childId}
                    loading={saving}
                  >
                    💾 Save
                  </Button>
                  <Button variant="secondary" onClick={() => setSchedule(null)}>
                    Create New
                  </Button>
                </div>
              </motion.div>
            )}

            {/* First-run / empty state */}
            {!schedule && !loading && !error && (
              <motion.div key="therapy-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card size="md" style={{
                  textAlign: "center",
                  padding: "3rem 2rem",
                  border: `2px dashed var(--color-secondary-soft)`,
                  backgroundColor: "var(--color-surface)",
                }}>
                  <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>📅</div>
                  <h3 style={{
                    margin: "0 0 0.75rem",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "var(--color-text)",
                  }}>
                    Your daily schedule will appear here
                  </h3>
                  <p style={{
                    margin: "0 0 1.5rem",
                    fontSize: "0.9rem",
                    color: "var(--color-text-muted)",
                    lineHeight: 1.6,
                    maxWidth: "420px",
                    marginLeft: "auto",
                    marginRight: "auto",
                  }}>
                    Set a focus area, choose duration and intensity above, then hit <strong>Generate Schedule</strong> to get a colour-coded timed routine.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.75rem" }}>
                    {["🧩 Communication", "🏃 Motor skills", "😌 Regulation", "📖 Focus & Learning"].map(s => (
                      <span key={s} style={{
                        padding: "0.5rem 1rem",
                        borderRadius: "var(--radius-full)",
                        backgroundColor: "var(--color-secondary-soft)",
                        color: "var(--color-secondary-dark)",
                        fontSize: "0.8rem",
                        fontWeight: 500,
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </Card>
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
                <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📅</div>
                <p style={{ margin: 0, fontSize: "0.95rem" }}>No saved schedules yet.</p>
              </Card>
            )
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {history.map((h, i) => (
                  <Card key={i} size="md">
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "0.75rem",
                    }}>
                      <span style={{
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}>
                        {h.title || `Schedule #${history.length - i}`}
                      </span>
                      <span style={{
                        fontSize: "0.8rem",
                        color: "var(--color-text-muted)",
                        whiteSpace: "nowrap",
                        marginLeft: "1rem",
                      }}>
                        {new Date(h.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{
                      margin: "0 0 1rem",
                      fontSize: "0.85rem",
                      color: "var(--color-text-muted)",
                    }}>
                      {h.focusGoal}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setSchedule(h); setTab("generate"); }}
                    >
                      View →
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
