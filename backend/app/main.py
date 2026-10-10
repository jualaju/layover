import asyncio
from collections import defaultdict, deque
from contextlib import asynccontextmanager
import secrets
import time

from fastapi import Depends, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import httpx
from pydantic import TypeAdapter, ValidationError
from starlette.responses import JSONResponse

from .config import Config
from .models import ClientEvent, CreateRoom, DelayEvent, Participant, ParticipantInput, Settings, UpdateEvent, utcnow
from .optimization import evaluate
from .providers import ProviderError, Providers
from .service import invalidate, recalculate, route_room
from .store import Store

bearer = HTTPBearer(auto_error=False)
events = TypeAdapter(ClientEvent)


def token(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if credentials is None:
        raise HTTPException(401, 'Participant token required')
    return credentials.credentials


def create_app(config: Config | None = None, providers: Providers | None = None) -> FastAPI:
    config = config or Config()
    store = Store(config)
    owned_client = httpx.AsyncClient(timeout=30)
    provider = providers or Providers(config, owned_client)

    @asynccontextmanager
    async def lifespan(app):
        yield
        await owned_client.aclose()

    app = FastAPI(title='Rendezvous API', lifespan=lifespan)
    app.state.store = store
    app.state.providers = provider
    app.add_middleware(CORSMiddleware, allow_origins=config.origins, allow_credentials=False,
                       allow_methods=['GET', 'POST', 'PUT'], allow_headers=['Authorization', 'Content-Type'])
    requests: dict[str, deque] = defaultdict(deque)

    @app.middleware('http')
    async def request_limits(request: Request, call_next):
        try:
            too_large = int(request.headers.get('content-length', '0')) > 16384
        except ValueError:
            return JSONResponse({'detail': 'Invalid content length'}, status_code=400)
        if too_large:
            return JSONResponse({'detail': 'Request too large'}, status_code=413)
        if request.method != 'OPTIONS' and request.url.path != '/health':
            ip = request.client.host if request.client else 'unknown'
            now = time.monotonic()
            bucket = requests[ip]
            while bucket and bucket[0] < now - 60:
                bucket.popleft()
            if len(bucket) >= 100:
                return JSONResponse({'detail': 'Too many requests; retry in a minute'}, status_code=429)
            bucket.append(now)
            if len(requests) > 1000:
                for key in list(requests):
                    if requests[key] and requests[key][-1] < now - 60:
                        del requests[key]
        return await call_next(request)

    @app.get('/health')
    def health():
        return {'status': 'ok', 'routing_configured': bool(config.ors_key), 'storage': 'in-memory', 'modes': ['walking', 'cycling', 'driving']}

    def add_participant(room, data):
        if len(room.participants) >= config.max_participants:
            raise HTTPException(409, 'Room is full (maximum eight participants)')
        p = Participant(**data.model_dump(), id=secrets.token_hex(8))
        secret = secrets.token_urlsafe(32)
        room.participants[p.id] = p
        room.tokens[secret] = p.id
        return p, secret

    @app.post('/rooms', status_code=201)
    async def create_room(data: CreateRoom):
        host = Participant(**data.participant.model_dump(), id=secrets.token_hex(8))
        room = store.create(data.settings, host)
        secret = secrets.token_urlsafe(32)
        room.participants[host.id] = host
        room.tokens[secret] = host.id
        return {'room': room.snapshot(), 'participant_id': host.id, 'token': secret}

    @app.post('/rooms/{code}/join', status_code=201)
    async def join(code: str, data: ParticipantInput):
        room = store.get(code)
        async with room.lock:
            p, secret = add_participant(room, data)
            had_routes = bool(room.matrix)
            invalidate(room)
            if had_routes and all(p.location for p in room.participants.values()):
                try:
                    await route_room(room, provider)
                except ProviderError:
                    pass
            await room.broadcast('participant.updated')
            return {'room': room.snapshot(), 'participant_id': p.id, 'token': secret}

    @app.get('/rooms/{code}')
    async def get_room(code: str, secret: str = Depends(token)):
        room = store.get(code)
        async with room.lock:
            room.authorize(secret)
            return room.snapshot()

    async def update_participant(room, p, data):
        route_change = p.location != data.location or p.mode != data.mode
        had_routes = bool(room.matrix)
        room.participants[p.id] = Participant(**data.model_dump(), id=p.id, delay_minutes=p.delay_minutes)
        if route_change:
            invalidate(room)
            if had_routes and all(p.location for p in room.participants.values()):
                try:
                    await route_room(room, provider)
                except ProviderError:
                    pass
        else:
            recalculate(room)
        await room.broadcast('participant.updated')

    @app.put('/rooms/{code}/participant')
    async def update(code: str, data: ParticipantInput, secret: str = Depends(token)):
        room = store.get(code)
        async with room.lock:
            p = room.authorize(secret)
            await update_participant(room, p, data)
            return room.snapshot()

    @app.put('/rooms/{code}/settings')
    async def settings(code: str, data: Settings, secret: str = Depends(token)):
        room = store.get(code)
        async with room.lock:
            room.authorize(secret, host=True)
            room.settings = data
            recalculate(room)
            await room.broadcast('recommendation.updated')
            return room.snapshot()

    @app.get('/rooms/{code}/places')
    async def places(code: str, q: str = Query(min_length=3, max_length=160), secret: str = Depends(token)):
        store.get(code).authorize(secret)
        try:
            return await provider.search(q)
        except ProviderError as exc:
            raise HTTPException(502, str(exc)) from exc

    @app.post('/rooms/{code}/calculate')
    async def calculate(code: str, discover: bool = False, secret: str = Depends(token)):
        room = store.get(code)
        async with room.lock:
            room.authorize(secret, host=True)
            try:
                await route_room(room, provider, discover=discover)
            except ProviderError as exc:
                raise HTTPException(502, str(exc)) from exc
            return room.snapshot()

    @app.websocket('/ws/rooms/{code}')
    async def websocket(ws: WebSocket, code: str):
        if ws.headers.get('origin') not in config.origins:
            await ws.close(code=1008)
            return
        await ws.accept()
        room = None
        try:
            auth = await asyncio.wait_for(ws.receive_json(), timeout=10)
            if not isinstance(auth, dict) or set(auth) != {'type', 'token'} or auth['type'] != 'auth' or not isinstance(auth['token'], str):
                await ws.close(code=1008)
                return
            secret = auth['token']
            room = store.get(code)
            async with room.lock:
                room.authorize(secret)
                if len(room.sockets) >= 24:
                    await ws.close(code=1013)
                    return
                room.sockets.add(ws)
                await ws.send_json({'type': 'room.state', 'room': room.snapshot()})
            recent = deque()
            while True:
                raw = await ws.receive_text()
                if len(raw) > 8192:
                    await ws.close(code=1009)
                    break
                now = time.monotonic()
                while recent and recent[0] < now-10:
                    recent.popleft()
                if len(recent) >= 30:
                    await ws.send_json({'type': 'error', 'message': 'Too many events; slow down'})
                    continue
                recent.append(now)
                try:
                    event = events.validate_json(raw)
                except ValidationError:
                    await ws.send_json({'type': 'error', 'message': 'Invalid event payload'})
                    continue
                async with room.lock:
                    store.get(code)
                    p = room.authorize(secret)
                    if isinstance(event, DelayEvent):
                        p.delay_minutes = event.minutes
                        recalculate(room)
                        await room.broadcast('delay.updated')
                    elif isinstance(event, UpdateEvent):
                        await update_participant(room, p, event.participant)
                    else:
                        proposal = room.proposal
                        if not proposal or proposal['id'] != event.proposal_id:
                            await ws.send_json({'type': 'error', 'message': 'Proposal expired; review the latest room state'})
                            continue
                        if not event.approve:
                            room.proposal = None
                            room.message = f'{p.name} declined the switch. Current venue retained.'
                        else:
                            if p.id not in proposal['votes']:
                                proposal['votes'].append(p.id)
                            if set(proposal['votes']) == set(room.participants):
                                fresh = evaluate(list(room.participants.values()), room.venues, room.matrix, room.settings, utcnow())
                                room.rankings = fresh
                                chosen = next((r for r in fresh if r['venue']['id'] == proposal['venue_id'] and r['eligible']), None)
                                if chosen:
                                    room.selected_id = proposal['venue_id']
                                    room.message = 'Everyone approved the new meeting point.'
                                    room.proposal = None
                                else:
                                    recalculate(room)
                        await room.broadcast('recommendation.updated')
        except (WebSocketDisconnect, asyncio.TimeoutError):
            pass
        except (HTTPException, ValueError, TypeError):
            try:
                await ws.close(code=1008)
            except RuntimeError:
                pass
        finally:
            if room:
                room.sockets.discard(ws)

    return app


app = create_app()
