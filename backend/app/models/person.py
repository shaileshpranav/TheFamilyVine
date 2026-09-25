import enum
import uuid
from typing import Any

from sqlalchemy import JSON, Boolean, Enum, ForeignKey, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin


class Sex(enum.StrEnum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    UNKNOWN = "unknown"


class PartnerStatus(enum.StrEnum):
    TOGETHER = "together"
    SEPARATED = "separated"
    DIVORCED = "divorced"


class ChildRelation(enum.StrEnum):
    BIOLOGICAL = "biological"
    ADOPTED = "adopted"
    STEP = "step"
    FOSTER = "foster"


def _str_enum(cls):
    return Enum(cls, native_enum=False, length=20, values_callable=lambda e: [m.value for m in e])


class Person(TimestampMixin, Base):
    __tablename__ = "people"
    __table_args__ = (UniqueConstraint("tree_id", "linked_user_id", name="uq_person_linked_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), index=True
    )
    given_names: Mapped[str] = mapped_column(String(200), default="")
    surname: Mapped[str] = mapped_column(String(200), default="", index=True)
    birth_surname: Mapped[str] = mapped_column(String(200), default="")
    nickname: Mapped[str] = mapped_column(String(200), default="")
    native_name: Mapped[str] = mapped_column(String(400), default="")
    sex: Mapped[Sex] = mapped_column(_str_enum(Sex), default=Sex.UNKNOWN)
    is_living: Mapped[bool] = mapped_column(Boolean, default=True)
    bio: Mapped[str] = mapped_column(Text, default="")

    # Profile details. Server defaults let the columns be added to tables that already hold people.
    occupation: Mapped[str] = mapped_column(String(200), default="", server_default="")
    nationality: Mapped[str] = mapped_column(String(200), default="", server_default="")
    education: Mapped[str] = mapped_column(String(300), default="", server_default="")
    # Small lists owned by the person; shapes are validated by the API schemas.
    links: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, server_default=text("'[]'")
    )
    vehicles: Mapped[list[str]] = mapped_column(JSON, default=list, server_default=text("'[]'"))
    pets: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, server_default=text("'[]'")
    )
    favorites: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, server_default=text("'[]'")
    )

    # The account that *is* this person ("this is me").
    linked_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    @property
    def display_name(self) -> str:
        return " ".join(p for p in (self.given_names, self.surname) if p) or "Unnamed"


class Family(TimestampMixin, Base):
    """A union of partners and their children (maps 1:1 to a GEDCOM FAM record)."""

    __tablename__ = "families"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), index=True
    )
    # Whether the couple is still together; separated and divorced couples stay on the tree.
    status: Mapped[PartnerStatus] = mapped_column(
        _str_enum(PartnerStatus), default=PartnerStatus.TOGETHER, server_default="together"
    )

    partners: Mapped[list["FamilyPartner"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    children: Mapped[list["ChildLink"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


class FamilyPartner(Base):
    __tablename__ = "family_partners"

    family_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), primary_key=True
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), primary_key=True, index=True
    )


class ChildLink(Base):
    __tablename__ = "child_links"

    family_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("families.id", ondelete="CASCADE"), primary_key=True
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("people.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    relation: Mapped[ChildRelation] = mapped_column(
        _str_enum(ChildRelation), default=ChildRelation.BIOLOGICAL
    )
