"""Explicit test-only server: NO production configuration can enable fake routes."""
from app.config import Config
from app.main import create_app
from tests.test_api import FakeProviders
app = create_app(Config(ors_key='browser-test-fixture'), FakeProviders())
