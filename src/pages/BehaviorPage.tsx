import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useOffline } from "../context/OfflineContext";
import { apiPost, apiGet, apiDelete } from "../lib/api";
import { useNavigate } from "react-router-dom";
import {
  saveLocalModel, loadLocalModel, extractBlobEmbedding,
  matchAgainstLocalModel, MIN_CUES_FOR_TRAINING,
  type LocalModel,
} from "../lib/cue-model";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BehaviorAnalysis {
  rootCause: string;
  triggerCategory: string;
  deescalationSteps: string[];
  preventionTips: string[];
  whenToSeekHelp: string;
}

interface CueEntry {
  id: number;
  label: string;
  media_type: string;
  confirmed_count: number;
  created_at: string;
}

interface CueEvent {
  id: number;
  matched_cue_id: number | null;
  match_confidence: number | null;
  ai_interpretations: string | null;
  caregiver_selected_interpretation: string | null;
  escalated: number;
  created_at: string;
  matched_label: string | null;
}

// ─── Describe-it tab ─────────────────────────────────────────────────────────

const BEHAVIORS = ["Covering ears","Screaming","Hitting / self-harm","Running away","Rocking",
  "Crying uncontrollably","Refusing to communicate","Throwing objects","Freezing / shutting down","Stimming intensely"];
const CONTEXTS = ["At home","At school","In public / store","During transitions","During meals","At bedtime","During homework"];

function DescribeTab({ activeChild, isOnline }: { activeChild: any; isOnline: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [ctx, setCtx] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BehaviorAnalysis | null>(null);
  const [error, setError] = useState("");
  const toggle = (b: string) => setSelected(p => p.includes(b) ? p.filter(x => x !== b) : [...p, b]);
  const analyze = async () => {
    if (!selected.length || !isOnline) return;
    setLoading(true); setError(""); setResult(null);
    const prompt = `A caregiver observes: Behaviors: ${selected.join(", ")}. Setting: ${ctx||"Not specified"}. Notes: ${notes||"None"}. Child profile: ${JSON.stringify(activeChild?.onboarding_data||{})}. Analyze and return JSON: {"rootCause":"string","triggerCategory":"string","deescalationSteps":["step 1","step 2","step 3","step 4","step 5"],"preventionTips":["tip 1","tip 2","tip 3"],"whenToSeekHelp":"string"}`;
    try { setResult(await apiPost<BehaviorAnalysis>("/api/gemini/structured", { prompt })); }
    catch (e: any) { setError(e.message || "Analysis failed."); }
    finally { setLoading(false); }
  };
  return (
    <>
      <div className="card" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "0.95rem", fontWeight: 600 }}>What are you observing?</h2>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Observed behaviors</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {BEHAVIORS.map(b => { const a = selected.includes(b); return <button key={b} type="button" onClick={() => toggle(b)} style={{ padding: "0.35rem 0.7rem", borderRadius: "999px", border: `1.5px solid ${a?"var(--accent)":"var(--border)"}`, backgroundColor: a?"var(--accent-light)":"var(--canvas)", color: a?"var(--accent)":"var(--text-secondary)", fontSize: "0.78rem", fontWeight: a?600:400, cursor: "pointer" }}>{b}</button>; })}
          </div>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <label className="label">Context</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {CONTEXTS.map(c => { const a = ctx === c; return <button key={c} type="button" onClick={() => setCtx(a?"":c)} style={{ padding: "0.35rem 0.7rem", borderRadius: "999px", border: `1.5px solid ${a?"var(--blue)":"var(--border)"}`, backgroundColor: a?"var(--blue-light)":"var(--canvas)", color: a?"var(--blue)":"var(--text-secondary)", fontSize: "0.78rem", fontWeight: a?600:400, cursor: "pointer" }}>{c}</button>; })}
          </div>
        </div>
        <div style={{ marginBottom: "1.25rem" }}>
          <label className="label">Additional notes</label>
          <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any other context…" rows={3} style={{ resize: "vertical" }} />
        </div>
        <button className="btn-primary" onClick={analyze} disabled={loading || !selected.length || !isOnline}>
          {!isOnline ? "📵 Offline" : loading ? "Analyzing…" : "Analyze Behavior →"}
        </button>
      </div>
      {error && <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "10px", marginBottom: "1rem", fontSize: "0.83rem" }}>{error}</div>}
      {loading && <div className="card" style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "1.75rem", justifyContent: "center" }}><div className="spinner" /><span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Analyzing…</span></div>}
      <AnimatePresence>
        {result && !loading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="card" style={{ borderLeft: "3px solid var(--accent)" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>Root Cause</div>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.875rem", lineHeight: 1.65 }}>{result.rootCause}</p>
              <span style={{ padding: "0.2rem 0.6rem", backgroundColor: "var(--accent-light)", color: "var(--accent)", borderRadius: "999px", fontSize: "0.72rem", fontWeight: 600 }}>{result.triggerCategory}</span>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>🚦 De-escalation Steps</div>
              <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>{result.deescalationSteps.map((s, i) => <li key={i} style={{ fontSize: "0.875rem", lineHeight: 1.65, marginBottom: "0.3rem" }}>{s}</li>)}</ol>
            </div>
            <div className="card">
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--blue)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>🛡️ Prevention Tips</div>
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>{result.preventionTips.map((t, i) => <li key={i} style={{ fontSize: "0.875rem", lineHeight: 1.65, marginBottom: "0.3rem" }}>{t}</li>)}</ul>
            </div>
            <div className="card" style={{ borderLeft: "3px solid var(--amber)", backgroundColor: "var(--amber-light)" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>⚠️ When to Seek Help</div>
              <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.65 }}>{result.whenToSeekHelp}</p>
            </div>
            <button className="btn-secondary" onClick={() => { setResult(null); setSelected([]); setCtx(""); setNotes(""); }}>Start New Analysis</button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Record-it tab — Video+Audio Cue Interpreter ──────────────────────────────

type RecordMode = "home" | "teach" | "recognize" | "result_match" | "result_ai" | "library";

function RecordTab({ activeChild, isOnline }: { activeChild: any; isOnline: boolean }) {
  const navigate    = useNavigate();
  const childId     = activeChild?.id;
  const childName   = activeChild?.onboarding_data?.childName ?? "your child";
  const videoRef    = useRef<HTMLVideoElement>(null);
  const previewRef  = useRef<HTMLVideoElement>(null);
  const mediaRef    = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  const [mode, setMode]               = useState<RecordMode>("home");
  const [cueLibrary, setCueLibrary]   = useState<CueEntry[]>([]);
  const [cueEvents, setCueEvents]     = useState<CueEvent[]>([]);
  const [localModel, setLocalModel]   = useState<LocalModel | null>(null);
  const [recording, setRecording]     = useState(false);
  const [videoBlob, setVideoBlob]     = useState<Blob | null>(null);
  const [videoB64, setVideoB64]       = useState("");
  const [videoURL, setVideoURL]       = useState("");
  const [teachLabel, setTeachLabel]   = useState("");
  const [mediaDesc, setMediaDesc]     = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [matchResult, setMatchResult] = useState<{ label: string; confidence: number; cueId: number } | null>(null);
  const [eventId, setEventId]         = useState<number | null>(null);
  const [aiOptions, setAiOptions]     = useState<string[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [confirmed, setConfirmed]     = useState("");
  const [showEscalation, setShowEscalation] = useState(false);
  const [syncingModel, setSyncingModel]     = useState(false);

  const cueCount    = cueLibrary.length;
  const isTrained   = cueCount >= MIN_CUES_FOR_TRAINING;
  const remaining   = Math.max(0, MIN_CUES_FOR_TRAINING - cueCount);

  // ── Load library + local model ───────────────────────────────────────────────
  const refreshData = useCallback(async () => {
    if (!childId) return;
    try {
      const [lib, evts] = await Promise.all([
        apiGet<CueEntry[]>(`/api/children/${childId}/cues`),
        apiGet<CueEvent[]>(`/api/children/${childId}/cue-events`),
      ]);
      setCueLibrary(lib);
      setCueEvents(evts);
    } catch {}
    const stored = await loadLocalModel(childId);
    setLocalModel(stored);
  }, [childId]);

  useEffect(() => { refreshData(); }, [refreshData]);

  // ── Sync model from server to IndexedDB ──────────────────────────────────────
  const syncLocalModel = async () => {
    if (!childId) return;
    setSyncingModel(true);
    try {
      const data = await apiGet<any>(`/api/children/${childId}/cues/model`);
      const model: LocalModel = {
        childId,
        cueCount: data.cueCount,
        trained:  data.trained,
        cues: data.model.map((c: any) => ({
          id: c.id, label: c.label,
          mediaType: c.mediaType, vector: c.vector, weight: c.weight,
        })),
        savedAt: Date.now(),
      };
      await saveLocalModel(model);
      setLocalModel(model);
    } catch (e: any) { setError(e.message); }
    finally { setSyncingModel(false); }
  };

  // ── Camera helpers ────────────────────────────────────────────────────────────
  const startCamera = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      return stream;
    } catch {
      setError("Camera/microphone access denied. Please allow permission in your browser.");
      return null;
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  const startRecording = async () => {
    const stream = await startCamera();
    if (!stream) return;
    chunksRef.current = [];
    const mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus" });
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      stopCamera();
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setVideoBlob(blob);
      setVideoURL(URL.createObjectURL(blob));
      const reader = new FileReader();
      reader.onloadend = () => setVideoB64((reader.result as string).split(",")[1]);
      reader.readAsDataURL(blob);
    };
    mr.start();
    mediaRef.current = mr;
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const resetFlow = () => {
    stopCamera();
    setMode("home"); setVideoBlob(null); setVideoB64(""); setVideoURL("");
    setMatchResult(null); setAiOptions([]); setEventId(null);
    setConfirmed(""); setCustomLabel(""); setMediaDesc(""); setError("");
    setShowEscalation(false);
  };

  // ── Teach ─────────────────────────────────────────────────────────────────────
  const handleTeach = async () => {
    if (!videoB64 || !teachLabel.trim() || !childId) return;
    setLoading(true); setError("");
    try {
      await apiPost(`/api/children/${childId}/cues/teach`, {
        label: teachLabel.trim(), mediaType: "video", mediaData: videoB64,
      });
      setTeachLabel(""); setVideoBlob(null); setVideoB64(""); setVideoURL("");
      await refreshData();
      await syncLocalModel();
      setMode("home");
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── Recognize (local first, then server) ─────────────────────────────────────
  const handleRecognize = async () => {
    if (!videoBlob || !childId) return;
    setLoading(true); setError("");
    try {
      // Try local model first (privacy-preserving, faster)
      const embedding = await extractBlobEmbedding(videoBlob);
      if (localModel && localModel.trained) {
        const localResult = matchAgainstLocalModel(embedding, localModel);
        if (localResult.matched && localResult.label && localResult.confidence && localResult.cueId) {
          setMatchResult({ label: localResult.label, confidence: localResult.confidence, cueId: localResult.cueId });
          // Log to server silently
          apiPost(`/api/children/${childId}/cues/recognize`, { mediaData: videoB64, mediaType: "video" }).catch(() => {});
          setMode("result_match");
          setLoading(false);
          return;
        }
      }
      // Fall back to server matching + AI
      const res = await apiPost<any>(`/api/children/${childId}/cues/recognize`, { mediaData: videoB64, mediaType: "video" });
      if (res.matched) {
        setMatchResult({ label: res.label, confidence: res.confidence, cueId: res.cueId });
        setMode("result_match");
      } else {
        setEventId(res.eventId ?? null);
        const aiRes = await apiPost<any>(`/api/children/${childId}/cues/interpret`, {
          eventId: res.eventId, mediaDescription: mediaDesc || undefined,
        });
        setAiOptions(aiRes.interpretations ?? []);
        setEventId(aiRes.eventId ?? res.eventId ?? null);
        setMode("result_ai");
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleConfirm = async (label: string) => {
    if (!childId) return;
    setLoading(true);
    try {
      await apiPost(`/api/children/${childId}/cues/confirm`, {
        eventId, selectedLabel: label, mediaData: videoB64, mediaType: "video", saveToLibrary: true,
      });
      setConfirmed(label);
      await refreshData();
      await syncLocalModel();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleEscalate = async () => {
    if (!childId) return;
    try {
      await apiPost(`/api/children/${childId}/cues/escalate`, { eventId });
      setShowEscalation(true);
    } catch {}
  };

  const handleDeleteCue = async (cueId: number) => {
    if (!childId) return;
    try {
      await apiDelete(`/api/children/${childId}/cues/${cueId}`);
      await refreshData();
      await syncLocalModel();
    } catch {}
  };

  // ── Video recorder widget ─────────────────────────────────────────────────────
  const VideoRecorder = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.875rem" }}>
      {/* Live preview */}
      <div style={{ width: "100%", maxWidth: "360px", borderRadius: "12px", overflow: "hidden", backgroundColor: "#000", aspectRatio: "16/9", position: "relative", border: "2px solid var(--border)" }}>
        <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: recording ? "block" : "none" }} />
        {!recording && !videoURL && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontSize: "0.85rem", flexDirection: "column", gap: "0.5rem" }}>
            <span style={{ fontSize: "2rem" }}>🎥</span>
            <span>Camera preview appears here</span>
          </div>
        )}
        {recording && (
          <div style={{ position: "absolute", top: "0.5rem", left: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem", backgroundColor: "rgba(0,0,0,0.6)", padding: "0.2rem 0.5rem", borderRadius: "4px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--red)", animation: "pulse-dot 1s infinite" }} />
            <span style={{ color: "white", fontSize: "0.72rem", fontWeight: 600 }}>REC</span>
          </div>
        )}
      </div>
      {/* Recorded preview */}
      {videoURL && !recording && (
        <video src={videoURL} controls style={{ width: "100%", maxWidth: "360px", borderRadius: "10px", border: "1px solid var(--border)" }} />
      )}
      {/* Record button */}
      <button
        onClick={recording ? stopRecording : startRecording}
        style={{
          width: "72px", height: "72px", borderRadius: "50%", border: "none", cursor: "pointer",
          background: recording
            ? "linear-gradient(135deg, var(--red), #b83f3f)"
            : "linear-gradient(135deg, var(--accent), var(--accent-dark))",
          color: "white", fontSize: "1.6rem", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: recording ? "0 0 0 8px rgba(220,38,38,0.2)" : "0 4px 16px rgba(139,92,246,0.4)",
          animation: recording ? "pulse-ring 1.5s infinite" : "none",
        }}
        aria-label={recording ? "Stop recording" : "Start recording"}
      >
        {recording ? "⏹" : "🎬"}
      </button>
      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
        {recording ? "Recording video+audio… tap ⏹ to stop (5–15 sec recommended)"
          : videoURL ? "✅ Recording ready — review above, then save"
          : "Tap 🎬 to record video with audio"}
      </p>
      <style>{`
        @keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(220,38,38,0.4)}70%{box-shadow:0 0 0 16px rgba(220,38,38,0)}100%{box-shadow:0 0 0 0 rgba(220,38,38,0)}}
        @keyframes pulse-dot{0%,100%{opacity:0.4;transform:scale(0.9)}50%{opacity:1;transform:scale(1)}}
      `}</style>
    </div>
  );

  // ── Escalation screen ─────────────────────────────────────────────────────────
  if (showEscalation) return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ padding: "1.25rem", backgroundColor: "var(--red-light)", border: "1.5px solid var(--red)", borderRadius: "14px", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700, color: "var(--red)" }}>🚨 Escalation Support</h2>
        <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", lineHeight: 1.65 }}>This cue could not be identified. For repeated unrecognised behaviours, consulting a specialist is recommended.</p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn-primary" style={{ background: "var(--red)" }} onClick={() => navigate("/emergency")}>🆘 Emergency Support</button>
          <button className="btn-secondary" onClick={resetFlow}>← Back</button>
        </div>
      </div>
      <div className="card">
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", fontWeight: 600 }}>Recommended specialists</h3>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", lineHeight: 1.9, color: "var(--text-secondary)" }}>
          <li>Pediatric Neurologist</li><li>Developmental Paediatrician</li>
          <li>Speech-Language Pathologist</li><li>Occupational Therapist (sensory)</li>
          <li>Child & Adolescent Psychiatrist</li>
        </ul>
      </div>
    </motion.div>
  );

  // ── Home screen ───────────────────────────────────────────────────────────────
  if (mode === "home") return (
    <div>
      {/* Training progress banner */}
      <div style={{ padding: "1rem 1.25rem", background: "linear-gradient(90deg, var(--accent-light), var(--honey-light))", border: "1px solid var(--border)", borderRadius: "12px", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
            {isTrained ? `✅ Model trained — ${cueCount} cues saved` : `🎓 Training: ${cueCount} / ${MIN_CUES_FOR_TRAINING} cues added`}
          </span>
          {localModel && <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Local model: {new Date(localModel.savedAt).toLocaleDateString("en-IN")}</span>}
        </div>
        <div style={{ height: "8px", backgroundColor: "var(--surface-2)", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, (cueCount / MIN_CUES_FOR_TRAINING) * 100)}%`, background: isTrained ? "linear-gradient(90deg, var(--green), var(--accent))" : "linear-gradient(90deg, var(--amber), var(--accent))", borderRadius: "4px", transition: "width 0.5s ease" }} />
        </div>
        {!isTrained && <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>Add {remaining} more video cue{remaining !== 1 ? "s" : ""} to enable personalised matching. The model is stored <strong>only on this device</strong>.</p>}
      </div>

      {/* Privacy notice */}
      <div style={{ padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "10px", marginBottom: "1.25rem", fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>
        🔒 <strong>Privacy:</strong> Video+audio recordings are used only to extract patterns — raw clips auto-delete after 30 days. The trained model is stored <strong>locally on your device only</strong> and never shared. No continuous recording — every capture is caregiver-initiated.
      </div>

      {/* Action cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <button onClick={() => setMode("teach")} style={{ padding: "1.25rem", borderRadius: "12px", border: "1.5px solid var(--green)", background: "linear-gradient(135deg, var(--green-light), var(--surface))", cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: "1.6rem", marginBottom: "0.4rem" }}>🎓</div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--green)", marginBottom: "0.2rem" }}>Teach a Cue</div>
          <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", lineHeight: 1.5 }}>Record a video+audio of a known behavior and label it</div>
        </button>
        <button onClick={() => { if (!isTrained) { setError(`Add at least ${remaining} more cue${remaining!==1?"s":""} before interpreting`); return; } setError(""); setMode("recognize"); }} style={{ padding: "1.25rem", borderRadius: "12px", border: `1.5px solid ${isTrained ? "var(--accent)" : "var(--border)"}`, background: isTrained ? "linear-gradient(135deg, var(--accent-light), var(--surface))" : "var(--surface-2)", cursor: isTrained ? "pointer" : "not-allowed", textAlign: "left", opacity: isTrained ? 1 : 0.65 }}>
          <div style={{ fontSize: "1.6rem", marginBottom: "0.4rem" }}>🔍</div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: isTrained ? "var(--accent)" : "var(--text-muted)", marginBottom: "0.2rem" }}>Interpret Now</div>
          <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{isTrained ? "Record and match against the trained model" : `Needs ${remaining} more cue${remaining!==1?"s":""} to unlock`}</div>
        </button>
      </div>
      {error && <div style={{ padding: "0.6rem 0.875rem", backgroundColor: "var(--amber-light)", color: "var(--amber)", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.82rem", fontWeight: 500 }}>{error}</div>}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button className="btn-secondary" onClick={() => setMode("library")}>📚 Library ({cueCount})</button>
        <button className="btn-secondary" onClick={syncLocalModel} disabled={syncingModel}>{syncingModel ? "Syncing…" : "🔄 Sync Local Model"}</button>
      </div>
    </div>
  );

  // ── Teach mode ────────────────────────────────────────────────────────────────
  if (mode === "teach") return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
          <span style={{ fontSize: "1.3rem" }}>🎓</span>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Teach a Cue ({cueCount}/{MIN_CUES_FOR_TRAINING})</h2>
        </div>
        <p style={{ margin: "0 0 1rem", fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Record a <strong>5–15 second video with audio</strong> of {childName}'s sound or movement, then label what it means. Add at least <strong>{MIN_CUES_FOR_TRAINING} different cues</strong> to train the personalised model.
        </p>
        <VideoRecorder />
        <div style={{ marginTop: "1rem" }}>
          <label className="label">What does this mean? (use your own words)</label>
          <input className="input" value={teachLabel} onChange={e => setTeachLabel(e.target.value)} placeholder='e.g. "wants water", "feeling overwhelmed", "needs a break"' />
        </div>
        {error && <div style={{ marginTop: "0.6rem", padding: "0.6rem 0.875rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "8px", fontSize: "0.83rem" }}>{error}</div>}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button className="btn-primary" onClick={handleTeach} disabled={loading || !videoBlob || !teachLabel.trim()}>
            {loading ? <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><div className="spinner" style={{ width: "14px", height: "14px" }} />Saving…</span> : "💾 Save Cue"}
          </button>
          <button className="btn-secondary" onClick={resetFlow}>Cancel</button>
        </div>
        {cueCount > 0 && (
          <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: isTrained ? "var(--green)" : "var(--amber)", fontWeight: 500 }}>
            {isTrained ? `✅ Model trained with ${cueCount} cues!` : `${remaining} more cue${remaining!==1?"s":""} needed to activate personalized matching`}
          </p>
        )}
      </div>
    </motion.div>
  );

  // ── Recognize mode ────────────────────────────────────────────────────────────
  if (mode === "recognize") return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
          <span style={{ fontSize: "1.3rem" }}>🔍</span>
          <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Interpret Now</h2>
        </div>
        <p style={{ margin: "0 0 1rem", fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Record what you're seeing. The app will match it against {childName}'s <strong>locally stored model</strong> ({cueCount} trained cues). No data leaves your device for matching.
        </p>
        <VideoRecorder />
        <div style={{ marginTop: "0.875rem" }}>
          <label className="label">Brief description (optional — helps AI if no match)</label>
          <input className="input" value={mediaDesc} onChange={e => setMediaDesc(e.target.value)} placeholder='e.g. "high-pitched hum, rocking back and forth"' />
        </div>
        {error && <div style={{ marginTop: "0.6rem", padding: "0.6rem 0.875rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "8px", fontSize: "0.83rem" }}>{error}</div>}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button className="btn-primary" onClick={handleRecognize} disabled={loading || !videoBlob || !isOnline}>
            {loading ? <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><div className="spinner" style={{ width: "14px", height: "14px" }} />Matching…</span> : "🔍 Interpret"}
          </button>
          <button className="btn-secondary" onClick={resetFlow}>Cancel</button>
        </div>
      </div>
    </motion.div>
  );

  // ── Match result ──────────────────────────────────────────────────────────────
  if (mode === "result_match" && matchResult) return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
      <div className="card" style={{ borderLeft: "4px solid var(--green)", background: "linear-gradient(135deg, var(--green-light), var(--surface))", textAlign: "center", padding: "2rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>✅</div>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 700, color: "var(--green)" }}>Cue Recognised!</h2>
        <div style={{ fontSize: "1.4rem", fontWeight: 700, margin: "0.75rem 0" }}>"{matchResult.label}"</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.875rem", backgroundColor: "var(--green-light)", color: "var(--green)", borderRadius: "999px", fontSize: "0.8rem", fontWeight: 600, marginBottom: "1.25rem" }}>
          {matchResult.confidence}% confidence · local model
        </div>
        <p style={{ margin: "0 0 1.5rem", fontSize: "0.83rem", color: "var(--text-secondary)" }}>Matched against {childName}'s saved cue library stored on this device.</p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={resetFlow}>Interpret Another</button>
          <button className="btn-secondary" onClick={() => setMode("library")}>View Library</button>
        </div>
      </div>
    </motion.div>
  );

  // ── AI interpretations ────────────────────────────────────────────────────────
  if (mode === "result_ai") {
    if (confirmed) return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="card" style={{ borderLeft: "4px solid var(--accent)", textAlign: "center", padding: "2rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🧠</div>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)" }}>Saved to Model!</h2>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0.75rem 0" }}>"{confirmed}"</div>
          <p style={{ margin: "0 0 1.5rem", fontSize: "0.83rem", color: "var(--text-secondary)" }}>Added to {childName}'s local model. Next time this cue occurs, it will be recognised automatically.</p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={resetFlow}>Interpret Another</button>
            <button className="btn-secondary" onClick={() => setMode("library")}>View Library</button>
          </div>
        </div>
      </motion.div>
    );
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "1.3rem" }}>🤔</span>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>No match — AI Interpretations</h2>
          </div>
          <p style={{ margin: "0 0 1rem", fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Select the best meaning or type your own. It will be added to {childName}'s local model for next time.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
            {aiOptions.map((opt, i) => (
              <button key={i} onClick={() => handleConfirm(opt)} disabled={loading} style={{ padding: "0.75rem 1rem", borderRadius: "10px", border: "1.5px solid var(--border)", backgroundColor: "var(--canvas)", fontSize: "0.85rem", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "0.75rem", transition: "all 0.12s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--accent-light)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--canvas)"; }}>
                <span style={{ width: "24px", height: "24px", borderRadius: "50%", backgroundColor: "var(--accent-light)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}>{i+1}</span>
                {opt}
              </button>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
            <label className="label">None fit? Type your own:</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input className="input" value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder='e.g. "wants to go outside"' />
              <button className="btn-primary" onClick={() => handleConfirm(customLabel)} disabled={!customLabel.trim() || loading} style={{ flexShrink: 0 }}>Save</button>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn-secondary" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={handleEscalate} disabled={loading}>🚨 This is escalating</button>
          <button className="btn-secondary" onClick={resetFlow}>Cancel</button>
        </div>
        {error && <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.875rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "8px", fontSize: "0.83rem" }}>{error}</div>}
      </motion.div>
    );
  }

  // ── Library ───────────────────────────────────────────────────────────────────
  if (mode === "library") return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>📚 {childName}'s Cue Library</h2>
        <button className="btn-secondary" onClick={resetFlow} style={{ fontSize: "0.78rem" }}>← Back</button>
      </div>
      {!isTrained && <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--amber-light)", color: "var(--amber)", borderRadius: "10px", marginBottom: "1rem", fontSize: "0.82rem", fontWeight: 500 }}>⚠️ {remaining} more video cue{remaining!==1?"s":""} needed to activate personalised matching.</div>}
      {cueLibrary.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎓</div>
          <p style={{ margin: 0 }}>No cues saved yet. Use <strong>Teach a Cue</strong> to start building the model.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
          {cueLibrary.map(cue => (
            <div key={cue.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1rem", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px" }}>
              <span style={{ fontSize: "1.2rem" }}>{cue.media_type === "video" ? "🎬" : "🎵"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cue.label}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Confirmed {cue.confirmed_count}× · {new Date(cue.created_at).toLocaleDateString("en-IN")}</div>
              </div>
              <span style={{ padding: "0.2rem 0.5rem", backgroundColor: "var(--green-light)", color: "var(--green)", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 600 }}>{cue.confirmed_count} matches</span>
              <button onClick={() => handleDeleteCue(cue.id)} style={{ padding: "0.3rem 0.5rem", borderRadius: "6px", border: "1px solid var(--red-light)", backgroundColor: "var(--red-light)", color: "var(--red)", fontSize: "0.75rem", cursor: "pointer" }} title="Delete">🗑</button>
            </div>
          ))}
        </div>
      )}
      {cueEvents.length > 0 && (
        <>
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.88rem", fontWeight: 600, color: "var(--text-secondary)" }}>Recent Interpret Events</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {cueEvents.slice(0, 10).map(ev => (
              <div key={ev.id} style={{ padding: "0.6rem 0.875rem", backgroundColor: ev.escalated ? "var(--red-light)" : "var(--canvas)", border: `1px solid ${ev.escalated ? "var(--red)" : "var(--border)"}`, borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: "0.8rem" }}>
                  {ev.matched_label ? <span style={{ fontWeight: 600, color: "var(--green)" }}>✅ {ev.matched_label}</span>
                    : ev.caregiver_selected_interpretation ? <span style={{ fontWeight: 600, color: "var(--accent)" }}>🧠 {ev.caregiver_selected_interpretation}</span>
                    : <span style={{ color: "var(--text-muted)" }}>Unresolved</span>}
                  {ev.escalated === 1 && <span style={{ marginLeft: "0.4rem", fontSize: "0.7rem", color: "var(--red)", fontWeight: 600 }}>🚨 Escalated</span>}
                </div>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{new Date(ev.created_at).toLocaleDateString("en-IN")}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );

  return null;
}

// ─── Main BehaviorPage with segmented control ─────────────────────────────────

export default function BehaviorPage() {
  const { activeChild } = useAuth();
  const { isOnline }    = useOffline();
  const [tab, setTab]   = useState<"describe" | "record">("describe");

  return (
    <div style={{ padding: "1.5rem", maxWidth: "720px", margin: "0 auto" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "linear-gradient(135deg, var(--accent), var(--amber))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>🧩</div>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Behavioral Interpreter</h1>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {activeChild?.onboarding_data?.childName ? `Understanding ${activeChild.onboarding_data.childName}'s communication` : "Understand and interpret your child's behavior"}
            </p>
          </div>
        </div>
      </div>

      {/* Segmented control */}
      <div style={{ display: "flex", backgroundColor: "var(--surface-2)", borderRadius: "12px", padding: "4px", marginBottom: "1.5rem", gap: "4px" }}>
        {([{ key: "describe", icon: "📝", label: "Describe it" }, { key: "record", icon: "🎬", label: "Record it" }] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: "0.55rem 0.5rem", borderRadius: "9px", border: "none", cursor: "pointer", fontSize: "0.85rem", fontWeight: tab === t.key ? 700 : 400, background: tab === t.key ? "linear-gradient(135deg, white, var(--honey-light))" : "transparent", color: tab === t.key ? "var(--accent)" : "var(--text-secondary)", boxShadow: tab === t.key ? "0 1px 6px rgba(44,31,20,0.10)" : "none", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "describe" ? (
          <motion.div key="describe" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.16 }}>
            <DescribeTab activeChild={activeChild} isOnline={isOnline} />
          </motion.div>
        ) : (
          <motion.div key="record" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.16 }}>
            {!activeChild
              ? <div className="card" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>No child profile selected. Please select one from the sidebar.</div>
              : <RecordTab activeChild={activeChild} isOnline={isOnline} />
            }
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
