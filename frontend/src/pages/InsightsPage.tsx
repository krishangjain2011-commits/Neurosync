import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { apiGet } from "../lib/api";
import FeatureTour from "../components/FeatureTour";

interface Overview {
  totalChildren: number;
  byRegion: { region_code: string; child_count: number }[];
  topMetrics: { metric_type: string; avg_value: number; data_points: number }[];
  adoptionByModule: { module: string; uses: number }[];
}

const COLORS = ["var(--accent)","var(--green)","var(--blue)","var(--amber)","var(--red)"];

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: string; color?: string }) {
  return (
    <div style={{ padding: "1.25rem", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "12px", borderLeft: `3px solid ${color || "var(--accent)"}` }}>
      <div style={{ fontSize: "1.4rem", marginBottom: "0.4rem" }}>{icon}</div>
      <div style={{ fontSize: "1.6rem", fontWeight: 700, color: color || "var(--text-primary)", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{label}</div>
    </div>
  );
}

export default function InsightsPage() {
  const [overview, setOverview]   = useState<Overview | null>(null);
  const [dxData, setDxData]       = useState<{ name: string; value: number }[]>([]);
  const [trigData, setTrigData]   = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");

  useEffect(() => {
    Promise.all([
      apiGet<Overview>("/api/insights/overview"),
      apiGet<{ diagnosisCounts: Record<string, number> }>("/api/insights/diagnosis-breakdown"),
      apiGet<{ triggerCounts: Record<string, number> }>("/api/insights/trigger-heatmap"),
    ]).then(([ov, dx, trig]) => {
      setOverview(ov);
      setDxData(Object.entries(dx.diagnosisCounts).map(([name, value]) => ({ name, value })));
      setTrigData(Object.entries(trig.triggerCounts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value));
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ width: "28px", height: "28px", border: "2px solid var(--accent-light)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>Loading analytics…</span>
    </div>
  );

  if (error) return (
    <div style={{ padding: "2rem" }}>
      <div style={{ padding: "1rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "10px" }}>{error}</div>
    </div>
  );

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "1.5rem" }}>📊</span>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Population Insights Dashboard</h1>
        </div>
        <p style={{ margin: 0, fontSize: "0.83rem", color: "var(--text-secondary)" }}>
          Aggregated, de-identified analytics — no individual child data is visible here.
        </p>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", marginTop: "0.5rem", padding: "0.25rem 0.7rem", backgroundColor: "var(--green-light)", color: "var(--green)", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 600 }}>
          🔒 District Admin View — De-identified Only
        </div>
      </div>

      <FeatureTour
        featureKey="insights"
        icon="📊"
        title="Population Insights Dashboard"
        summary="Aggregated, de-identified analytics for district admins — total children enrolled, diagnosis distribution, sensory trigger patterns, and module adoption rates across your organisation. No individual child data is ever shown."
        tips={[
          "All data is aggregated at the SQL level — individual children are never identifiable.",
          "Diagnosis Breakdown shows which conditions are most common in your district.",
          "Trigger Heatmap highlights the most prevalent sensory challenges across children.",
          "Use module adoption data to see which tools caregivers find most useful.",
          "This view is only visible to users with the district_admin role.",
        ]}
        accentColor="var(--blue)"
      />

      {/* Stat cards */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <StatCard label="Total Children Enrolled" value={overview?.totalChildren ?? 0} icon="👶" color="var(--accent)" />
        <StatCard label="Module Adoptions" value={overview?.adoptionByModule.reduce((a, b) => a + b.uses, 0) ?? 0} icon="📱" color="var(--green)" />
        <StatCard label="Distinct Metrics Tracked" value={overview?.topMetrics.length ?? 0} icon="📈" color="var(--blue)" />
        <StatCard label="Regions Covered" value={overview?.byRegion.length ?? 0} icon="🗺️" color="var(--amber)" />
      </motion.div>

      {/* Module adoption bar chart */}
      {overview && overview.adoptionByModule.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Module Adoption</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={overview.adoptionByModule} margin={{ left: -10 }}>
              <XAxis dataKey="module" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="uses" radius={[4, 4, 0, 0]}>
                {overview.adoptionByModule.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "1.5rem" }}>
        {/* Diagnosis breakdown */}
        {dxData.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="card">
            <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Diagnosis Breakdown</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={dxData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${Math.round(percent * 100)}%`} labelLine={false}>
                  {dxData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
                <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: "0.72rem" }} />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Top sensory triggers */}
        {trigData.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="card">
            <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>Top Sensory Triggers</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {trigData.slice(0, 6).map((t, i) => {
                const max = trigData[0].value;
                return (
                  <div key={t.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.2rem" }}>
                      <span style={{ color: "var(--text-secondary)" }}>{t.name}</span>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{t.value}</span>
                    </div>
                    <div style={{ height: "6px", backgroundColor: "var(--surface-2)", borderRadius: "3px", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(t.value / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length], borderRadius: "3px", transition: "width 0.6s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>

      {/* Regional breakdown */}
      {overview && overview.byRegion.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="card">
          <h2 style={{ margin: "0 0 0.875rem", fontSize: "0.95rem", fontWeight: 600 }}>Enrollment by Region</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {overview.byRegion.map((r) => (
              <div key={r.region_code} style={{ padding: "0.5rem 1rem", backgroundColor: "var(--canvas)", border: "1px solid var(--border)", borderRadius: "8px", textAlign: "center" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)" }}>{r.child_count}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{r.region_code || "Unspecified"}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <p style={{ marginTop: "1.5rem", fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center" }}>
        All analytics are computed at the SQL aggregate level. No child names, free-text notes, or contact information are returned to this view.
      </p>
    </div>
  );
}
