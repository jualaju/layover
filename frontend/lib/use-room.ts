"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiUrl } from "./api";
import type { ClientEvent, Room, ServerEvent, Session } from "./types";

export function useRoom(code: string, session: Session | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState("Connecting");
  const [error, setError] = useState("");
  const socket = useRef<WebSocket | null>(null);
  const accept = useCallback((state: Room) => setRoom(old => !old || old.code !== state.code || state.version >= old.version ? state : old), []);
  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    let current: WebSocket;
    function connect() {
      if (stopped || !session) return;
      setStatus(attempts ? "Reconnecting" : "Connecting");
      current = new WebSocket(`${apiUrl().replace(/^http/, "ws")}/ws/rooms/${code}`);
      socket.current = current;
      current.onopen = () => { if (!stopped) current.send(JSON.stringify({ type: "auth", token: session.token })); };
      current.onmessage = event => {
        if (stopped) return;
        try {
          const data: ServerEvent = JSON.parse(event.data);
          if (data.type === "error" && typeof data.message === "string") setError(data.message);
          else if (["room.state", "participant.updated", "delay.updated", "recommendation.updated"].includes(data.type) && "room" in data && data.room?.code === code && typeof data.room.version === "number") {
            accept(data.room); setStatus("Live"); attempts = 0;
          } else setError("Received an invalid server message");
        } catch { setError("Received an invalid server message"); }
      };
      current.onerror = () => { if (!stopped) setStatus("Connection interrupted"); };
      current.onclose = event => {
        if (stopped) return;
        if (event.code === 1008) { setStatus("Access denied"); setError("Room expired, token invalid, or frontend origin is not allowed. Rejoin or check backend ALLOWED_ORIGINS."); return; }
        setStatus("Reconnecting");
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 15000));
      };
    }
    api<Room>(`/rooms/${code}`, session.token).then(state => { if (!stopped) accept(state); }).catch(err => { if (!stopped) setError(err.message); });
    connect();
    return () => { stopped = true; clearTimeout(timer); current?.close(); socket.current = null; };
  }, [code, session, accept]);
  const send = useCallback((event: ClientEvent) => {
    if (socket.current?.readyState !== WebSocket.OPEN || status !== "Live") { setError("Wait for the live connection before updating."); return false; }
    socket.current.send(JSON.stringify(event)); return true;
  }, [status]);
  return { room: session && room?.code === code ? room : null, accept, status, error, setError, send };
}
