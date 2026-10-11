import asyncio
from dataclasses import dataclass, field
from datetime import datetime
import secrets

from fastapi import HTTPException, WebSocket

from .config import Config
from .models import Participant, Settings, Venue, utcnow
from .optimization import Matrix


@dataclass
class Room:
    code: str
    host_id: str
    settings: Settings
    created_at: datetime = field(default_factory=utcnow)
    participants: dict[str, Participant] = field(default_factory=dict)
    tokens: dict[str, str] = field(default_factory=dict)
    venues: list[Venue] = field(default_factory=list)
    matrix: Matrix = field(default_factory=dict)
    rankings: list[dict] = field(default_factory=list)
    selected_id: str | None = None
    proposal: dict | None = None
    message: str = "Invite your group and set starting locations."
    routing_status: str = "not_requested"
    routed_at: str | None = None
    route_source: str | None = None
    version: int = 0
    sockets: set[WebSocket] = field(default_factory=set)
    socket_participants: dict[WebSocket, str] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def snapshot(self):
        return {"code": self.code, "host_id": self.host_id, "version": self.version,
                "settings": self.settings.model_dump(mode="json"),
                "participants": [p.model_dump(mode="json") for p in self.participants.values()],
                "venues": [v.model_dump(mode="json") for v in self.venues],
                "rankings": self.rankings, "selected_id": self.selected_id,
                "proposal": self.proposal, "message": self.message,
                "routing_status": self.routing_status, "routed_at": self.routed_at, "route_source": self.route_source}

    def authorize(self, token: str, host=False) -> Participant:
        pid = self.tokens.get(token)
        if pid is None or pid not in self.participants:
            raise HTTPException(401, "Invalid participant token")
        if host and pid != self.host_id:
            raise HTTPException(403, "Only the room host can perform this action")
        return self.participants[pid]

    async def broadcast(self, event="room.state"):
        self.version += 1
        payload = {"type": event, "room": self.snapshot()}
        # Slow/broken clients cannot block a room indefinitely.
        async def send(socket):
            try:
                await asyncio.wait_for(socket.send_json(payload), timeout=2)
            except Exception:
                self.sockets.discard(socket)
                self.socket_participants.pop(socket, None)
        await asyncio.gather(*(send(s) for s in tuple(self.sockets)))


class Store:
    def __init__(self, config: Config):
        self.config = config
        self.rooms: dict[str, Room] = {}

    def prune(self):
        expired = [code for code, r in self.rooms.items() if (utcnow() - r.created_at).total_seconds() > self.config.room_ttl_seconds]
        for code in expired:
            room = self.rooms.pop(code)
            for socket in tuple(room.sockets):
                asyncio.create_task(socket.close(code=1008, reason="Room expired"))

    def get(self, code: str) -> Room:
        self.prune()
        room = self.rooms.get(code.upper())
        if room is None:
            raise HTTPException(404, "Room not found or expired")
        return room

    def create(self, settings: Settings, participant: Participant) -> Room:
        self.prune()
        if len(self.rooms) >= self.config.max_rooms:
            raise HTTPException(503, "Room capacity reached; retry later")
        code = secrets.token_hex(4).upper()
        while code in self.rooms:
            code = secrets.token_hex(4).upper()
        room = Room(code=code, host_id=participant.id, settings=settings)
        self.rooms[code] = room
        return room
