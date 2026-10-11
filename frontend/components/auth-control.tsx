"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./modal";
import { api } from "@/lib/api";

type Account = { id: string; email: string };

function broadcastAuthChange() {
  try { localStorage.setItem("rendezvous-auth-changed", String(Date.now())); } catch { /* Storage may be disabled. */ }
}

export function AuthControl() {
  const revision = useRef(0);
  const mutating = useRef(false);
  const [user, setUser] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (mutating.current) return;
      const requestRevision = ++revision.current;
      api<{ user: Account }>("/auth/me")
        .then(({ user: account }) => { if (active && revision.current === requestRevision) setUser(account); })
        .catch(() => { if (active && revision.current === requestRevision) setUser(null); });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "rendezvous-auth-changed") refresh();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutating.current = true; revision.current++;
    setBusy(true); setMessage("");
    try {
      const { user: account } = await api<{ user: Account }>(mode === "sign-in" ? "/auth/login" : "/auth/signup", undefined, "POST", { email, password });
      setUser(account);
      setPassword("");
      setOpen(false);
      broadcastAuthChange();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in. Please try again.");
    } finally { mutating.current = false; setBusy(false); }
  }

  async function signOut() {
    mutating.current = true; revision.current++;
    setBusy(true);
    try {
      await api("/auth/logout", undefined, "POST");
      setUser(null);
      setMessage("");
      broadcastAuthChange();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
    } finally { mutating.current = false; setBusy(false); }
  }

  if (user) return <div className="auth-control"><span className="auth-email" title={user.email}>{user.email}</span>{message && <span role="status">{message}</span>}<button className="text-button" disabled={busy} onClick={signOut}>Sign out</button></div>;

  return <>
    <button className="text-button" onClick={() => { setMessage(""); setOpen(true); }}>Sign in</button>
    {open && <Modal titleId="auth-title" onClose={() => setOpen(false)}>
      <span className="eyebrow">YOUR RENDEZVOUS ACCOUNT</span>
      <h2 id="auth-title">{mode === "sign-in" ? "Welcome back" : "Create an account"}</h2>
      <form className="participant-form" onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required autoFocus /></label>
        <label>Password<input type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={mode === "sign-up" ? 8 : undefined} value={password} onChange={event => setPassword(event.target.value)} required /></label>
        {mode === "sign-up" && <p className="muted">Use at least 8 characters.</p>}
        {message && <div className="alert error" role="alert">{message}</div>}
        <button className="button full" disabled={busy}>{busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="text-button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }}>{mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
    </Modal>}
  </>;
}
