from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.schemas import UserOut, UserUpdate

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("", response_model=UserOut)
async def get_me(user: CurrentUser):
    return user


@router.patch("", response_model=UserOut)
async def update_me(body: UserUpdate, user: CurrentUser, db: DB):
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    await db.commit()
    return user
