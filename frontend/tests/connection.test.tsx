import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRoom } from "@/lib/use-room";
import type { Room } from "@/lib/types";

class Socket {
  static OPEN = 1;
  static all: Socket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) { Socket.all.push(this); }
  emit(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
}
afterEach(() => { vi.unstubAllGlobals(); Socket.all = []; });
const session = { token: "test-token", participant_id: "p" };
const state = (version: number) => ({ code: "ABCDEF12", version, participants: [], rankings: [] } as unknown as Room);

it("authenticates sockets, keeps newer snapshots, and isolates room messages", async () => {
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => state(0) }));
  const { result, unmount } = renderHook(() => useRoom("ABCDEF12", session));
  await waitFor(() => expect(result.current.room?.version).toBe(0));
  const socket = Socket.all[0];
  act(() => socket.onopen?.());
  expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "auth", token: session.token }));
  expect(socket.url).not.toContain(session.token);
  act(() => socket.emit({ type: "delay.updated", room: state(2) }));
  act(() => socket.emit({ type: "room.state", room: state(1) }));
  expect(result.current.room?.version).toBe(2);
  expect(result.current.status).toBe("Live");
  act(() => socket.emit({ type: "room.state", room: { ...state(9), code: "OTHER" } }));
  expect(result.current.room?.version).toBe(2);
  expect(result.current.error).toMatch(/invalid server message/);
  unmount();
  expect(socket.close).toHaveBeenCalled();
});

it("rejects disconnected writes and stops reconnecting after authorization denial", async () => {
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => state(0) }));
  const { result } = renderHook(() => useRoom("ABCDEF12", session));
  await waitFor(() => expect(result.current.room).not.toBeNull());
  act(() => { expect(result.current.send({ type: "delay.update", minutes: 4 })).toBe(false); });
  act(() => Socket.all[0].onclose?.({ code: 1008 }));
  expect(result.current.status).toBe("Access denied");
  expect(result.current.error).toMatch(/Room expired/);
});

it("accepts a new room with a lower version without exposing the previous room", async () => {
  vi.stubGlobal("WebSocket", Socket);
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => state(8) }).mockResolvedValueOnce({ ok: true, json: async () => ({ ...state(0), code: "FEDCBA12" }) });
  vi.stubGlobal("fetch", fetcher);
  const { result, rerender } = renderHook(({ code }) => useRoom(code, session), { initialProps: { code: "ABCDEF12" } });
  await waitFor(() => expect(result.current.room?.version).toBe(8));
  rerender({ code: "FEDCBA12" });
  expect(result.current.room).toBeNull();
  await waitFor(() => expect(result.current.room?.code).toBe("FEDCBA12"));
  expect(result.current.room?.version).toBe(0);
});
