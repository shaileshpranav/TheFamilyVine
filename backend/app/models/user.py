import uuid

from sqlalchemy import JSON, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, TimestampMixin


class User(TimestampMixin, Base):
    """A person who can sign in. Identity lives in SuperTokens; `auth_id` links the two."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    auth_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(200), default="")
    avatar_url: Mapped[str | None] = mapped_column(String(1000))
    # App settings (see schemas.Preferences), saved here so they follow the user between
    # devices. Settings never chosen are left out and read as their defaults.
    preferences: Mapped[dict] = mapped_column(JSON, default=dict, server_default=text("'{}'"))
