import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import FeatureTour from "../components/FeatureTour";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { FormGroup } from "../components/ui/FormGroup";
import { Input } from "../components/ui/Input";
import { Alert } from "../components/ui/Alert";

function MultiSelect({ options, selected, onChange }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const toggle = (o: string) => onChange(selected.includes(o) ? selected.filter(s => s !== o) : [...selected, o]);
  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: "0.75rem"
    }}>
      {options.map(o => {
        const active = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            style={{
              padding: "0.6rem 1rem",
              borderRadius: "var(--radius-full)",
              border: `2px solid ${active ? "var(--color-accent)" : "var(--color-secondary-soft)"}`,
              backgroundColor: active ? "var(--color-accent-soft)" : "var(--color-surface)",
              color: active ? "var(--color-accent-dark)" : "var(--color-text-muted)",
              fontSize: "0.875rem",
              fontWeight: active ? 600 : 500,
              fontFamily: "var(--font-body)",
              cursor: "pointer",
              transition: "all 0.16s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: active ? "0 2px 8px rgba(141, 162, 139, 0.15)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!active) (e.target as HTMLButtonElement).style.borderColor = "var(--color-secondary)";
            }}
            onMouseLeave={(e) => {
              if (!active) (e.target as HTMLButtonElement).style.borderColor = "var(--color-secondary-soft)";
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export default function OnboardingPage({ addMode = false }: { addMode?: boolean }) {
  const { addChild } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const [step, setStep]     = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const [form, setForm]     = useState({
    childName: "", childAge: "",
    diagnoses: [] as string[], sensoryTriggers: [] as string[],
    strengths: [] as string[], goals: [] as string[],
    otherDetails: "",
    consentGiven: false,
  });

  const set = (key: string) => (val: any) => setForm(f => ({ ...f, [key]: val }));

  // Translated option arrays — keys kept stable in English for DB storage
  const DIAGNOSES  = [t("diagADHD"), t("diagAutism"), t("diagDyslexia"), t("diagSPD"), t("diagOther")];
  const TRIGGERS   = [t("trigLoudNoises"), t("trigBrightLights"), t("trigCrowded"), t("trigTexture"), t("trigSuddenChanges"), t("trigSmells"), t("trigTouch"), t("trigScreenTime")];
  const STRENGTHS  = [t("strVisual"), t("strPattern"), t("strHyperfocus"), t("strCreative"), t("strMemory"), t("strLogical"), t("strMusical"), t("strPhysical")];
  const GOALS      = [t("goalMeltdowns"), t("goalRoutines"), t("goalCommunication"), t("goalSensory"), t("goalAcademic"), t("goalSocial"), t("goalSleep"), t("goalDiet")];
  const STEPS      = [t("stepChildInfo"), t("stepDiagnoses"), t("stepSensoryTriggers"), t("stepStrengths"), t("stepGoals"), t("stepConsent")];

  const canNext = () => {
    if (step === 0) return form.childName.trim().length > 0;
    if (step === 1) {
      if (form.diagnoses.length === 0) return false;
      if (form.diagnoses.includes(t("diagOther"))) return form.otherDetails.trim().length > 0;
      return true;
    }
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
        otherDetails: form.otherDetails.trim() || undefined,
      });
      navigate("/chat");
    } catch (err: any) {
      setError(err.message || t("setupFailed"));
    } finally {
      setSaving(false);
    }
  };

  const stepContent = [
    <div key="info" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <FormGroup label={t("childName")} required>
        <Input
          value={form.childName}
          onChange={e => set("childName")(e.target.value)}
          placeholder={t("childNamePlaceholder")}
          autoFocus
        />
      </FormGroup>
      <FormGroup label={t("age")}>
        <Input
          type="number"
          min={1}
          max={18}
          value={form.childAge}
          onChange={e => set("childAge")(e.target.value)}
          placeholder={t("agePlaceholder")}
          style={{ maxWidth: "120px" }}
        />
      </FormGroup>
    </div>,

    <div key="dx" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <FormGroup label={t("selectAllThatApply")} helperText={t("selectAllThatApply")}>
        <MultiSelect options={DIAGNOSES} selected={form.diagnoses} onChange={set("diagnoses")} />
      </FormGroup>
      {form.diagnoses.includes(t("diagOther")) && (
        <FormGroup label={t("otherDetailsLabel")}>
          <Input
            value={form.otherDetails}
            onChange={e => set("otherDetails")(e.target.value)}
            placeholder={t("otherDetailsPlaceholder")}
          />
        </FormGroup>
      )}
    </div>,

    <div key="triggers">
      <FormGroup label={t("sensoryInputQuestion")}>
        <MultiSelect options={TRIGGERS} selected={form.sensoryTriggers} onChange={set("sensoryTriggers")} />
      </FormGroup>
    </div>,

    <div key="strengths">
      <FormGroup label={t("strengthsNote")}>
        <MultiSelect options={STRENGTHS} selected={form.strengths} onChange={set("strengths")} />
      </FormGroup>
    </div>,

    <div key="goals">
      <FormGroup label={t("goalsNote")}>
        <MultiSelect options={GOALS} selected={form.goals} onChange={set("goals")} />
      </FormGroup>
    </div>,

    <div key="consent" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <Card size="md" style={{
        backgroundColor: "var(--color-secondary-soft)",
        border: `1px solid var(--color-secondary-light, #B8CDE1)`,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <h3 style={{
            margin: 0,
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "var(--color-secondary-dark)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}>
            <span>✓</span> {t("consentTitle")}
          </h3>
          <ul style={{
            margin: 0,
            paddingLeft: "1.5rem",
            fontSize: "0.85rem",
            color: "var(--color-text)",
            lineHeight: 1.6,
          }}>
            <li>{t("consentItem1")}</li>
            <li>{t("consentItem2")}</li>
            <li>{t("consentItem3")}</li>
            <li>{t("consentItem4")}</li>
            <li>{t("consentItem5")}</li>
          </ul>
        </div>
      </Card>
      <label style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        cursor: "pointer",
        padding: "0.75rem",
        borderRadius: "var(--radius-lg)",
        transition: "background-color 0.16s",
        backgroundColor: "transparent",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-accent-soft)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <input
          type="checkbox"
          checked={form.consentGiven}
          onChange={e => set("consentGiven")(e.target.checked)}
          style={{
            marginTop: "3px",
            width: "18px",
            height: "18px",
            accentColor: "var(--color-accent)",
            flexShrink: 0,
            cursor: "pointer",
          }}
        />
        <span style={{
          fontSize: "0.85rem",
          color: "var(--color-text)",
          lineHeight: 1.5,
        }}>
          {t("consentCheckbox")}
        </span>
      </label>
    </div>,
  ];

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "var(--color-bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
    }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ width: "100%", maxWidth: "520px" }}
      >
        <Card size="lg" style={{
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
        }}>
          {!addMode && (
            <div style={{ marginBottom: "1.75rem" }}>
              <FeatureTour
                featureKey="onboarding"
                icon="✨"
                title="Welcome to NeuroSync"
                summary="Tell us a little about your child so NeuroSync can give you faster, more useful support across behavior, diet, therapy, and routines."
                tips={[
                  "Enter your child's name and the most important details first.",
                  "If you're unsure about a diagnosis, choose the closest option and add notes.",
                  "The profile helps the app personalise suggestions without sharing data externally.",
                ]}
                accentColor="var(--color-accent)"
              />
            </div>
          )}

          <div style={{ marginBottom: "1.75rem" }}>
            <div style={{
              fontSize: "1.75rem",
              marginBottom: "0.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}>
              🧠
            </div>
            <h2 style={{
              margin: 0,
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--color-text)",
            }}>
              {addMode ? t("addAnotherChild") : t("setupChildProfile")}
            </h2>
            <p style={{
              margin: "0.5rem 0 0",
              fontSize: "0.8rem",
              color: "var(--color-text-muted)",
            }}>
              {t("stepOf")} {step + 1} {t("of")} {STEPS.length} — {STEPS[step]}
            </p>
          </div>

          {/* Progress Bar */}
          <div style={{
            height: "6px",
            backgroundColor: "var(--color-secondary-soft)",
            borderRadius: "var(--radius-full)",
            marginBottom: "1.75rem",
            overflow: "hidden",
          }}>
            <motion.div
              animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              style={{
                height: "100%",
                background: "var(--gradient-success)",
                borderRadius: "var(--radius-full)",
              }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
            >
              {stepContent[step]}
            </motion.div>
          </AnimatePresence>

          {error && <Alert type="error" style={{ marginTop: "1.5rem" }}>{error}</Alert>}

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "2rem",
            gap: "1rem",
          }}>
            {step > 0
              ? <Button variant="secondary" onClick={() => setStep(s => s - 1)}>{t("back")}</Button>
              : <div />
            }
            {step < STEPS.length - 1
              ? <Button
                  variant="primary"
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canNext()}
                  fullWidth={step === 0}
                >
                  {t("next")}
                </Button>
              : <Button
                  variant="success"
                  onClick={finish}
                  disabled={saving || !canNext()}
                  loading={saving}
                  fullWidth={true}
                >
                  {saving ? t("settingUp") : t("startNeuroSync")}
                </Button>
            }
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
