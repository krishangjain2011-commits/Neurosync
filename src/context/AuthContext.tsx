import React, {
  createContext, useContext, useState, useRef,
  useEffect, useCallback, ReactNode,
} from "react";
import {
  apiGet, apiPost, storeSession, clearSession,
  getStoredToken, getStoredMeta, getStoredChildren,
  getStoredActiveChildId, storeChildren, storeActiveChildId,
  storeAppData, getStoredAppData,
} from "../lib/api";
import {
  firebaseLogin, firebaseRegister, firebaseLogout,
  isFirebaseConfigured,
} from "../lib/firebase";

export interface OnboardingData {
  childName: string;
  childAge?: number;
  diagnoses: string[];
  sensoryTriggers: string[];
  strengths: string[];
  goals: string[];
  otherDetails?: string;
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
  const activeChildRef                 = useRef<ChildProfile | null>(null);

  useEffect(() => {
    activeChildRef.current = activeChild;
  }, [activeChild]);

  const handleSetActiveChild = useCallback((childOrUpdater: React.SetStateAction<ChildProfile | null>) => {
    setActiveChild((current) => {
      const next = typeof childOrUpdater === "function"
        ? (childOrUpdater as (prev: ChildProfile | null) => ChildProfile | null)(current)
        : childOrUpdater;
      storeActiveChildId(next?.id ?? null);
      return next;
    });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await apiGet<AuthUser>("/api/me");
      setUser(me);
      storeChildren(me.children);
      storeAppData({ user: { ...me, children: me.children }, activeChildId: activeChildRef.current?.id ?? null });
      const storedChildId = getStoredActiveChildId();
      const selectedChild = me.children.find((c) => c.id === activeChildRef.current?.id)
        ?? me.children.find((c) => c.id === storedChildId)
        ?? me.children[0]
        ?? null;
      handleSetActiveChild(selectedChild);
    } catch {
      setUser(null);
      handleSetActiveChild(null);
    }
  }, [handleSetActiveChild]);

  useEffect(() => {
    const token = getStoredToken();
    const cachedData = getStoredAppData();
    if (token && cachedData) {
      setUser({
        ...cachedData.user,
        children: cachedData.user.children,
      });
      const initialChild = cachedData.user.children.find((c: ChildProfile) => c.id === cachedData.activeChildId)
        ?? cachedData.user.children[0]
        ?? null;
      handleSetActiveChild(initialChild);
      setLoading(false);
      refreshUser().catch(() => {}).finally(() => setLoading(false));
    } else if (token) {
      const storedUser = getStoredMeta();
      const storedChildren = getStoredChildren();
      const storedChildId = getStoredActiveChildId();
      if (storedUser) {
        setUser({
          ...storedUser,
          children: Array.isArray(storedChildren) ? storedChildren : [],
          id: 0,
          preferredLanguage: "en",
        } as AuthUser);
      }
      if (storedChildren && storedChildren.length > 0) {
        const initialChild = storedChildren.find((c: ChildProfile) => c.id === storedChildId) ?? storedChildren[0];
        handleSetActiveChild(initialChild);
      }
      if (storedUser) {
        setLoading(false);
        refreshUser().catch(() => {}).finally(() => setLoading(false));
      } else {
        refreshUser().finally(() => setLoading(false));
      }
    } else {
      setLoading(false);
    }
  }, [refreshUser, handleSetActiveChild]);

  const login = async (email: string, password: string) => {
    let data: { token: string; email: string; role: string; displayName: string | null };

    if (isFirebaseConfigured()) {
      const idToken = await firebaseLogin(email, password);
      data = await apiPost<{ token: string; email: string; role: string; displayName: string | null }>(
        "/api/auth/firebase", { idToken }
      );
    } else {
      data = await apiPost<{ token: string; email: string; role: string; displayName: string | null }>(
        "/api/login", { email, password }
      );
    }

    storeSession(data.token, { email: data.email, role: data.role, displayName: data.displayName });
    await refreshUser();
  };

  const register = async (email: string, password: string, opts: RegisterOpts = {}) => {
    let data: { token: string; email: string; role: string; displayName: string | null };

    if (isFirebaseConfigured()) {
      const idToken = await firebaseRegister(email, password, opts.displayName);
      data = await apiPost<{ token: string; email: string; role: string; displayName: string | null }>(
        "/api/auth/firebase", {
          idToken,
          role: opts.role ?? "parent",
          displayName: opts.displayName,
          preferredLanguage: opts.preferredLanguage ?? "en",
        }
      );
    } else {
      data = await apiPost<{ token: string; email: string; role: string; displayName: string | null }>(
        "/api/register", { email, password, ...opts }
      );
    }

    storeSession(data.token, { email: data.email, role: data.role, displayName: data.displayName });
    await refreshUser();
  };

  const logout = async () => {
    await apiPost("/api/logout", {}).catch(() => {});
    if (isFirebaseConfigured()) {
      await firebaseLogout().catch(() => {});
    }
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
    storeActiveChildId(child.id);
    return child;
  };

  return (
    <AuthContext.Provider value={{
      user, loading, activeChild, setActiveChild: handleSetActiveChild,
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
