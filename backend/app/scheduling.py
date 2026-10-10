"""Pure scheduling, with a clock supplied by callers for deterministic tests."""
from datetime import datetime, timedelta

from .models import Participant, Settings


def schedule(participants: list[Participant], durations: dict[str, float], settings: Settings, now: datetime) -> list[dict]:
    journeys = []
    for p in participants:
        duration = durations[p.id]
        depart = settings.target_arrival - timedelta(minutes=duration + settings.buffer_minutes)
        ready = max(now, p.ready_at + timedelta(minutes=p.delay_minutes))
        earliest_arrival = ready + timedelta(minutes=duration + settings.buffer_minutes)
        reasons = []
        if ready > depart:
            reasons.append("Cannot reach target after readiness and safety buffer")
        if p.available_until and settings.target_arrival > p.available_until:
            reasons.append("Target is outside participant availability")
        journeys.append({
            "participant_id": p.id, "name": p.name, "minutes": duration,
            "depart_at": depart.isoformat(), "ready_at": ready.isoformat(),
            "earliest_arrival": earliest_arrival.isoformat(),
            "feasible": not reasons, "reasons": reasons,
        })
    return journeys
