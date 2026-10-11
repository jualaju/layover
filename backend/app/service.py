import secrets

from .models import utcnow
from .optimization import evaluate, switching_decision
from .providers import ProviderError, Providers
from .store import Room


def recalculate(room: Room):
    room.proposal = None
    if not room.matrix or room.routing_status != "ready":
        room.rankings = []
        return
    room.rankings = evaluate(list(room.participants.values()), room.venues, room.matrix, room.settings, utcnow())
    candidate, reason = switching_decision(room.rankings, room.selected_id, room.settings)
    if room.selected_id is None:
        room.selected_id = candidate
        room.message = "Initial recommendation minimizes the selected scoring objective." if candidate else reason
    elif candidate and candidate != room.selected_id:
        room.proposal = {"id": secrets.token_hex(8), "venue_id": candidate, "reason": reason, "votes": []}
        room.message = "A better meeting point is proposed. Every participant must confirm the switch."
    else:
        room.message = reason or "Current meeting point remains the best eligible candidate."


def invalidate(room: Room):
    room.matrix = {}
    room.rankings = []
    room.proposal = None
    room.routing_status = "stale"
    room.route_source = None
    room.routed_at = None
    room.message = "Group or locations changed. Host: calculate routes again."


async def route_room(room: Room, providers: Providers, discover=False):
    participants = list(room.participants.values())
    if not participants or any(p.location is None for p in participants):
        raise ProviderError("Every participant needs a starting location before discovery or routing.")
    room.rankings = []
    room.proposal = None
    room.routing_status = "loading"
    room.message = "Discovering venues and calculating real routes…"
    await room.broadcast("recommendation.updated")
    try:
        if discover:
            discovered = await providers.discover([p.location for p in participants])
            # Keep the agreed destination available until a switch is approved.
            selected = next((v for v in room.venues if v.id == room.selected_id), None)
            if selected and all(v.id != selected.id for v in discovered):
                discovered = discovered[:9] + [selected]
            room.venues = discovered
        if not room.venues:
            raise ProviderError("No candidate venues found within 4 km of the group center. Try nearby starting locations.")
        matrix = await providers.matrix(participants, room.venues)
        room.matrix = matrix
        room.routed_at = utcnow().isoformat()
        room.route_source = providers.source
        room.routing_status = "ready"
        recalculate(room)
    except ProviderError as exc:
        room.matrix = {}
        room.rankings = []
        room.proposal = None
        room.routing_status = "error"
        room.route_source = None
        room.routed_at = None
        room.message = str(exc)
        raise
    finally:
        await room.broadcast("recommendation.updated")
