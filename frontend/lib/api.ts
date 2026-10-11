import type { Session } from "./types";

export function apiUrl() {
  const base = process.env.NEXT_PUBLIC_BACKEND_API_URL || (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:8000` : "http://localhost:8000");
  return base.replace(/\/$/, "");
}
export async function api<T>(path: string, token?: string, method = "GET", data?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 100_000);
  try {
    const response = await fetch(`${apiUrl()}${path}`, {
      method, headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: data ? JSON.stringify(data) : undefined, cache: "no-store", credentials: "include", signal: controller.signal,
    });
    const body = await response.json().catch(() => { throw new Error("The backend returned an unreadable response. Check the server and try again."); });
    if (!response.ok) {
      if (typeof body.detail === "string") throw new Error(body.detail);
      if (Array.isArray(body.detail)) {
        const issue = body.detail.find((item: { loc?: unknown[]; type?: string }) => Array.isArray(item.loc));
        const field = issue?.loc?.at(-1);
        if (field === "email") throw new Error("Enter a valid email address.");
        if (field === "password" && issue?.type === "string_too_short") throw new Error("Use at least 8 characters for your password.");
      }
      const issue = Array.isArray(body.detail) ? body.detail[0] : null;
      throw new Error(issue?.msg ? `${issue.loc?.slice(1).join(" · ") || "Input"}: ${issue.msg}` : "The request failed. Please try again.");
    }
    return body as T;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Cannot reach the backend. Check the server and API URL.");
    if (error instanceof Error && error.name === "AbortError") throw new Error("The request took too long. Reconnect to check the latest state before retrying.");
    throw error;
  } finally { clearTimeout(timeout); }
}
export function saveSession(code: string, session: Session) {
  sessionStorage.setItem(`rendezvous:${code}`, JSON.stringify({ token: session.token, participant_id: session.participant_id }));
  window.dispatchEvent(new Event("rendezvous-session"));
}
export function loadSession(code: string): Session | null {
  try { const value = sessionStorage.getItem(`rendezvous:${code}`); return parseSession(value); } catch { return null; }
}
export function localInput(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export function timeLabel(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
export function dateLabel(iso: string) { return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

export function parseSession(value: string | null): Session | null {
  try {
    const parsed = value ? JSON.parse(value) : null;
    return parsed && typeof parsed.token === "string" && parsed.token && typeof parsed.participant_id === "string" && parsed.participant_id ? parsed : null;
  } catch { return null; }
}
export function storedSession(code: string) {
  try { return sessionStorage.getItem(`rendezvous:${code}`); } catch { return null; }
}
export function clearSession(code: string) {
  sessionStorage.removeItem(`rendezvous:${code}`);
  window.dispatchEvent(new Event("rendezvous-session"));
}
