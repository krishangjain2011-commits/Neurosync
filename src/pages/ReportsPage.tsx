import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost, apiDelete } from "../lib/api";
import FeatureTour from "../components/FeatureTour";

interface ShareEntry {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
  granted_at: string;
}

interface ReportData {
  generatedAt: string;
  child: {
    name: string;
    age?: number;
    diagnoses: string[];
    sensoryTriggers: string[];
    strengths: string[];
    goals: string[];
  };
  progressSummary: Record<string, { latest: number; count: number; avg: number }>;
  recentProgress: { metric_type: string; value: number; timestamp: string }[];
  latestDietPlan: any;
  latestRoutine: any;
}

const METRIC_LABELS: Record<string, string> = {
  calm_down_interval: "Calm-down Interval (min)",
  routines_completed: "Routines Completed",
  meltdown_intensity: "Meltdown Intensity",
  focus_duration:     "Focus Duration (min)",
  sleep_quality:      "Sleep Quality",
};

const ROLE_LABELS: Record<string, string> = {
  parent:             "Parent",
  caregiver:          "Caregiver",
  anganwadi_worker:   "Anganwadi Worker",
  special_educator:   "Special Educator",
  asha_worker:        "ASHA Worker",
  district_admin:     "District Admin",
};

const ROLE_COLORS: Record<string, string> = {
  parent:           "var(--accent)",
  caregiver:        "var(--blue)",
  anganwadi_worker: "var(--green)",
  special_educator: "var(--amber)",
  asha_worker:      "var(--green)",
  district_admin:   "var(--red)",
};

export default function ReportsPage() {
  const { activeChild, user } = useAuth();
  const childId = activeChild?.id;
  const printRef = useRef<HTMLDivElement>(null);

  const [tab, setTab]                 = useState<"report" | "share">("report");
  const [report, setReport]           = useState<ReportData | null>(null);
  const [narrative, setNarrative]     = useState("");
  const [shares, setShares]           = useState<ShareEntry[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [shareEmail, setShareEmail]   = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareMsg, setShareMsg]       = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [revokeLoading, setRevokeLoading] = useState<number | null>(null);

  const [error, setError]             = useState("");

  const fetchReport = async () => {
    if (!childId) return;
    setLoadingReport(true);
    setError("");
    try {
      const data = await apiGet<ReportData>(`/api/children/${childId}/report`);
      setReport(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingReport(false);
    }
  };

  const fetchNarrative = async () => {
    if (!childId) return;
    setLoadingNarrative(true);
    try {
      const data = await apiPost<{ narrative: string }>(
        `/api/children/${childId}/report/narrative`, {}
      );
      setNarrative(data.narrative);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingNarrative(false);
    }
  };

  const fetchShares = async () => {
    if (!childId) return;
    try {
      const data = await apiGet<ShareEntry[]>(`/api/children/${childId}/shares`);
      setShares(data);
    } catch {}
  };

  useEffect(() => {
    if (childId) { fetchReport(); fetchShares(); }
  }, [childId]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childId || !shareEmail.trim()) return;
    setShareLoading(true);
    setShareMsg(null);
    try {
      const res = await apiPost<{ status: string; sharedWith?: string; role?: string }>(
        `/api/children/${childId}/share`, { email: shareEmail.trim() }
      );
      if (res.status === "already_shared") {
        setShareMsg({ type: "ok", text: `Already shared with ${shareEmail}` });
      } else {
        setShareMsg({ type: "ok", text: `✅ Report shared with ${shareEmail} (${ROLE_LABELS[res.role ?? ""] ?? res.role})` });
        setShareEmail("");
        fetchShares();
      }
    } catch (e: any) {
      setShareMsg({ type: "err", text: e.message });
    } finally {
      setShareLoading(false);
    }
  };

  const handleRevoke = async (targetUserId: number, email: string) => {
    if (!childId) return;
    setRevokeLoading(targetUserId);
    try {
      await apiDelete(`/api/children/${childId}/share/${targetUserId}`);
      setShares(prev => prev.filter(s => s.id !== targetUserId));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRevokeLoading(null);
    }
  };

  const handlePrint = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head>
        <title>NeuroSync Report — ${report?.child.name}</title>
        <style>
          body { font-family: Georgia, serif; padding: 2rem; color: #2C1F14; max-width: 800px; margin: 0 auto; }
          h1 { font-size: 1.5rem; color: #8B5CF6; margin-bottom: 0.25rem; }
          h2 { font-size: 1.1rem; border-bottom: 1px solid #E8DCCF; padding-bottom: 0.3rem; margin-top: 1.5rem; }
          h3 { font-size: 0.95rem; margin: 0.75rem 0 0.3rem; color: #6B4F38; }
          .tag { display: inline-block; background: #F3EEFF; color: #6D28D9; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.8rem; margin: 0.15rem; }
          .metric { display: flex; justify-content: space-between; padding: 0.35rem 0; border-bottom: 1px solid #F2E9DC; font-size: 0.9rem; }
          .narrative { line-height: 1.8; font-size: 0.95rem; white-space: pre-wrap; }
          .footer { margin-top: 2rem; font-size: 0.75rem; color: #A08468; border-top: 1px solid #E8DCCF; padding-top: 0.75rem; }
          @media print { button { display: none; } }
        </style>
      </head><body>${content}
        <div class="footer">Generated by NeuroSync AI Caretaker · ${new Date().toLocaleDateString("en-IN")} · For caregiving use only. Not a clinical diagnosis.</div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const childName = activeChild?.onboarding_data?.childName ?? "Child";

  return (
    <div style={{ padding: "1.5rem", maxWidth: "800px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <div style={{
            width: "40px", height: "40px", borderRadius: "10px",
            background: "linear-gradient(135deg, var(--green) 0%, var(--blue) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem",
          }}>📋</div>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Reports & Sharing</h1>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Generate progress reports and share with Anganwadi workers, schools, or doctors
            </p>
          </div>
        </div>
      </div>

      <FeatureTour
        featureKey="reports"
        icon="📋"
        title="Reports & Sharing"
        summary="Generates a complete child development report from all the data you've logged — progress metrics, diet plans, routines, strengths, and goals. Share it by email or grant direct in-app access to Anganwadi workers, schools, or doctors."
        tips={[
          "Click 'Generate AI Narrative' for a professional summary paragraph ready to share with a specialist.",
          "Print the report using the Print button — it formats cleanly for A4.",
          "Email the report directly to an institution using the email field (requires Resend API key).",
          "Share tab: grant a worker or teacher access to your child's profile using their email — they must have a NeuroSync account.",
          "You can revoke access at any time from the Share tab.",
        ]}
        accentColor="var(--green)"
      />

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {([
          { key: "report", label: "📄 Generate Report" },
          { key: "share",  label: `👥 Share Access (${shares.length})` },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{
            padding: "0.5rem 1.25rem", borderRadius: "10px", cursor: "pointer", fontSize: "0.85rem",
            fontWeight: tab === t.key ? 600 : 400,
            border: `1.5px solid ${tab === t.key ? "var(--accent)" : "var(--border)"}`,
            background: tab === t.key ? "linear-gradient(135deg, var(--accent-light), var(--honey-light))" : "transparent",
            color: tab === t.key ? "var(--accent)" : "var(--text-secondary)",
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "10px", marginBottom: "1rem", fontSize: "0.83rem" }}>
          {error}
        </div>
      )}

      {/* ── REPORT TAB ── */}
      {tab === "report" && (
        <>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={fetchReport} disabled={loadingReport || !childId}>
              {loadingReport ? "Loading…" : "🔄 Refresh Data"}
            </button>
            <button className="btn-secondary" onClick={fetchNarrative} disabled={loadingNarrative || !childId}>
              {loadingNarrative ? "Generating…" : "✨ Generate AI Summary"}
            </button>
            {report && (
              <button className="btn-secondary" onClick={handlePrint}>
                🖨️ Print / Save PDF
              </button>
            )}
          </div>

          {loadingReport && (
            <div className="card" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "2rem", justifyContent: "center" }}>
              <div className="spinner" />
              <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Loading report data…</span>
            </div>
          )}

          {/* Empty state — no report loaded yet */}
          {!report && !loadingReport && !error && (
            <div className="card" style={{ textAlign: "center", padding: "2.5rem 2rem", border: "2px dashed var(--border)", backgroundColor: "var(--canvas)" }}>
              <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>📋</div>
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                No report loaded yet
              </h3>
              <p style={{ margin: "0 0 1.25rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.65, maxWidth: "380px", marginLeft: "auto", marginRight: "auto" }}>
                Click <strong>Refresh Data</strong> above to pull the latest progress, diet plans, and routines for {childName} into a printable report. Then use <strong>Generate AI Summary</strong> for a professional narrative.
              </p>
              <button className="btn-primary" onClick={fetchReport} disabled={!childId}>
                🔄 Load Report
              </button>
            </div>
          )}

          {/* Printable report area */}
          <AnimatePresence>
            {report && !loadingReport && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div ref={printRef}>
                  {/* Title */}
                  <div style={{
                    background: "linear-gradient(135deg, var(--accent-light) 0%, var(--honey-light) 100%)",
                    border: "1px solid var(--border)", borderRadius: "14px",
                    padding: "1.25rem 1.5rem", marginBottom: "1.25rem",
                  }}>
                    <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.2rem", fontWeight: 700, color: "var(--accent)" }}>
                      Child Development Report
                    </h1>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      Generated: {new Date(report.generatedAt).toLocaleString("en-IN")} · For: {report.child.name}
                    </p>
                    <p style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: "var(--amber)", fontWeight: 500 }}>
                      ⚕️ This report is based on caregiver-logged data. It is NOT a clinical diagnosis.
                    </p>
                  </div>

                  {/* Child profile */}
                  <div className="card" style={{ marginBottom: "1rem" }}>
                    <h2 style={{ margin: "0 0 0.875rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      👶 Child Profile
                    </h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                      {[
                        ["Name", report.child.name],
                        ["Age", report.child.age ? `${report.child.age} years` : "Not specified"],
                      ].map(([label, val]) => (
                        <div key={label as string}>
                          <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>{label}</div>
                          <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {[
                      ["Diagnoses / Conditions", report.child.diagnoses, "var(--accent)", "var(--accent-light)"],
                      ["Sensory Triggers", report.child.sensoryTriggers, "var(--red)", "var(--red-light)"],
                      ["Strengths", report.child.strengths, "var(--green)", "var(--green-light)"],
                      ["Caregiver Goals", report.child.goals, "var(--blue)", "var(--blue-light)"],
                    ].map(([label, items, color, bg]) => (
                      (items as string[]).length > 0 && (
                        <div key={label as string} style={{ marginTop: "0.875rem" }}>
                          <div style={{ fontSize: "0.72rem", fontWeight: 600, color: color as string, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.35rem" }}>
                            {label as string}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                            {(items as string[]).map((item, i) => (
                              <span key={i} style={{ padding: "0.2rem 0.6rem", backgroundColor: bg as string, color: color as string, borderRadius: "999px", fontSize: "0.78rem", fontWeight: 500 }}>
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>

                  {/* Progress metrics */}
                  {Object.keys(report.progressSummary).length > 0 && (
                    <div className="card" style={{ marginBottom: "1rem" }}>
                      <h2 style={{ margin: "0 0 0.875rem", fontSize: "0.95rem", fontWeight: 700 }}>📈 Progress Summary</h2>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                            {["Metric", "Latest", "Average", "Entries"].map(h => (
                              <th key={h} style={{ textAlign: "left", padding: "0.4rem 0.5rem", fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(report.progressSummary).map(([key, val], i) => (
                            <tr key={key} style={{ borderBottom: "1px solid var(--border)", backgroundColor: i % 2 === 0 ? "transparent" : "var(--surface-2)" }}>
                              <td style={{ padding: "0.45rem 0.5rem" }}>{METRIC_LABELS[key] ?? key}</td>
                              <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600 }}>{val.latest}</td>
                              <td style={{ padding: "0.45rem 0.5rem" }}>{val.avg}</td>
                              <td style={{ padding: "0.45rem 0.5rem", color: "var(--text-muted)" }}>{val.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Latest routine */}
                  {report.latestRoutine && (
                    <div className="card" style={{ marginBottom: "1rem" }}>
                      <h2 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", fontWeight: 700 }}>📅 Latest Daily Routine</h2>
                      <p style={{ margin: "0 0 0.3rem", fontSize: "0.85rem", fontWeight: 600 }}>{report.latestRoutine.title}</p>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>{report.latestRoutine.focusGoal}</p>
                      <p style={{ margin: "0.3rem 0 0", fontSize: "0.72rem", color: "var(--text-muted)" }}>Saved: {new Date(report.latestRoutine.savedAt).toLocaleDateString("en-IN")}</p>
                    </div>
                  )}

                  {/* AI Narrative */}
                  {loadingNarrative && (
                    <div className="card" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1.5rem", justifyContent: "center" }}>
                      <div className="spinner" />
                      <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Generating professional summary with AI…</span>
                    </div>
                  )}

                  {narrative && !loadingNarrative && (
                    <div className="card" style={{ borderLeft: "3px solid var(--green)", background: "linear-gradient(135deg, var(--surface) 0%, var(--green-light) 100%)" }}>
                      <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700, color: "var(--green)" }}>
                        ✨ AI-Generated Professional Summary
                      </h2>
                      <div className="prose-neurosync" style={{ whiteSpace: "pre-wrap" }}>{narrative}</div>
                      <p style={{ margin: "0.75rem 0 0", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        AI-generated. Review before sharing. Not a clinical document.
                      </p>
                    </div>
                  )}
                </div>

                {/* Print button again at bottom */}
                {(report || narrative) && (
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
                    <button className="btn-primary" onClick={handlePrint}>
                      🖨️ Print / Save as PDF
                    </button>
                    <button className="btn-secondary" onClick={() => setTab("share")}>
                      👥 Share with Institution →
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ── SHARE TAB ── */}
      {tab === "share" && (
        <div>
          {/* Info banner */}
          <div style={{
            padding: "1rem 1.25rem",
            background: "linear-gradient(90deg, var(--blue-light) 0%, var(--accent-light) 100%)",
            border: "1px solid var(--border)", borderRadius: "12px", marginBottom: "1.25rem",
          }}>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.65 }}>
              <strong>How sharing works:</strong> Enter the email address of the Anganwadi worker, special educator, ASHA worker, or doctor.
              They must have a NeuroSync account — ask them to register at this app first.
              Once shared, they can view <strong>{childName}'s</strong> progress, diet plans, and routines but cannot edit or delete data.
            </p>
          </div>

          {/* Share form */}
          <div className="card" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Add Institution / Worker</h2>
            <form onSubmit={handleShare} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px" }}>
                <label className="label">Worker / Institution email</label>
                <input
                  className="input"
                  type="email"
                  value={shareEmail}
                  onChange={e => setShareEmail(e.target.value)}
                  placeholder="e.g. worker@anganwadi.gov.in"
                  required
                />
              </div>
              <div style={{ alignSelf: "flex-end" }}>
                <button className="btn-primary" type="submit" disabled={shareLoading || !shareEmail.trim()}>
                  {shareLoading ? "Sharing…" : "Share Access →"}
                </button>
              </div>
            </form>

            {shareMsg && (
              <div style={{
                marginTop: "0.75rem", padding: "0.6rem 0.875rem", borderRadius: "8px",
                backgroundColor: shareMsg.type === "ok" ? "var(--green-light)" : "var(--red-light)",
                color: shareMsg.type === "ok" ? "var(--green)" : "var(--red)",
                fontSize: "0.83rem", fontWeight: 500,
              }}>
                {shareMsg.text}
              </div>
            )}
          </div>

          {/* Current shares list */}
          <div className="card">
            <h2 style={{ margin: "0 0 0.875rem", fontSize: "0.95rem", fontWeight: 600 }}>
              People with access to {childName}'s profile
            </h2>

            {shares.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                No one else has access yet. Share above to add an institution or worker.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {shares.map(s => {
                  const isMe = s.id === user?.id;
                  const roleColor = ROLE_COLORS[s.role] ?? "var(--text-muted)";
                  return (
                    <div key={s.id} style={{
                      display: "flex", alignItems: "center", gap: "0.75rem",
                      padding: "0.75rem 1rem", borderRadius: "10px",
                      backgroundColor: isMe ? "var(--accent-light)" : "var(--canvas)",
                      border: `1px solid ${isMe ? "var(--accent)" : "var(--border)"}`,
                    }}>
                      <div style={{
                        width: "36px", height: "36px", borderRadius: "50%",
                        backgroundColor: roleColor + "22",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "1rem", flexShrink: 0,
                      }}>
                        {s.role === "anganwadi_worker" ? "🏫"
                          : s.role === "asha_worker" ? "🏥"
                          : s.role === "special_educator" ? "📚"
                          : s.role === "parent" ? "👪" : "👤"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {s.display_name || s.email}
                          {isMe && <span style={{ marginLeft: "0.4rem", fontSize: "0.7rem", color: "var(--accent)" }}>(you)</span>}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{s.email}</div>
                      </div>
                      <span style={{
                        padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 600,
                        backgroundColor: roleColor + "18", color: roleColor,
                      }}>
                        {ROLE_LABELS[s.role] ?? s.role}
                      </span>
                      {!isMe && (
                        <button
                          onClick={() => handleRevoke(s.id, s.email)}
                          disabled={revokeLoading === s.id}
                          style={{
                            padding: "0.3rem 0.65rem", borderRadius: "7px", border: "1px solid var(--red-light)",
                            backgroundColor: "var(--red-light)", color: "var(--red)",
                            fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", flexShrink: 0,
                          }}
                        >
                          {revokeLoading === s.id ? "…" : "Revoke"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
