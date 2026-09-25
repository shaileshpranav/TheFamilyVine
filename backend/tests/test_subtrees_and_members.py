from datetime import timedelta

from sqlalchemy import update

from app.db import get_sessionmaker, utcnow
from app.models import Invite
from tests.conftest import OWNER, join


async def make_uncle_branch(api, family):
    """Uncle's line: just Uncle (deceased) plus anyone added under him later."""
    r = await api.as_(OWNER).post(
        f"/api/trees/{family['tree']}/subtrees",
        {"name": "Uncle's line", "root_person_id": family["uncle"]},
    )
    assert r.status_code == 201, r.text
    return r.json()


async def make_dad_branch(api, family):
    r = await api.as_(OWNER).post(
        f"/api/trees/{family['tree']}/subtrees",
        {"name": "Dad's line", "root_person_id": family["dad"], "direction": "descendants"},
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---- sub-trees ---------------------------------------------------------------------------


async def test_subtree_membership_is_computed(api, family):
    branch = await make_dad_branch(api, family)
    assert branch["member_count"] == 3  # Dad, Mum (spouse), Kid
    r = await api.as_(OWNER).get(f"/api/trees/{family['tree']}/subtrees/{branch['id']}/people")
    assert {p["given_names"] for p in r.json()} == {"Dad", "Mum", "Kid"}


async def test_branch_only_member_sees_only_their_branch(api, family):
    tid = family["tree"]
    branch = await make_dad_branch(api, family)
    m = await join(api, tid, "branch@example.com", "personal", branch["id"])
    people = (await m.get(f"/api/trees/{tid}/people")).json()
    assert {p["given_names"] for p in people} == {"Dad", "Mum", "Kid"}
    assert (await m.get(f"/api/trees/{tid}/people/{family['grandpa']}")).status_code == 404


async def test_new_relatives_join_branch_automatically(api, family):
    tid = family["tree"]
    branch = await make_dad_branch(api, family)
    c = await join(api, tid, "c@example.com", "contributor", branch["id"])
    r = await c.post(
        f"/api/trees/{tid}/people",
        {
            "given_names": "Grandkid",
            "relative": {"person_id": family["kid"], "relation": "child"},
        },
    )
    assert r.status_code == 201, r.text
    people = (await c.get(f"/api/trees/{tid}/people")).json()
    assert "Grandkid" in {p["given_names"] for p in people}


async def test_branch_member_must_attach_new_people(api, family):
    tid = family["tree"]
    branch = await make_dad_branch(api, family)
    c = await join(api, tid, "c@example.com", "contributor", branch["id"])
    r = await c.post(f"/api/trees/{tid}/people", {"given_names": "Floating"})
    assert r.status_code == 422


async def test_branch_admin_role_applies_only_inside_branch(api, family):
    tid = family["tree"]
    branch = await make_dad_branch(api, family)
    admin = await join(api, tid, "badmin@example.com", "admin", branch["id"])
    # A tree-wide contributor role too, so they can see everyone.
    await join(api, tid, "badmin@example.com", "contributor")

    r = await admin.patch(f"/api/trees/{tid}/people/{family['kid']}", {"is_living": False})
    assert r.status_code == 200  # admin inside the branch
    r = await admin.patch(f"/api/trees/{tid}/people/{family['grandpa']}", {"is_living": True})
    assert r.status_code == 403  # only contributor outside it


async def test_only_tree_admins_manage_subtrees(api, family):
    tid = family["tree"]
    c = await join(api, tid, "c@example.com", "contributor")
    r = await c.post(f"/api/trees/{tid}/subtrees", {"name": "X", "root_person_id": family["dad"]})
    assert r.status_code == 403


# ---- members & invites -------------------------------------------------------------------


async def test_creator_is_owner(api):
    r = await api.as_(OWNER).post("/api/trees", {"name": "Mine"})
    tree = (await api.as_(OWNER).get(f"/api/trees/{r.json()['id']}")).json()
    assert tree["access"]["tree_role"] == "owner"
    assert tree["access"]["is_owner"] is True


async def test_invite_cannot_grant_owner(api, family):
    r = await api.as_(OWNER).post(f"/api/trees/{family['tree']}/invites", {"role": "owner"})
    assert r.status_code == 422


async def test_invite_email_must_match(api, family):
    r = await api.as_(OWNER).post(
        f"/api/trees/{family['tree']}/invites",
        {"role": "personal", "email": "right@example.com"},
    )
    token = r.json()["token"]
    assert (
        await api.as_("wrong@example.com").post(f"/api/invites/{token}/accept")
    ).status_code == 403
    assert (
        await api.as_("Right@example.com").post(f"/api/invites/{token}/accept")
    ).status_code == 200


async def test_invites_are_single_use_revocable_and_expire(api, family):
    tid, owner = family["tree"], api.as_(OWNER)
    used = (await owner.post(f"/api/trees/{tid}/invites", {"role": "personal"})).json()
    await api.as_("a@example.com").post(f"/api/invites/{used['token']}/accept")
    assert (
        await api.as_("b@example.com").post(f"/api/invites/{used['token']}/accept")
    ).status_code == 410

    revoked = (await owner.post(f"/api/trees/{tid}/invites", {"role": "personal"})).json()
    await owner.delete(f"/api/trees/{tid}/invites/{revoked['id']}")
    assert (
        await api.as_("c@example.com").post(f"/api/invites/{revoked['token']}/accept")
    ).status_code == 410

    expired = (await owner.post(f"/api/trees/{tid}/invites", {"role": "personal"})).json()
    async with get_sessionmaker()() as s:
        await s.execute(
            update(Invite)
            .where(Invite.token == expired["token"])
            .values(expires_at=utcnow() - timedelta(days=1))
        )
        await s.commit()
    assert (
        await api.as_("d@example.com").post(f"/api/invites/{expired['token']}/accept")
    ).status_code == 410


async def test_accepting_never_downgrades(api, family):
    tid = family["tree"]
    admin = await join(api, tid, "x@example.com", "admin")
    await join(api, tid, "x@example.com", "personal")
    tree = (await admin.get(f"/api/trees/{tid}")).json()
    assert tree["access"]["tree_role"] == "admin"


async def test_admin_cannot_touch_owner_and_contributor_cannot_manage(api, family):
    tid = family["tree"]
    admin = await join(api, tid, "admin@example.com", "admin")
    c = await join(api, tid, "c@example.com", "contributor")
    members = (await admin.get(f"/api/trees/{tid}/members")).json()
    owner_m = next(m for m in members if m["role"] == "owner")
    c_m = next(m for m in members if m["user"]["email"] == "c@example.com")

    assert (await admin.delete(f"/api/trees/{tid}/members/{owner_m['id']}")).status_code == 403
    assert (
        await admin.patch(f"/api/trees/{tid}/members/{owner_m['id']}", {"role": "personal"})
    ).status_code == 403
    assert (await c.post(f"/api/trees/{tid}/invites", {"role": "personal"})).status_code == 403
    assert (
        await admin.patch(f"/api/trees/{tid}/members/{c_m['id']}", {"role": "admin"})
    ).status_code == 200


async def test_members_can_leave(api, family):
    tid = family["tree"]
    c = await join(api, tid, "c@example.com", "contributor")
    members = (await c.get(f"/api/trees/{tid}/members")).json()
    mine = next(m for m in members if m["user"]["email"] == "c@example.com")
    assert (await c.delete(f"/api/trees/{tid}/members/{mine['id']}")).status_code == 204
    assert (await c.get(f"/api/trees/{tid}")).status_code == 404


async def test_branch_admin_can_invite_to_branch_only(api, family):
    tid = family["tree"]
    branch = await make_dad_branch(api, family)
    other = await make_uncle_branch(api, family)
    ba = await join(api, tid, "ba@example.com", "admin", branch["id"])
    ok = await ba.post(
        f"/api/trees/{tid}/invites", {"role": "contributor", "subtree_id": branch["id"]}
    )
    assert ok.status_code == 201
    assert (await ba.post(f"/api/trees/{tid}/invites", {"role": "contributor"})).status_code == 403
    assert (
        await ba.post(
            f"/api/trees/{tid}/invites", {"role": "contributor", "subtree_id": other["id"]}
        )
    ).status_code == 403


async def test_transfer_ownership_and_delete(api, family):
    tid = family["tree"]
    admin = await join(api, tid, "admin@example.com", "admin")
    me = (await admin.get("/api/me")).json()
    assert (await admin.delete(f"/api/trees/{tid}")).status_code == 403
    r = await api.as_(OWNER).post(f"/api/trees/{tid}/transfer", {"user_id": me["id"]})
    assert r.status_code == 204
    assert (await api.as_(OWNER).get(f"/api/trees/{tid}")).json()["access"]["tree_role"] == "admin"
    assert (await admin.delete(f"/api/trees/{tid}")).status_code == 204
    assert (await admin.get(f"/api/trees/{tid}")).status_code == 404
