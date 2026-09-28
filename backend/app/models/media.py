import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, TimestampMixin


class Photo(TimestampMixin, Base):
    """A picture in one person's gallery, or a tree's cover when there's no person.

    The image itself lives on disk (see app.photos), resized in two sizes.
    """

    __tablename__ = "photos"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), index=True
    )
    person_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), index=True
    )
    caption: Mapped[str] = mapped_column(String(500), default="")
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class ConditionStatus(enum.StrEnum):
    DIAGNOSED = "diagnosed"
    CARRIER = "carrier"
    # Recorded as something to keep an eye on, such as a borderline test result.
    WATCH = "watch"
    UNTESTED = "untested"


class Condition(TimestampMixin, Base):
    """A health condition someone has recorded, shared only with their blood relatives."""

    __tablename__ = "conditions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), index=True
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[ConditionStatus] = mapped_column(
        Enum(
            ConditionStatus,
            native_enum=False,
            length=20,
            values_callable=lambda e: [m.value for m in e],
        )
    )
    year: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(String(500), default="")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
