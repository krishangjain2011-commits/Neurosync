import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { LangCode, SUPPORTED_LANGUAGES, TranslationKey, t as translate } from "../lib/i18n";

interface LangContextType {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (key: TranslationKey) => string;
  supportedLanguages: typeof SUPPORTED_LANGUAGES;
}

const LangContext = createContext<LangContextType | null>(null);

const STORAGE_KEY = "neurosync_lang";

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as LangCode) ?? "en";
  });

  const setLang = (l: LangCode) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    // Update <html lang> attribute for accessibility
    document.documentElement.lang = l;
  };

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key: TranslationKey) => translate(lang, key);

  return (
    <LangContext.Provider value={{ lang, setLang, t, supportedLanguages: SUPPORTED_LANGUAGES }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be inside LangProvider");
  return ctx;
}
