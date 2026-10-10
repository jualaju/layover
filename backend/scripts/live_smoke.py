"""Opt-in real provider check. Never run as part of the automated suite."""
import asyncio
from datetime import timedelta
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import httpx
from app.config import Config
from app.models import Location, Participant, utcnow
from app.providers import Providers

async def main():
    config = Config()
    participants = [Participant(id=str(i), name=f'Smoke {mode}', location=Location(lat=12.9716 + i * .005, lng=77.5946 + i * .005), mode=mode, ready_at=utcnow()) for i, mode in enumerate(['walking', 'cycling', 'driving'])]
    async with httpx.AsyncClient(timeout=30) as client:
        provider = Providers(config, client)
        venues = await provider.discover([p.location for p in participants])
        print(f'Live Overpass: {len(venues)} actual candidate venues')
        for venue in venues:
            print(venue.id, venue.name)
        if not config.ors_key:
            print('Live ORS: SKIPPED — ORS_API_KEY is not configured')
            return
        if venues:
            matrix = await provider.matrix(participants, venues)
            print(f'Live ORS: {sum(t is not None for row in matrix.values() for t in row.values())} available routes across walking/cycling/driving')

if __name__ == '__main__':
    asyncio.run(main())
