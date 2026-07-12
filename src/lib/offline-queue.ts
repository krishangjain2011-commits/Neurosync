/**
 * NeuroSync — Offline Write Queue
 *
 * Queues POST/PUT requests in IndexedDB when the network is unavailable.
 * On reconnect, flushes queued operations in order.
 */

const DB_NAME    = "neurosync_offline";
const STORE_NAME = "pending_writes";
const DB_VERSION = 1;

interface PendingWrite {
  id?: number;
  url: string;
  method: string;
  body: unknown;
  queuedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function enqueueWrite(url: string, method: string, body: unknown): Promise<void> {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = idb.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.add({ url, method, body, queuedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function getPending(): Promise<PendingWrite[]> {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = idb.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.getAll();
    req.onsuccess = () => resolve(req.result as PendingWrite[]);
    req.onerror   = () => reject(req.error);
  });
}

async function removeWrite(id: number): Promise<void> {
  const idb = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = idb.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/** Call on app startup and on navigator.onLine events. */
export async function flushQueue(getToken: () => string | null): Promise<void> {
  if (!navigator.onLine) return;
  const pending = await getPending();
  if (!pending.length) return;

  console.log(`[offline-queue] Flushing ${pending.length} queued writes…`);
  for (const item of pending) {
    const token = getToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers,
        credentials: "include",
        body: JSON.stringify(item.body),
      });
      if (res.ok) {
        await removeWrite(item.id!);
        console.log(`[offline-queue] Synced: ${item.method} ${item.url}`);
      } else {
        console.warn(`[offline-queue] Server rejected: ${item.method} ${item.url} → ${res.status}`);
      }
    } catch (err) {
      console.warn(`[offline-queue] Still offline for: ${item.url}`);
      break; // Stop — still no network
    }
  }
}

export async function getPendingCount(): Promise<number> {
  const pending = await getPending();
  return pending.length;
}
