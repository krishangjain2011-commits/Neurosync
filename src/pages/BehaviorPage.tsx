import { useState, useRef, useEffect, useCallback } from "react";
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
import FeatureTour from "../components/FeatureTour";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Audio Recorder component ─────────────────────────────────────────────────

type RecordMode = "home" | "teach" | "recognize" | "result_match" | "result_no_match" | "library";

function AudioRecorder({
  onRecorded,
}: {
  onRecorded: (blob: Blob, b64: string) => void;
}) {
  const mediaRef   = useRef<MediaRecorder | null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const fileRef    = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [audioURL,  setAudioURL]  = useState("");
  const [fileName,  setFileName]  = useState("");
  const [error,     setError]     = useState("");
  const [duration,  setDuration]  = useState(0);
  const timerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRec = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        const url  = URL.createObjectURL(blob);
        setAudioURL(url);
        setFileName("");
        const reader = new FileReader();
        reader.onloadend = () => {
          const b64 = (reader.result as string).split(",")[1];
          onRecorded(blob, b64);
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      setError("Microphone access denied. Please allow mic permission in your browser.");
    }
  };

  const stopRec = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRef.current?.stop();
    setRecording(false);
  };

  const handleFile = (file: File) => {
    const ACCEPTED = ["audio/mpeg","audio/mp4","audio/wav","audio/ogg","audio/webm","audio/x-m4a","audio/aac","audio/flac","application/octet-stream"];
    if (!file.type.startsWith("audio/") && !ACCEPTED.includes(file.type)) {
      setError(`Unsupported format: ${file.type || file.name}. Use m4a, mp3, wav, ogg, or webm.`);
      return;
    }
    setError("");
    const url = URL.createObjectURL(file);
    setAudioURL(url);
    setFileName(file.name);
    setDuration(0);
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = (reader.result as string).split(",")[1];
      onRecorded(file, b64);
    };
    reader.readAsDataURL(file);
  };

  const reset = () => {
    setAudioURL("");
    setFileName("");
    setDuration(0);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.875rem" }}>
      {/* Record + Attach row */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {/* Record button */}
        <button
          onClick={recording ? stopRec : startRec}
          style={{
            width: "80px", height: "80px", borderRadius: "50%", border: "none", cursor: "pointer",
            background: recording
              ? "linear-gradient(135deg, var(--red), #b83f3f)"
              : "linear-gradient(135deg, var(--accent), var(--accent-dark, #6d28d9))",
            color: "white", fontSize: "2rem", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: recording ? "0 0 0 8px rgba(220,38,38,0.2)" : "0 4px 16px rgba(139,92,246,0.4)",
            animation: recording ? "pulse-ring 1.5s infinite" : "none",
            transition: "all 0.2s",
          }}
          aria-label={recording ? "Stop recording" : "Start recording"}
        >
          {recording ? "⏹" : "🎙️"}
        </button>

        {/* Divider */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem" }}>
          <div style={{ width: "1px", height: "20px", backgroundColor: "var(--border)" }} />
          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontWeight: 600 }}>OR</span>
          <div style={{ width: "1px", height: "20px", backgroundColor: "var(--border)" }} />
        </div>

        {/* File attach button */}
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            width: "80px", height: "80px", borderRadius: "50%", border: "2px dashed var(--border)",
            cursor: "pointer", background: "var(--canvas)",
            color: "var(--text-muted)", fontSize: "1.5rem",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px",
            transition: "all 0.2s",
          }}
          aria-label="Attach audio file"
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
        >
          📎
          <span style={{ fontSize: "0.55rem", fontWeight: 600, letterSpacing: "0.02em" }}>ATTACH</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.m4a,.mp3,.wav,.ogg,.webm,.aac,.flac"
          style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {recording && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--red)", fontWeight: 600, fontSize: "0.85rem" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "var(--red)", animation: "pulse-dot 1s infinite" }} />
          Recording… {duration}s (tap ⏹ to stop)
        </div>
      )}

      {!recording && !audioURL && (
        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>
          Record live (5–15 sec) or attach an existing audio file (m4a, mp3, wav, ogg, webm)
        </p>
      )}

      {audioURL && !recording && (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <audio src={audioURL} controls style={{ width: "100%", borderRadius: "8px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName ? `📎 ${fileName}` : `✅ Recording ready${duration > 0 ? ` (${duration}s)` : ""}`}
            </span>
            <button onClick={reset} style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem", borderRadius: "5px", border: "1px solid var(--border)", backgroundColor: "var(--canvas)", cursor: "pointer", color: "var(--text-secondary)", flexShrink: 0 }}>
              {fileName ? "Re-attach" : "Re-record"}
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ margin: 0, color: "var(--red)", fontSize: "0.8rem" }}>{error}</p>}

      <style>{`
        @keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(220,38,38,0.4)}70%{box-shadow:0 0 0 16px rgba(220,38,38,0)}100%{box-shadow:0 0 0 0 rgba(220,38,38,0)}}
        @keyframes pulse-dot{0%,100%{opacity:0.4;transform:scale(0.9)}50%{opacity:1;transform:scale(1)}}
      `}</style>
    </div>
  );
}

// ─── Main BehaviorTab (audio-only cue interpreter) ───────────────────────────

function BehaviorTab({ activeChild, isOnline }: { activeChild: any; isOnline: boolean }) {
  const navigate  = useNavigate();
  const childId   = activeChild?.id;
  const childName = activeChild?.onboarding_data?.childName ?? "your child";

  const [mode, setMode]               = useState<RecordMode>("home");
  const [cueLibrary, setCueLibrary]   = useState<CueEntry[]>([]);
  const [cueEvents, setCueEvents]     = useState<CueEvent[]>([]);
  const [localModel, setLocalModel]   = useState<LocalModel | null>(null);
  const [audioBlob, setAudioBlob]     = useState<Blob | null>(null);
  const [audioB64, setAudioB64]       = useState("");
  const [teachLabel, setTeachLabel]   = useState("");
  const [mediaDesc, setMediaDesc]     = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [matchResult, setMatchResult] = useState<{ label: string; confidence: number; cueId: number } | null>(null);
  const [eventId, setEventId]         = useState<number | null>(null);
  const [closestCues, setClosestCues] = useState<{ id?: number; label: string; confidence: number; score?: number }[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [confirmed, setConfirmed]     = useState("");
  const [showEscalation, setShowEscalation] = useState(false);
  const [aiOptions, setAiOptions]           = useState<string[]>([]);
  const [syncingModel, setSyncingModel]     = useState(false);
  const [sharedMatches, setSharedMatches]   = useState<{ clusterId: string; topLabel: string; score: number }[]>([]);

  const cueCount  = cueLibrary.length;
  const isTrained = cueCount >= MIN_CUES_FOR_TRAINING;
  const remaining = Math.max(0, MIN_CUES_FOR_TRAINING - cueCount);

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

  // ── Sync server model → IndexedDB ────────────────────────────────────────────
  const syncLocalModel = async () => {
    if (!childId) return;
    setSyncingModel(true);
    try {
      const data = await apiGet<any>(`/api/children/${childId}/cues/model`);
      const model: LocalModel = {
        childId,
        cueCount:     data.cueCount,
        trained:      data.trained,
        cues: data.model.map((c: any) => ({
          id: c.id, label: c.label,
          mediaType: c.mediaType, vector: c.vector, weight: c.weight,
        })),
        centroids:    data.centroids ?? {},
        embedVersion: data.embedVersion ?? "local-v2",
        savedAt:      Date.now(),
      };
      await saveLocalModel(model);
      setLocalModel(model);
    } catch (e: any) { setError(e.message); }
    finally { setSyncingModel(false); }
  };

  // ── Reset flow ────────────────────────────────────────────────────────────────
  const resetFlow = () => {
    setMode("home");
    setAudioBlob(null); setAudioB64("");
    setMatchResult(null); setClosestCues([]); setEventId(null);
    setConfirmed(""); setCustomLabel(""); setMediaDesc(""); setError("");
    setShowEscalation(false); setAiOptions([]); setSharedMatches([]);
  };

  // ── Teach — multipart upload ──────────────────────────────────────────────────
  const handleTeach = async () => {
    if (!audioBlob || !teachLabel.trim() || !childId) return;
    setLoading(true); setError("");
    const labelToSave = teachLabel.trim();
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "clip.webm");
      formData.append("label", labelToSave);
      formData.append("mediaType", "audio");

      const res = await fetch(`/api/children/${childId}/cues/teach`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? "Upload failed");
      }
      setTeachLabel(""); setAudioBlob(null); setAudioB64("");
      await refreshData();
      await syncLocalModel();
      // Contribute this newly-taught cue to the shared pool (always on)
      handleContributePool(labelToSave);
      setMode("home");
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── Recognize — single multipart call, synchronous result ───────────────────
  const handleRecognize = async () => {
    if (!audioBlob || !childId) return;
    setLoading(true); setError("");
    try {
      // 1. Try on-device IndexedDB model first (zero network, privacy-preserving)
      const embedding = await extractBlobEmbedding(audioBlob);
      if (localModel && localModel.trained) {
        const localResult = matchAgainstLocalModel(embedding, localModel);
        if (localResult.matched && localResult.label && localResult.confidence && localResult.cueId) {
          setMatchResult({ label: localResult.label, confidence: localResult.confidence, cueId: localResult.cueId });
          setMode("result_match");
          setLoading(false);
          // Log to server silently in background
          const fd = new FormData();
          fd.append("audio", audioBlob, "clip.webm");
          fetch(`/api/children/${childId}/cues/recognize`, {
            method: "POST", body: fd, credentials: "include",
          }).catch(() => {});
          return;
        }
      }

      // 2. Server-side: multipart upload → synchronous MFCC embed → match
      const formData = new FormData();
      formData.append("audio", audioBlob, "clip.webm");

      const token = localStorage.getItem("neurosync_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/children/${childId}/cues/recognize`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const result = await res.json();
      if (result.matched) {
        setMatchResult({ label: result.label, confidence: result.confidence, cueId: result.cueId });
        setMode("result_match");
      } else {
        setEventId(result.eventId ?? null);
        setClosestCues(result.closestCues ?? []);
        setMode("result_no_match");
        // Check shared pool for cross-family suggestions (fire-and-forget)
        if (result.closestCues?.length === 0 || cueCount === 0) {
          const embedding = await extractBlobEmbedding(audioBlob).catch(() => null);
          if (embedding) {
            apiPost<any>("/api/shared-pool/match", { embeddingVector: embedding })
              .then(r => { if (r.matches?.length) setSharedMatches(r.matches); })
              .catch(() => {});
          }
        }
      }
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── Confirm label — multipart when blob available, else base64 ───────────────
  const handleConfirm = async (label: string) => {
    if (!childId) return;
    setLoading(true);
    try {
      if (audioBlob) {
        const formData = new FormData();
        formData.append("audio", audioBlob, "clip.webm");
        formData.append("selectedLabel", label);
        formData.append("mediaType", "audio");
        formData.append("saveToLibrary", "true");
        if (eventId) formData.append("eventId", String(eventId));
        const res = await fetch(`/api/children/${childId}/cues/confirm`, {
          method: "POST", body: formData, credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Confirm failed");
      } else {
        await apiPost(`/api/children/${childId}/cues/confirm`, {
          eventId, selectedLabel: label, mediaData: audioB64, mediaType: "audio", saveToLibrary: true,
        });
      }
      setConfirmed(label);
      await refreshData();
      await syncLocalModel();
      handleContributePool(label); // silently contribute to shared pool if opted in
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── Contribute to shared pool (fires silently after confirm if user opted in) ─
  const handleContributePool = async (label: string) => {
    if (!childId || !audioBlob) return;
    try {
      const embedding = await extractBlobEmbedding(audioBlob);
      if (embedding && embedding.some(v => v !== 0)) {
        await apiPost(`/api/children/${childId}/cues/contribute-pool`, {
          embeddingVector: embedding,
          confirmedLabel: label,
        });
      }
    } catch { /* non-fatal — shared pool contribution is best-effort */ }
  };

  // ── Escalate ──────────────────────────────────────────────────────────────────
  const handleEscalate = async () => {
    if (!childId) return;
    try {
      await apiPost(`/api/children/${childId}/cues/escalate`, { eventId });
      setShowEscalation(true);
    } catch {}
  };

  // ── Ask AI to interpret ───────────────────────────────────────────────────────
  const handleGetAiInterpretation = async () => {
    if (!childId) return;
    setLoading(true); setError("");
    try {
      const aiRes = await apiPost<any>(`/api/children/${childId}/cues/interpret`, {
        eventId,
        mediaDescription: mediaDesc || undefined,
      });
      setAiOptions(aiRes.interpretations ?? []);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  // ── Delete cue ────────────────────────────────────────────────────────────────
  const handleDeleteCue = async (cueId: number) => {
    if (!childId) return;
    try {
      await apiDelete(`/api/children/${childId}/cues/${cueId}`);
      await refreshData();
      await syncLocalModel();
    } catch {}
  };

  // ── Escalation screen ─────────────────────────────────────────────────────────
  if (showEscalation) return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ padding: "1.25rem", backgroundColor: "var(--red-light)", border: "1.5px solid var(--red)", borderRadius: "14px", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem", fontWeight: 700, color: "var(--red)" }}>🚨 Escalation Support</h2>
        <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", lineHeight: 1.65 }}>
          This cue could not be identified. For repeated unrecognised behaviours, consulting a specialist is recommended.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn-primary" style={{ background: "var(--red)" }} onClick={() => navigate("/emergency")}>🆘 Emergency Support</button>
          <button className="btn-secondary" onClick={resetFlow}>← Back</button>
        </div>
      </div>
      <div className="card">
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", fontWeight: 600 }}>Recommended specialists</h3>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", lineHeight: 1.9, color: "var(--text-secondary)" }}>
          <li>Pediatric Neurologist</li>
          <li>Developmental Paediatrician</li>
          <li>Speech-Language Pathologist</li>
          <li>Occupational Therapist (sensory)</li>
          <li>Child &amp; Adolescent Psychiatrist</li>
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
            {isTrained
              ? `✅ Model trained — ${cueCount} audio cues saved`
              : `🎓 Training: ${cueCount} / ${MIN_CUES_FOR_TRAINING} audio cues added`}
          </span>
          {localModel && (
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              Synced: {new Date(localModel.savedAt).toLocaleDateString("en-IN")}
            </span>
          )}
        </div>
        <div style={{ height: "8px", backgroundColor: "var(--surface-2)", borderRadius: "4px", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, (cueCount / MIN_CUES_FOR_TRAINING) * 100)}%`,
            background: isTrained
              ? "linear-gradient(90deg, var(--green), var(--accent))"
              : "linear-gradient(90deg, var(--amber), var(--accent))",
            borderRadius: "4px", transition: "width 0.5s ease",
          }} />
        </div>
        {!isTrained && (
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: "var(--text-secondary)" }}>
            Add {remaining} more audio cue{remaining !== 1 ? "s" : ""} to enable personalised matching.
            The model is stored <strong>only on this device</strong>.
          </p>
        )}
      </div>

      {/* Privacy notice */}
      <div style={{ padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "10px", marginBottom: "1.25rem", fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.65 }}>
        🔒 <strong>Privacy:</strong> Audio recordings are used only to extract MFCC patterns via a local Python model — raw clips auto-delete after 30 days. The trained model is stored <strong>locally on this device</strong> and never shared. Every capture is caregiver-initiated.
      </div>

      {/* Action cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <button onClick={() => { setError(""); setMode("teach"); }} style={{ padding: "1.25rem", borderRadius: "12px", border: "1.5px solid var(--green)", background: "linear-gradient(135deg, var(--green-light), var(--surface))", cursor: "pointer", textAlign: "left" }}>
          <div style={{ fontSize: "1.6rem", marginBottom: "0.4rem" }}>🎓</div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--green)", marginBottom: "0.2rem" }}>Teach a Cue</div>
          <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", lineHeight: 1.5 }}>Record audio of a known behaviour and label it</div>
        </button>
        <button
          onClick={() => { setError(""); setMode("recognize"); }}
          style={{ padding: "1.25rem", borderRadius: "12px", border: "1.5px solid var(--accent)", background: "linear-gradient(135deg, var(--accent-light), var(--surface))", cursor: "pointer", textAlign: "left" }}
        >
          <div style={{ fontSize: "1.6rem", marginBottom: "0.4rem" }}>🔍</div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent)", marginBottom: "0.2rem" }}>Interpret Now</div>
          <div style={{ fontSize: "0.73rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            {isTrained ? "Match audio against trained model" : "Record audio — we'll match or help you label it"}
          </div>
        </button>
      </div>

      {error && (
        <div style={{ padding: "0.6rem 0.875rem", backgroundColor: "var(--amber-light)", color: "var(--amber)", borderRadius: "8px", marginBottom: "1rem", fontSize: "0.82rem", fontWeight: 500 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button className="btn-secondary" onClick={() => setMode("library")}>📚 Library ({cueCount})</button>
        <button className="btn-secondary" onClick={syncLocalModel} disabled={syncingModel}>
          {syncingModel ? "Syncing…" : "🔄 Sync Local Model"}
        </button>
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
          Record a <strong>5–15 second audio clip</strong> of {childName}'s sound or vocalisation, then label what it means.
          Add at least <strong>{MIN_CUES_FOR_TRAINING} different cues</strong> to train the personalised model.
        </p>
        <AudioRecorder onRecorded={(blob, b64) => { setAudioBlob(blob); setAudioB64(b64); }} />
        <div style={{ marginTop: "1rem" }}>
          <label className="label">What does this mean? (use your own words)</label>
          <input
            className="input"
            value={teachLabel}
            onChange={e => setTeachLabel(e.target.value)}
            placeholder='e.g. "wants water", "feeling overwhelmed", "needs a break"'
          />
        </div>
        {error && (
          <div style={{ marginTop: "0.6rem", padding: "0.6rem 0.875rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "8px", fontSize: "0.83rem" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button className="btn-primary" onClick={handleTeach} disabled={loading || !audioBlob || !teachLabel.trim()}>
            {loading
              ? <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><div className="spinner" style={{ width: "14px", height: "14px" }} />Saving…</span>
              : "💾 Save Cue"}
          </button>
          <button className="btn-secondary" onClick={resetFlow}>Cancel</button>
        </div>
        {cueCount > 0 && (
          <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: isTrained ? "var(--green)" : "var(--amber)", fontWeight: 500 }}>
            {isTrained
              ? `✅ Model trained with ${cueCount} cues!`
              : `${remaining} more cue${remaining !== 1 ? "s" : ""} needed to activate personalised matching`}
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
          Record what you're hearing. The app will match it against {childName}'s{" "}
          <strong>locally stored model</strong> ({cueCount} trained cues). Matching happens on-device — no audio leaves your phone.
        </p>
        <AudioRecorder onRecorded={(blob, b64) => { setAudioBlob(blob); setAudioB64(b64); }} />
        <div style={{ marginTop: "0.875rem" }}>
          <label className="label">Optional: briefly describe what you're observing</label>
          <input
            className="input"
            value={mediaDesc}
            onChange={e => setMediaDesc(e.target.value)}
            placeholder='e.g. "high-pitched hum, rocking back and forth"'
          />
          <p style={{ margin: "0.3rem 0 0", fontSize: "0.73rem", color: "var(--text-muted)" }}>
            Used only if AI interpretation is requested — stored with the event for your reference.
          </p>
        </div>
        {error && (
          <div style={{ marginTop: "0.6rem", padding: "0.6rem 0.875rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "8px", fontSize: "0.83rem" }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button className="btn-primary" onClick={handleRecognize} disabled={loading || !audioBlob || !isOnline}>
            {loading
              ? <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><div className="spinner" style={{ width: "14px", height: "14px" }} />Matching…</span>
              : "🔍 Interpret"}
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
          {matchResult.confidence}% confidence · local MFCC model
        </div>
        <p style={{ margin: "0 0 1.5rem", fontSize: "0.83rem", color: "var(--text-secondary)" }}>
          Matched against {childName}'s saved cue library stored on this device.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn-primary" onClick={resetFlow}>Interpret Another</button>
          <button className="btn-secondary" onClick={() => setMode("library")}>View Library</button>
        </div>
      </div>
    </motion.div>
  );

  // ── No confident match ────────────────────────────────────────────────────────
  if (mode === "result_no_match") {
    if (confirmed) return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="card" style={{ borderLeft: "4px solid var(--accent)", textAlign: "center", padding: "2rem" }}>
          <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>🧠</div>
          <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)" }}>Saved to Model!</h2>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0.75rem 0" }}>"{confirmed}"</div>
          <p style={{ margin: "0 0 1.5rem", fontSize: "0.83rem", color: "var(--text-secondary)" }}>
            Added to {childName}'s local model. Next time this cue occurs, it will be recognised automatically.
          </p>
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
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "1.3rem" }}>🔍</span>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>No confident match found</h2>
          </div>
          <p style={{ margin: "0 0 1rem", fontSize: "0.83rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            The model couldn't confidently match this audio.
            {closestCues.length > 0
              ? " Here are the closest patterns — these are below the confidence threshold, not confirmed answers."
              : " No similar patterns found in the library yet."}
          </p>

          {/* Closest known patterns */}
          {closestCues.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
                Closest known patterns
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {closestCues.map((cue, i) => {
                  const confidencePct = Math.round((cue.confidence ?? 0) * 100);
                  return (
                    <div key={i} style={{ padding: "0.75rem 1rem", borderRadius: "10px", border: "1.5px solid var(--border)", backgroundColor: "var(--canvas)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{cue.label}</div>
                        <div style={{ marginTop: "0.3rem", height: "5px", backgroundColor: "var(--surface-2)", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${confidencePct}%`, backgroundColor: "var(--accent)", borderRadius: "3px", opacity: 0.6 }} />
                        </div>
                      </div>
                      <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", flexShrink: 0 }}>{confidencePct}% similarity</span>
                      <button onClick={() => handleConfirm(cue.label)} disabled={loading} style={{ padding: "0.3rem 0.7rem", borderRadius: "7px", border: "1.5px solid var(--accent)", backgroundColor: "var(--accent-light)", color: "var(--accent)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                        This is it
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Interpretation (Groq text-only) */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "0.875rem 0" }}>
            {aiOptions.length === 0 ? (
              <button
                onClick={handleGetAiInterpretation}
                disabled={loading || !isOnline}
                style={{ width: "100%", padding: "0.65rem 1rem", borderRadius: "10px", border: "1.5px solid var(--accent)", backgroundColor: "var(--accent-light)", color: "var(--accent)", fontSize: "0.85rem", fontWeight: 600, cursor: loading || !isOnline ? "not-allowed" : "pointer", opacity: loading || !isOnline ? 0.6 : 1 }}
              >
                {loading ? "Asking AI…" : "🔮 Ask AI to suggest interpretations"}
              </button>
            ) : (
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>
                  AI suggestions — tap one or type your own below
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {aiOptions.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => handleConfirm(opt)}
                      disabled={loading}
                      style={{ padding: "0.6rem 0.875rem", borderRadius: "9px", textAlign: "left", border: "1.5px solid var(--border)", backgroundColor: "var(--canvas)", color: "var(--text-primary)", fontSize: "0.85rem", cursor: "pointer", transition: "all 0.12s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--accent-light)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.backgroundColor = "var(--canvas)"; }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Custom label */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
            <label className="label">None fit? Label it yourself:</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input className="input" value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder='e.g. "wants to go outside"' />
              <button className="btn-primary" onClick={() => handleConfirm(customLabel)} disabled={!customLabel.trim() || loading} style={{ flexShrink: 0 }}>
                Save &amp; Train
              </button>
            </div>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Saving a label adds this audio clip to {childName}'s model for future recognition.
            </p>
          </div>

          {/* Shared-pool suggestions — clearly marked as other families' data */}
          {sharedMatches.length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.875rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                🌐 Other families' interpretations
              </div>
              <p style={{ margin: "0 0 0.6rem", fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                These come from anonymised patterns across other opted-in families — not specific to {childName}. Use as a starting point only.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {sharedMatches.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => handleConfirm(m.topLabel)}
                    disabled={loading}
                    style={{ padding: "0.55rem 0.875rem", borderRadius: "9px", textAlign: "left", border: "1.5px dashed var(--border)", backgroundColor: "var(--surface-2)", color: "var(--text-secondary)", fontSize: "0.82rem", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <span>{m.topLabel}</span>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{Math.round(m.score * 100)}% similar</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Escalation */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button className="btn-secondary" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={handleEscalate} disabled={loading}>
            🚨 This is escalating
          </button>
          <button className="btn-secondary" onClick={resetFlow}>Cancel</button>
        </div>
        {error && (
          <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.875rem", backgroundColor: "var(--red-light)", color: "var(--red)", borderRadius: "8px", fontSize: "0.83rem" }}>
            {error}
          </div>
        )}
      </motion.div>
    );
  }

  // ── Library ───────────────────────────────────────────────────────────────────
  if (mode === "library") return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>📚 {childName}'s Audio Cue Library</h2>
        <button className="btn-secondary" onClick={resetFlow} style={{ fontSize: "0.78rem" }}>← Back</button>
      </div>
      {!isTrained && (
        <div style={{ padding: "0.75rem 1rem", backgroundColor: "var(--amber-light)", color: "var(--amber)", borderRadius: "10px", marginBottom: "1rem", fontSize: "0.82rem", fontWeight: 500 }}>
          ⚠️ {remaining} more audio cue{remaining !== 1 ? "s" : ""} needed to activate personalised matching.
        </div>
      )}
      {cueLibrary.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎙️</div>
          <p style={{ margin: 0 }}>No audio cues saved yet. Use <strong>Teach a Cue</strong> to start building the model.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginBottom: "1.5rem" }}>
          {cueLibrary.map(cue => (
            <div key={cue.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1rem", backgroundColor: "var(--surface)", border: "1px solid var(--border)", borderRadius: "10px" }}>
              <span style={{ fontSize: "1.2rem" }}>🎙️</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cue.label}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  Confirmed {cue.confirmed_count}× · {new Date(cue.created_at).toLocaleDateString("en-IN")}
                </div>
                {/* Playback — only shown if file is stored on server */}
                {(cue as any).media_ref && (
                  <audio
                    src={`/api/children/${childId}/cues/audio/${encodeURIComponent((cue as any).media_ref.split(/[/\\]/).pop())}`}
                    controls
                    style={{ width: "100%", marginTop: "0.35rem", height: "28px" }}
                  />
                )}
              </div>
              <span style={{ padding: "0.2rem 0.5rem", backgroundColor: "var(--green-light)", color: "var(--green)", borderRadius: "999px", fontSize: "0.7rem", fontWeight: 600 }}>
                {cue.confirmed_count} matches
              </span>
              <button
                onClick={() => handleDeleteCue(cue.id)}
                style={{ padding: "0.3rem 0.5rem", borderRadius: "6px", border: "1px solid var(--red-light)", backgroundColor: "var(--red-light)", color: "var(--red)", fontSize: "0.75rem", cursor: "pointer" }}
                title="Delete"
              >🗑</button>
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
                  {ev.matched_label
                    ? <span style={{ fontWeight: 600, color: "var(--green)" }}>✅ {ev.matched_label}</span>
                    : ev.caregiver_selected_interpretation
                    ? <span style={{ fontWeight: 600, color: "var(--accent)" }}>🧠 {ev.caregiver_selected_interpretation}</span>
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

// ─── Main BehaviorPage ────────────────────────────────────────────────────────

export default function BehaviorPage() {
  const { activeChild } = useAuth();
  const { isOnline }    = useOffline();

  const tourTips = [
    "🎙️ Teach audio cues first — record 6+ clips to train the personalised model.",
    "🔍 Once trained, use Interpret Now to match new sounds against the model.",
    "🔒 All audio matching happens on-device. No recordings leave your phone.",
    "🔮 If no match is found, ask the AI for text-based interpretation suggestions.",
    "📚 View the Library to see all saved cues and recent interpret events.",
  ];

  return (
    <div style={{ padding: "1.5rem", maxWidth: "720px", margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "linear-gradient(135deg, var(--accent), var(--amber))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem" }}>🎙️</div>
          <div>
            <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>Behaviour Interpreter</h1>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {activeChild?.onboarding_data?.childName
                ? `Understanding ${activeChild.onboarding_data.childName}'s communication`
                : "Understand and interpret your child's vocalisations"}
            </p>
          </div>
        </div>
      </div>

      <FeatureTour
        featureKey="tour_behavior"
        icon="🎙️"
        title="Behaviour Interpreter"
        summary="Teach audio cues, then interpret them in real time using a personalised on-device ML model."
        tips={tourTips}
      />

      <AnimatePresence mode="wait">
        {!activeChild ? (
          <motion.div key="no-child" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="card" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
              No child profile selected. Please select one from the sidebar.
            </div>
          </motion.div>
        ) : (
          <motion.div key="tab" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <BehaviorTab activeChild={activeChild} isOnline={isOnline} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
