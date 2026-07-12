import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";

const DIAGNOSES  = ["ADHD","Autism Spectrum Disorder","Dyslexia","Sensory Processing Disorder","Other / Undiagnosed"];
const TRIGGERS   = ["Loud noises","Bright lights","Crowded spaces","Texture sensitivities","Sudden changes","Strong smells","Physical touch","Screen time"];
const STRENGTHS  = ["Visual learning","Pattern recognition","Hyperfocus ability","Creative thinking","Memory recall","Logical reasoning","Musical ability","Physical movement"];
const GOALS      = ["Reduce meltdowns","Build daily routines","Improve communication","Sensory regulation","Academic support","Social skills","Sleep improvement","Dietary management"];
const STEPS      = ["Child Info","Diagnoses","Sensory Triggers","Strengths","Goals","Consent"];

function MultiSelect({ options, selected, onChange }: { options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
      {options.map(o => {
        const active = selected.includes(o);
        return (
          <button key={o} type="button" onClick={() => toggle(o)}
            style={{ padding: "0.4rem 0.8rem", borderRadius: "999px", border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`, backgroundColor: active ? "var(--accent-light)" : "var(--canvas)", color: active ? "var(--accent)" : "var(--text-secondary)", fontSize: "0.8rem", fontWeight: active ? 600 : 400, cursor: "pointer", transition: "all 0.12s" }}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export default function OnboardingPage({ addMode = false }: { addMode?: boolean }) {
  const { addChild } = useAuth();
  const navigate = useNavigate();
  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [form, setForm]     = useState({
    childName: "", childAge: "",
    diagnoses: [] as string[], sensoryTriggers: [] as string[],
    strengths: [] as string[], goals: [] as string[],
    consentGiven: false,
  });

  const set = (key: string) => (val: any) => setForm(f => ({ ...f, [key]: val }));

  const canNext = () => {
    if (step === 0) return form.childName.trim().length > 0;
    if (step === 1) return form.diagnoses.length > 0;
    if (step === 5) return form.consentGiven;
    return true;
  };

  const finish = async () => {
    setSaving(true);
    setError("");
    try {
      await addChild({
        childName: form.childName.trim(),
        childAge: form.childAge ? parseInt(form.childAge) : undefined,
        diagnoses: form.diagnoses,
        sensoryTriggers: form.sensoryTriggers,
        strengths: form.strengths,
        goals: form.goals,
      });
      navigate(addMode ? "/chat" : "/chat");
    } catch (err: any) {
      setError(err.message || "Setup failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const stepContent = [
    <div key="info" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <label className="label">Child's name</label>
        <input className="input" value={form.childName} onChange={e => set("childName")(e.target.value)} placeholder="e.g. Arjun" autoFocus />
      </div>
      <div>
        <label className="label">Age (optional)</label>
        <input className="input" type="number" min={1} max={18} value={form.childAge} onChange={e => set("childAge")(e.target.value)} placeholder="e.g. 7" style={{ maxWidth: "120px" }} />
      </div>
    </div>,

    <div key="dx">
      <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)", marginBottom: "0.875rem" }}>Select all that apply — unofficial or suspected diagnoses are welcome.</p>
      <MultiSelect options={DIAGNOSES} selected={form.diagnoses} onChange={set("diagnoses")} />
    </div>,

    <div key="triggers">
      <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)", marginBottom: "0.875rem" }}>Which sensory inputs are most challenging?</p>
      <MultiSelect options={TRIGGERS} selected={form.sensoryTriggers} onChange={set("sensoryTriggers")} />
    </div>,

    <div key="strengths">
      <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)", marginBottom: "0.875rem" }}>Every child has unique strengths — this helps personalise support.</p>
      <MultiSelect options={STRENGTHS} selected={form.strengths} onChange={set("strengths")} />
    </div>,

    <div key="goals">
      <p style={{ fontSize: "0.83rem", color: "var(--text-secondary)", marginBottom: "0.875rem" }}>What are your primary caregiving goals?</p>
      <MultiSelect options={GOALS} selected={form.goals} onChange={set("goals")} />
    </div>,

    // Consent step (DPDP-aligned)
    <div key="consent" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ padding: "1rem", backgroundColor: "var(--blue-light)", borderRadius: "10px", border: "1px solid var(--border)" }}>
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", fontWeight: 700, color: "var(--blue)" }}>Data Consent Notice</h3>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.82rem", color: "var(--text-primary)", lineHeight: 1.7 }}>
          <li>This profile collects your child's behavioral, dietary, and routine data.</li>
          <li>Data is stored locally and used <strong>only</strong> for caregiving support.</li>
          <li>No data is shared with third parties or used for advertising.</li>
          <li>You may delete all data at any time from your account settings.</li>
          <li>Compliant with India's Digital Personal Data Protection Act 2023.</li>
        </ul>
      </div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", cursor: "pointer" }}>
        <input type="checkbox" checked={form.consentGiven} onChange={e => set("consentGiven")(e.target.checked)}
          style={{ marginTop: "2px", width: "16px", height: "16px", accentColor: "var(--accent)", flexShrink: 0 }} />
        <span style={{ fontSize: "0.83rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
          I understand and consent to the collection and use of my child's data as described above, for the purpose of caregiving support only.
        </span>
      </label>
    </div>,
  ];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        style={{ width: "100%", maxWidth: "520px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "16px", padding: "2rem", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>

        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "1.4rem", marginBottom: "0.4rem" }}>🧠</div>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
            {addMode ? "Add another child" : "Set up your child's profile"}
          </h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </p>
        </div>

        {/* Progress */}
        <div style={{ height: "4px", backgroundColor: "var(--surface-2)", borderRadius: "2px", marginBottom: "1.75rem", overflow: "hidden" }}>
          <motion.div animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            style={{ height: "100%", backgroundColor: "var(--accent)", borderRadius: "2px" }} transition={{ duration: 0.3 }} />
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.16 }}>
            {stepContent[step]}
          </motion.div>
        </AnimatePresence>

        {error && <div style={{ marginTop: "1rem", padding: "0.6rem 0.875rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "8px", fontSize: "0.83rem" }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2rem", gap: "0.75rem" }}>
          {step > 0
            ? <button className="btn-secondary" onClick={() => setStep(s => s - 1)}>← Back</button>
            : <div />
          }
          {step < STEPS.length - 1
            ? <button className="btn-primary" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>Next →</button>
            : <button className="btn-primary" onClick={finish} disabled={saving || !canNext()}>
                {saving ? "Setting up…" : "Start NeuroSync ✓"}
              </button>
          }
        </div>
      </motion.div>
    </div>
  );
}
