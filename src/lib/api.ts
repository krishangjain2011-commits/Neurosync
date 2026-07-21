/**
 * NeuroSync API Client
 *
 * Security: the opaque session token is stored in localStorage so it
 * persists across browser restarts on the same device.
 * The raw user ID is NEVER stored or sent as a credential.
 * Cookie (httpOnly) is the primary auth vector; the Bearer header
 * is the fallback for sandboxed iframes where cookies are blocked.
 */

const TOKEN_KEY = "neurosync_token";
const USER_KEY  = "neurosync_user_meta"; // non-sensitive display data only
const CHILDREN_KEY = "neurosync_children";
const ACTIVE_CHILD_KEY = "neurosync_active_child";
const APP_DATA_KEY = "neurosync_app_data";

export interface UserMeta {
  email: string;
  role: string;
  displayName: string | null;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeSession(token: string, meta: UserMeta): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(meta));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(CHILDREN_KEY);
  localStorage.removeItem(ACTIVE_CHILD_KEY);
  clearAppData();
}

export function getStoredMeta(): UserMeta | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeChildren(children: any[]): void {
  localStorage.setItem(CHILDREN_KEY, JSON.stringify(children));
}

export function getStoredChildren(): any[] | null {
  try {
    const raw = localStorage.getItem(CHILDREN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export interface StoredAppData {
  user: UserMeta & { id: number; preferredLanguage: string; children: any[] };
  activeChildId: number | null;
}

export function storeAppData(data: StoredAppData): void {
  localStorage.setItem(APP_DATA_KEY, JSON.stringify(data));
}

export function getStoredAppData(): StoredAppData | null {
  try {
    const raw = localStorage.getItem(APP_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAppData(): void {
  localStorage.removeItem(APP_DATA_KEY);
}

export function getStoredActiveChildId(): number | null {
  const raw = localStorage.getItem(ACTIVE_CHILD_KEY);
  if (!raw) return null;
  const id = parseInt(raw, 10);
  return Number.isNaN(id) ? null : id;
}

export function storeActiveChildId(childId: number | null): void {
  if (childId === null) {
    localStorage.removeItem(ACTIVE_CHILD_KEY);
  } else {
    localStorage.setItem(ACTIVE_CHILD_KEY, String(childId));
  }
}

// ── Fetch wrapper ─────────────────────────────────────────────────────────────

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  const body = options.body;

  if (!(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (options.headers) {
    Object.assign(headers, options.headers as Record<string, string>);
  }

  if (token) headers["Authorization"] = `Bearer ${token}`;

  return fetch(url, { ...options, headers, credentials: "include" });
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `GET ${url} failed`);
  }
  return res.json();
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const isFormData = body instanceof FormData;
  const res = await apiFetch(url, { method: "POST", body: isFormData ? body : JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `POST ${url} failed`);
  }
  return res.json();
}

export async function apiPostFormData<T>(url: string, formData: FormData): Promise<T> {
  const res = await apiFetch(url, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `POST ${url} failed`);
  }
  return res.json();
}

export async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, { method: "PUT", body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `PUT ${url} failed`);
  }
  return res.json();
}

export async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  const res = await apiFetch(url, { method: "PATCH", body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `PATCH ${url} failed`);
  }
  return res.json();
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await apiFetch(url, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `DELETE ${url} failed`);
  }
  return res.json();
}

// ── SSE Streaming ─────────────────────────────────────────────────────────────

export async function* streamGemini(
  messages: { role: string; content: string }[],
  context?: object
): AsyncGenerator<string> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch("/api/gemini/stream", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ messages, context }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: "Stream failed" }));
    throw new Error(err.error || "Stream failed");
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.text) yield parsed.text;
      } catch {}
    }
  }
}
