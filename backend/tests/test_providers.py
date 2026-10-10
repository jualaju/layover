import json
import time

import httpx
import pytest

from app.config import Config
from app.providers import ProviderError, Providers, parse_durations
from tests.test_core import people, venues


def test_parser():
    assert parse_durations({'durations': [[120, None, 0]]}, 1, 3) == [[2, None, 0]]


@pytest.mark.parametrize('data', [{}, {'durations': []}, {'durations': [[1]]}, {'durations': [[-1, 2]]}, {'durations': [[True, 2]]}, {'durations': [[float('inf'), 2]]}])
def test_malformed_matrix(data):
    with pytest.raises(ProviderError):
        parse_durations(data, 1, 2)


@pytest.mark.asyncio
async def test_matrix_modes_indices_cache():
    requests = []
    def handler(req):
        requests.append(req)
        body = json.loads(req.content)
        assert body['sources'] == ['0']
        assert body['destinations'] == ['1', '2']
        assert body['locations'][0] == [77, 12]
        return httpx.Response(200, json={'durations': [[60, None]]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = Providers(Config(ors_key='test'), client)
        # Avoid deliberate provider throttling in tests only.
        provider.last_request = -100
        p = people()
        p[1].mode = 'cycling'
        result = await provider.matrix(p, venues())
        assert result == {'a': {'v1': 1, 'v2': None}, 'b': {'v1': 1, 'v2': None}}
        assert requests[0].url.path.endswith('foot-walking')
        assert requests[1].url.path.endswith('cycling-regular')
        assert await provider.matrix(p, venues()) == result
        assert len(requests) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize('status', [401, 429, 500])
async def test_provider_failures(status):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(status))) as client:
        provider = Providers(Config(ors_key='test'), client)
        with pytest.raises(ProviderError, match=str(status)):
            await provider.matrix(people(), venues())


@pytest.mark.asyncio
async def test_missing_key_and_timeout():
    async with httpx.AsyncClient() as client:
        with pytest.raises(ProviderError, match='ORS_API_KEY'):
            await Providers(Config(ors_key=''), client).matrix(people(), venues())
    def timeout(req):
        raise httpx.ReadTimeout('slow', request=req)
    async with httpx.AsyncClient(transport=httpx.MockTransport(timeout)) as client:
        with pytest.raises(ProviderError, match='unavailable'):
            await Providers(Config(ors_key='test'), client).matrix(people(), venues())


@pytest.mark.asyncio
async def test_discovery_real_tags_unknown_metadata_and_cache():
    calls = []
    def handler(req):
        from urllib.parse import parse_qs
        query = parse_qs(req.content.decode())["data"][0]
        # The wire request must ask for coordinates, not tag-only records.
        assert "out body center" in query
        calls.append(req)
        return httpx.Response(200, json={'elements': [
            {'type': 'node', 'id': 1, 'lat': 12, 'lon': 77, 'tags': {'name': 'Real OSM cafe', 'amenity': 'cafe', 'opening_hours': '24/7', 'capacity': '12'}},
            {'type': 'way', 'id': 2, 'center': {'lat': 12.01, 'lon': 77.01}, 'tags': {'name': 'Restaurant', 'opening_hours': 'Mo-Fr 10:00-20:00'}},
            {'type': 'node', 'id': 3, 'tags': {}}]})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        provider = Providers(Config(), client)
        result = await provider.discover([p.location for p in people()])
        assert len(result) == 2
        assert result[0].known_open is True
        assert result[0].price_level is None
        assert result[1].known_open is None
        assert len(await provider.discover([p.location for p in people()])) == 2
        assert len(calls) == 1


@pytest.mark.asyncio
async def test_search_parsing():
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, json={'features': [{'geometry': {'coordinates': [77, 12]}, 'properties': {'label': 'Bengaluru'}}]}))) as client:
        assert (await Providers(Config(ors_key='test'), client).search('Bengaluru'))[0]['lat'] == 12
