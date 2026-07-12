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
    { path: "/chat",        label: t("navChat"),      icon: "💬" },
    { path: "/behavior",    label: t("navBehavior"),   icon: "🧩" },
    { path: "/diet",        label: t("navDiet"),       icon: "🥗" },
    { path: "/therapy",     label: t("navTherapy"),    icon: "📅" },
    { path: "/homeschool",  label: t("navHomeschool"), icon: "📚" },
    { path: "/visual",      label: t("navVisual"),     icon: "🖼️" },
    { path: "/progress",    label: t("navProgress"),   icon: "📈" },
    { path: "/reports",     label: t("navReports"),    icon: "📋" },
    { path: "/emergency",   label: t("navEmergency"),  icon: "🚨" },
  ];

  const handleLogout = async () => { await logout(); navigate("/auth"); };

  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "1rem 0.75rem" }}>
      {/* Logo */}
      <div style={{ padding: "0.5rem 0.75rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px",
            background: "linear-gradient(135deg, var(--accent) 0%, var(--honey) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "1.1rem", boxShadow: "0 2px 8px rgba(139,92,246,0.30)",
          }}>🧠</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>NeuroSync</div>
            <div style={{ fontSize: "0.67rem", color: "var(--text-muted)", letterSpacing: "0.03em" }}>{t("aiCaretaker")}</div>
          </div>
        </div>
      </div>

      {/* Language switcher */}
      <div style={{ marginBottom: "0.75rem", padding: "0 0.25rem" }}>
        <label style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.3rem" }}>
          {t("language")}
        </label>
        <div style={{ display: "flex", gap: "0.3rem" }}>
          {supportedLanguages.map(l => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              title={l.label}
              style={{
                flex: 1, padding: "0.3rem 0.2rem", borderRadius: "6px",
                border: `1.5px solid ${lang === l.code ? "var(--accent)" : "var(--border)"}`,
                backgroundColor: lang === l.code ? "var(--accent-light)" : "var(--canvas)",
                color: lang === l.code ? "var(--accent)" : "var(--text-secondary)",
                fontSize: "0.72rem", fontWeight: lang === l.code ? 700 : 400,
                cursor: "pointer", transition: "all 0.12s",
              }}
            >
              {l.nativeLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Child selector */}
      {user && user.children.length > 0 && (
        <div style={{ marginBottom: "0.75rem", padding: "0 0.25rem" }}>
          <label style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "0.3rem" }}>
            {t("activeChild")}
          </label>
          <select
            value={activeChild?.id ?? ""}
            onChange={(e) => {
              const child = user.children.find((c) => c.id === parseInt(e.target.value, 10));
              setActiveChild(child ?? null);
            }}
            style={{ width: "100%", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid var(--border)", backgroundColor: "var(--accent-light)", color: "var(--accent)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", outline: "none" }}
          >
            {user.children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.onboarding_data?.childName ?? `Child #${c.id}`}
              </option>
            ))}
          </select>
          <button
            onClick={() => { navigate("/add-child"); setSidebarOpen(false); }}
            style={{ marginTop: "0.35rem", width: "100%", padding: "0.35rem 0.6rem", borderRadius: "6px", border: "1px dashed var(--border)", backgroundColor: "transparent", color: "var(--text-muted)", fontSize: "0.75rem", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: "0.4rem" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; (e.currentTarget as HTMLElement).style.color = "var(--accent)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          >
            <span>＋</span> {t("addChildProfile")}
          </button>
        </div>
      )}

      {/* Nav links */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.15rem" }}>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setSidebarOpen(false)}
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: "0.6rem",
              padding: "0.5rem 0.75rem", borderRadius: "10px",
              textDecoration: "none", fontSize: "0.83rem",
              fontWeight: isActive ? 600 : 400,
              background: isActive
                ? "linear-gradient(90deg, var(--accent-light) 0%, var(--honey-light) 100%)"
                : "transparent",
              color: isActive ? "var(--accent)" : "var(--text-secondary)",
              borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
              transition: "all 0.12s ease",
            })}
          >
            <span style={{ fontSize: "0.95rem", minWidth: "1.1rem" }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Offline badge */}
      {(!isOnline || pendingCount > 0) && (
        <div style={{ margin: "0.5rem 0.25rem", padding: "0.5rem 0.75rem", backgroundColor: pendingCount > 0 ? "var(--amber-light)" : "var(--surface-2)", borderRadius: "8px", fontSize: "0.75rem", color: pendingCount > 0 ? "var(--amber)" : "var(--text-muted)" }}>
          {!isOnline
            ? `📵 ${t("offline")}`
            : `⏳ ${pendingCount} ${t("pendingSync")}`}
        </div>
      )}

      {/* User footer */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.25rem" }}>
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", padding: "0 0.75rem", marginBottom: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user?.displayName || user?.email}
        </div>
        <div style={{ fontSize: "0.65rem", color: "var(--accent)", padding: "0 0.75rem", marginBottom: "0.5rem", textTransform: "capitalize" }}>
          {user?.role?.replace("_", " ")}
        </div>
        <button onClick={handleLogout}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", width: "100%", padding: "0.45rem 0.75rem", borderRadius: "7px", border: "none", backgroundColor: "transparent", color: "var(--text-muted)", fontSize: "0.78rem", cursor: "pointer", textAlign: "left" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--red-light)"; (e.currentTarget as HTMLElement).style.color = "var(--red)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
        >
          🚪 {t("signOut")}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", backgroundColor: "var(--canvas)" }}>
      {/* Desktop sidebar */}
      <div className="hidden md:block" style={{
        width: "224px", minWidth: "224px", flexShrink: 0,
        background: "linear-gradient(180deg, #FDF4E8 0%, var(--surface) 100%)",
        borderRight: "1px solid var(--border)",
        boxShadow: "2px 0 12px rgba(44,31,20,0.06)"
      }}>
        <SidebarContent />
      </div>

      {/* Mobile hamburger */}
      <button className="md:hidden" onClick={() => setSidebarOpen(true)}
        style={{ position: "fixed", top: "0.875rem", left: "0.875rem", zIndex: 50, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "0.45rem 0.6rem", cursor: "pointer", fontSize: "1rem" }}
        aria-label="Open navigation">☰</button>

      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.3)", zIndex: 40 }} />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: "260px", zIndex: 50, backgroundColor: "var(--surface)", borderRight: "1px solid var(--border)" }}>
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main */}
      <main style={{ flex: 1, overflowY: "auto" }}>
        <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} style={{ minHeight: "100%" }}>
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}
