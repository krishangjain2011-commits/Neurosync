import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost, apiDelete } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import { Input } from "../components/ui/Input";
import { FormGroup } from "../components/ui/FormGroup";
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
  parent:           "#C07A5E",
  caregiver:        "#5B7B94",
  anganwadi_worker: "#8DA28B",
  special_educator: "#D4A574",
  asha_worker:      "#8DA28B",
  district_admin:   "#DC2626",
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
          body { font-family: Georgia, serif; padding: 2rem; color: #2C1F14; max-width: 800px; margin: 0 auto; background:#fff; }
          h1 { font-size: 1.5rem; color: #C07A5E; margin-bottom: 0.25rem; }
          h2 { font-size: 1.1rem; border-bottom: 1px solid #E8DCCF; padding-bottom: 0.3rem; margin-top: 1.5rem; }
          h3 { font-size: 0.95rem; margin: 0.75rem 0 0.3rem; color: #6B4F38; }
          .tag { display: inline-block; background: #FFE5D9; color: #C07A5E; padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.8rem; margin: 0.15rem; }
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

  const exportCsvValue = (value: unknown) => {
    const str = value === null || value === undefined ? "" : String(value);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const buildExportCsv = () => {
    const rows: Array<{ section: string; key: string; value: string }> = [];

    if (user) {
      rows.push({ section: "user", key: "email", value: user.email });
      rows.push({ section: "user", key: "displayName", value: user.displayName ?? "" });
      rows.push({ section: "user", key: "role", value: user.role });
      rows.push({ section: "user", key: "preferredLanguage", value: user.preferredLanguage });
    }
    rows.push({ section: "session", key: "activeChildId", value: String(activeChild?.id ?? "") });
    rows.push({ section: "session", key: "activeChildName", value: activeChild?.onboarding_data?.childName ?? "" });

    if (report) {
      rows.push({ section: "report", key: "generatedAt", value: report.generatedAt });
      rows.push({ section: "report", key: "childName", value: report.child.name });
      rows.push({ section: "report", key: "childAge", value: report.child.age ? String(report.child.age) : "" });
      rows.push({ section: "report", key: "diagnoses", value: report.child.diagnoses.join("; ") });
      rows.push({ section: "report", key: "sensoryTriggers", value: report.child.sensoryTriggers.join("; ") });
      rows.push({ section: "report", key: "strengths", value: report.child.strengths.join("; ") });
      rows.push({ section: "report", key: "goals", value: report.child.goals.join("; ") });
      Object.entries(report.progressSummary).forEach(([metric, data]) => {
        rows.push({ section: "progressSummary", key: metric, value: `latest=${data.latest};count=${data.count};avg=${data.avg}` });
      });
      report.recentProgress.forEach((item, index) => {
        rows.push({ section: "recentProgress", key: `${index + 1}.${item.metric_type}`, value: `${item.value} @ ${item.timestamp}` });
      });
    }

    Object.keys(localStorage)
      .filter((key) => key.startsWith("neurosync_"))
      .forEach((key) => rows.push({ section: "localStorage", key, value: localStorage.getItem(key) ?? "" }));

    const header = ["section", "key", "value"].map(exportCsvValue).join(",");
    const body = rows.map((row) => [exportCsvValue(row.section), exportCsvValue(row.key), exportCsvValue(row.value)].join(",")).join("\n");
    return `${header}\n${body}`;
  };

  const handleExportCsv = () => {
    const csv = buildExportCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=UTF-8" });
    const url = URL.createObjectURL(blob);
    const fileName = `neurosync-export-${(activeChild?.onboarding_data?.childName ?? "user").replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const childName = activeChild?.onboarding_data?.childName ?? "Child";

  return (
    <div style={{ padding: "1.5rem", maxWidth: "900px", margin: "0 auto", backgroundColor: "#FBF8F3", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #8DA28B 0%, #5B7B94 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            boxShadow: "0 2px 8px rgba(141, 162, 139, 0.15)",
          }}>
            📋
          </div>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#2D3748",
            }}>
              Reports & Sharing
            </h1>
            <p style={{
              margin: "0.25rem 0 0",
              fontSize: "0.85rem",
              color: "#6B7280",
            }}>
              Generate progress reports and share with institutions or specialists.
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
          "Email the report directly to an institution using the email field (requires SMTP configuration).",
          "Share tab: grant a worker or teacher access to your child's profile using their email — they must have a NeuroSync account.",
          "You can revoke access at any time from the Share tab.",
        ]}
        accentColor="#8DA28B"
      />

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: "0.75rem",
        marginBottom: "2rem",
        borderBottom: "2px solid #E8F5F0",
        paddingBottom: "1rem",
        flexWrap: "wrap",
      }}>
        {([
          { key: "report", label: "📄 Generate Report" },
          { key: "share",  label: `👥 Share Access (${shares.length})` },
        ] as const).map(t => (
          <Button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            variant={tab === t.key ? "primary" : "ghost"}
            size="sm"
          >
            {t.label}
          </Button>
        ))}
      </div>

      {error && <Alert type="error" icon="❌" style={{ marginBottom: "1.5rem" }}>{error}</Alert>}

      {/* ── REPORT TAB ── */}
      {tab === "report" && (
        <>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
            <Button onClick={fetchReport} disabled={loadingReport || !childId} size="sm">
              {loadingReport ? "Loading…" : "🔄 Refresh Data"}
            </Button>
            <Button onClick={fetchNarrative} disabled={loadingNarrative || !childId} variant="secondary" size="sm">
              {loadingNarrative ? "Generating…" : "✨ Generate AI Summary"}
            </Button>
            <Button onClick={handleExportCsv} disabled={!user} variant="secondary" size="sm">
              📥 Export local CSV
            </Button>
            {report && (
              <Button onClick={handlePrint} variant="secondary" size="sm">
                🖨️ Print / Save PDF
              </Button>
            )}
          </div>

          {loadingReport && (
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1rem", justifyContent: "center" }}>
                <div style={{ width: "18px", height: "18px", border: "2px solid #FFE5D9", borderTopColor: "#C07A5E", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                <span style={{ fontSize: "0.875rem", color: "#6B7280" }}>Loading report data…</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            </Card>
          )}

          {/* Empty state — no report loaded yet */}
          {!report && !loadingReport && !error && (
            <Card>
              <div style={{ textAlign: "center", padding: "2.5rem 2rem" }}>
                <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>📋</div>
                <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700, color: "#2D3748" }}>
                  No report loaded yet
                </h3>
                <p style={{ margin: "0 0 1.25rem", fontSize: "0.85rem", color: "#6B7280", lineHeight: 1.65, maxWidth: "380px", marginLeft: "auto", marginRight: "auto" }}>
                  Click <strong>Refresh Data</strong> above to pull the latest progress, diet plans, and routines for {childName} into a printable report. Then use <strong>Generate AI Summary</strong> for a professional narrative.
                </p>
                <Button onClick={fetchReport} disabled={!childId}>
                  🔄 Load Report
                </Button>
              </div>
            </Card>
          )}

          {/* Printable report area */}
          <AnimatePresence>
            {report && !loadingReport && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div ref={printRef}>
                  {/* Title */}
                  <div style={{
                    background: "linear-gradient(135deg, #FFE5D9 0%, #FDF5E8 100%)",
                    border: "1px solid #E5E7EB", borderRadius: "14px",
                    padding: "1.25rem 1.5rem", marginBottom: "1.25rem",
                  }}>
                    <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.2rem", fontWeight: 700, color: "#C07A5E" }}>
                      Child Development Report
                    </h1>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#6B7280" }}>
                      Generated: {new Date(report.generatedAt).toLocaleString("en-IN")} · For: {report.child.name}
                    </p>
                    <p style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: "#D4A574", fontWeight: 500 }}>
                      ⚕️ This report is based on caregiver-logged data. It is NOT a clinical diagnosis.
                    </p>
                  </div>

                  {/* Child profile */}
                  <Card style={{ marginBottom: "1rem" }}>
                    <h2 style={{ margin: "0 0 0.875rem", fontSize: "0.95rem", fontWeight: 700, color: "#2D3748" }}>
                      👶 Child Profile
                    </h2>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                      {[
                        ["Name", report.child.name],
                        ["Age", report.child.age ? `${report.child.age} years` : "Not specified"],
                      ].map(([label, val]) => (
                        <div key={label as string}>
                          <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.2rem" }}>{label}</div>
                          <div style={{ fontSize: "0.9rem", fontWeight: 600 }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {[
                      ["Diagnoses / Conditions", report.child.diagnoses, "#C07A5E", "#FFE5D9"],
                      ["Sensory Triggers", report.child.sensoryTriggers, "#DC2626", "#FECACA"],
                      ["Strengths", report.child.strengths, "#047857", "#D1F2EB"],
                      ["Caregiver Goals", report.child.goals, "#5B7B94", "#E0E9F0"],
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
                  </Card>

                  {/* Progress metrics */}
                  {Object.keys(report.progressSummary).length > 0 && (
                    <Card style={{ marginBottom: "1rem" }}>
                      <h2 style={{ margin: "0 0 0.875rem", fontSize: "0.95rem", fontWeight: 700 }}>📈 Progress Summary</h2>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                            {["Metric", "Latest", "Average", "Entries"].map(h => (
                              <th key={h} style={{ textAlign: "left", padding: "0.4rem 0.5rem", fontSize: "0.72rem", fontWeight: 600, color: "#6B7280", textTransform: "uppercase" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(report.progressSummary).map(([key, val], i) => (
                            <tr key={key} style={{ borderBottom: "1px solid #E5E7EB", backgroundColor: i % 2 === 0 ? "transparent" : "#F9FAFB" }}>
                              <td style={{ padding: "0.45rem 0.5rem" }}>{METRIC_LABELS[key] ?? key}</td>
                              <td style={{ padding: "0.45rem 0.5rem", fontWeight: 600 }}>{val.latest}</td>
                              <td style={{ padding: "0.45rem 0.5rem" }}>{val.avg}</td>
                              <td style={{ padding: "0.45rem 0.5rem", color: "#6B7280" }}>{val.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  )}

                  {/* Latest routine */}
                  {report.latestRoutine && (
                    <Card style={{ marginBottom: "1rem" }}>
                      <h2 style={{ margin: "0 0 0.5rem", fontSize: "0.95rem", fontWeight: 700 }}>📅 Latest Daily Routine</h2>
                      <p style={{ margin: "0 0 0.3rem", fontSize: "0.85rem", fontWeight: 600 }}>{report.latestRoutine.title}</p>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "#6B7280" }}>{report.latestRoutine.focusGoal}</p>
                      <p style={{ margin: "0.3rem 0 0", fontSize: "0.72rem", color: "#6B7280" }}>Saved: {new Date(report.latestRoutine.savedAt).toLocaleDateString("en-IN")}</p>
                    </Card>
                  )}

                  {/* AI Narrative */}
                  {loadingNarrative && (
                    <Card style={{ marginBottom: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: "center" }}>
                        <div style={{ width: "18px", height: "18px", border: "2px solid #FFE5D9", borderTopColor: "#C07A5E", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                        <span style={{ fontSize: "0.875rem", color: "#6B7280" }}>Generating professional summary with AI…</span>
                      </div>
                    </Card>
                  )}

                  {narrative && !loadingNarrative && (
                    <Card style={{ marginBottom: "1rem", borderLeft: "3px solid #8DA28B", background: "linear-gradient(135deg, #F9FAFB 0%, #E8F5F0 100%)" }}>
                      <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.95rem", fontWeight: 700, color: "#8DA28B" }}>
                        ✨ AI-Generated Professional Summary
                      </h2>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: "0.9rem", lineHeight: 1.7, color: "#2D3748" }}>{narrative}</div>
                      <p style={{ margin: "0.75rem 0 0", fontSize: "0.72rem", color: "#6B7280" }}>
                        AI-generated. Review before sharing. Not a clinical document.
                      </p>
                    </Card>
                  )}
                </div>

                {/* Print button again at bottom */}
                {(report || narrative) && (
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
                    <Button onClick={handlePrint}>
                      🖨️ Print / Save as PDF
                    </Button>
                    <Button onClick={() => setTab("share")} variant="secondary">
                      👥 Share with Institution →
                    </Button>
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
          <Alert
            type="info"
            icon="ℹ️"
            style={{ marginBottom: "1.25rem" }}
          >
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#1F2937", lineHeight: 1.65 }}>
              <strong>How sharing works:</strong> Enter the email address of the Anganwadi worker, special educator, ASHA worker, or doctor.
              They must have a NeuroSync account — ask them to register at this app first.
              Once shared, they can view <strong>{childName}'s</strong> progress, diet plans, and routines but cannot edit or delete data.
            </p>
          </Alert>

          {/* Share form */}
          <Card style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Add Institution / Worker</h2>
            <form onSubmit={handleShare} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <FormGroup label="Worker / Institution email" style={{ flex: "1 1 260px" }}>
                <Input
                  type="email"
                  value={shareEmail}
                  onChange={e => setShareEmail(e.target.value)}
                  placeholder="e.g. worker@anganwadi.gov.in"
                  required
                />
              </FormGroup>
              <Button type="submit" disabled={shareLoading || !shareEmail.trim()}>
                {shareLoading ? "Sharing…" : "Share Access →"}
              </Button>
            </form>

            {shareMsg && (
              <Alert
                type={shareMsg.type === "ok" ? "success" : "error"}
                icon={shareMsg.type === "ok" ? "✅" : "❌"}
                style={{ marginTop: "0.75rem" }}
              >
                {shareMsg.text}
              </Alert>
            )}
          </Card>

          {/* Current shares list */}
          <Card>
            <h2 style={{ margin: "0 0 0.875rem", fontSize: "0.95rem", fontWeight: 600 }}>
              People with access to {childName}'s profile
            </h2>

            {shares.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem", color: "#6B7280", fontSize: "0.85rem" }}>
                No one else has access yet. Share above to add an institution or worker.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {shares.map(s => {
                  const isMe = s.id === user?.id;
                  const roleColor = ROLE_COLORS[s.role] ?? "#6B7280";
                  return (
                    <div key={s.id} style={{
                      display: "flex", alignItems: "center", gap: "0.75rem",
                      padding: "0.75rem 1rem", borderRadius: "10px",
                      backgroundColor: isMe ? "#FFE5D9" : "#F9FAFB",
                      border: `1px solid ${isMe ? "#C07A5E" : "#E5E7EB"}`,
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
                        <div style={{ fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1F2937" }}>
                          {s.display_name || s.email}
                          {isMe && <span style={{ marginLeft: "0.4rem", fontSize: "0.7rem", color: "#C07A5E" }}>(you)</span>}
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "#6B7280" }}>{s.email}</div>
                      </div>
                      <span style={{
                        padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 600,
                        backgroundColor: roleColor + "18", color: roleColor,
                      }}>
                        {ROLE_LABELS[s.role] ?? s.role}
                      </span>
                      {!isMe && (
                        <Button
                          onClick={() => handleRevoke(s.id, s.email)}
                          disabled={revokeLoading === s.id}
                          variant="error"
                          size="sm"
                        >
                          {revokeLoading === s.id ? "…" : "Revoke"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
