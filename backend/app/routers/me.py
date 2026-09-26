from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.models import User
from app.schemas import UserOut, UserUpdate

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("", response_model=UserOut)
async def get_me(user: CurrentUser):
    return user


@router.patch("", response_model=UserOut)
async def update_me(body: UserUpdate, user: CurrentUser, db: DB):
    me = await db.get(User, user.id)
    assert me is not None
    for key, value in body.model_dump(exclude_unset=True, exclude={"preferences"}).items():
        setattr(me, key, value)
    if body.preferences is not None:
        # Merge, so each setting can change on its own. A new dict, because changes made
        # inside a JSON value aren't noticed.
        me.preferences = {**me.preferences, **body.preferences.model_dump(exclude_none=True)}
    await db.commit()
    return me
