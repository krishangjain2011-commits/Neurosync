/**
 * NeuroSync NeuroBloom Theme - Complete Color System
 * A warm, accessible, neurodiversity-affirming color palette
 */

export const neuroBloomTheme = {
  // Primary Colors
  primary: {
    terracotta: "#C07A5E",
    terracottaDark: "#A66348",
    terracottaLight: "#E8A58D",
    terracottaSoft: "#F5E8E2",
  },

  // Secondary Colors
  secondary: {
    slateBlue: "#5B7B94",
    slateBlueDark: "#455E72",
    slateBlueSoft: "#E3EBF0",
    sageGreen: "#8DA28B",
    sageGreenDark: "#6E836C",
    sageGreenSoft: "#E8EFE8",
  },

  // Neutral Colors
  neutral: {
    charcoal: "#2D3748",
    charcoalMuted: "#5A6578",
    cream: "#FBF8F3",
    creamCard: "#FFFFFF",
    creamAlt: "#F4EFE6",
  },

  // Semantic Colors
  semantic: {
    success: "#059669",
    successLight: "#ECFDF5",
    warning: "#B45309",
    warningLight: "#FFFBEB",
    error: "#DC2626",
    errorLight: "#FEF2F2",
    info: "#2563EB",
    infoLight: "#EFF6FF",
  },

  // Gradients
  gradients: {
    primaryGradient: "linear-gradient(135deg, #C07A5E, #A66348)",
    secondaryGradient: "linear-gradient(135deg, #5B7B94, #455E72)",
    successGradient: "linear-gradient(135deg, #8DA28B, #6E836C)",
  },

  // Shadows
  shadows: {
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
  },

  // Spacing
  spacing: {
    xs: "0.25rem",
    sm: "0.5rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
    "2xl": "2.5rem",
    "3xl": "3rem",
  },

  // Border Radius
  borderRadius: {
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    "2xl": "1.5rem",
    full: "9999px",
  },

  // Typography
  typography: {
    fontFamily: {
      body: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      dyslexic: "'Atkinson Hyperlegible', 'Lexend', system-ui, sans-serif",
      mono: "'Menlo', 'Monaco', 'Courier New', monospace",
    },
    fontSize: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
      "5xl": "3rem",
    },
    fontWeight: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
      loose: 2,
    },
  },

  // Z-index
  zIndex: {
    hide: -1,
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    fixed: 1200,
    modalBackdrop: 1300,
    modal: 1400,
    popover: 1500,
    tooltip: 1600,
  },

  // Breakpoints
  breakpoints: {
    xs: "320px",
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
  },
};

/**
 * CSS Variable strings for easy use in styled components
 */
export const cssVars = {
  // Primary
  "--color-primary": neuroBloomTheme.primary.terracotta,
  "--color-primary-dark": neuroBloomTheme.primary.terracottaDark,
  "--color-primary-light": neuroBloomTheme.primary.terracottaLight,
  "--color-primary-soft": neuroBloomTheme.primary.terracottaSoft,

  // Secondary
  "--color-secondary": neuroBloomTheme.secondary.slateBlue,
  "--color-secondary-dark": neuroBloomTheme.secondary.slateBlueDark,
  "--color-secondary-soft": neuroBloomTheme.secondary.slateBlueSoft,
  "--color-accent": neuroBloomTheme.secondary.sageGreen,
  "--color-accent-dark": neuroBloomTheme.secondary.sageGreenDark,
  "--color-accent-soft": neuroBloomTheme.secondary.sageGreenSoft,

  // Neutral
  "--color-charcoal": neuroBloomTheme.neutral.charcoal,
  "--color-charcoal-muted": neuroBloomTheme.neutral.charcoalMuted,
  "--color-bg": neuroBloomTheme.neutral.cream,
  "--color-surface": neuroBloomTheme.neutral.creamCard,
  "--color-surface-alt": neuroBloomTheme.neutral.creamAlt,

  // Semantic
  "--color-success": neuroBloomTheme.semantic.success,
  "--color-success-light": neuroBloomTheme.semantic.successLight,
  "--color-warning": neuroBloomTheme.semantic.warning,
  "--color-warning-light": neuroBloomTheme.semantic.warningLight,
  "--color-error": neuroBloomTheme.semantic.error,
  "--color-error-light": neuroBloomTheme.semantic.errorLight,
  "--color-info": neuroBloomTheme.semantic.info,
  "--color-info-light": neuroBloomTheme.semantic.infoLight,
};

export type NeuroBloomTheme = typeof neuroBloomTheme;
