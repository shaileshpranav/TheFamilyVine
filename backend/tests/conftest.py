import os

os.environ["FT_TESTING"] = "1"

import pytest  # noqa: E402
from fastapi import Header  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import event  # noqa: E402

from app import db as db_module  # noqa: E402
from app.auth import get_current_user, get_or_create_user  # noqa: E402
from app.db import Base, get_sessionmaker  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture
async def engine():
    engine = db_module.configure_engine("sqlite+aiosqlite:///:memory:")

    @event.listens_for(engine.sync_engine, "connect")
    def _fk_on(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def app(engine):
    app = create_app()

    async def fake_current_user(x_test_user: str = Header(...)):
        async with get_sessionmaker()() as session:
            return await get_or_create_user(session, f"st-{x_test_user}", x_test_user)

    app.dependency_overrides[get_current_user] = fake_current_user
    return app


class Api:
    """Thin client that acts as a given user: `api.as_("ann@x.com").get(...)`."""

    def __init__(self, client: AsyncClient):
        self.client = client

    def as_(self, email: str) -> "_As":
        return _As(self.client, email)


class _As:
    def __init__(self, client: AsyncClient, email: str):
        self.client, self.headers = client, {"X-Test-User": email}

    async def get(self, url, **kw):
        return await self.client.get(url, headers=self.headers, **kw)

    async def post(self, url, json=None, **kw):
        return await self.client.post(url, json=json, headers=self.headers, **kw)

    async def patch(self, url, json=None, **kw):
        return await self.client.patch(url, json=json, headers=self.headers, **kw)

    async def put(self, url, json=None, **kw):
        return await self.client.put(url, json=json, headers=self.headers, **kw)

    async def delete(self, url, **kw):
        return await self.client.delete(url, headers=self.headers, **kw)


@pytest.fixture
async def api(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield Api(client)


OWNER = "owner@example.com"


async def join(api: Api, tree_id: str, email: str, role: str, subtree_id: str | None = None):
    """Invite `email` with `role` (as the owner) and accept it. Returns the member's client."""
    r = await api.as_(OWNER).post(
        f"/api/trees/{tree_id}/invites", {"role": role, "subtree_id": subtree_id}
    )
    assert r.status_code == 201, r.text
    member = api.as_(email)
    r = await member.post(f"/api/invites/{r.json()['token']}/accept")
    assert r.status_code == 200, r.text
    return member


@pytest.fixture
async def family(api):
    """A small three-generation tree owned by OWNER.

    Grandpa (deceased) + Grandma (deceased)
               |
      Dad (living) + Mum (living)          Uncle (deceased)
               |
             Kid (living)
    """
    owner = api.as_(OWNER)
    tree = (await owner.post("/api/trees", {"name": "Test family"})).json()
    tid = tree["id"]

    async def add(given, living=True, relative=None):
        body = {"given_names": given, "surname": "Test", "is_living": living}
        if relative:
            body["relative"] = relative
        r = await owner.post(f"/api/trees/{tid}/people", body)
        assert r.status_code == 201, r.text
        return r.json()["id"]

    grandpa = await add("Grandpa", False)
    grandma = await add("Grandma", False, {"person_id": grandpa, "relation": "partner"})
    dad = await add("Dad", True, {"person_id": grandpa, "relation": "child"})
    uncle = await add("Uncle", False, {"person_id": grandpa, "relation": "child"})
    mum = await add("Mum", True, {"person_id": dad, "relation": "partner"})
    kid = await add("Kid", True, {"person_id": dad, "relation": "child"})
    return {
        "tree": tid,
        "grandpa": grandpa,
        "grandma": grandma,
        "dad": dad,
        "uncle": uncle,
        "mum": mum,
        "kid": kid,
    }
