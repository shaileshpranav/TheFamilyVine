"""SuperTokens handles *authentication* (who you are). Authorisation lives in app.permissions."""

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from supertokens_python import InputAppInfo, SupertokensConfig, init
from supertokens_python.asyncio import get_user
from supertokens_python.recipe import emailpassword, session
from supertokens_python.recipe.session import SessionContainer
from supertokens_python.recipe.session.framework.fastapi import verify_session

from app.config import Settings
from app.db import get_db
from app.models import User


def init_supertokens(settings: Settings) -> None:
    init(
        app_info=InputAppInfo(
            app_name=settings.app_name,
            api_domain=settings.api_domain,
            website_domain=settings.website_domain,
            api_base_path=settings.api_base_path,
            website_base_path="/auth",
        ),
        supertokens_config=SupertokensConfig(
            connection_uri=settings.supertokens_uri, api_key=settings.supertokens_api_key
        ),
        framework="fastapi",
        recipe_list=[emailpassword.init(), session.init()],
        mode="asgi",
        telemetry=False,
    )


async def get_or_create_user(db: AsyncSession, auth_id: str, email: str) -> User:
    user = await db.scalar(select(User).where(User.auth_id == auth_id))
    if user is None:
        user = User(auth_id=auth_id, email=email.lower(), display_name=email.split("@")[0])
        db.add(user)
        await db.commit()
    return user


async def get_current_user(
    st_session: SessionContainer = Depends(verify_session()),
    db: AsyncSession = Depends(get_db),
) -> User:
    auth_id = st_session.get_user_id()
    user = await db.scalar(select(User).where(User.auth_id == auth_id))
    if user is not None:
        return user
    st_user = await get_user(auth_id)
    email = st_user.emails[0] if st_user and st_user.emails else f"{auth_id}@unknown.invalid"
    return await get_or_create_user(db, auth_id, email)
