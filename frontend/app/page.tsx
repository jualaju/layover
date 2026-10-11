"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brand, Overworld, PixelIcon } from "@/components/pixel-art";
import { Modal } from "@/components/modal";
import { ParticipantForm } from "@/components/participant-form";
import { AuthControl } from "@/components/auth-control";
import { api, saveSession } from "@/lib/api";
import type { Joined, ParticipantInput } from "@/lib/types";

export default function Home() {
  const [flow, setFlow] = useState<"create" | "join" | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function enter(participant: ParticipantInput) {
    setBusy(true);
    try {
      const result = flow === "join" ? await api<Joined>(`/rooms/${code.trim().toUpperCase()}/join`, undefined, "POST", participant)
        : await api<Joined>("/rooms", undefined, "POST", { participant, settings: { target_arrival: new Date(Date.now() + 120 * 60_000).toISOString(), buffer_minutes: 5, fairness_weight: 0, switch_absolute_minutes: 3, switch_relative: .1, require_known_metadata: false } });
      saveSession(result.room.code, result);
      router.push(`/room/${result.room.code}`);
    } finally { setBusy(false); }
  }
  return <main>
    <nav className="site-nav"><Brand /><span className="nav-note">MULTIPLAYER PLANS. REAL-WORLD ADVENTURES.</span><div className="nav-actions"><AuthControl /><button className="text-button" onClick={() => setFlow("join")}>Join a room <span aria-hidden="true">↗</span></button></div></nav>
    <div className="hero">
      <section className="hero-copy"><span className="pill"><PixelIcon kind="party" /> YOUR NEXT ADVENTURE, TOGETHER</span><h1>Different starts.<br />One <em>good place.</em></h1><p className="hero-description">Find a place that works for everyone. Real journey times, a fairer trip, and a plan that moves with your group.</p><div className="hero-actions"><button className="button" onClick={() => setFlow("create")}>Plan a meetup <span>↗</span></button><button className="button secondary" onClick={() => setFlow("join")}>Join your friends</button></div><p className="fine-print">No account needed · Walking, cycling & driving</p><div className="hero-principle"><span>THE MAIN QUEST</span><p>The fairest place isn’t always in the middle.<br /><strong>It’s the one with the shortest longest trip.</strong></p></div></section>
      <section className="hero-art" aria-label="Pixel-art illustration of friends meeting on an island"><div className="art-label"><span className="live-dot" /> WORLD 01 <span>THE MEETUP</span></div><Overworld /><div className="art-caption"><span className="eyebrow">THREE STARTS. ONE DESTINATION.</span><p>A fair journey for<br />every player.</p><small>Illustrative world · real maps in your room</small></div></section>
    </div>
    <section className="how-it-works"><div><span className="step-number"><PixelIcon kind="party" /> 01 / GATHER</span><h2>Bring your people</h2><p>Share one room link. Everyone adds their starting point and preferences.</p></div><div><span className="step-number"><PixelIcon kind="route" /> 02 / EXPLORE</span><h2>Find the fair option</h2><p>Compare real venues by journey time, with the longest trip in focus.</p></div><div><span className="step-number"><PixelIcon kind="clock" /> 03 / RENDEZVOUS</span><h2>Keep the group in sync</h2><p>Report a delay. Update the plan together, without constant venue changes.</p></div></section>
    {flow && <Modal titleId="flow-title" onClose={() => setFlow(null)}><span className="eyebrow">LET’S GET EVERYONE TOGETHER</span><h2 id="flow-title">{flow === "create" ? "Start a new meetup" : "Join your group"}</h2><p className="muted">Add your preferences now. Choose your location on the map inside the room.</p>{flow === "join" && <label>Room code<input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 8))} placeholder="8-character code" maxLength={8} autoFocus /></label>}<ParticipantForm showLocation={false} onSave={async data => { if (flow === "join" && code.length !== 8) throw new Error("Enter an eight-character room code."); await enter(data); }} busy={busy} submitLabel={flow === "create" ? "Create my room" : "Join the meetup"} /></Modal>}
    <footer>Built for the journey, and the people at the end of it.<span>Rendezvous · a fair way to meet</span></footer>
  </main>;
}
