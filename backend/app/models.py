"""Validated API inputs; internal room state lives in store.py."""
from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Location(Input):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    label: str = Field(default="Map location", max_length=200)


class ParticipantInput(Input):
    name: str = Field(min_length=1, max_length=40)
    location: Location | None = None
    mode: Literal["walking", "cycling", "driving"] = "walking"
    price_preference: int = Field(default=3, ge=1, le=3)
    ready_at: datetime
    available_until: datetime | None = None
    max_journey_minutes: float | None = Field(default=None, gt=0, le=360)

    @field_validator("ready_at", "available_until")
    @classmethod
    def aware(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("Include a timezone in all timestamps")
        return value

    @model_validator(mode="after")
    def availability_order(self):
        if self.available_until is not None and self.available_until < self.ready_at:
            raise ValueError("Availability must end after earliest departure")
        return self


class Participant(ParticipantInput):
    id: str
    delay_minutes: int = 0


class Settings(Input):
    target_arrival: datetime
    buffer_minutes: int = Field(default=5, ge=0, le=30)
    fairness_weight: float = Field(default=0, ge=0, le=2)
    switch_absolute_minutes: float = Field(default=3, ge=0, le=60)
    switch_relative: float = Field(default=.1, ge=0, le=1)
    require_known_metadata: bool = False

    _aware = field_validator("target_arrival")(ParticipantInput.aware.__func__)


class CreateRoom(Input):
    participant: ParticipantInput
    settings: Settings


class Venue(Input):
    id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    location: Location
    category: str = Field(default="cafe", max_length=40)
    price_level: int | None = Field(default=None, ge=1, le=3)
    capacity: int | None = Field(default=None, gt=0, le=10000)
    opening_hours: str | None = Field(default=None, max_length=200)
    # No inference of opening status from unsupported OSM hours syntax.
    known_open: bool | None = None


class DelayEvent(Input):
    type: Literal["delay.update"]
    minutes: int = Field(ge=0, le=120)


class UpdateEvent(Input):
    type: Literal["participant.update"]
    participant: ParticipantInput


class VoteEvent(Input):
    type: Literal["venue.vote"]
    proposal_id: str = Field(min_length=1, max_length=80)
    approve: bool


ClientEvent = Annotated[DelayEvent | UpdateEvent | VoteEvent, Field(discriminator="type")]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
