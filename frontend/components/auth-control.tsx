"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Modal } from "./modal";
import { getSupabaseClient, supabaseConfigured } from "@/lib/supabase";

export function AuthControl() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const configured = supabaseConfigured();

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => { if (active) setUser(data.user); });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true); setMessage("");
    const result = mode === "sign-in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (mode === "sign-up" && !result.data.session) setMessage("Check your email to confirm your account, then sign in.");
    else { setMessage(mode === "sign-up" ? "Account created — you are signed in." : "Signed in successfully."); setPassword(""); }
  }

  async function signOut() {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signOut();
    setBusy(false);
    if (error) setMessage(error.message);
  }

  if (user) return <div className="auth-control"><span className="auth-email" title={user.email || undefined}>{user.email || "Signed in"}</span><button className="text-button" disabled={busy} onClick={signOut}>Sign out</button></div>;

  return <>
    <button className="text-button" onClick={() => { setMessage(""); setOpen(true); }}>Sign in</button>
    {open && <Modal titleId="auth-title" onClose={() => setOpen(false)}>
      <span className="eyebrow">YOUR RENDEZVOUS ACCOUNT</span>
      <h2 id="auth-title">{mode === "sign-in" ? "Welcome back" : "Create an account"}</h2>
      {!configured ? <div className="alert error" role="alert">Supabase login is not configured. Add the public project URL and publishable key to <code>.env.local</code>, then restart the app.</div> : <form className="participant-form" onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required autoFocus /></label>
        <label>Password<input type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={6} value={password} onChange={event => setPassword(event.target.value)} required /></label>
        {message && <div className={message.includes("successfully") || message.includes("created") || message.startsWith("Check") ? "alert success" : "alert error"} role="status">{message}</div>}
        <button className="button full" disabled={busy}>{busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
      </form>}
      <button className="text-button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setMessage(""); }}>{mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
    </Modal>}
  </>;
}
