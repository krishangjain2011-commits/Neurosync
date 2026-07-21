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
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "transparent" }}>

      {/* Desktop sidebar — independently scrollable */}
      <aside className="hidden md:block" style={{
        width: "235px", minWidth: "235px", flexShrink: 0,
        background: "rgba(255,255,255,0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
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
                zIndex: 50,
                background: "rgba(255,255,255,0.88)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
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

        {/* Background image is handled globally via CSS (body::before) */}

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
