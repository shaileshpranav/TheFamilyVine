from tests.conftest import OWNER


async def get(api, family, who):
    r = await api.as_(OWNER).get(f"/api/trees/{family['tree']}/people/{family[who]}")
    assert r.status_code == 200
    return r.json()


async def test_relatives_are_wired_into_families(api, family):
    dad = await get(api, family, "dad")
    assert set(dad["parents"]) == {family["grandpa"], family["grandma"]}
    assert dad["partners"] == [family["mum"]]
    assert dad["children"] == [family["kid"]]
    kid = await get(api, family, "kid")
    assert set(kid["parents"]) == {family["dad"], family["mum"]}


async def test_second_partner_requires_choosing_family_for_children(api, family):
    tid, owner = family["tree"], api.as_(OWNER)
    r = await owner.post(
        f"/api/trees/{tid}/people",
        {"given_names": "Stepmum", "relative": {"person_id": family["dad"], "relation": "partner"}},
    )
    assert r.status_code == 201
    r = await owner.post(
        f"/api/trees/{tid}/people",
        {"given_names": "Half", "relative": {"person_id": family["dad"], "relation": "child"}},
    )
    assert r.status_code == 422


async def test_third_parent_rejected(api, family):
    r = await api.as_(OWNER).post(
        f"/api/trees/{family['tree']}/people",
        {"given_names": "Extra", "relative": {"person_id": family["kid"], "relation": "parent"}},
    )
    assert r.status_code == 422


async def test_search(api, family):
    r = await api.as_(OWNER).get(f"/api/trees/{family['tree']}/people", params={"q": "gran"})
    assert {p["given_names"] for p in r.json()} == {"Grandpa", "Grandma"}


async def test_delete_person_removes_relationships(api, family):
    tid = family["tree"]
    r = await api.as_(OWNER).delete(f"/api/trees/{tid}/people/{family['mum']}")
    assert r.status_code == 204
    dad = await get(api, family, "dad")
    assert dad["partners"] == []
    assert dad["children"] == [family["kid"]]


async def test_admin_links_member_account(api, family):
    tid, owner = family["tree"], api.as_(OWNER)
    r = await owner.post(f"/api/trees/{tid}/invites", {"role": "personal"})
    kid_client = api.as_("kid@example.com")
    await kid_client.post(f"/api/invites/{r.json()['token']}/accept")
    kid_user = (await kid_client.get("/api/me")).json()

    r = await owner.put(
        f"/api/trees/{tid}/people/{family['kid']}/linked-user", {"user_id": kid_user["id"]}
    )
    assert r.status_code == 200
    r = await kid_client.patch(f"/api/trees/{tid}/people/{family['kid']}", {"bio": "me!"})
    assert r.status_code == 200

    r = await owner.put(
        f"/api/trees/{tid}/people/{family['dad']}/linked-user", {"user_id": kid_user["id"]}
    )
    assert r.status_code == 409
