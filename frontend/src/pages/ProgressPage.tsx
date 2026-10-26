import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Alert } from "../components/ui/Alert";
import FeatureTour from "../components/FeatureTour";

interface ProgressRow {
  id: number;
  child_id: number;
  metric_type: string;
  value: number;
  timestamp: string;
}

const METRIC_TYPES = [
  { key: "calm_down_interval",  label: "Calm-down Interval (min)", color: "#8DA28B" },
  { key: "routines_completed",  label: "Routines Completed",        color: "#047857" },
  { key: "meltdown_intensity",  label: "Meltdown Intensity (1-10)", color: "#DC2626" },
  { key: "focus_duration",      label: "Focus Duration (min)",      color: "#5B7B94" },
  { key: "sleep_quality",       label: "Sleep Quality (1-10)",      color: "#C07A5E" },
];

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupByMetric(rows: ProgressRow[]) {
  const map: Record<string, { date: string; value: number }[]> = {};
  for (const row of rows) {
    if (!map[row.metric_type]) map[row.metric_type] = [];
    map[row.metric_type].push({ date: formatDate(row.timestamp), value: row.value });
  }
  return map;
}

export default function ProgressPage() {
  const { activeChild } = useAuth();
  const childId = activeChild?.id;

  const [rows, setRows]         = useState<ProgressRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [logType, setLogType]   = useState(METRIC_TYPES[0].key);
  const [logValue, setLogValue] = useState("");
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState("");
  const [error, setError]       = useState("");

  const fetchData = async () => {
    if (!childId) return;
    try {
      const data = await apiGet<ProgressRow[]>(`/api/children/${childId}/progress`);
      setRows(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [childId]);

  const handleLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(logValue);
    if (isNaN(num) || !childId) return;
    setSaving(true);
    setSaveMsg("");
    try {
      await apiPost(`/api/children/${childId}/progress`, {
        metric_type: logType,
        value: num,
      });
      setSaveMsg("Logged ✓");
      setLogValue("");
      await fetchData();
    } catch (e: any) {
      setSaveMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  const grouped = groupByMetric(rows);

  // Build chart data: all dates across all metrics
  const allDates = Array.from(new Set(rows.map(r => formatDate(r.timestamp)))).slice(-14);

  const chartData = allDates.map(date => {
    const point: Record<string, string | number> = { date };
    for (const m of METRIC_TYPES) {
      const match = grouped[m.key]?.find(r => r.date === date);
      if (match) point[m.key] = match.value;
    }
    return point;
  });

  const activeMetrics = METRIC_TYPES.filter(m => grouped[m.key]?.length > 0);

  return (
    <div style={{ padding: "1.5rem", maxWidth: "860px", margin: "0 auto", backgroundColor: "#FBF8F3", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "1.5rem" }}>📈</span>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#2D3748" }}>Progress Tracker</h1>
        </div>
        <p style={{ margin: 0, fontSize: "0.83rem", color: "#6B7280" }}>
          Log behavioral metrics and visualize trends over time
          {activeChild?.onboarding_data?.childName && ` for ${activeChild.onboarding_data.childName}`}.
        </p>
      </div>

      <FeatureTour
        featureKey="progress"
        icon="📈"
        title="Progress Tracker"
        summary="Log daily behavioral observations and see trends over time as charts. Handwriting pattern data from the Homeschooling module also appears here automatically."
        tips={[
          "Log entries daily for the best trend picture — even a 30-second check-in helps.",
          "Calm-down Interval: how many minutes it takes your child to de-escalate.",
          "Meltdown Intensity: rate 1–10 to track whether episodes are becoming milder.",
          "Focus Duration: log how long the child sustained attention during a task.",
          "Handwriting reversal counts are added automatically when you use the Handwriting Interpreter.",
          "Share the Progress Tracker data with a therapist or school to back up your observations.",
        ]}
        accentColor="#5B7B94"
      />

      {/* Log new entry */}
      <Card style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Log Today's Entry</h2>
        <form onSubmit={handleLog} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem", color: "#1F2937" }}>Metric</label>
            <select
              value={logType}
              onChange={e => setLogType(e.target.value)}
              style={{
                width: "100%",
                padding: "0.65rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid #D1D5DB",
                backgroundColor: "#FFFFFF",
                color: "#1F2937",
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              {METRIC_TYPES.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: "0 1 140px" }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem", color: "#1F2937" }}>Value</label>
            <input
              type="number"
              min={0}
              max={999}
              step={0.5}
              value={logValue}
              onChange={e => setLogValue(e.target.value)}
              placeholder="e.g. 15"
              required
              style={{
                width: "100%",
                padding: "0.65rem 0.75rem",
                borderRadius: "8px",
                border: "1px solid #D1D5DB",
                backgroundColor: "#FFFFFF",
                color: "#1F2937",
                fontSize: "0.9rem",
              }}
            />
          </div>
          <Button
            variant="primary"
            type="submit"
            disabled={saving || !logValue || !childId}
            style={{ flexShrink: 0, minWidth: "120px" }}
          >
            {saving ? "Saving…" : "Log Entry"}
          </Button>
          {saveMsg && (
            <span style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              color: saveMsg.startsWith("Error") ? "#DC2626" : "#047857",
              alignSelf: "center",
            }}>
              {saveMsg}
            </span>
          )}
        </form>
      </Card>

      {error && (
        <div style={{ marginBottom: "1rem" }}>
          <Alert type="error" icon="❌">{error}</Alert>
        </div>
      )}

      {loading ? (
        <Card style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "2.5rem" }}>
          <div style={{ width: "20px", height: "20px", border: "2px solid #FFE5D9", borderTopColor: "#C07A5E", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          <span style={{ fontSize: "0.875rem", color: "#6B7280" }}>Loading progress data…</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </Card>
      ) : rows.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "3rem", color: "#9CA3AF" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📊</div>
          <p style={{ margin: 0, fontSize: "0.875rem" }}>No data yet. Log your first entry above to start tracking.</p>
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {/* Trend chart */}
          {activeMetrics.length > 0 && chartData.length > 0 && (
            <Card style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>14-Day Trends</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: "0.8rem", borderRadius: "8px", border: "1px solid #E5E7EB", backgroundColor: "#FFFFFF" }} />
                  <Legend wrapperStyle={{ fontSize: "0.78rem" }} />
                  {activeMetrics.map(m => (
                    <Line
                      key={m.key}
                      type="monotone"
                      dataKey={m.key}
                      name={m.label}
                      stroke={m.color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {activeMetrics.map(m => {
              const vals = grouped[m.key] ?? [];
              const latest = vals[0]?.value;
              const avg = vals.length
                ? (vals.reduce((s, r) => s + r.value, 0) / vals.length).toFixed(1)
                : "—";
              return (
                <motion.div
                  key={m.key}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card>
                    <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                      {m.label}
                    </div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700, color: m.color, lineHeight: 1.2 }}>
                      {latest ?? "—"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#6B7280", marginTop: "0.25rem" }}>
                      Latest · Avg: {avg} · {vals.length} entries
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {/* Recent log table */}
          <Card>
            <h2 style={{ margin: "0 0 0.875rem", fontSize: "0.95rem", fontWeight: 600 }}>Recent Entries</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                    {["Date", "Metric", "Value"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "0.4rem 0.75rem", fontWeight: 600, color: "#6B7280", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, i) => {
                    const meta = METRIC_TYPES.find(m => m.key === row.metric_type);
                    return (
                      <tr key={row.id} style={{ borderBottom: "1px solid #E5E7EB", backgroundColor: i % 2 === 0 ? "transparent" : "#F9FAFB" }}>
                        <td style={{ padding: "0.5rem 0.75rem", color: "#6B7280" }}>
                          {new Date(row.timestamp).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: meta?.color ?? "#6B7280", flexShrink: 0 }} />
                            {meta?.label ?? row.metric_type}
                          </span>
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>{row.value}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > 20 && (
              <p style={{ margin: "0.75rem 0 0", fontSize: "0.75rem", color: "#6B7280" }}>
                Showing 20 most recent entries of {rows.length} total.
              </p>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  );
}
