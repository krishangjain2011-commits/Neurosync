import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useOffline } from "../context/OfflineContext";
import { useLang } from "../context/LangContext";
import { streamGemini } from "../lib/api";
import FeatureTour from "../components/FeatureTour";

interface Message { id: string; role: "user" | "assistant"; content: string; }

function MsgBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: "0.875rem" }}>
      {!isUser && (
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", marginRight: "0.5rem", flexShrink: 0, marginTop: "2px" }}>🧠</div>
      )}
      <div style={{
        maxWidth: "72%", padding: "0.7rem 0.95rem",
        borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
        background: isUser
          ? "linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)"
          : "var(--surface)",
        color: isUser ? "white" : "var(--text-primary)",
        border: isUser ? "none" : "1px solid var(--border)",
        boxShadow: isUser ? "0 2px 8px rgba(139,92,246,0.25)" : "var(--shadow-sm)",
        fontSize: "1rem", lineHeight: 1.65,
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {msg.content}
      </div>
    </motion.div>
  );
}

export default function ChatPage() {
  const { activeChild } = useAuth();
  const { isOnline }    = useOffline();
  const { t }           = useLang();

  const [messages, setMessages] = useState<Message[]>([{
    id: "welcome", role: "assistant",
    content: t("chatWelcome"),
  }]);
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Re-set welcome message when language changes
  useEffect(() => {
    setMessages(prev => prev.map(m =>
      m.id === "welcome" ? { ...m, content: t("chatWelcome") } : m
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t("chatWelcome")]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const QUICK_PROMPTS = [
    t("quickPrompt1"),
    t("quickPrompt2"),
    t("quickPrompt3"),
    t("quickPrompt4"),
  ];

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: Message   = { id: Date.now().toString(), role: "user", content: text.trim() };
    const assistId = (Date.now() + 1).toString();
    const assistMsg: Message = { id: assistId, role: "assistant", content: "" };
    setMessages(p => [...p, userMsg, assistMsg]);
    setInput("");
    setStreaming(true);
    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      let acc = "";
      for await (const chunk of streamGemini(history, activeChild?.onboarding_data ?? undefined)) {
        acc += chunk;
        setMessages(p => p.map(m => m.id === assistId ? { ...m, content: acc } : m));
      }
    } catch {
      setMessages(p => p.map(m => m.id === assistId ? { ...m, content: t("chatErrorMsg") } : m));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "transparent" }}>
      {/* Header */}
      <div style={{
        padding: "1rem 1.5rem",
        borderBottom: "1px solid var(--border)",
        background: "linear-gradient(90deg, var(--surface) 0%, var(--honey-light) 100%)",
        display: "flex", alignItems: "center", gap: "0.75rem",
      }}>

        <span style={{ fontSize: "1.25rem" }}>💬</span>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>{t("chatTitle")}</h1>
          <p style={{ margin: 0, fontSize: "0.833rem", color: "var(--text-muted)" }}>
            {activeChild?.onboarding_data?.childName
              ? `${t("chatSupporting")} ${activeChild.onboarding_data.childName}`
              : t("chatSubtitle")}
          </p>
        </div>
        {!isOnline && (
          <span style={{ marginLeft: "auto", padding: "0.2rem 0.6rem", backgroundColor: "var(--amber-light)", color: "var(--amber)", borderRadius: "999px", fontSize: "0.722rem", fontWeight: 600 }}>
            📵 {t("offline")}
          </span>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1.25rem 1.5rem" }}>
        <FeatureTour
          featureKey="chat"
          icon="💬"
          title="Helpful Chat"
          summary="Your AI caregiving assistant — ask anything about your child's behaviour, routines, sensory needs, or day-to-day challenges. Responses are personalised using your child's profile."
          tips={[
            "Use the quick prompts below to get started instantly.",
            "The AI knows your child's diagnoses and sensory triggers — mention specific situations for tailored advice.",
            "Type in English, Hindi, or Marathi — switch language from the sidebar anytime.",
            "Chat history is not saved between sessions, so screenshot anything useful.",
          ]}
          accentColor="var(--accent)"
        />
        {messages.length === 1 && (
          <div style={{ marginBottom: "1.25rem" }}>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>{t("chatQuickPrompts")}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
              {QUICK_PROMPTS.map(q => (
                <button key={q} onClick={() => sendMessage(q)} disabled={!isOnline}
                  style={{ padding: "0.35rem 0.7rem", borderRadius: "999px", border: "1px solid var(--border)", backgroundColor: "var(--surface)", color: "var(--text-secondary)", fontSize: "0.833rem", cursor: "pointer", opacity: isOnline ? 1 : 0.5 }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map(msg => <MsgBubble key={msg.id} msg={msg} />)}
        </AnimatePresence>
        {streaming && messages[messages.length - 1]?.content === "" && (
          <div style={{ display: "flex", gap: "0.35rem", paddingLeft: "2.25rem", marginBottom: "0.875rem" }}>
            {[0, 1, 2].map(i => (
              <motion.div key={i} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--text-muted)" }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: "1rem 1.5rem",
        borderTop: "1px solid var(--border)",
        background: "linear-gradient(90deg, var(--surface) 0%, var(--honey-light) 100%)",
      }}>
        {!isOnline && (
          <div style={{ padding: "0.4rem 0.75rem", backgroundColor: "var(--amber-light)", color: "var(--amber)", borderRadius: "7px", fontSize: "0.833rem", marginBottom: "0.6rem", fontWeight: 500 }}>
            📵 {t("chatOfflineNote")}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            disabled={streaming || !isOnline}
            placeholder={isOnline ? t("chatPlaceholder") : t("chatOfflinePlaceholder")}
            rows={1}
            style={{ flex: 1, padding: "0.65rem 0.875rem", border: "1px solid var(--border)", borderRadius: "10px", backgroundColor: "var(--canvas)", color: "var(--text-primary)", fontSize: "1rem", fontFamily: "inherit", resize: "none", outline: "none", lineHeight: 1.5, maxHeight: "120px", overflow: "auto" }}
            onInput={e => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }}
            onFocus={e => e.currentTarget.style.borderColor = "var(--accent)"}
            onBlur={e => e.currentTarget.style.borderColor = "var(--border)"} />
          <button className="btn-primary" onClick={() => sendMessage(input)} disabled={streaming || !input.trim() || !isOnline} style={{ flexShrink: 0, padding: "0.65rem 1rem" }}>
            {streaming ? t("chatSending") : t("chatSend")}
          </button>
        </div>
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.722rem", color: "var(--text-muted)" }}>{t("chatHint")}</p>
      </div>
    </div>
  );
}
