import datetime as dt
import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Date,
    Enum,
    Float,
    ForeignKey,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.dates import DateQualifier, FuzzyDate, FuzzyDateOut
from app.db import Base, TimestampMixin


class EventType(enum.StrEnum):
    # Life events of one person
    BIRTH = "birth"
    BAPTISM = "baptism"
    DEATH = "death"
    BURIAL = "burial"
    EDUCATION = "education"
    OCCUPATION = "occupation"
    RETIREMENT = "retirement"
    RESIDENCE = "residence"
    EMIGRATION = "emigration"
    IMMIGRATION = "immigration"
    MILITARY = "military"
    # Events of a couple
    ENGAGEMENT = "engagement"
    MARRIAGE = "marriage"
    SEPARATION = "separation"
    DIVORCE = "divorce"
    # Anything else, described by the event's title
    OTHER = "other"


PERSON_EVENT_TYPES = frozenset(
    {
        EventType.BIRTH,
        EventType.BAPTISM,
        EventType.DEATH,
        EventType.BURIAL,
        EventType.EDUCATION,
        EventType.OCCUPATION,
        EventType.RETIREMENT,
        EventType.RESIDENCE,
        EventType.EMIGRATION,
        EventType.IMMIGRATION,
        EventType.MILITARY,
        EventType.OTHER,
    }
)
FAMILY_EVENT_TYPES = frozenset(
    {
        EventType.ENGAGEMENT,
        EventType.MARRIAGE,
        EventType.SEPARATION,
        EventType.DIVORCE,
        EventType.OTHER,
    }
)
# A person has at most one of each of these; alternatives belong in sources, not duplicates.
ONE_PER_PERSON = frozenset({EventType.BIRTH, EventType.DEATH})


def _str_enum(cls):
    return Enum(cls, native_enum=False, length=20, values_callable=lambda e: [m.value for m in e])


class Place(TimestampMixin, Base):
    """A named place, shared by all events in a tree so names stay consistent."""

    __tablename__ = "places"
    __table_args__ = (UniqueConstraint("tree_id", "name", name="uq_place_name"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(300))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)


class Event(TimestampMixin, Base):
    """Something that happened to a person, or to a couple (a Family)."""

    __tablename__ = "events"
    __table_args__ = (
        CheckConstraint("(person_id IS NULL) <> (family_id IS NULL)", name="one_owner"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), index=True
    )
    person_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), index=True
    )
    family_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[EventType] = mapped_column(_str_enum(EventType))
    title: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")

    date_qualifier: Mapped[DateQualifier | None] = mapped_column(_str_enum(DateQualifier))
    date_year: Mapped[int | None] = mapped_column(SmallInteger)
    date_month: Mapped[int | None] = mapped_column(SmallInteger)
    date_day: Mapped[int | None] = mapped_column(SmallInteger)
    date_year2: Mapped[int | None] = mapped_column(SmallInteger)
    date_month2: Mapped[int | None] = mapped_column(SmallInteger)
    date_day2: Mapped[int | None] = mapped_column(SmallInteger)
    date_phrase: Mapped[str] = mapped_column(String(200), default="")
    sort_date: Mapped[dt.date | None] = mapped_column(Date, index=True)

    place_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("places.id", ondelete="SET NULL"))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    place: Mapped[Place | None] = relationship(lazy="joined")

    @property
    def date(self) -> FuzzyDateOut | None:
        if self.date_qualifier is None:
            return None
        return FuzzyDateOut(
            qualifier=self.date_qualifier,
            year=self.date_year,
            month=self.date_month,
            day=self.date_day,
            year2=self.date_year2,
            month2=self.date_month2,
            day2=self.date_day2,
            phrase=self.date_phrase or "",
        )

    def set_date(self, value: FuzzyDate | None) -> None:
        self.date_qualifier = value.qualifier if value else None
        self.date_year = value.year if value else None
        self.date_month = value.month if value else None
        self.date_day = value.day if value else None
        self.date_year2 = value.year2 if value else None
        self.date_month2 = value.month2 if value else None
        self.date_day2 = value.day2 if value else None
        self.date_phrase = value.phrase if value else ""
        self.sort_date = value.sort_date() if value else None

    @property
    def place_name(self) -> str | None:
        return self.place.name if self.place else None
