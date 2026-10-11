import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ParticipantForm } from "@/components/participant-form";
import { SettingsForm } from "@/components/settings-form";
import { api, loadSession, saveSession } from "@/lib/api";
import { AuthControl } from "@/components/auth-control";

vi.mock("next/dynamic", () => ({ default: () => () => <div>Map placeholder in component test</div> }));

describe("participant setup", () => {
  it("submits validated preferences with explicit timestamps", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ParticipantForm showLocation={false} onSave={onSave} />);
    await userEvent.type(screen.getByLabelText("Your name"), "Alex");
    await userEvent.selectOptions(screen.getByLabelText("Getting there"), "cycling");
    await userEvent.type(screen.getByLabelText(/Max journey/), "45");
    await userEvent.click(screen.getByRole("button", { name: /Save my starting point/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Alex", mode: "cycling", max_journey_minutes: 45, location: null });
    expect(onSave.mock.calls[0][0].ready_at).toMatch(/Z$/);
  });
  it("shows API failures without losing the form", async () => {
    render(<ParticipantForm showLocation={false} onSave={async () => { throw new Error("Room not found"); }} />);
    await userEvent.type(screen.getByLabelText("Your name"), "Alex");
    await userEvent.click(screen.getByRole("button", { name: /Save my starting point/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Room not found");
    expect(screen.getByLabelText("Your name")).toHaveValue("Alex");
  });
});

it("host settings preserve thresholds and strict metadata flag", async () => {
  const onSave = vi.fn();
  render(<SettingsForm busy={false} onSave={onSave} settings={{ target_arrival: "2030-01-01T12:00:00Z", buffer_minutes: 5, fairness_weight: 0, switch_absolute_minutes: 3, switch_relative: .1, require_known_metadata: false }} />);
  await userEvent.click(screen.getByLabelText(/Require verified/));
  await userEvent.click(screen.getByRole("button", { name: /Save group settings/ }));
  expect(onSave.mock.calls[0][0]).toMatchObject({ switch_relative: .1, require_known_metadata: true });
});

it("persists per-room identity and sends bearer authorization", async () => {
  saveSession("A", { participant_id: "p", token: "test-token" });
  expect(loadSession("A")?.participant_id).toBe("p");
  expect(loadSession("B")).toBeNull();
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) });
  vi.stubGlobal("fetch", fetcher);
  await api("/rooms/A", "test-token");
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer test-token");
  vi.unstubAllGlobals();
});

it("keeps the app usable and explains how to configure an absent Supabase login", async () => {
  render(<AuthControl />);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Supabase login is not configured");
});
