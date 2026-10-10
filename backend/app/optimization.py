"""No network or store access: minimax, eligibility, fairness and hysteresis."""
from datetime import datetime
import math

from .models import Participant, Settings, Venue
from .scheduling import schedule

Matrix = dict[str, dict[str, float | None]]


def evaluate(participants: list[Participant], venues: list[Venue], matrix: Matrix, settings: Settings, now: datetime) -> list[dict]:
    results = []
    for v in venues:
        reasons, unknowns = [], []
        if v.price_level is None:
            unknowns.append("Price")
        elif any(v.price_level > p.price_preference for p in participants):
            reasons.append("Above a participant's price preference")
        if v.capacity is None:
            unknowns.append("Group capacity")
        elif v.capacity < len(participants):
            reasons.append("Too small for this group")
        if v.known_open is None:
            unknowns.append("Opening at target time")
        elif not v.known_open:
            reasons.append("Known closed")
        if settings.require_known_metadata and unknowns:
            reasons.append("Strict verification requires known price, capacity and opening status")
        times = {p.id: matrix.get(p.id, {}).get(v.id) for p in participants}
        complete = bool(participants) and all(t is not None and math.isfinite(t) and t >= 0 for t in times.values())
        if not complete:
            reasons.append("At least one route is unavailable")
        valid = {pid: float(t) for pid, t in times.items() if t is not None}
        journeys = schedule(participants, valid, settings, now) if complete else []
        for p in participants:
            t = times[p.id]
            if t is not None and p.max_journey_minutes is not None and t > p.max_journey_minutes:
                reasons.append(f"Exceeds {p.name}'s maximum journey")
        if journeys and not all(j["feasible"] for j in journeys):
            reasons.append("Target arrival schedule is infeasible")
        values = list(valid.values())
        worst = max(values) if complete else None
        total = sum(values) if complete else None
        imbalance = max(values) - min(values) if complete else None
        penalty = settings.fairness_weight * imbalance if complete else None
        results.append({"venue": v.model_dump(mode="json"), "eligible": not reasons,
                        "reasons": reasons, "unknowns": unknowns, "journeys": journeys,
                        "worst_minutes": worst, "total_minutes": total,
                        "average_minutes": total / len(values) if complete else None,
                        "imbalance_minutes": imbalance, "fairness_penalty": penalty,
                        "score": worst + penalty if complete else None,
                        "baseline_rank": None, "adjusted_rank": None,
                        "explanation": "Score = longest journey + fairness weight × (longest − shortest). Delays affect feasibility, not route duration."})
    eligible = [r for r in results if r["eligible"]]
    for index, r in enumerate(sorted(eligible, key=lambda r: (r["worst_minutes"], r["total_minutes"], r["venue"]["id"]))):
        r["baseline_rank"] = index + 1
    for index, r in enumerate(sorted(eligible, key=lambda r: (r["score"], r["worst_minutes"], r["total_minutes"], r["venue"]["id"]))):
        r["adjusted_rank"] = index + 1
    return sorted(results, key=lambda r: (not r["eligible"], r["adjusted_rank"] or 999, r["venue"]["id"]))


def switching_decision(ranked: list[dict], current_id: str | None, settings: Settings) -> tuple[str | None, str | None]:
    best = next((r for r in ranked if r["eligible"]), None)
    if best is None:
        return None, "No eligible venue; adjust arrival time or constraints"
    if current_id is None or best["venue"]["id"] == current_id:
        return best["venue"]["id"], None
    current = next((r for r in ranked if r["venue"]["id"] == current_id), None)
    if current is None or not current["eligible"]:
        return best["venue"]["id"], "Current venue is unavailable or infeasible"
    improvement = current["score"] - best["score"]
    threshold = max(settings.switch_absolute_minutes, current["score"] * settings.switch_relative)
    if improvement > threshold:
        return best["venue"]["id"], f"Score improves by {improvement:.1f} min, exceeding the {threshold:.1f} min switching threshold"
    return current_id, f"Keeping current venue: improvement {improvement:.1f} min does not exceed {threshold:.1f} min threshold"
