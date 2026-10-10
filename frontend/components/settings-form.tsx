"use client";
import { FormEvent } from "react";
import { localInput } from "@/lib/api";
import type { Settings } from "@/lib/types";
export function SettingsForm({ settings, onSave, busy }: { settings: Settings; onSave: (settings: Settings) => void; busy: boolean }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({ ...settings, target_arrival: new Date(String(data.get("arrival"))).toISOString(), buffer_minutes: Number(data.get("buffer")), fairness_weight: Number(data.get("fairness")), switch_absolute_minutes: Number(data.get("absolute")), switch_relative: Number(data.get("relative")) / 100, require_known_metadata: data.get("strict") === "on" });
  }
  return <form onSubmit={submit} className="participant-form">
    <label>Target arrival<input name="arrival" type="datetime-local" required defaultValue={localInput(settings.target_arrival)} /></label>
    <div className="form-row"><label>Safety buffer (min)<input name="buffer" type="number" min={0} max={30} defaultValue={settings.buffer_minutes} required /></label><label>Fairness weight<input name="fairness" type="number" min={0} max={2} step={.1} defaultValue={settings.fairness_weight} required /></label></div>
    <p className="fine-print">0 = pure minimax. A positive weight adds a penalty for unequal journeys and may select a longer worst journey.</p>
    <div className="form-row"><label>Switch threshold (min)<input name="absolute" type="number" min={0} max={60} step={.5} defaultValue={settings.switch_absolute_minutes} required /></label><label>Switch threshold (%)<input name="relative" type="number" min={0} max={100} defaultValue={settings.switch_relative * 100} required /></label></div>
    <label className="checkbox-label"><input name="strict" type="checkbox" defaultChecked={settings.require_known_metadata} />Require verified price, capacity & opening</label>
    <p className="fine-print">Most OSM venues have unknown metadata. Strict verification can exclude every candidate.</p>
    <button className="button" disabled={busy}>Save group settings</button>
  </form>;
}
