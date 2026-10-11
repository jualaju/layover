"""Bounded, cached real provider calls. External errors never become fake routes."""
import asyncio
import math
import time

import httpx
from pydantic import ValidationError

from .config import Config
from .models import Location, Participant, Venue
from .optimization import Matrix


class ProviderError(Exception):
    pass


PROFILES = {"walking": "foot-walking", "cycling": "cycling-regular", "driving": "driving-car"}


def parse_durations(data: dict, rows: int, columns: int) -> list[list[float | None]]:
    durations = data.get("durations")
    if not isinstance(durations, list) or len(durations) != rows:
        raise ProviderError("Routing returned an invalid matrix shape")
    parsed = []
    for row in durations:
        if not isinstance(row, list) or len(row) != columns:
            raise ProviderError("Routing returned an invalid matrix shape")
        out = []
        for value in row:
            if value is None:
                out.append(None)
            elif isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0:
                out.append(value / 60)
            else:
                raise ProviderError("Routing returned an invalid duration")
        parsed.append(out)
    return parsed


class Providers:
    source = "OpenRouteService"

    def __init__(self, config: Config, client: httpx.AsyncClient):
        self.config, self.client = config, client
        self.cache: dict[tuple, tuple[float, object]] = {}
        self.lock = asyncio.Lock()
        self.last_request = 0.0

    async def request(self, method: str, url: str, **kwargs) -> dict:
        # One process-wide provider call at a time, >= 2 seconds apart.
        async with self.lock:
            await asyncio.sleep(max(0, 2 - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                headers = {"User-Agent": self.config.user_agent, **kwargs.pop("headers", {})}
                response = await self.client.request(method, url, headers=headers, **kwargs)
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, dict):
                    raise ValueError("Expected object")
                return data
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                raise ProviderError(f"Provider returned HTTP {status}. Check credentials/quota or try again later.") from exc
            except (httpx.RequestError, ValueError) as exc:
                raise ProviderError("Provider unavailable or returned malformed data. Please retry later.") from exc

    def key_required(self):
        if not self.config.ors_key:
            raise ProviderError("ORS_API_KEY is not configured on the backend. Map selection works; routing and place search require a key.")

    def cached(self, key: tuple):
        entry = self.cache.get(key)
        return entry[1] if entry and entry[0] > time.monotonic() else None

    def put(self, key: tuple, value, ttl=300):
        if len(self.cache) >= 500:
            self.cache.clear()
        self.cache[key] = (time.monotonic() + ttl, value)

    async def search(self, query: str) -> list[dict]:
        key = ("search", query.casefold())
        cached = self.cached(key)
        if cached is not None:
            return cached
        # Public Nominatim supports low-volume address lookup without an API key.
        # Keep it behind the backend, identify the app, cache results, and share
        # the provider lock/rate limit with other external requests.
        async with self.lock:
            await asyncio.sleep(max(0, 2 - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                response = await self.client.get(
                    self.config.nominatim_url,
                    params={"q": query, "format": "jsonv2", "limit": 5},
                    headers={"User-Agent": self.config.user_agent},
                )
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPStatusError as exc:
                raise ProviderError(f"Location search returned HTTP {exc.response.status_code}. Please retry later.") from exc
            except (httpx.RequestError, ValueError) as exc:
                raise ProviderError("Location search is unavailable or returned malformed data. Please retry later.") from exc
        try:
            if not isinstance(data, list):
                raise TypeError("Expected a list")
            results = [Location(lat=float(item["lat"]), lng=float(item["lon"]), label=item["display_name"][:200]).model_dump() for item in data[:5]]
        except (KeyError, TypeError, ValueError, IndexError, ValidationError) as exc:
            raise ProviderError("Place search returned malformed data") from exc
        self.put(key, results, 3600)
        return results

    async def discover(self, locations: list[Location]) -> list[Venue]:
        lat = sum(p.lat for p in locations) / len(locations)
        lng = sum(p.lng for p in locations) / len(locations)
        key = ("venues", round(lat, 3), round(lng, 3))
        cached = self.cached(key)
        if cached is not None:
            return cached
        # "body" includes node coordinates; "tags" alone would omit them.
        query = f'[out:json][timeout:20];nwr["amenity"~"^(cafe|restaurant)$"]["name"](around:4000,{lat:.6f},{lng:.6f});out body center 100;'
        data = await self.request("POST", self.config.overpass_url, data={"data": query})
        if "remark" in data or not isinstance(data.get("elements"), list):
            raise ProviderError("Venue discovery did not complete. Please retry later.")
        venues = []
        for e in data["elements"]:
            try:
                tags = e["tags"]
                pos = e.get("center", e)
                if not isinstance(tags, dict) or not isinstance(pos, dict):
                    continue
                hours = tags.get("opening_hours")
                capacity = tags.get("capacity")
                venue = Venue(id=f'{e["type"]}/{e["id"]}', name=tags["name"],
                              location=Location(lat=pos["lat"], lng=pos["lon"], label=tags["name"]),
                              category=tags.get("amenity", "cafe"),
                              capacity=int(capacity) if isinstance(capacity, str) and capacity.isdigit() else None,
                              opening_hours=hours, known_open=True if hours == "24/7" else None)
                venues.append(venue)
            except (KeyError, TypeError, ValueError, ValidationError):
                continue
        venues.sort(key=lambda v: ((v.location.lat-lat)**2 + ((v.location.lng-lng)*math.cos(math.radians(lat)))**2, v.id))
        venues = list({v.id: v for v in venues}.values())[:10]
        self.put(key, venues, 1800)
        return venues

    async def matrix(self, participants: list[Participant], venues: list[Venue]) -> Matrix:
        self.key_required()
        matrix: Matrix = {p.id: {} for p in participants}
        for mode, profile in PROFILES.items():
            group = [p for p in participants if p.mode == mode]
            if not group:
                continue
            locations = [[p.location.lng, p.location.lat] for p in group] + [[v.location.lng, v.location.lat] for v in venues]
            key = ("matrix", profile, tuple(tuple(x) for x in locations), len(group))
            durations = self.cached(key)
            if durations is None:
                data = await self.request("POST", f"{self.config.ors_url}/v2/matrix/{profile}",
                                          json={"locations": locations, "sources": [str(i) for i in range(len(group))],
                                                "destinations": [str(i) for i in range(len(group), len(locations))], "metrics": ["duration"]},
                                          # ORS matrix accepts the key in Authorization, never the browser.
                                          headers={"Authorization": self.config.ors_key})
                durations = parse_durations(data, len(group), len(venues))
                self.put(key, durations)
            for p, row in zip(group, durations):
                matrix[p.id] = {v.id: t for v, t in zip(venues, row)}
        return matrix
