import React, {
  createContext, useContext, useState,
  useEffect, useCallback, ReactNode,
} from "react";
import { flushQueue, getPendingCount } from "../lib/offline-queue";
import { getStoredToken } from "../lib/api";

interface OfflineContextType {
  isOnline: boolean;
  pendingCount: number;
  flush: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextType>({
  isOnline: true,
  pendingCount: 0,
  flush: async () => {},
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline]       = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(async () => {
    const n = await getPendingCount();
    setPendingCount(n);
  }, []);

  const flush = useCallback(async () => {
    await flushQueue(getStoredToken);
    await refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    const onOnline  = async () => { setIsOnline(true);  await flush(); };
    const onOffline = ()       => { setIsOnline(false); };

    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    refreshCount();

    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flush, refreshCount]);

  return (
    <OfflineContext.Provider value={{ isOnline, pendingCount, flush }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}
