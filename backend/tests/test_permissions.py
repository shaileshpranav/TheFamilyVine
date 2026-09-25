"""The role matrix from docs/PLAN.md, exercised through the API."""

import pytest

from tests.conftest import OWNER, join


async def edit(client, family, who, field="bio"):
    return await client.patch(
        f"/api/trees/{family['tree']}/people/{family[who]}", {field: "edited"}
    )


# ---- owner / admin -----------------------------------------------------------------------


@pytest.mark.parametrize("who", ["grandpa", "dad", "kid"])
async def test_admin_can_edit_anyone(api, family, who):
    admin = await join(api, family["tree"], "admin@example.com", "admin")
    assert (await edit(admin, family, who)).status_code == 200


async def test_admin_can_change_living_flag(api, family):
    admin = await join(api, family["tree"], "admin@example.com", "admin")
    r = await admin.patch(
        f"/api/trees/{family['tree']}/people/{family['dad']}", {"is_living": False}
    )
    assert r.status_code == 200
    assert r.json()["is_living"] is False


# ---- contributor -------------------------------------------------------------------------


async def test_contributor_can_edit_deceased_but_not_living(api, family):
    c = await join(api, family["tree"], "c@example.com", "contributor")
    assert (await edit(c, family, "grandpa")).status_code == 200
    assert (await edit(c, family, "dad")).status_code == 403


async def test_contributor_cannot_change_living_flag(api, family):
    c = await join(api, family["tree"], "c@example.com", "contributor")
    r = await c.patch(
        f"/api/trees/{family['tree']}/people/{family['grandpa']}", {"is_living": True}
    )
    assert r.status_code == 403
    # Sending the unchanged value alongside other edits is fine.
    r = await c.patch(
        f"/api/trees/{family['tree']}/people/{family['grandpa']}",
        {"is_living": False, "nickname": "Pop"},
    )
    assert r.status_code == 200


async def test_contributor_can_add_living_or_deceased_people(api, family):
    c = await join(api, family["tree"], "c@example.com", "contributor")
    for living in (True, False):
        r = await c.post(
            f"/api/trees/{family['tree']}/people",
            {
                "given_names": "New",
                "is_living": living,
                "relative": {"person_id": family["kid"], "relation": "child"},
            },
        )
        assert r.status_code == 201, r.text
        assert r.json()["is_living"] is living


async def test_contributor_cannot_edit_living_person_they_added(api, family):
    c = await join(api, family["tree"], "c@example.com", "contributor")
    r = await c.post(f"/api/trees/{family['tree']}/people", {"given_names": "Baby"})
    r = await c.patch(f"/api/trees/{family['tree']}/people/{r.json()['id']}", {"bio": "x"})
    assert r.status_code == 403


async def test_contributor_can_edit_own_living_profile(api, family):
    c = await join(api, family["tree"], "c@example.com", "contributor")
    me = await c.post(f"/api/trees/{family['tree']}/people", {"given_names": "Me", "is_me": True})
    r = await c.patch(f"/api/trees/{family['tree']}/people/{me.json()['id']}", {"bio": "hi"})
    assert r.status_code == 200


async def test_contributor_cannot_delete(api, family):
    c = await join(api, family["tree"], "c@example.com", "contributor")
    r = await c.delete(f"/api/trees/{family['tree']}/people/{family['grandpa']}")
    assert r.status_code == 403


# ---- personal ----------------------------------------------------------------------------


async def test_personal_can_view_everyone(api, family):
    p = await join(api, family["tree"], "p@example.com", "personal")
    r = await p.get(f"/api/trees/{family['tree']}/people")
    assert len(r.json()) == 6


async def test_personal_can_only_add_and_edit_own_profile(api, family):
    tid = family["tree"]
    p = await join(api, tid, "p@example.com", "personal")
    assert (await edit(p, family, "grandpa")).status_code == 403
    assert (await p.post(f"/api/trees/{tid}/people", {"given_names": "X"})).status_code == 403

    r = await p.post(
        f"/api/trees/{tid}/people",
        {
            "given_names": "Me",
            "is_me": True,
            "relative": {"person_id": family["kid"], "relation": "child"},
        },
    )
    assert r.status_code == 201, r.text
    me = r.json()
    assert me["permissions"]["can_edit"] is True
    assert me["permissions"]["can_set_living"] is False
    assert me["permissions"]["can_add_relatives"] is False
    assert me["parents"] == [family["kid"]]

    # Only one self-profile per tree.
    r = await p.post(f"/api/trees/{tid}/people", {"given_names": "Me2", "is_me": True})
    assert r.status_code == 409


async def test_personal_linked_by_invite_can_edit_that_person(api, family):
    tid = family["tree"]
    r = await api.as_(OWNER).post(
        f"/api/trees/{tid}/invites", {"role": "personal", "person_id": family["mum"]}
    )
    mum = api.as_("mum@example.com")
    await mum.post(f"/api/invites/{r.json()['token']}/accept")
    assert (await edit(mum, family, "mum")).status_code == 200
    assert (await edit(mum, family, "dad")).status_code == 403
    tree = (await mum.get(f"/api/trees/{tid}")).json()
    assert tree["access"]["my_person_id"] == family["mum"]


# ---- outsiders ---------------------------------------------------------------------------


async def test_non_members_get_404(api, family):
    stranger = api.as_("stranger@example.com")
    assert (await stranger.get(f"/api/trees/{family['tree']}")).status_code == 404
    r = await stranger.get(f"/api/trees/{family['tree']}/people/{family['dad']}")
    assert r.status_code == 404
