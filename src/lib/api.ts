/**
 * NeuroSync API Client
 *
 * Security: the opaque session token is stored in sessionStorage so it is
 * cleared automatically when the tab/browser closes. Every fresh visit
 * starts from the login screen.
 * The raw user ID is NEVER stored or sent as a credential.
 * Cookie (httpOnly) is the primary auth vector; the Bearer header
 * is the fallback for sandboxed iframes where cookies are blocked.
 */

const TOKEN_KEY = "neurosync_token";
const USER_KEY  = "neurosync_user_meta"; // non-sensitive display data only

export interface UserMeta {
  email: string;
  role: string;
  displayName: string | null;
}

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function storeSession(token: string, meta: UserMeta): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(meta));
}

export function clearSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function getStoredMeta(): UserMeta | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Fetch wrapper ─────────────────────────────────────────────────────────────

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
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
  const res = await apiFetch(url, { method: "POST", body: JSON.stringify(body) });
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
