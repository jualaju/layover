from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.models import Location, Participant, Settings, Venue
from app.optimization import evaluate, switching_decision
from app.scheduling import schedule

NOW = datetime(2030, 1, 1, 12, tzinfo=timezone.utc)


def people():
    return [Participant(id=x, name=x, ready_at=NOW, location=Location(lat=12, lng=77)) for x in ['a', 'b']]


def settings(**kwargs):
    return Settings(target_arrival=NOW+timedelta(hours=2), **kwargs)


def venues():
    return [Venue(id=x, name=x, location=Location(lat=12, lng=77)) for x in ['v1', 'v2']]


def test_minimax_and_ties():
    matrix = {'a': {'v1': 10, 'v2': 19}, 'b': {'v1': 20, 'v2': 19}}
    r = evaluate(people(), venues(), matrix, settings(), NOW)
    assert r[0]['venue']['id'] == 'v2'
    assert r[0]['worst_minutes'] == 19
    assert r[0]['total_minutes'] == 38
    ties = evaluate(people(), venues()[::-1], {'a': {'v1': 20, 'v2': 20}, 'b': {'v1': 20, 'v2': 20}}, settings(), NOW)
    assert ties[0]['venue']['id'] == 'v1'


def test_fairness_can_change_absolute_minimax():
    matrix = {'a': {'v1': 2, 'v2': 21}, 'b': {'v1': 20, 'v2': 21}}
    r = evaluate(people(), venues(), matrix, settings(fairness_weight=.5), NOW)
    assert r[0]['venue']['id'] == 'v2'
    assert r[0]['baseline_rank'] == 2
    assert r[1]['fairness_penalty'] == 9
    assert r[1]['score'] == 29


def test_constraints_unknowns_and_missing_route():
    p = people()
    p[0].price_preference = 1
    v = venues()
    v[0].price_level = 3
    v[0].capacity = 1
    v[0].known_open = False
    r = evaluate(p, v, {'a': {'v1': 10, 'v2': None}, 'b': {'v1': 10, 'v2': 20}}, settings(), NOW)
    assert not any(x['eligible'] for x in r)
    assert len(r[0]['reasons']) == 3
    assert r[1]['worst_minutes'] is None
    assert 'Price' in r[1]['unknowns']
    r = evaluate(p, venues(), {'a': {'v1': 10, 'v2': 10}, 'b': {'v1': 10, 'v2': 10}}, settings(require_known_metadata=True), NOW)
    assert not any(x['eligible'] for x in r)


def test_max_journey_and_availability():
    p = people()
    p[0].max_journey_minutes = 5
    p[1].available_until = NOW + timedelta(minutes=30)
    r = evaluate(p, venues(), {'a': {'v1': 10}, 'b': {'v1': 10}}, settings(), NOW)
    assert 'Exceeds a\'s maximum journey' in r[0]['reasons']
    assert not r[0]['journeys'][1]['feasible']


def test_schedule_delay_buffer_and_infeasibility():
    p = people()
    s = Settings(target_arrival=NOW+timedelta(minutes=40), buffer_minutes=5)
    r = schedule(p, {'a': 20, 'b': 10}, s, NOW)
    assert r[0]['depart_at'] == (NOW+timedelta(minutes=15)).isoformat()
    p[0].delay_minutes = 16
    r = schedule(p, {'a': 20, 'b': 10}, s, NOW)
    assert not r[0]['feasible']
    assert r[0]['earliest_arrival'] == (NOW+timedelta(minutes=41)).isoformat()
    assert r[0]['minutes'] == 20


def test_hysteresis_threshold_and_ineligible_current():
    r = evaluate(people(), venues(), {'a': {'v1': 20, 'v2': 19}, 'b': {'v1': 20, 'v2': 19}}, settings(), NOW)
    assert switching_decision(r, 'v1', settings())[0] == 'v1'
    r[1]['score'] = 30
    assert switching_decision(r, 'v1', settings())[0] == 'v2'
    r[1]['eligible'] = False
    assert 'infeasible' in switching_decision(r, 'v1', settings())[1]
    for x in r:
        x['eligible'] = False
    assert switching_decision(r, 'v1', settings())[0] is None


@pytest.mark.parametrize('field,value', [('lat', 91), ('lng', -181), ('lat', float('nan'))])
def test_location_validation(field, value):
    with pytest.raises(ValidationError):
        Location(**{'lat': 10, 'lng': 10, field: value})


def test_timezone_and_venue_validation():
    with pytest.raises(ValidationError):
        Settings(target_arrival=datetime(2030, 1, 1))
    with pytest.raises(ValidationError):
        Venue(id='a', name='a', location=Location(lat=0, lng=0), price_level=4)
