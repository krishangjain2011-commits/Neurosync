import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { apiGet, apiPost } from "../lib/api";

interface ProgressRow {
  id: number;
  child_id: number;
  metric_type: string;
  value: number;
  timestamp: string;
}

const METRIC_TYPES = [
  { key: "calm_down_interval",  label: "Calm-down Interval (min)", color: "#7C6FCD" },
  { key: "routines_completed",  label: "Routines Completed",        color: "#3D9E6E" },
  { key: "meltdown_intensity",  label: "Meltdown Intensity (1-10)", color: "#D94F4F" },
  { key: "focus_duration",      label: "Focus Duration (min)",      color: "#3B7DD8" },
  { key: "sleep_quality",       label: "Sleep Quality (1-10)",      color: "#C97B2A" },
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
    <div style={{ padding: "1.5rem", maxWidth: "860px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "1.5rem" }}>📈</span>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Progress Tracker</h1>
        </div>
        <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-secondary)" }}>
          Log behavioral metrics and visualize trends over time
          {activeChild?.onboarding_data?.childName && ` for ${activeChild.onboarding_data.childName}`}.
        </p>
      </div>

      {/* Log new entry */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Log Today's Entry</h2>
        <form onSubmit={handleLog} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label className="label">Metric</label>
            <select
              className="input"
              value={logType}
              onChange={e => setLogType(e.target.value)}
              style={{ cursor: "pointer" }}
            >
              {METRIC_TYPES.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: "0 1 140px" }}>
            <label className="label">Value</label>
            <input
              className="input"
              type="number"
              min={0}
              max={999}
              step={0.5}
              value={logValue}
              onChange={e => setLogValue(e.target.value)}
              placeholder="e.g. 15"
              required
            />
          </div>
          <button
            className="btn-primary"
            type="submit"
            disabled={saving || !logValue || !childId}
            style={{ flexShrink: 0 }}
          >
            {saving ? "Saving…" : "Log Entry"}
          </button>
          {saveMsg && (
            <span style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              color: saveMsg.startsWith("Error") ? "var(--red)" : "var(--green)",
              alignSelf: "center",
            }}>
              {saveMsg}
            </span>
          )}
        </form>
      </div>

      {error && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "10px", marginBottom: "1rem", fontSize: "0.83rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "2.5rem" }}>
          <div style={{ width: "20px", height: "20px", border: "2px solid var(--accent-light)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Loading progress data…</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>📊</div>
          <p style={{ margin: 0, fontSize: "0.875rem" }}>No data yet. Log your first entry above to start tracking.</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {/* Trend chart */}
          {activeMetrics.length > 0 && chartData.length > 0 && (
            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>14-Day Trends</h2>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: "0.8rem", borderRadius: "8px", border: "1px solid var(--border)" }} />
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
            </div>
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
                  style={{
                    padding: "1rem",
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    borderLeft: `3px solid ${m.color}`,
                  }}
                >
                  <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
                    {m.label}
                  </div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700, color: m.color, lineHeight: 1.2 }}>
                    {latest ?? "—"}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                    Latest · Avg: {avg} · {vals.length} entries
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Recent log table */}
          <div className="card">
            <h2 style={{ margin: "0 0 0.875rem", fontSize: "0.95rem", fontWeight: 600 }}>Recent Entries</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Date", "Metric", "Value"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "0.4rem 0.75rem", fontWeight: 600, color: "var(--text-muted)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, i) => {
                    const meta = METRIC_TYPES.find(m => m.key === row.metric_type);
                    return (
                      <tr key={row.id} style={{ borderBottom: "1px solid var(--border)", backgroundColor: i % 2 === 0 ? "transparent" : "var(--surface-2)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-muted)" }}>
                          {new Date(row.timestamp).toLocaleDateString()}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: meta?.color ?? "var(--text-muted)", flexShrink: 0 }} />
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
              <p style={{ margin: "0.75rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Showing 20 most recent entries of {rows.length} total.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
