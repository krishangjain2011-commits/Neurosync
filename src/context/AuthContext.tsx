import React, {
  createContext, useContext, useState,
  useEffect, useCallback, ReactNode,
} from "react";
import {
  apiGet, apiPost, storeSession, clearSession, getStoredToken, getStoredMeta,
} from "../lib/api";

export interface OnboardingData {
  childName: string;
  childAge?: number;
  diagnoses: string[];
  sensoryTriggers: string[];
  strengths: string[];
  goals: string[];
}

export interface ChildProfile {
  id: number;
  onboarding_data: OnboardingData | null;
  created_at: string;
}

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  displayName: string | null;
  preferredLanguage: string;
  children: ChildProfile[];
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  activeChild: ChildProfile | null;
  setActiveChild: (c: ChildProfile | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, opts?: RegisterOpts) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  addChild: (data: OnboardingData) => Promise<ChildProfile>;
}

interface RegisterOpts {
  displayName?: string;
  role?: string;
  orgId?: number;
  preferredLanguage?: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<AuthUser | null>(null);
  const [loading, setLoading]         = useState(true);
  const [activeChild, setActiveChild] = useState<ChildProfile | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiGet<AuthUser>("/api/me");
      setUser(me);
      // Auto-select first child if none selected
      setActiveChild((prev) => {
        if (prev) return me.children.find((c) => c.id === prev.id) ?? me.children[0] ?? null;
        return me.children[0] ?? null;
      });
    } catch {
      setUser(null);
      setActiveChild(null);
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      refreshUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await apiPost<{ token: string; email: string; role: string; displayName: string | null }>(
      "/api/login", { email, password }
    );
    storeSession(data.token, { email: data.email, role: data.role, displayName: data.displayName });
    await refreshUser();
  };

  const register = async (email: string, password: string, opts: RegisterOpts = {}) => {
    const data = await apiPost<{ token: string; email: string; role: string; displayName: string | null }>(
      "/api/register", { email, password, ...opts }
    );
    storeSession(data.token, { email: data.email, role: data.role, displayName: data.displayName });
    await refreshUser();
  };

  const logout = async () => {
    await apiPost("/api/logout", {}).catch(() => {});
    clearSession();
    setUser(null);
    setActiveChild(null);
  };

  const addChild = async (data: OnboardingData): Promise<ChildProfile> => {
    const res = await apiPost<{ childId: number; consentId: number }>("/api/children", {
      onboardingData: data,
    });
    await refreshUser();
    const updated = await apiGet<AuthUser>("/api/me");
    const child = updated.children.find((c) => c.id === res.childId)!;
    setActiveChild(child);
    return child;
  };

  return (
    <AuthContext.Provider value={{
      user, loading, activeChild, setActiveChild,
      login, register, logout, refreshUser, addChild,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
