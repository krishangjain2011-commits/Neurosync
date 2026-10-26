import React, { useState, useEffect } from "react";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function HomePage() {
  const { t } = useLang();
  const { user, activeChild } = useAuth();
  const navigate = useNavigate();
  
  const [currentFontSize, setCurrentFontSize] = useState(100);
  const [isDyslexicFont, setIsDyslexicFont] = useState(false);
  const [isHighContrast, setIsHighContrast] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [isBreathing, setIsBreathing] = useState(true);
  const [currentTint, setCurrentTint] = useState("#FFFFFF");
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${currentFontSize}%`;
    
    const body = document.body;
    if (isDyslexicFont) {
      body.classList.add("dyslexia-font");
    } else {
      body.classList.remove("dyslexia-font");
    }
    
    if (isHighContrast) {
      body.classList.add("high-contrast");
    } else {
      body.classList.remove("high-contrast");
    }
    
    if (isReducedMotion) {
      body.classList.add("reduced-motion");
    } else {
      body.classList.remove("reduced-motion");
    }
  }, [currentFontSize, isDyslexicFont, isHighContrast, isReducedMotion]);

  const handleFontIncrease = () => {
    if (currentFontSize < 130) setCurrentFontSize(currentFontSize + 10);
  };

  const handleFontDecrease = () => {
    if (currentFontSize > 90) setCurrentFontSize(currentFontSize - 10);
  };

  const handleFontReset = () => setCurrentFontSize(100);

  const handleGetStarted = () => {
    if (user && activeChild) {
      navigate("/chat");
    } else if (user) {
      navigate("/onboarding");
    } else {
      navigate("/auth");
    }
  };

  const styles = {
    pageContainer: {
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "space-between",
      backgroundColor: "#FBF8F3",
      color: "#2D3748",
    },
    accessibilityBar: {
      position: "sticky" as const,
      top: 0,
      zIndex: 50,
      backgroundColor: "#2D3748",
      color: "white",
      padding: "0.625rem 1rem",
      boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
    },
    accessibilityContent: {
      maxWidth: "80rem",
      margin: "0 auto",
      display: "flex",
      flexWrap: "wrap" as const,
      alignItems: "center",
      justifyContent: "space-between",
      gap: "0.75rem",
      fontSize: "0.875rem",
      padding: "0 0.5rem",
    },
    toolbarLabel: {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      fontWeight: "500",
    },
    controlsGroup: {
      display: "flex",
      flexWrap: "wrap" as const,
      alignItems: "center",
      gap: "1rem",
    },
    fontSizeContainer: {
      display: "flex",
      alignItems: "center",
      backgroundColor: "rgba(90, 101, 120, 0.3)",
      borderRadius: "0.5rem",
      padding: "0.125rem",
      border: "1px solid #4B5563",
    },
    button: {
      padding: "0.25rem 0.625rem",
      borderRadius: "0.375rem",
      backgroundColor: "transparent",
      color: "white",
      border: "none",
      cursor: "pointer",
      fontSize: "0.75rem",
      fontWeight: "600",
      transition: "background-color 0.2s",
    },
    buttonHover: {
      backgroundColor: "rgba(55, 65, 81, 0.7)",
    },
    accessibilityButton: {
      display: "flex",
      alignItems: "center",
      gap: "0.375rem",
      padding: "0.25rem 0.75rem",
      borderRadius: "0.5rem",
      backgroundColor: "rgba(90, 101, 120, 0.3)",
      border: "1px solid #4B5563",
      color: "white",
      cursor: "pointer",
      fontSize: "0.75rem",
      fontWeight: "600",
      transition: "all 0.2s",
    },
    header: {
      padding: "1.5rem 1rem",
      borderBottom: "1px solid rgba(0, 0, 0, 0.1)",
      backgroundColor: "#FBF8F3",
    },
    headerContent: {
      maxWidth: "80rem",
      margin: "0 auto",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    },
    logo: {
      display: "flex",
      alignItems: "center",
      gap: "0.75rem",
      textDecoration: "none",
      cursor: "pointer",
    },
    logoIcon: {
      width: "2.75rem",
      height: "2.75rem",
      borderRadius: "0.5rem",
      backgroundColor: "rgba(192, 122, 94, 0.1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#C07A5E",
      transition: "all 0.3s",
    },
    logoText: {
      fontSize: "1.25rem",
      fontWeight: "700",
      color: "#2D3748",
      textDecoration: "none",
    },
    logoSubtext: {
      fontSize: "0.75rem",
      fontWeight: "600",
      color: "#C07A5E",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    },
    mainContent: {
      flexGrow: 1,
    },
    section: {
      padding: "3rem 1rem",
      maxWidth: "80rem",
      margin: "0 auto",
    },
    heroSection: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
      gap: "2.5rem",
      alignItems: "center",
    },
    heroText: {
      display: "flex",
      flexDirection: "column" as const,
      gap: "1.5rem",
    },
    heroHeading: {
      fontSize: "2.25rem",
      fontWeight: "700",
      color: "#2D3748",
      lineHeight: "1.2",
    },
    heroSubheading: {
      fontSize: "1.125rem",
      color: "#5A6578",
      lineHeight: "1.6",
    },
    buttonGroup: {
      display: "flex",
      flexWrap: "wrap" as const,
      gap: "1rem",
      alignItems: "center",
    },
    primaryButton: {
      padding: "0.875rem 1.75rem",
      borderRadius: "1rem",
      backgroundColor: "#C07A5E",
      color: "white",
      fontWeight: "600",
      border: "none",
      cursor: "pointer",
      transition: "background-color 0.2s",
      textDecoration: "none",
      display: "inline-block",
    },
    secondaryButton: {
      padding: "0.875rem 1.75rem",
      borderRadius: "1rem",
      backgroundColor: "#E8EFE8",
      color: "#6E836C",
      fontWeight: "600",
      border: "none",
      cursor: "pointer",
      transition: "all 0.2s",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: "0.5rem",
    },
    featureCards: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      gap: "2rem",
      marginTop: "3rem",
    },
    card: {
      backgroundColor: "white",
      padding: "2rem",
      borderRadius: "1.5rem",
      border: "1px solid rgba(0, 0, 0, 0.08)",
      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
      transition: "box-shadow 0.2s",
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "space-between",
      gap: "1.5rem",
    },
    cardIcon: {
      width: "3.5rem",
      height: "3.5rem",
      borderRadius: "0.75rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "1.5rem",
      fontWeight: "700",
    },
    cardTitle: {
      fontSize: "1.5rem",
      fontWeight: "700",
      color: "#2D3748",
    },
    cardDescription: {
      color: "#5A6578",
      fontSize: "1rem",
      lineHeight: "1.6",
    },
    cardList: {
      listStyle: "none",
      padding: 0,
      margin: "0.5rem 0",
      fontSize: "0.875rem",
      fontWeight: "500",
    },
    cardListItem: {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      marginBottom: "0.625rem",
    },
    footer: {
      backgroundColor: "#F4EFE6",
      borderTop: "1px solid rgba(0, 0, 0, 0.08)",
      padding: "3rem 1rem",
      marginTop: "3rem",
    },
    footerContent: {
      maxWidth: "80rem",
      margin: "0 auto",
    },
  };

  return (
    <div style={styles.pageContainer}>
      {/* Accessibility Toolbar */}
      <aside style={styles.accessibilityBar}>
        <div style={styles.accessibilityContent}>
          <div style={styles.toolbarLabel}>
            <span>♿</span>
            <span>Accessibility Tools</span>
          </div>
          <div style={styles.controlsGroup}>
            {/* Font Size */}
            <div style={styles.fontSizeContainer}>
              <span style={{ fontSize: "0.75rem", padding: "0 0.5rem", color: "#94A3B8", fontWeight: "600", display: "none" }}>Text Size:</span>
              <button
                onClick={handleFontDecrease}
                style={{ ...styles.button }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(55, 65, 81, 0.7)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                title="Decrease font size"
              >
                A-
              </button>
              <button
                onClick={handleFontReset}
                style={{ ...styles.button }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(55, 65, 81, 0.7)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                title="Reset font size"
              >
                Reset
              </button>
              <button
                onClick={handleFontIncrease}
                style={{ ...styles.button }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(55, 65, 81, 0.7)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                title="Increase font size"
              >
                A+
              </button>
            </div>

            {/* Dyslexia Font Toggle */}
            <button
              onClick={() => setIsDyslexicFont(!isDyslexicFont)}
              style={{
                ...styles.accessibilityButton,
                backgroundColor: isDyslexicFont ? "#C07A5E" : "rgba(90, 101, 120, 0.3)",
                color: isDyslexicFont ? "white" : "white",
              }}
              title="Toggle Dyslexia-Friendly Font"
            >
              🔤 Dyslexia Font
            </button>

            {/* High Contrast Toggle */}
            <button
              onClick={() => setIsHighContrast(!isHighContrast)}
              style={{
                ...styles.accessibilityButton,
                backgroundColor: isHighContrast ? "#C07A5E" : "rgba(90, 101, 120, 0.3)",
              }}
              title="Toggle High Contrast Mode"
            >
              ◐ Contrast
            </button>

            {/* Reduced Motion Toggle */}
            <button
              onClick={() => setIsReducedMotion(!isReducedMotion)}
              style={{
                ...styles.accessibilityButton,
                backgroundColor: isReducedMotion ? "#C07A5E" : "rgba(90, 101, 120, 0.3)",
              }}
              title="Pause Animations"
            >
              ⏸ Pause
            </button>
          </div>
        </div>
      </aside>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <a href="/" style={{ ...styles.logo, textDecoration: "none" }}>
            <div style={styles.logoIcon}>🧠</div>
            <div>
              <div style={styles.logoText}>NeuroSync</div>
              <div style={styles.logoSubtext}>AI Caregiver</div>
            </div>
          </a>
          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={handleGetStarted}
              style={{ ...styles.primaryButton, fontSize: "0.875rem" }}
            >
              {user ? "Go to App" : "Get Started"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={styles.mainContent}>
        {/* Hero Section */}
        <section style={styles.section}>
          <div style={styles.heroSection}>
            <div style={styles.heroText}>
              <h1 style={styles.heroHeading}>
                Personalized Support for <span style={{ color: "#C07A5E" }}>Autism</span>, <span style={{ color: "#5B7B94" }}>ADHD</span> & <span style={{ color: "#8DA28B" }}>Dyslexia</span>
              </h1>
              <p style={styles.heroSubheading}>
                NeuroSync is an AI caregiver companion that provides real-time guidance, behavioral insights, dietary planning, and sensory-friendly support for families managing neurodevelopmental conditions.
              </p>
              <div style={styles.buttonGroup}>
                <button onClick={handleGetStarted} style={styles.primaryButton}>
                  Start Your Journey
                </button>
                <a href="#features" style={styles.secondaryButton}>
                  🌬 Explore Features
                </a>
              </div>
            </div>
            <div style={{ textAlign: "center", fontSize: "3rem" }}>🧠💚</div>
          </div>
        </section>

        {/* Features */}
        <section id="features" style={styles.section}>
          <h2 style={{ fontSize: "1.875rem", fontWeight: "700", textAlign: "center", marginBottom: "0.5rem" }}>
            Comprehensive Support Features
          </h2>
          <p style={{ textAlign: "center", color: "#5A6578", marginBottom: "2rem" }}>
            NeuroSync combines AI intelligence with expert-designed tools to support every aspect of care.
          </p>

          <div style={styles.featureCards}>
            {/* AI Chat Card */}
            <div style={styles.card}>
              <div style={{...styles.cardIcon, backgroundColor: "#F5E8E2", color: "#C07A5E"}}>🧠</div>
              <h3 style={styles.cardTitle}>AI Chat Support</h3>
              <p style={styles.cardDescription}>
                Real-time AI guidance for behavioral challenges, emotional regulation, and immediate caregiving questions.
              </p>
              <ul style={styles.cardList}>
                <li style={styles.cardListItem}><span>✓</span> <span>24/7 AI Companion</span></li>
                <li style={styles.cardListItem}><span>✓</span> <span>Multi-language Support</span></li>
                <li style={styles.cardListItem}><span>✓</span> <span>Emergency Guidance</span></li>
              </ul>
              <button style={{ ...styles.primaryButton, fontSize: "0.875rem", width: "100%", textAlign: "center" }}>
                Try AI Chat →
              </button>
            </div>

            {/* Behavior Tracking Card */}
            <div style={styles.card}>
              <div style={{...styles.cardIcon, backgroundColor: "#E3EBF0", color: "#5B7B94"}}>📊</div>
              <h3 style={styles.cardTitle}>Behavior Tracking</h3>
              <p style={styles.cardDescription}>
                Log behavioral patterns, emotional states, triggers, and progress over time with AI-powered insights.
              </p>
              <ul style={styles.cardList}>
                <li style={styles.cardListItem}><span>✓</span> <span>Pattern Recognition</span></li>
                <li style={styles.cardListItem}><span>✓</span> <span>Progress Analytics</span></li>
                <li style={styles.cardListItem}><span>✓</span> <span>Trend Reporting</span></li>
              </ul>
              <button style={{ ...styles.primaryButton, fontSize: "0.875rem", width: "100%", textAlign: "center" }}>
                View Tracking →
              </button>
            </div>

            {/* Diet & Wellness Card */}
            <div style={styles.card}>
              <div style={{...styles.cardIcon, backgroundColor: "#E8EFE8", color: "#6E836C"}}>🍎</div>
              <h3 style={styles.cardTitle}>Diet & Wellness</h3>
              <p style={styles.cardDescription}>
                Personalized nutrition guidance, meal planning, and wellness recommendations for optimal health.
              </p>
              <ul style={styles.cardList}>
                <li style={styles.cardListItem}><span>✓</span> <span>AI-Generated Meal Plans</span></li>
                <li style={styles.cardListItem}><span>✓</span> <span>Dietary Tracking</span></li>
                <li style={styles.cardListItem}><span>✓</span> <span>Nutrition Insights</span></li>
              </ul>
              <button style={{ ...styles.primaryButton, fontSize: "0.875rem", width: "100%", textAlign: "center" }}>
                Plan Nutrition →
              </button>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section style={styles.section}>
          <div style={{ backgroundColor: "white", borderRadius: "1.5rem", padding: "2rem", border: "1px solid rgba(0, 0, 0, 0.08)" }}>
            <h2 style={{ fontSize: "1.875rem", fontWeight: "700", marginBottom: "1rem", color: "#2D3748" }}>
              Neurodiversity-Affirming AI Care
            </h2>
            <p style={{ color: "#5A6578", lineHeight: "1.8", marginBottom: "1.5rem" }}>
              NeuroSync is built by a diverse team of educators, therapists, and neurodivergent individuals. We believe in strength-based approaches that honor individual differences in communication, sensory processing, and learning styles.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "1rem" }}>
              <div style={{ padding: "1rem", borderRadius: "1rem", backgroundColor: "#F4EFE6", border: "1px solid rgba(0, 0, 0, 0.08)" }}>
                <h3 style={{ fontWeight: "700", marginBottom: "0.25rem", color: "#2D3748" }}>Personalized Support</h3>
                <p style={{ fontSize: "0.875rem", color: "#5A6578" }}>Tailored to each child's unique strengths, challenges, and goals.</p>
              </div>
              <div style={{ padding: "1rem", borderRadius: "1rem", backgroundColor: "#F4EFE6", border: "1px solid rgba(0, 0, 0, 0.08)" }}>
                <h3 style={{ fontWeight: "700", marginBottom: "0.25rem", color: "#2D3748" }}>Privacy-First Design</h3>
                <p style={{ fontSize: "0.875rem", color: "#5A6578" }}>Your data stays with you. No tracking, no selling, no compromise.</p>
              </div>
            </div>
            <button onClick={handleGetStarted} style={{ ...styles.primaryButton, marginTop: "1.5rem" }}>
              Get Started Now
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContent}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <span style={{ fontSize: "1rem", fontWeight: "700", color: "#2D3748" }}>NeuroSync</span>
          </div>
          <p style={{ fontSize: "0.875rem", color: "#5A6578", maxWidth: "30rem", lineHeight: "1.6" }}>
            AI-powered caregiving companion for children with Autism, ADHD, and Dyslexia. Providing personalized support with privacy, compassion, and accessibility.
          </p>
          <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid rgba(0, 0, 0, 0.08)", fontSize: "0.875rem", color: "#5A6578" }}>
            <p>&copy; 2026 NeuroSync. Compassionate AI care for every child.</p>
          </div>
        </div>
      </footer>

      <style>{`
        body.dyslexia-font {
          font-family: 'Atkinson Hyperlegible', 'Lexend', system-ui, -apple-system, sans-serif !important;
          letter-spacing: 0.03em;
          word-spacing: 0.08em;
          line-height: 1.8 !important;
        }

        body.high-contrast {
          background-color: #0F172A !important;
          color: #F8FAFC !important;
        }

        body.high-contrast button,
        body.high-contrast a {
          color: #F8FAFC !important;
        }

        body.reduced-motion * {
          animation-duration: 0.001s !important;
          transition-duration: 0.001s !important;
        }

        *:focus-visible {
          outline: 3px solid #C07A5E !important;
          outline-offset: 3px !important;
        }
      `}</style>
    </div>
  );
}
