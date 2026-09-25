import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Person, User
from app.permissions import TreeAccess

DB = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def forbidden(detail: str = "You don't have permission to do that") -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, detail)


def not_found(what: str = "Not found") -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, what)


async def require_tree_access(tree_id: uuid.UUID, db: DB, user: CurrentUser) -> TreeAccess:
    access = await TreeAccess.load(db, user, tree_id)
    # 404 rather than 403 so tree ids can't be probed.
    if access is None:
        raise not_found("Tree not found")
    return access


Access = Annotated[TreeAccess, Depends(require_tree_access)]


async def get_visible_person(db: AsyncSession, access: TreeAccess, person_id: uuid.UUID) -> Person:
    """The person, if they're in this tree and the viewer may see them; 404 otherwise."""
    person = await db.get(Person, person_id)
    if person is None or not access.can_view_person(person):
        raise not_found("Person not found")
    return person
