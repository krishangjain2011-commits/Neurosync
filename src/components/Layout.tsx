import React, { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useOffline } from "../context/OfflineContext";
import { useLang } from "../context/LangContext";

export default function Layout() {
  const { user, activeChild, setActiveChild, logout } = useAuth();
  const { isOnline, pendingCount } = useOffline();
  const { t, lang, setLang, supportedLanguages } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const NAV_ITEMS = [
    { path: "/chat",       label: t("navChat"),       icon: "💬" },
    { path: "/behavior",   label: t("navBehavior"),   icon: "🧩" },
    { path: "/diet",       label: t("navDiet"),       icon: "🥗" },
    { path: "/therapy",    label: t("navTherapy"),    icon: "📅" },
    { path: "/homeschool", label: t("navHomeschool"), icon: "📚" },
    { path: "/visual-board", label: t("navVisualBoard"), icon: "🖼️" },
    { path: "/progress",   label: t("navProgress"),   icon: "📈" },
    { path: "/reports",    label: t("navReports"),    icon: "📋" },
    { path: "/emergency",  label: t("navEmergency"),  icon: "🚨" },
  ];

  const handleLogout = async () => { await logout(); navigate("/auth"); };

  const SidebarContent = () => (
    <div style={{
      display: "flex", flexDirection: "column", minHeight: "100vh",
      padding: "1rem 0.75rem",
    }}>
      {/* Logo */}
      <div style={{ padding: "0.25rem 0.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{
            width: "34px", height: "34px", borderRadius: "9px",
            background: "var(--accent)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1rem", flexShrink: 0,
          }}>🧠</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              NeuroSync
            </div>
            <div style={{ fontSize: "0.722rem", color: "var(--text-muted)", letterSpacing: "0.01em" }}>{t("aiCaretaker")}</div>
          </div>
        </div>
      </div>

      {/* Child selector */}
      {user && user.children.length > 0 && (
        <div style={{ marginBottom: "1.25rem", padding: "0 0.25rem" }}>
          <div style={{ fontSize: "0.667rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.35rem", padding: "0 0.25rem" }}>
            {t("activeChild")}
          </div>
          <select
            value={activeChild?.id ?? ""}
            onChange={e => {
              const child = user.children.find(c => c.id === parseInt(e.target.value, 10));
              setActiveChild(child ?? null);
            }}
            style={{
              width: "100%", padding: "0.4rem 0.55rem", borderRadius: "7px",
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--text-primary)", fontSize: "0.875rem", fontWeight: 600,
              cursor: "pointer", outline: "none",
            }}
          >
            {user.children.map(c => (
              <option key={c.id} value={c.id}>
                {c.onboarding_data?.childName ?? `Child #${c.id}`}
              </option>
            ))}
          </select>
          <button
            onClick={() => { navigate("/add-child"); setSidebarOpen(false); }}
            style={{
              marginTop: "0.3rem", width: "100%", padding: "0.3rem 0.55rem",
              borderRadius: "6px", border: "1px dashed var(--border)",
              background: "transparent", color: "var(--text-muted)",
              fontSize: "0.833rem", cursor: "pointer", textAlign: "left",
              display: "flex", alignItems: "center", gap: "0.3rem",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--accent)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
          >
            + {t("addChildProfile")}
          </button>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setSidebarOpen(false)}
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: "0.7rem",
              padding: "0.6rem 0.75rem", borderRadius: "8px",
              textDecoration: "none",
              fontSize: "1rem",
              fontWeight: isActive ? 700 : 500,
              background: isActive ? "var(--accent-light)" : "transparent",
              color: isActive ? "var(--accent)" : "var(--text-secondary)",
              transition: "background 0.1s, color 0.1s",
              letterSpacing: "-0.01em",
            })}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "var(--surface-2)";
              el.style.color = "var(--text-primary)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "";
              el.style.color = "";
            }}
          >
            <span style={{ fontSize: "1.05rem", width: "1.25rem", textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Language switcher */}
      <div style={{ padding: "0.625rem 0.25rem 0", borderTop: "1px solid var(--border)", marginTop: "0.75rem" }}>
        <div style={{ fontSize: "0.667rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.35rem", padding: "0 0.25rem" }}>
          {t("language")}
        </div>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          {supportedLanguages.map(l => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              style={{
                flex: 1, padding: "0.3rem 0.2rem", borderRadius: "6px",
                border: `1px solid ${lang === l.code ? "var(--accent)" : "var(--border)"}`,
                background: lang === l.code ? "var(--accent-light)" : "transparent",
                color: lang === l.code ? "var(--accent)" : "var(--text-muted)",
                fontSize: "0.722rem", fontWeight: lang === l.code ? 700 : 500,
                cursor: "pointer",
              }}
            >{l.nativeLabel}</button>
          ))}
        </div>
      </div>

      {/* Offline */}
      {(!isOnline || pendingCount > 0) && (
        <div style={{
          margin: "0.5rem 0.25rem 0",
          padding: "0.4rem 0.65rem",
          background: pendingCount > 0 ? "var(--amber-light)" : "var(--surface-2)",
          borderRadius: "6px", fontSize: "0.722rem",
          color: pendingCount > 0 ? "var(--amber)" : "var(--text-muted)",
        }}>
          {!isOnline ? `📵 ${t("offline")}` : `⏳ ${pendingCount} ${t("pendingSync")}`}
        </div>
      )}

      {/* User footer */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "auto", paddingBottom: "0.5rem" }}>
        <div style={{ padding: "0 0.5rem", marginBottom: "0.3rem" }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user?.displayName || user?.email}
          </div>
          <div style={{ fontSize: "0.722rem", color: "var(--accent)", textTransform: "capitalize", fontWeight: 500 }}>
            {user?.role?.replace("_", " ")}
          </div>
        </div>
        <button
          onClick={handleLogout}
          style={{
            display: "flex", alignItems: "center", gap: "0.4rem",
            width: "100%", padding: "0.4rem 0.65rem",
            borderRadius: "6px", border: "none",
            background: "transparent", color: "var(--text-muted)",
            fontSize: "0.875rem", fontWeight: 500, cursor: "pointer", textAlign: "left",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--red-light)"; (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
        >
          🚪 {t("signOut")}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "var(--canvas)" }}>

      {/* Desktop sidebar — independently scrollable */}
      <aside className="hidden md:block" style={{
        width: "235px", minWidth: "235px", flexShrink: 0,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        position: "sticky",
        top: 0,
        alignSelf: "flex-start",
      }}>
        <SidebarContent />
      </aside>

      {/* Mobile hamburger */}
      <button
        className="md:hidden"
        onClick={() => setSidebarOpen(true)}
        style={{
          position: "fixed", top: "0.75rem", left: "0.75rem", zIndex: 50,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "7px", padding: "0.4rem 0.55rem",
          cursor: "pointer", fontSize: "0.9rem",
          boxShadow: "var(--shadow-sm)",
        }}
        aria-label="Open navigation"
      >☰</button>

      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 40 }}
            />
            <motion.div
              initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 240 }}
              style={{
                position: "fixed", left: 0, top: 0, bottom: 0, width: "240px",
                zIndex: 50, background: "var(--surface)",
                borderRight: "1px solid var(--border)",
              }}
            >
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content area — scrolls independently */}
      <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", position: "relative", minHeight: "100vh" }}>

        {/* Background illustration — fixed, low opacity */}
        <div aria-hidden="true" style={{
          position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden",
        }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1024 576"
            preserveAspectRatio="xMidYMid slice"
            style={{ width: "100%", height: "100%", opacity: 0.16, filter: "brightness(0.72)" }}
          >
            <defs>
              <linearGradient id="arcL" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F97316" />
                <stop offset="100%" stopColor="#EF4444" />
              </linearGradient>
              <linearGradient id="arcR" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#06B6D4" />
                <stop offset="100%" stopColor="#8B5CF6" />
              </linearGradient>
              <radialGradient id="shadowL" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#C4B5FD" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#C4B5FD" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="shadowR" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#99F6E4" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#99F6E4" stopOpacity="0" />
              </radialGradient>
            </defs>
            <line x1="160" y1="430" x2="860" y2="430" stroke="#9CA3AF" strokeWidth="1" />
            <ellipse cx="310" cy="445" rx="160" ry="28" fill="url(#shadowL)" />
            <ellipse cx="700" cy="445" rx="160" ry="28" fill="url(#shadowR)" />
            <path d="M 155 260 A 185 185 0 0 1 480 60" fill="none" stroke="url(#arcL)" strokeWidth="16" strokeLinecap="round" />
            <path d="M 555 65 A 185 185 0 0 1 878 262" fill="none" stroke="url(#arcR)" strokeWidth="16" strokeLinecap="round" />
            <circle cx="298" cy="268" r="36" fill="#7C3AED" />
            <ellipse cx="298" cy="370" rx="34" ry="58" fill="#7C3AED" />
            <circle cx="366" cy="312" r="26" fill="#16A34A" />
            <ellipse cx="366" cy="398" rx="24" ry="40" fill="#16A34A" />
            <circle cx="598" cy="310" r="28" fill="#EA580C" />
            <ellipse cx="598" cy="396" rx="26" ry="42" fill="#EA580C" />
            <circle cx="672" cy="262" r="38" fill="#2563EB" />
            <ellipse cx="672" cy="368" rx="36" ry="60" fill="#2563EB" />
            <circle cx="112" cy="155" r="6" fill="#EF4444" opacity="0.6" />
            <circle cx="210" cy="108" r="4" fill="#F97316" opacity="0.5" />
            <circle cx="850" cy="175" r="5" fill="#06B6D4" opacity="0.5" />
            <circle cx="820" cy="290" r="6" fill="#16A34A" opacity="0.5" />
          </svg>
        </div>

        {/* Page content */}
        <div style={{ position: "relative", zIndex: 1, minHeight: "100%" }}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            style={{ minHeight: "100%" }}
          >
            <Outlet />
          </motion.div>
        </div>
      </main>
    </div>
  );
}
