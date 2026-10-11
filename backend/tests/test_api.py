from datetime import timedelta
from fastapi.testclient import TestClient
import pytest
from starlette.websockets import WebSocketDisconnect
from app.config import Config
from app.main import create_app
from app.models import Location, Venue, utcnow
from app.providers import ProviderError

class FakeProviders:
    """Synthetic routes exist ONLY in tests, never the running app."""
    source = "Synthetic test fixtures"
    calls = 0
    fail = False
    async def discover(self, locations):
        return [Venue(id='node/1', name='Test A', location=Location(lat=12, lng=77)), Venue(id='node/2', name='Test B', location=Location(lat=12.01, lng=77.01))]
    async def matrix(self, participants, venues):
        self.calls += 1
        if self.fail:
            raise ProviderError('Test routing outage')
        return {p.id: {'node/1': 30 if i == 0 else 10, 'node/2': 10 if i == 0 else 35} for i, p in enumerate(participants)}
    async def search(self, query):
        return []

@pytest.fixture
def harness(tmp_path):
    provider = FakeProviders()
    app = create_app(Config(ors_key='test', auth_db_path=str(tmp_path / 'auth.sqlite3')), provider)
    with TestClient(app) as client:
        yield client, app, provider

def participant(name='Alex', location=True):
    return {'name': name, 'location': {'lat': 12, 'lng': 77, 'label': 'Test location'} if location else None, 'ready_at': utcnow().isoformat(), 'mode': 'walking'}

def create(client):
    response = client.post('/rooms', json={'participant': participant(), 'settings': {'target_arrival': (utcnow()+timedelta(minutes=65)).isoformat()}})
    assert response.status_code == 201, response.text
    return response.json()

def headers(joined):
    return {'Authorization': 'Bearer '+joined['token']}

def websocket(client, code, origin='http://localhost:3000'):
    return client.websocket_connect('/ws/rooms/'+code, headers={'origin': origin})

def test_room_creation_join_isolation_auth(harness):
    client, _, _ = harness
    a, b = create(client), create(client)
    code = a['room']['code']
    joined = client.post(f'/rooms/{code.lower()}/join', json=participant('Sam')).json()
    assert len(joined['room']['participants']) == 2
    assert client.get(f'/rooms/{code}', headers=headers(a)).status_code == 200
    assert client.get(f'/rooms/{code}').status_code == 401
    assert client.get(f'/rooms/{code}', headers=headers(b)).status_code == 401
    assert len(client.get('/rooms/'+b['room']['code'], headers=headers(b)).json()['participants']) == 1
    assert client.put(f'/rooms/{code}/settings', json=a['room']['settings'], headers=headers(joined)).status_code == 403
    assert 'tokens' not in client.get(f'/rooms/{code}', headers=headers(a)).json()

def test_bad_rooms_requests_and_validation(harness):
    client, _, _ = harness
    assert client.post('/rooms/UNKNOWN/join', json=participant()).status_code == 404
    assert client.post('/rooms', json={}).status_code == 422
    invalid = participant(); invalid['location']['lat'] = 200
    assert client.post('/rooms', json={'participant': invalid, 'settings': {'target_arrival': utcnow().isoformat()}}).status_code == 422
    a = create(client)
    bad = participant(); bad['mode'] = 'metro'
    assert client.put('/rooms/'+a['room']['code']+'/participant', json=bad, headers=headers(a)).status_code == 422
    bad = participant(); bad['name'] = ' '
    assert client.post('/rooms/'+a['room']['code']+'/join', json=bad).status_code == 422

def test_capacity_and_expiry(harness):
    client, app, _ = harness
    a = create(client); code = a['room']['code']
    for _ in range(7):
        assert client.post(f'/rooms/{code}/join', json=participant()).status_code == 201
    assert client.post(f'/rooms/{code}/join', json=participant()).status_code == 409
    app.state.store.rooms[code].created_at = utcnow() - timedelta(days=2)
    assert client.get(f'/rooms/{code}', headers=headers(a)).status_code == 404

def test_calculation_failures_and_updates(harness):
    client, _, provider = harness
    a = create(client); code = a['room']['code']
    assert client.post(f'/rooms/{code}/calculate', headers=headers(a)).status_code == 502
    result = client.post(f'/rooms/{code}/calculate?discover=true', headers=headers(a)).json()
    assert result['routing_status'] == 'ready'
    assert result['selected_id'] == 'node/2'
    data = participant(); data['mode'] = 'cycling'
    assert client.put(f'/rooms/{code}/participant', json=data, headers=headers(a)).json()['routing_status'] == 'ready'
    assert provider.calls == 2
    provider.fail = True
    assert client.post(f'/rooms/{code}/calculate', headers=headers(a)).status_code == 502
    state = client.get(f'/rooms/{code}', headers=headers(a)).json()
    assert state['routing_status'] == 'error'
    assert not state['rankings']

def test_missing_participant_location(harness):
    client, _, _ = harness
    a = create(client); code = a['room']['code']
    client.post(f'/rooms/{code}/join', json=participant('Sam', False))
    response = client.post(f'/rooms/{code}/calculate?discover=true', headers=headers(a))
    assert response.status_code == 502
    assert 'Every participant' in response.json()['detail']

def test_websocket_delay_proposal_confirmation_and_errors(harness):
    client, _, provider = harness
    a = create(client); code = a['room']['code']
    b = client.post(f'/rooms/{code}/join', json=participant('Sam')).json()
    client.post(f'/rooms/{code}/calculate?discover=true', headers=headers(a))
    with websocket(client, code) as wa, websocket(client, code) as wb:
        wa.send_json({'type': 'auth', 'token': a['token']}); wb.send_json({'type': 'auth', 'token': b['token']})
        assert wa.receive_json()['room']['selected_id'] == 'node/1'; wb.receive_json()
        wa.send_json({'type': 'delay.update', 'minutes': -2})
        assert wa.receive_json()['type'] == 'error'
        wa.send_json({'type': 'delay.update', 'minutes': 40})
        ra = wa.receive_json()['room']; rb = wb.receive_json()['room']
        assert ra == rb
        assert ra['participants'][0]['delay_minutes'] == 40
        assert ra['selected_id'] == 'node/1'
        assert ra['proposal']['venue_id'] == 'node/2'
        assert provider.calls == 1
        proposal = ra['proposal']['id']
        wa.send_json({'type': 'venue.vote', 'proposal_id': 'stale', 'approve': True})
        assert wa.receive_json()['type'] == 'error'
        wa.send_json({'type': 'venue.vote', 'proposal_id': proposal, 'approve': True})
        assert len(wa.receive_json()['room']['proposal']['votes']) == 1; wb.receive_json()
        wb.send_json({'type': 'venue.vote', 'proposal_id': proposal, 'approve': True})
        final = wa.receive_json()['room']; wb.receive_json()
        assert final['selected_id'] == 'node/2'
        assert final['proposal'] is None
    with websocket(client, code) as ws:
        ws.send_json({'type': 'auth', 'token': a['token']})
        assert ws.receive_json()['room']['participants'][0]['delay_minutes'] == 40

def test_ws_auth_origin_and_room_isolation(harness):
    client, _, _ = harness
    a, other = create(client), create(client)
    code = a['room']['code']
    with pytest.raises(WebSocketDisconnect):
        with websocket(client, code, 'https://evil.example'):
            pass
    with pytest.raises(WebSocketDisconnect):
        with websocket(client, code) as ws:
            ws.send_json({'type': 'auth', 'token': other['token']}); ws.receive_json()
    with websocket(client, code) as ws:
        ws.send_json({'type': 'auth', 'token': a['token']}); ws.receive_json()
        ws.send_json({'type': 'delay.update', 'minutes': 4}); ws.receive_json()
    assert client.get('/rooms/'+other['room']['code'], headers=headers(other)).json()['participants'][0]['delay_minutes'] == 0

def test_vote_rejection_and_new_participant_invalidates_proposal(harness):
    client, app, _ = harness
    a = create(client); code = a['room']['code']
    client.post(f'/rooms/{code}/join', json=participant('Sam'))
    client.post(f'/rooms/{code}/calculate?discover=true', headers=headers(a))
    with websocket(client, code) as ws:
        ws.send_json({'type': 'auth', 'token': a['token']}); ws.receive_json()
        ws.send_json({'type': 'delay.update', 'minutes': 40})
        proposal = ws.receive_json()['room']['proposal']['id']
        ws.send_json({'type': 'venue.vote', 'proposal_id': proposal, 'approve': False})
        state = ws.receive_json()['room']
        assert state['selected_id'] == 'node/1'
        assert state['proposal'] is None
    client.post(f'/rooms/{code}/join', json=participant('New', False))
    assert app.state.store.rooms[code].proposal is None


def test_leave_revokes_identity_transfers_host_and_reuses_routes(harness):
    client, app, provider = harness
    a = create(client); code = a['room']['code']
    b = client.post(f'/rooms/{code}/join', json=participant('Sam')).json()
    client.post(f'/rooms/{code}/calculate?discover=true', headers=headers(a))
    calls = provider.calls
    with websocket(client, code) as ws:
        ws.send_json({'type': 'auth', 'token': a['token']}); ws.receive_json()
        assert client.post(f'/rooms/{code}/leave', headers=headers(a)).status_code == 200
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()
    assert client.get(f'/rooms/{code}', headers=headers(a)).status_code == 401
    state = client.get(f'/rooms/{code}', headers=headers(b)).json()
    assert state['host_id'] == b['participant_id']
    assert len(state['participants']) == 1
    assert state['routing_status'] == 'ready'
    assert provider.calls == calls
    assert client.post(f'/rooms/{code}/leave', headers=headers(b)).status_code == 200
    assert code not in app.state.store.rooms


def test_rediscovery_retains_agreed_venue_and_bounds_candidates(harness):
    client, app, provider = harness
    a = create(client); code = a['room']['code']
    client.post(f'/rooms/{code}/calculate?discover=true', headers=headers(a))
    async def changed_discovery(locations):
        return [Venue(id=f'node/{i}', name=f'Cafe {i}', location=Location(lat=12, lng=77)) for i in range(3, 13)]
    provider.discover = changed_discovery
    state = client.post(f'/rooms/{code}/calculate?discover=true', headers=headers(a)).json()
    assert state['selected_id'] == 'node/2'
    assert any(v['id'] == 'node/2' for v in state['venues'])
    assert len(state['venues']) == 10


def test_actual_body_limit_and_auth_origin(harness):
    client, _, _ = harness
    assert client.post('/rooms', content=iter([b'x' * 9000, b'x' * 9000])).status_code == 413
    assert client.post('/auth/logout', headers={'origin': 'https://evil.example'}).status_code == 403


def test_account_lifecycle_validation_and_revocation(harness):
    client, _, _ = harness
    credentials = {'email': ' User@Example.com ', 'password': 'a secure password'}
    response = client.post('/auth/signup', json=credentials)
    assert response.status_code == 201
    assert response.json()['user']['email'] == 'user@example.com'
    assert 'HttpOnly' in response.headers['set-cookie']
    assert client.get('/auth/me').status_code == 200
    cookie = client.cookies.get('rendezvous_session')
    assert client.post('/auth/logout').status_code == 200
    assert client.get('/auth/me').status_code == 401
    assert client.get('/auth/me', headers={'cookie': f'rendezvous_session={cookie}'}).status_code == 401
    assert client.post('/auth/login', json={**credentials, 'password': 'wrong'}).status_code == 401
    assert client.post('/auth/login', json=credentials).status_code == 200
    assert client.post('/auth/signup', json=credentials).status_code == 409
    invalid = client.post('/auth/signup', json={**credentials, 'password': 'x' * 257})
    assert invalid.status_code == 422
    assert 'x' * 257 not in invalid.text
