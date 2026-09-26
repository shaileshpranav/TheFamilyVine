import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, TimestampMixin, utcnow


class Role(enum.StrEnum):
    """Membership roles, lowest to highest privilege."""

    PERSONAL = "personal"  # view; add/edit only their own profile
    CONTRIBUTOR = "contributor"  # add people; edit own profile and deceased people
    ADMIN = "admin"  # edit everyone, set living flag, manage members and sub-trees
    OWNER = "owner"  # everything, incl. deleting the tree and transferring ownership

    @property
    def rank(self) -> int:
        return _ROLE_RANK[self]


_ROLE_RANK = {Role.PERSONAL: 1, Role.CONTRIBUTOR: 2, Role.ADMIN: 3, Role.OWNER: 4}


def role_column():
    return Enum(Role, native_enum=False, length=20, values_callable=lambda e: [m.value for m in e])


class SubtreeDirection(enum.StrEnum):
    DESCENDANTS = "descendants"
    ANCESTORS = "ancestors"
    BOTH = "both"


class Tree(TimestampMixin, Base):
    __tablename__ = "trees"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    cover_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("photos.id", ondelete="SET NULL", use_alter=True)
    )

    subtrees: Mapped[list["Subtree"]] = relationship(
        back_populates="tree", cascade="all, delete-orphan", passive_deletes=True
    )


class Subtree(TimestampMixin, Base):
    """A named branch of a tree, defined by a root person and a direction.

    Membership of people in a sub-tree is computed from relationships, never stored,
    so newly added relatives join the branch automatically.
    """

    __tablename__ = "subtrees"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    root_person_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("people.id", ondelete="CASCADE"))
    direction: Mapped[SubtreeDirection] = mapped_column(
        Enum(
            SubtreeDirection,
            native_enum=False,
            length=20,
            values_callable=lambda e: [m.value for m in e],
        ),
        default=SubtreeDirection.DESCENDANTS,
    )
    include_spouses: Mapped[bool] = mapped_column(Boolean, default=True)

    tree: Mapped[Tree] = relationship(back_populates="subtrees")


class Membership(TimestampMixin, Base):
    """Grants a user a role on a whole tree (subtree_id NULL) or on one sub-tree."""

    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("tree_id", "user_id", "subtree_id", name="uq_membership"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    subtree_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subtrees.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[Role] = mapped_column(role_column())

    user = relationship("User", lazy="joined")
    subtree: Mapped[Subtree | None] = relationship(lazy="joined")


class Invite(TimestampMixin, Base):
    __tablename__ = "invites"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), index=True
    )
    subtree_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subtrees.id", ondelete="CASCADE")
    )
    role: Mapped[Role] = mapped_column(role_column())
    email: Mapped[str | None] = mapped_column(String(320))
    # Optionally link the new member to an existing person ("this is you") on acceptance.
    person_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("people.id", ondelete="SET NULL")
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)

    tree: Mapped[Tree] = relationship(lazy="joined")
    subtree: Mapped[Subtree | None] = relationship(lazy="joined")

    def is_usable(self, now: datetime | None = None) -> bool:
        now = now or utcnow()
        expires = self.expires_at
        if expires.tzinfo is None:  # SQLite drops tz info
            expires = expires.replace(tzinfo=now.tzinfo)
        return not self.revoked and self.accepted_at is None and expires > now
