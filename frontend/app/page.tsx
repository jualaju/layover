"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ParticipantForm } from "@/components/participant-form";
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
    <nav className="site-nav"><Link href="/" className="brand"><span className="brand-symbol" aria-hidden="true">r</span>rendezvous<span className="brand-dot">.</span></Link><span className="nav-note">A LITTLE LESS TRAVEL. A LITTLE MORE TOGETHER.</span><button className="text-button" onClick={() => setFlow("join")}>Join a room ↗</button></nav>
    <div className="hero">
      <section className="hero-copy"><span className="pill">GOOD PLANS START WITH A FAIR MEETING POINT</span><h1>Different starts.<br />One <em>good place.</em></h1><p className="hero-description">Find a place that works for everyone. Real journey times, a fairer trip, and a plan that moves with your group.</p><div className="hero-actions"><button className="button" onClick={() => setFlow("create")}>Plan a meetup <span>↗</span></button><button className="button secondary" onClick={() => setFlow("join")}>Join your friends</button></div><p className="fine-print">No account needed · Walking, cycling & driving</p><div className="hero-principle"><span>01 / THE IDEA</span><p>The fairest place isn’t always in the middle.<br /><strong>It’s the one with the shortest longest trip.</strong></p></div></section>
      <section className="hero-art" aria-label="Illustration of different starting points converging on a meeting point"><svg viewBox="0 0 600 620" role="img"><title>Three starting points, one shared destination — illustrative map</title><rect width="600" height="620" fill="#e7e9df" /><path d="M0 100L200 80L300 0M120 620L140 400L50 280L0 260M600 180L410 240L300 400L340 620" stroke="#c8d9cd" strokeWidth="85" fill="none" /><g stroke="#fbfbf5" strokeWidth="16" fill="none"><path d="M-10 200L640 330M-20 470L640 540M90-10L250 650M420-10L350 650M-20 70L620 180M-10 350L640 410M230-10L80 650M560-10L500 650" /></g><g stroke="#d7d9cd" strokeWidth="2" fill="none"><path d="M-10 200L640 330M-20 470L640 540M90-10L250 650M420-10L350 650M-20 70L620 180M-10 350L640 410" /></g><path d="M140 160L200 245L300 310M480 180L380 220L300 310M170 490L250 390L300 310" stroke="#527568" strokeWidth="3" strokeDasharray="7 7" fill="none" /><circle cx="300" cy="310" r="62" fill="#28645a" opacity=".08" /><circle cx="300" cy="310" r="34" fill="#28645a" /><text x="300" y="321" textAnchor="middle" fill="white" fontSize="30">↗</text><g fill="#fff" stroke="#28645a" strokeWidth="5"><circle cx="140" cy="160" r="13" /><circle cx="480" cy="180" r="13" /><circle cx="170" cy="490" r="13" /></g></svg><div className="art-label art-label-top"><span className="live-dot" /> EVERY JOURNEY COUNTS</div><div className="art-caption"><span className="eyebrow">MEET SOMEWHERE THAT MAKES SENSE</span><p>Less “where should we go?”<br />More “see you there.”</p><small>Illustration · real maps inside your room</small></div></section>
    </div>
    <section className="how-it-works"><div><span>01</span><h2>Bring your people</h2><p>Share one room link. Everyone adds their starting point and preferences.</p></div><div><span>02</span><h2>Find the fair option</h2><p>Compare real venues by journey time, with the longest trip in focus.</p></div><div><span>03</span><h2>Keep the group in sync</h2><p>Report a delay. Update the plan together, without constant venue changes.</p></div></section>
    {flow && <Modal titleId="flow-title" onClose={() => setFlow(null)}><span className="eyebrow">LET’S GET EVERYONE TOGETHER</span><h2 id="flow-title">{flow === "create" ? "Start a new meetup" : "Join your group"}</h2><p className="muted">Add your preferences now. Choose your location on the map inside the room.</p>{flow === "join" && <label>Room code<input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, "").slice(0, 8))} placeholder="8-character code" maxLength={8} autoFocus /></label>}<ParticipantForm showLocation={false} onSave={async data => { if (flow === "join" && code.length !== 8) throw new Error("Enter an eight-character room code."); await enter(data); }} busy={busy} submitLabel={flow === "create" ? "Create my room" : "Join the meetup"} /></Modal>}
    <footer>Built for the journey, and the people at the end of it.<span>Rendezvous · a fair way to meet</span></footer>
  </main>;
}
