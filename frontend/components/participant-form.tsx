"use client";
import { FormEvent, useState } from "react";
import dynamic from "next/dynamic";
import { api, localInput } from "@/lib/api";
import type { Location, ParticipantInput, Session } from "@/lib/types";
const MeetingMap = dynamic(() => import("./map"), { ssr: false, loading: () => <div className="map-loading">Loading map…</div> });

export function ParticipantForm({ initial, onSave, busy = false, code, session, submitLabel = "Save my starting point", showLocation = true }: { initial?: ParticipantInput; onSave: (data: ParticipantInput) => Promise<void>; busy?: boolean; code?: string; session?: Session; submitLabel?: string; showLocation?: boolean }) {
  const [location, setLocation] = useState<Location | null>(initial?.location || null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  async function search(event: FormEvent) {
    event.preventDefault();
    if (!code || !session) return;
    setSearching(true); setError("");
    try { setResults(await api<Location[]>(`/rooms/${code}/places?q=${encodeURIComponent(query)}`, session.token)); }
    catch (err) { setError((err as Error).message); }
    finally { setSearching(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setError("Device location is unavailable. Select a point on the map."); return; }
    navigator.geolocation.getCurrentPosition(position => { setLocation({ lat: position.coords.latitude, lng: position.coords.longitude, label: "Device location" }); setError(""); }, () => setError("Location permission denied or unavailable. Use the map or search instead."), { timeout: 10000 });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await onSave({ name: String(form.get("name")), location,
        mode: String(form.get("mode")) as ParticipantInput["mode"], price_preference: Number(form.get("price")),
        ready_at: new Date(String(form.get("ready"))).toISOString(),
        available_until: form.get("until") ? new Date(String(form.get("until"))).toISOString() : null,
        max_journey_minutes: form.get("maximum") ? Number(form.get("maximum")) : null });
    } catch (err) { setError((err as Error).message); }
  }
  return <div>
    {showLocation && <div className="location-picker">
      <p className="eyebrow">YOUR STARTING POINT</p>
      <p className="muted">Click the map to drop a pin, or use your device location.</p>
      <div className="setup-map"><MeetingMap picked={location} onPick={setLocation} /></div>
      <div className="location-summary"><span>{location ? location.label : "No starting point selected"}</span><button className="button secondary small" onClick={locate} type="button">Use my location</button></div>
      {session && <form onSubmit={search} className="search-form"><label className="sr-only" htmlFor="search">Search for a place</label><input id="search" placeholder="Search a neighbourhood or address" value={query} onChange={e => setQuery(e.target.value)} minLength={3} maxLength={160} required /><button className="button secondary" disabled={searching}>{searching ? "Searching…" : "Search"}</button></form>}
      {!!results.length && <ul className="search-results">{results.map((r, i) => <li key={i}><button type="button" onClick={() => { setLocation(r); setResults([]); }}>{r.label}</button></li>)}</ul>}
      {session && <small className="muted">Search via Nominatim · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Choose a result or a map pin.</small>}
    </div>}
    <form onSubmit={submit} className="participant-form">
      <label>Your name<input name="name" defaultValue={initial?.name} placeholder="e.g. Alex" maxLength={40} required /></label>
      <div className="form-row"><label>Getting there<select name="mode" defaultValue={initial?.mode || "walking"}><option value="walking">Walking</option><option value="cycling">Cycling</option><option value="driving">Driving</option></select></label><label>Venue price preference<select name="price" defaultValue={initial?.price_preference || 3}><option value={1}>Low · ₹ / $</option><option value={2}>Moderate · ₹₹ / $$</option><option value={3}>Flexible · ₹₹₹ / $$$</option></select></label></div>
      <label>Earliest departure<input type="datetime-local" name="ready" defaultValue={localInput(initial?.ready_at || new Date().toISOString())} required /></label>
      <div className="form-row"><label>Available until <span className="muted">(optional)</span><input type="datetime-local" name="until" defaultValue={initial?.available_until ? localInput(initial.available_until) : ""} /></label><label>Max journey <span className="muted">(minutes)</span><input type="number" name="maximum" min="1" max="360" placeholder="No limit" defaultValue={initial?.max_journey_minutes || ""} /></label></div>
      <p className="fine-print">Price levels are preferences, not currency amounts. Unknown venue prices stay unknown. Times use your device timezone.</p>
      {error && <div role="alert" className="alert error">{error}</div>}
      <button className="button" disabled={busy} type="submit">{busy ? "Saving…" : submitLabel}<span aria-hidden="true">↗</span></button>
    </form>
  </div>;
}
