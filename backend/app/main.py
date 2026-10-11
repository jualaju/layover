import asyncio
from collections import defaultdict, deque
from contextlib import asynccontextmanager
import secrets
import sqlite3
import time

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import httpx
from pydantic import TypeAdapter, ValidationError
from starlette.responses import JSONResponse

from .config import Config
from .auth_store import AuthStore
from .models import AuthCredentials, ClientEvent, CreateRoom, DelayEvent, Participant, ParticipantInput, Settings, UpdateEvent, utcnow
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
        async def expire_rooms():
            while True:
                await asyncio.sleep(30)
                store.prune()
        cleanup = asyncio.create_task(expire_rooms())
        try:
            yield
        finally:
            cleanup.cancel()
            await asyncio.gather(cleanup, return_exceptions=True)
            await owned_client.aclose()

    app = FastAPI(title='Rendezvous API', lifespan=lifespan)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # Do not echo submitted values (especially passwords) in validation responses.
        details = [{key: error[key] for key in ('loc', 'msg', 'type') if key in error} for error in exc.errors()]
        return JSONResponse({'detail': details}, status_code=422)

    app.state.store = store
    auth_store = AuthStore(config.auth_db_path)
    app.state.auth_store = auth_store
    app.state.providers = provider
    app.add_middleware(CORSMiddleware, allow_origins=config.origins, allow_credentials=True,
                       allow_methods=['GET', 'POST', 'PUT'], allow_headers=['Authorization', 'Content-Type'])
    requests: dict[str, deque] = defaultdict(deque)
    auth_requests: dict[str, deque] = defaultdict(deque)

    def limit_auth(request: Request):
        ip = request.client.host if request.client else 'unknown'
        now = time.monotonic()
        bucket = auth_requests[ip]
        while bucket and bucket[0] < now - 60:
            bucket.popleft()
        if len(bucket) >= 10:
            raise HTTPException(429, 'Too many sign-in attempts; retry in a minute')
        bucket.append(now)
        for key in list(auth_requests):
            if auth_requests[key] and auth_requests[key][-1] < now - 60:
                del auth_requests[key]

    @app.middleware('http')
    async def request_limits(request: Request, call_next):
        try:
            too_large = int(request.headers.get('content-length', '0')) > 16384
        except ValueError:
            return JSONResponse({'detail': 'Invalid content length'}, status_code=400)
        if request.method == 'POST' and request.url.path.startswith('/auth/'):
            origin = request.headers.get('origin')
            if origin and origin not in config.origins:
                return JSONResponse({'detail': 'Origin not allowed'}, status_code=403)
            if request.url.path in {'/auth/login', '/auth/signup'}:
                try:
                    limit_auth(request)
                except HTTPException as exc:
                    return JSONResponse({'detail': exc.detail}, status_code=exc.status_code)
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
        # Enforce the limit on actual bytes, including chunked requests.
        body = bytearray()
        async for chunk in request.stream():
            if len(body) + len(chunk) > 16384:
                return JSONResponse({'detail': 'Request too large'}, status_code=413)
            body.extend(chunk)
        request._body = bytes(body)
        return await call_next(request)

    @app.get('/health')
    def health():
        return {'status': 'ok', 'routing_configured': bool(config.ors_key), 'storage': 'in-memory', 'modes': ['walking', 'cycling', 'driving']}

    def set_session_cookie(response: Response, token_value: str):
        response.set_cookie('rendezvous_session', token_value, max_age=auth_store.session_ttl_seconds,
                            httponly=True, secure=config.auth_cookie_secure, samesite=config.auth_cookie_samesite, path='/auth')

    @app.post('/auth/signup', status_code=201)
    def signup(data: AuthCredentials, request: Request, response: Response):
        if len(data.password) < 8:
            raise HTTPException(422, 'Password must be at least 8 characters')
        try:
            user = auth_store.create_user(data.email, data.password)
        except sqlite3.IntegrityError as exc:
            raise HTTPException(409, 'Unable to create an account with those details') from exc
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        set_session_cookie(response, auth_store.create_session(user['id']))
        return {'user': user}

    @app.post('/auth/login')
    def login(data: AuthCredentials, request: Request, response: Response):
        user = auth_store.authenticate(data.email, data.password)
        if not user:
            raise HTTPException(401, 'Invalid email or password')
        set_session_cookie(response, auth_store.create_session(user['id']))
        return {'user': user}

    @app.get('/auth/me')
    def current_user(request: Request):
        user = auth_store.get_user_for_session(request.cookies.get('rendezvous_session'))
        if not user:
            raise HTTPException(401, 'Sign in to continue')
        return {'user': user}

    @app.post('/auth/logout')
    def logout(request: Request, response: Response):
        auth_store.delete_session(request.cookies.get('rendezvous_session'))
        response.delete_cookie('rendezvous_session', httponly=True, secure=config.auth_cookie_secure,
                               samesite=config.auth_cookie_samesite, path='/auth')
        return {'ok': True}

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

    @app.post('/rooms/{code}/leave')
    async def leave(code: str, secret: str = Depends(token)):
        room = store.get(code)
        async with room.lock:
            participant = room.authorize(secret)
            del room.participants[participant.id]
            room.tokens = {key: pid for key, pid in room.tokens.items() if pid != participant.id}
            departing = [socket for socket, pid in room.socket_participants.items() if pid == participant.id]
            for socket in departing:
                room.sockets.discard(socket)
                room.socket_participants.pop(socket, None)
            if not room.participants:
                store.rooms.pop(room.code, None)
            else:
                if room.host_id == participant.id:
                    room.host_id = next(iter(room.participants))
                room.matrix.pop(participant.id, None)
                recalculate(room)
                await room.broadcast('participant.updated')
            for socket in departing:
                try:
                    await asyncio.wait_for(socket.close(code=1008, reason='Participant left room'), 2)
                except Exception:
                    pass
            return {'ok': True}

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
                participant = room.authorize(secret)
                if len(room.sockets) >= 24:
                    await ws.close(code=1013)
                    return
                room.sockets.add(ws)
                room.socket_participants[ws] = participant.id
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
                room.socket_participants.pop(ws, None)

    return app


app = create_app()
