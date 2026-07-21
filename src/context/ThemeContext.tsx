import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "default" | "high-contrast";

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  supportedThemes: { value: ThemeMode; label: string }[];
}

const ThemeContext = createContext<ThemeContextType | null>(null);
const STORAGE_KEY = "neurosync_theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    return (stored === "high-contrast" ? "high-contrast" : "default") as ThemeMode;
  });

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, mode);
      document.documentElement.dataset.theme = mode;
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const supportedThemes = useMemo<ThemeContextType["supportedThemes"]>(() => [
    { value: "default", label: "Normal Contrast" },
    { value: "high-contrast", label: "High Contrast" },
  ], []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, supportedThemes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be inside ThemeProvider");
  return ctx;
}
