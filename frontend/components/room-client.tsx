"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { api, dateLabel, saveSession, timeLabel } from "@/lib/api";
import { useRoom } from "@/lib/use-room";
import type { Joined, ParticipantInput, Room, Session, Settings } from "@/lib/types";
import { ParticipantForm } from "./participant-form";
import { Brand, PixelIcon } from "./pixel-art";
import { Modal } from "./modal";
import { SettingsForm } from "./settings-form";
import { AuthControl } from "./auth-control";
const MeetingMap = dynamic(() => import("./map"), { ssr: false, loading: () => <div className="map-loading">Loading map…</div> });

function subscribeSession(callback: () => void) {
  window.addEventListener("rendezvous-session", callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener("rendezvous-session", callback); window.removeEventListener("storage", callback); };
}
const noSubscription = () => () => {};

export default function RoomClient({ code }: { code: string }) {
  const stored = useSyncExternalStore(subscribeSession, () => sessionStorage.getItem(`rendezvous:${code}`), () => null);
  const loaded = useSyncExternalStore(noSubscription, () => true, () => false);
  const session = useMemo<Session | null>(() => { try { return stored ? JSON.parse(stored) : null; } catch { return null; } }, [stored]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draftDelay, setDraftDelay] = useState<{ serverValue: number; value: number } | null>(null);
  const delayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { room, accept, status, error, setError, send } = useRoom(code, session);
  const me = room?.participants.find(p => p.id === session?.participant_id);
  const serverDelay = me?.delay_minutes ?? 0;
  const delay = draftDelay?.serverValue === serverDelay ? draftDelay.value : serverDelay;
  useEffect(() => () => clearTimeout(delayTimer.current), []);
  const host = me?.id === room?.host_id;
  const current = room?.rankings.find(r => r.venue.id === room.selected_id);
  const currentVenue = room?.venues.find(v => v.id === room.selected_id);
  const proposed = room?.venues.find(v => v.id === room.proposal?.venue_id);
  async function join(data: ParticipantInput) {
    setBusy(true);
    try { const result = await api<Joined>(`/rooms/${code}/join`, undefined, "POST", data); saveSession(code, result); accept(result.room); }
    finally { setBusy(false); }
  }
  async function update(data: ParticipantInput) {
    if (!session) return;
    setBusy(true);
    try { accept(await api<Room>(`/rooms/${code}/participant`, session.token, "PUT", data)); setEditing(false); }
    finally { setBusy(false); }
  }
  async function calculate(discover: boolean) {
    if (!session) return;
    setBusy(true); setError("");
    try { accept(await api<Room>(`/rooms/${code}/calculate?discover=${discover}`, session.token, "POST")); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function saveSettings(settings: Settings) {
    if (!session) return;
    setBusy(true); setError("");
    try { accept(await api<Room>(`/rooms/${code}/settings`, session.token, "PUT", settings)); setSettingsOpen(false); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  function updateDelay(value: number) {
    setDraftDelay({ serverValue: serverDelay, value }); clearTimeout(delayTimer.current);
    delayTimer.current = setTimeout(() => { send({ type: "delay.update", minutes: value }); }, 300);
  }
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setError(`Copy this room link: ${window.location.href}`); }
  }
  if (!loaded) return <main className="loading-screen">Opening your meetup…</main>;
  if (!session) return <main><nav className="site-nav"><Brand /><span className="pill">ROOM {code}</span></nav><section className="join-card"><span className="eyebrow">YOU’RE INVITED</span><h1>A good place.<br />Better company.</h1><p className="muted">Join room {code}, then add your starting point to the shared map.</p><ParticipantForm showLocation={false} onSave={join} busy={busy} submitLabel="Join this meetup" /></section></main>;
  if (!room) return <main className="loading-screen"><p>Connecting to your meetup…</p>{error && <div className="alert error" role="alert">{error}</div>}<button className="button secondary" onClick={() => { sessionStorage.removeItem(`rendezvous:${code}`); window.dispatchEvent(new Event("rendezvous-session")); }}>Rejoin room</button></main>;
  return <main className="room-shell">
    <nav className="site-nav"><Brand /><div className="room-nav"><span className={`connection ${status === "Live" ? "connected" : ""}`} role="status"><span className="live-dot" />{status}</span><AuthControl /><button className="button secondary small" onClick={share}>{copied ? "Link copied ✓" : `Share room · ${code} ↗`}</button></div></nav>
    <div className="room-heading"><div><span className="eyebrow">YOUR PARTY’S MEETUP</span><h1>Let’s find your <em>common ground.</em></h1></div><div className="arrival"><span>MEET AT</span><strong>{timeLabel(room.settings.target_arrival)}</strong><small>{dateLabel(room.settings.target_arrival)}</small></div></div>
    {error && <div className="alert error" role="alert">{error}<button className="text-button" onClick={() => setError("")}>Dismiss</button></div>}
    <div className="room-layout"><aside className="room-sidebar">
      <section className="panel"><div className="panel-heading"><h2>The party <span className="count">{room.participants.length}</span></h2><span className="eyebrow">UP TO 8</span></div><ul className="people-list">{room.participants.map((p, i) => <li key={p.id}><span className={`avatar color-${i % 4}`}>{p.name.slice(0, 1).toUpperCase()}</span><div><strong>{p.name}{p.id === me?.id ? " (you)" : ""}</strong><small>{p.mode} · {p.location ? "Location set" : "Needs starting point"}{p.delay_minutes ? ` · +${p.delay_minutes} min delay` : ""}</small></div>{p.id === room.host_id && <span className="tag">Host</span>}</li>)}</ul><button className="button secondary full" onClick={() => setEditing(!editing)}>{me?.location ? "Edit my starting point & preferences" : "Add my starting point ↗"}</button></section>
      <section className="panel delay-panel"><span className="eyebrow">WHEN LIFE HAPPENS</span><div className="panel-heading"><h2>Running behind?</h2><strong className="delay-value">+{delay}<small> min</small></strong></div><label htmlFor="delay" className="muted">Simulate your departure delay</label><input id="delay" type="range" min={0} max={120} step={1} value={delay} onChange={e => updateDelay(Number(e.target.value))} disabled={status !== "Live" || busy} /><div className="range-labels"><span>On time</span><span>+120 min</span></div><p className="fine-print">Manual simulation. Shifts your readiness and recalculates the shared schedule; this is not live traffic.</p></section>
      {host && <section className="panel"><div className="panel-heading"><h2>Make the plan</h2><span className="tag">Host</span></div><p className="muted">Discover up to ten real cafés and restaurants near the group, then compare actual routes.</p><button className="button full" disabled={busy || room.participants.some(p => !p.location)} onClick={() => calculate(true)}>{busy || room.routing_status === "loading" ? "Finding your meeting point…" : "Find meeting points ↗"}</button>{room.venues.length > 0 && <button className="text-button" disabled={busy} onClick={() => calculate(false)}>Refresh routes for these venues</button>}<button className="text-button" onClick={() => setSettingsOpen(!settingsOpen)}>Arrival, fairness & switch settings</button>{settingsOpen && <SettingsForm settings={room.settings} onSave={saveSettings} busy={busy} />}</section>}
    </aside><div className="room-main">
      <section className="room-map"><MeetingMap participants={room.participants} venues={room.venues} selectedId={room.selected_id} /><div className="map-legend"><span><i className="legend-person" />Starting points</span><span><i className="legend-venue" />Venues</span><span><i className="legend-selected" />Meeting point</span></div></section>
      <section className="recommendation panel"><div className="panel-heading"><span className="eyebrow">{room.settings.fairness_weight ? "FAIRNESS-ADJUSTED RECOMMENDATION" : "MINIMAX RECOMMENDATION"}</span><span className="tag">{room.routing_status === "ready" ? (room.route_source === "OpenRouteService" ? "Real ORS estimates" : room.route_source || "Routes") : "Routes unavailable"}</span></div><div className="recommendation-heading"><div><h2>{currentVenue?.name || "Your meeting point starts here"}</h2><p className="muted">{room.message}</p></div>{current?.worst_minutes != null && <div className="worst-metric"><strong>{Math.ceil(current.worst_minutes)}</strong><span>min · longest journey</span></div>}</div>{current && !current.eligible && <div className="alert error">Current venue is infeasible: {current.reasons.join(" · ")}</div>}{current && <p className="fine-print">Total {current.total_minutes?.toFixed(1)} min · Average {current.average_minutes?.toFixed(1)} min · Imbalance {current.imbalance_minutes?.toFixed(1)} min · Score {current.score?.toFixed(1)} · Minimax rank {current.baseline_rank ?? "ineligible"} · Adjusted rank {current.adjusted_rank ?? "ineligible"}. {current.unknowns.length ? `Verify: ${current.unknowns.join(", ")}.` : ""}</p>}{room.proposal && <div className="proposal"><span className="eyebrow">GROUP CONFIRMATION NEEDED</span><h3>Switch to {proposed?.name}?</h3><p>{room.proposal.reason}</p><p>{room.proposal.votes.length} / {room.participants.length} approved. The current venue stays selected until everyone agrees.</p><div className="hero-actions"><button className="button small" disabled={status !== "Live" || room.proposal.votes.includes(me?.id || "")} onClick={() => send({ type: "venue.vote", proposal_id: room.proposal!.id, approve: true })}>{room.proposal.votes.includes(me?.id || "") ? "You approved ✓" : "Approve switch"}</button><button className="button secondary small" disabled={status !== "Live"} onClick={() => send({ type: "venue.vote", proposal_id: room.proposal!.id, approve: false })}>Keep current venue</button></div></div>}</section>
      {current && <section className="panel"><div className="panel-heading"><h2>Everyone’s journey</h2><span className="eyebrow">{room.settings.buffer_minutes} MIN SAFETY BUFFER</span></div><div className="journey-grid">{current.journeys.map(j => <article className="journey" key={j.participant_id}><strong>{j.name}</strong><div className="journey-duration">{Math.ceil(j.minutes)}<small> min</small></div><p>Leave at <strong>{dateLabel(j.depart_at)}</strong></p><small className={j.feasible ? "feasible" : "infeasible"}>{j.feasible ? "Ready in time ✓" : `Earliest arrival ${dateLabel(j.earliest_arrival)}`}</small>{j.reasons.map(r => <p className="fine-print infeasible" key={r}>{r}</p>)}</article>)}</div><p className="fine-print">Departure = target arrival − route duration − safety buffer. Route estimates are not a traffic forecast. {room.routed_at && `Retrieved ${dateLabel(room.routed_at)}.`}</p></section>}
      <section className="panel venue-panel"><div className="panel-heading"><h2>Compare meeting points</h2><span className="count">{room.venues.length}</span></div>{!room.rankings.length ? <div className="empty-state"><span aria-hidden="true"><PixelIcon kind="route" /></span><h3>{room.routing_status === "error" ? "Routes could not be calculated" : "A little input from everyone"}</h3><p>{room.routing_status === "error" ? room.message : "Add each starting point. The host can then discover venues and calculate real travel times."}</p></div> : <div className="table-scroll"><table><thead><tr><th>Venue / adjusted rank</th><th>Minimax rank</th><th>Longest</th><th>Total / average</th><th>Gap / penalty / score</th><th>Details</th></tr></thead><tbody>{room.rankings.map(r => <tr key={r.venue.id} className={r.venue.id === room.selected_id ? "selected-row" : ""}><td><span className="rank-number">{r.adjusted_rank || "—"}</span><strong>{r.venue.name}</strong>{r.venue.id === room.selected_id && <small className="feasible">Current meeting point</small>}</td><td>{r.baseline_rank || "—"}</td><td>{r.worst_minutes == null ? "Unavailable" : `${r.worst_minutes.toFixed(1)} min`}</td><td>{r.total_minutes?.toFixed(1) ?? "—"} / {r.average_minutes?.toFixed(1) ?? "—"}</td><td>{r.imbalance_minutes?.toFixed(1) ?? "—"} / {r.fairness_penalty?.toFixed(1) ?? "—"} / {r.score?.toFixed(1) ?? "—"}</td><td><details><summary>{r.eligible ? "Eligible · verify details" : "Excluded · see why"}</summary><p>{r.explanation}</p>{r.reasons.map(reason => <p key={reason} className="infeasible">{reason}</p>)}<p>Unknown: {r.unknowns.join(", ") || "none"}</p><p>Hours: {r.venue.opening_hours || "unknown"}</p><a href={`https://www.openstreetmap.org/${r.venue.id}`} target="_blank" rel="noreferrer">View venue ↗</a></details></td></tr>)}</tbody></table></div>}<p className="fine-print">Best among this finite set of candidates. Score = longest + {room.settings.fairness_weight} × journey gap. Equal scores use longest, total, then venue ID. Venue metadata: © OpenStreetMap contributors. Routing: <a href="https://openrouteservice.org/" target="_blank" rel="noreferrer">openrouteservice</a>.</p></section>
    </div></div>
    {editing && me && <Modal wide titleId="setup-title" onClose={() => setEditing(false)}><span className="eyebrow">MAKE YOUR JOURNEY COUNT</span><h2 id="setup-title">Where are you starting?</h2><p className="fine-print">Your starting point is shared with this room. Coordinates go to routing and map providers. Avoid sensitive addresses in public demos.</p><ParticipantForm initial={me} onSave={update} busy={busy} code={code} session={session} /></Modal>}
    <footer>Fair journeys, shared plans.<span>In-memory prototype · rooms expire after 24 hours</span></footer>
  </main>;
}
