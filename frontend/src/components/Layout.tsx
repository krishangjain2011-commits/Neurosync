import React, { useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useOffline } from "../context/OfflineContext";
import { useLang } from "../context/LangContext";
import { useTheme } from "../context/ThemeContext";
import { Button } from "./ui/Button";

export default function Layout() {
  const { user, activeChild, setActiveChild, logout } = useAuth();
  const { isOnline, pendingCount } = useOffline();
  const { t, lang, setLang, supportedLanguages } = useLang();
  const { theme, setTheme, supportedThemes } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fontSize, setFontSize] = useState(100);
  const [isDyslexicFont, setIsDyslexicFont] = useState(false);
  const [isHighContrast, setIsHighContrast] = useState(false);

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

  React.useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}%`;
  }, [fontSize]);

  const handleLogout = async () => { await logout(); navigate("/auth"); };

  const SidebarContent = () => (
    <div style={{
      display: "flex",
      flexDirection: "column",
      minHeight: "100vh",
      padding: "1rem 0.75rem",
      background: "#FFFFFF",
      color: "#2D3748",
    }}>
      {/* Logo */}
      <div style={{ padding: "0.25rem 0.5rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{
            width: "34px",
            height: "34px",
            borderRadius: "9px",
            background: "linear-gradient(135deg, #C07A5E, #A66348)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1rem",
            flexShrink: 0,
            color: "white",
            fontWeight: "bold",
          }}>
            🧠
          </div>
          <div>
            <div style={{
              fontWeight: 800,
              fontSize: "1rem",
              color: "#2D3748",
              letterSpacing: "-0.02em",
              margin: 0,
            }}>
              NeuroSync
            </div>
            <div style={{
              fontSize: "0.722rem",
              color: "#C07A5E",
              letterSpacing: "0.01em",
              margin: 0,
              marginTop: "0.1rem",
            }}>
              {t("aiCaretaker")}
            </div>
          </div>
        </div>
      </div>

      {/* Child selector */}
      {user && user.children.length > 0 && (
        <div style={{ marginBottom: "1.25rem", padding: "0 0.25rem" }}>
          <label htmlFor="child-select" style={{
            fontSize: "0.667rem",
            fontWeight: 700,
            color: "#5A6578",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: "0.35rem",
            display: "block",
            padding: "0 0.25rem",
          }}>
            {t("activeChild")}
          </label>
          <select
            id="child-select"
            value={activeChild?.id ?? ""}
            onChange={e => {
              const child = user.children.find(c => c.id === parseInt(e.target.value, 10));
              setActiveChild(child ?? null);
            }}
            aria-label={t("activeChild")}
            style={{
              width: "100%",
              padding: "0.4rem 0.55rem",
              borderRadius: "7px",
              border: "1px solid #E8DCCF",
              background: "#FFFFFF",
              color: "#2D3748",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              outline: "none",
            }}
          >
            {user.children.map(c => (
              <option key={c.id} value={c.id}>
                {c.onboarding_data?.childName ?? `Child #${c.id}`}
              </option>
            ))}
          </select>
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
              display: "flex",
              alignItems: "center",
              gap: "0.7rem",
              padding: "0.6rem 0.75rem",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "1rem",
              fontWeight: isActive ? 700 : 500,
              background: isActive ? "#E8EFE8" : "transparent",
              color: isActive ? "#8DA28B" : "#5A6578",
              transition: "all 0.15s ease",
              letterSpacing: "-0.01em",
              border: "none",
              cursor: "pointer",
            })}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "#F4EFE6";
              el.style.color = "#2D3748";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = location.pathname === el.getAttribute("href") ? "#E8EFE8" : "transparent";
              el.style.color = location.pathname === el.getAttribute("href") ? "#8DA28B" : "#5A6578";
            }}
          >
            <span style={{ fontSize: "1.05rem", width: "1.25rem", textAlign: "center", flexShrink: 0 }}>
              {item.icon}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div style={{ borderTop: "1px solid #E8DCCF", marginTop: "auto", paddingTop: "0.75rem", marginBottom: "0.5rem" }} />

      {/* User Info */}
      <div style={{ padding: "0 0.5rem", marginBottom: "0.75rem" }}>
        <div style={{
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "#2D3748",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {user?.displayName || user?.email}
        </div>
        <div style={{
          fontSize: "0.722rem",
          color: "#C07A5E",
          textTransform: "capitalize",
          fontWeight: 500,
        }}>
          {user?.role?.replace("_", " ")}
        </div>
      </div>

      {/* Sign Out Button */}
      <button
        onClick={handleLogout}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          width: "100%",
          padding: "0.4rem 0.65rem",
          borderRadius: "6px",
          border: "none",
          background: "transparent",
          color: "#5A6578",
          fontSize: "0.875rem",
          fontWeight: 500,
          cursor: "pointer",
          textAlign: "left",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = "#FEF2F2";
          (e.currentTarget as HTMLElement).style.color = "#DC2626";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "#5A6578";
        }}
      >
        🚪 {t("signOut")}
      </button>
    </div>
  );

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      overflow: "hidden",
      background: "#FBF8F3",
    }}>
      {/* Desktop Sidebar */}
      <aside style={{
        width: "235px",
        minWidth: "235px",
        flexShrink: 0,
        background: "#FFFFFF",
        borderRight: "1px solid #E8DCCF",
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        position: "sticky",
        top: 0,
        display: "none",
      }} className="md:block">
        <SidebarContent />
      </aside>

      {/* Mobile Hamburger Button */}
      <button
        onClick={() => setSidebarOpen(true)}
        style={{
          position: "fixed",
          top: "4rem",
          left: "1rem",
          zIndex: 50,
          background: "#FFFFFF",
          border: "1px solid #E8DCCF",
          borderRadius: "7px",
          padding: "0.4rem 0.55rem",
          cursor: "pointer",
          fontSize: "0.9rem",
          boxShadow: "0 1px 2px rgba(45, 55, 72, 0.05)",
          display: "flex",
        }}
        className="md:hidden"
        aria-label="Open navigation"
      >
        ☰
      </button>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.25)",
                zIndex: 40,
              }}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 240 }}
              style={{
                position: "fixed",
                left: 0,
                top: 0,
                bottom: 0,
                width: "240px",
                zIndex: 50,
                background: "#FFFFFF",
                borderRight: "1px solid #E8DCCF",
              }}
            >
              <SidebarContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#FBF8F3",
      }}>
        {/* Top Accessibility Toolbar */}
        <div style={{
          background: "#2D3748",
          color: "white",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid rgba(0,0,0,0.1)",
          overflowX: "auto",
          overflowY: "hidden",
        }}>
          <div style={{
            maxWidth: "100%",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: "1rem",
            fontSize: "0.875rem",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}>
              <span>♿</span>
              <span>Accessibility</span>
            </div>

            {/* Font Size Controls */}
            <div style={{
              display: "flex",
              alignItems: "center",
              background: "rgba(255,255,255,0.15)",
              borderRadius: "6px",
              padding: "0.25rem",
              border: "1px solid rgba(255,255,255,0.2)",
              gap: "0.25rem",
            }}>
              <button
                onClick={() => setFontSize(Math.max(90, fontSize - 10))}
                style={{
                  padding: "0.25rem 0.5rem",
                  background: "transparent",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                A−
              </button>
              <button
                onClick={() => setFontSize(100)}
                style={{
                  padding: "0.25rem 0.5rem",
                  background: "transparent",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                }}
              >
                Reset
              </button>
              <button
                onClick={() => setFontSize(Math.min(130, fontSize + 10))}
                style={{
                  padding: "0.25rem 0.5rem",
                  background: "transparent",
                  border: "none",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                }}
              >
                A+
              </button>
            </div>

            {/* Dyslexia Font Toggle */}
            <button
              onClick={() => setIsDyslexicFont(!isDyslexicFont)}
              style={{
                padding: "0.3rem 0.75rem",
                borderRadius: "6px",
                border: `1px solid ${isDyslexicFont ? "#C07A5E" : "rgba(255,255,255,0.2)"}`,
                background: isDyslexicFont ? "#C07A5E" : "transparent",
                color: "white",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              🔤 Dyslexia Font
            </button>

            {/* High Contrast Toggle */}
            <button
              onClick={() => setIsHighContrast(!isHighContrast)}
              style={{
                padding: "0.3rem 0.75rem",
                borderRadius: "6px",
                border: `1px solid ${isHighContrast ? "#C07A5E" : "rgba(255,255,255,0.2)"}`,
                background: isHighContrast ? "#C07A5E" : "transparent",
                color: "white",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              ◐ Contrast
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          background: "#FBF8F3",
        }}>
          <Outlet />
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          aside {
            display: block !important;
          }
          button[aria-label="Open navigation"] {
            display: none !important;
          }
        }
        @media (max-width: 767px) {
          aside {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
