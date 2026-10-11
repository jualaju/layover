from dataclasses import dataclass, field
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Config:
    ors_key: str = field(default_factory=lambda: os.getenv("ORS_API_KEY", ""))
    ors_url: str = field(default_factory=lambda: os.getenv("ORS_BASE_URL", "https://api.openrouteservice.org"))
    overpass_url: str = field(default_factory=lambda: os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter"))
    nominatim_url: str = field(default_factory=lambda: os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org/search"))
    user_agent: str = field(default_factory=lambda: os.getenv("PROVIDER_USER_AGENT", "Rendezvous/0.1 (local hackathon prototype)"))
    origins: list[str] = field(default_factory=lambda: [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if origin.strip()])
    auth_db_path: str = field(default_factory=lambda: os.getenv("AUTH_DB_PATH", str(Path(__file__).resolve().parents[1] / "data" / "rendezvous.sqlite3")))
    auth_cookie_secure: bool = field(default_factory=lambda: os.getenv("AUTH_COOKIE_SECURE", "false").lower() in {"1", "true", "yes"})
    auth_cookie_samesite: str = field(default_factory=lambda: os.getenv("AUTH_COOKIE_SAMESITE", "lax").lower())
    room_ttl_seconds: int = 86400
    max_rooms: int = 200
    max_participants: int = 8
