import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useOffline } from "../context/OfflineContext";
import { useLang } from "../context/LangContext";
import { streamGemini } from "../lib/api";
import FeatureTour from "../components/FeatureTour";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";

interface Message { id: string; role: "user" | "assistant"; content: string; }

function MsgBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "1rem",
        alignItems: "flex-end",
        gap: "0.5rem",
      }}
    >
      {!isUser && (
        <div style={{
          width: "32px",
          height: "32px",
          borderRadius: "999px",
          background: "var(--gradient-success)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1rem",
          flexShrink: 0,
          boxShadow: "0 2px 8px rgba(141, 162, 139, 0.2)",
        }}>
          🧠
        </div>
      )}
      <div style={{
        maxWidth: "72%",
        padding: "0.875rem 1.125rem",
        borderRadius: isUser ? "var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)" : "var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)",
        background: isUser
          ? "linear-gradient(135deg, #C07A5E, #C07A5E)"
          : "#FFFFFF",
        color: isUser ? "#FFFFFF" : "#1F2937",
        border: isUser ? "none" : `1px solid #E0E9F0`,
        boxShadow: isUser
          ? "0 4px 12px rgba(192, 122, 94, 0.15)"
          : "0 2px 8px rgba(0, 0, 0, 0.05)",
        fontSize: "0.95rem",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
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
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      backgroundColor: "#FBF8F3",
    }}>
      {/* Header */}
      <div style={{
        padding: "1.25rem 1.5rem",
        borderBottom: "1px solid #E0E9F0",
        background: "linear-gradient(90deg, #FFFFFF 0%, #FFE5D9 100%)",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
      }}>
        <div style={{
          width: "40px",
          height: "40px",
          borderRadius: "12px",
          background: "var(--gradient-success)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.25rem",
          boxShadow: "0 2px 8px rgba(141, 162, 139, 0.15)",
        }}>
          💬
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "#1F2937",
          }}>
            {t("chatTitle")}
          </h1>
          <p style={{
            margin: "0.25rem 0 0",
            fontSize: "0.85rem",
            color: "#6B7280",
          }}>
            {activeChild?.onboarding_data?.childName
              ? `${t("chatSupporting")} ${activeChild.onboarding_data.childName}`
              : t("chatSubtitle")}
          </p>
        </div>
        {!isOnline && (
          <div style={{
            padding: "0.5rem 0.875rem",
            backgroundColor: "#FDF5E8",
            color: "#D4A574",
            borderRadius: "999px",
            fontSize: "0.8rem",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}>
            📵 {t("offline")}
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
      }}>
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
          accentColor="#C07A5E"
        />

        {messages.length === 1 && (
          <div style={{
            marginBottom: "1.5rem",
            paddingBottom: "1.5rem",
            borderBottom: "1px solid #E0E9F0",
          }}>
            <p style={{
              fontSize: "0.8rem",
              color: "#6B7280",
              fontWeight: 500,
              marginBottom: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}>
              {t("chatQuickPrompts")}
            </p>
            <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}>
              {QUICK_PROMPTS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={!isOnline}
                  style={{
                    padding: "0.6rem 1rem",
                    borderRadius: "999px",
                    border: `1.5px solid #C07A5E`,
                    backgroundColor: isOnline ? "#FFE5D9" : "#FFFFFF",
                    color: isOnline ? "#A35A42" : "#6B7280",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    cursor: isOnline ? "pointer" : "not-allowed",
                    opacity: isOnline ? 1 : 0.6,
                    transition: "all 0.16s",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    if (isOnline) {
                      (e.target as HTMLButtonElement).style.backgroundColor = "#C07A5E";
                      (e.target as HTMLButtonElement).style.color = "#FFFFFF";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isOnline) {
                      (e.target as HTMLButtonElement).style.backgroundColor = "#FFE5D9";
                      (e.target as HTMLButtonElement).style.color = "#A35A42";
                    }
                  }}
                >
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
          <div style={{
            display: "flex",
            gap: "0.5rem",
            paddingLeft: "2.5rem",
            marginBottom: "1rem",
            alignItems: "center",
          }}>
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  backgroundColor: "#C07A5E",
                }}
              />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div style={{
        padding: "1.25rem 1.5rem",
        borderTop: "1px solid #E0E9F0",
        background: "linear-gradient(90deg, #FFFFFF 0%, #FFE5D9 100%)",
        flexShrink: 0,
      }}>
        {!isOnline && (
          <Alert type="warning" style={{ marginBottom: "1rem" }}>
            📵 {t("chatOfflineNote")}
          </Alert>
        )}

        <div style={{
          display: "flex",
          gap: "0.875rem",
          alignItems: "flex-end",
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            disabled={streaming || !isOnline}
            placeholder={isOnline ? t("chatPlaceholder") : t("chatOfflinePlaceholder")}
            rows={1}
            style={{
              flex: 1,
              padding: "0.875rem 1rem",
              border: `1.5px solid #E0E9F0`,
              borderRadius: "12px",
              backgroundColor: "#FFFFFF",
              color: "#1F2937",
              fontSize: "0.95rem",
              fontFamily: "inherit",
              resize: "none",
              outline: "none",
              lineHeight: 1.5,
              maxHeight: "120px",
              overflow: "auto",
              transition: "border-color 0.16s, box-shadow 0.16s",
              fontWeight: 400,
            }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = "#C07A5E";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(141, 162, 139, 0.1)";
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = "#E0E9F0";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          <Button
            variant="success"
            onClick={() => sendMessage(input)}
            disabled={streaming || !input.trim() || !isOnline}
            loading={streaming}
            style={{ flexShrink: 0, minWidth: "80px" }}
          >
            {streaming ? t("chatSending") : t("chatSend")}
          </Button>
        </div>

        <p style={{
          margin: "0.5rem 0 0",
          fontSize: "0.75rem",
          color: "#6B7280",
          fontWeight: 400,
        }}>
          {t("chatHint")}
        </p>
      </div>
    </div>
  );
}
