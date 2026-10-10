from dataclasses import dataclass, field
import os

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    ors_key: str = field(default_factory=lambda: os.getenv("ORS_API_KEY", ""))
    ors_url: str = field(default_factory=lambda: os.getenv("ORS_BASE_URL", "https://api.openrouteservice.org"))
    overpass_url: str = field(default_factory=lambda: os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter"))
    user_agent: str = field(default_factory=lambda: os.getenv("PROVIDER_USER_AGENT", "Rendezvous/0.1 (local hackathon prototype)"))
    origins: list[str] = field(default_factory=lambda: [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()])
    room_ttl_seconds: int = 86400
    max_rooms: int = 200
    max_participants: int = 8
