from tests.conftest import OWNER, join


def base(family):
    return f"/api/trees/{family['tree']}/people"


async def add(client, family, given, relation, anchor, **extra):
    body = {
        "given_names": given,
        "surname": "Test",
        "relative": {"person_id": family[anchor], "relation": relation, **extra},
    }
    return await client.post(base(family), body)


async def relatives(client, family, who, pid=None):
    r = await client.get(f"{base(family)}/{pid or family[who]}")
    assert r.status_code == 200, r.text
    return {x["person_id"]: x for x in r.json()["relatives"]}


# ---- adding relatives --------------------------------------------------------------------


async def test_sibling_shares_both_parents(api, family):
    owner = api.as_(OWNER)
    r = await add(owner, family, "Sis", "sibling", "kid")
    assert r.status_code == 201, r.text
    sis = r.json()
    assert set(sis["parents"]) == {family["dad"], family["mum"]}
    rels = await relatives(owner, family, "kid")
    assert rels[sis["id"]]["relation"] == "sibling"


async def test_sibling_without_parents_then_a_parent_for_both(api, family):
    owner = api.as_(OWNER)
    loner = (await owner.post(base(family), {"given_names": "Loner"})).json()
    family["loner"] = loner["id"]
    bro = (await add(owner, family, "Bro", "sibling", "loner")).json()
    assert (await relatives(owner, family, "loner"))[bro["id"]]["relation"] == "sibling"

    parent = (await add(owner, family, "Parent", "parent", "loner")).json()
    assert (await relatives(owner, family, None, bro["id"]))[parent["id"]]["relation"] == "parent"


async def test_step_parent_needs_to_know_which_parent(api, family):
    owner = api.as_(OWNER)
    r = await add(owner, family, "Stepdad", "step_parent", "kid")
    assert r.status_code == 422
    assert "Choose which parent" in r.json()["detail"]

    r = await add(
        owner,
        family,
        "Stepdad",
        "step_parent",
        "kid",
        via_person_id=family["mum"],
        status="together",
    )
    assert r.status_code == 201, r.text
    stepdad = r.json()["id"]
    rels = await relatives(owner, family, "kid")
    assert rels[stepdad]["relation"] == "step_parent"
    assert rels[stepdad]["via_person_id"] == family["mum"]
    mum = await relatives(owner, family, "mum")
    assert mum[stepdad]["relation"] == "partner"
    assert mum[family["dad"]]["relation"] == "partner"


async def test_step_child_and_half_sibling(api, family):
    owner = api.as_(OWNER)
    # A child of Mum's from before, with no other parent recorded:
    # Dad's step-child and Kid's half-sibling.
    r = await add(owner, family, "Older", "step_child", "dad")
    assert r.status_code == 201, r.text
    older = r.json()["id"]
    assert (await relatives(owner, family, "dad"))[older]["relation"] == "step_child"
    assert (await relatives(owner, family, "mum"))[older]["relation"] == "child"
    assert (await relatives(owner, family, "kid"))[older]["relation"] == "half_sibling"


async def test_new_single_parent_family_for_a_child(api, family):
    owner = api.as_(OWNER)
    r = await add(owner, family, "Half", "child", "dad", new_family=True)
    assert r.status_code == 201, r.text
    assert (await relatives(owner, family, "kid"))[r.json()["id"]]["relation"] == "half_sibling"
    assert (await relatives(owner, family, "mum")).get(r.json()["id"], {}).get(
        "relation"
    ) == "step_child"


async def test_step_sibling_through_a_step_parent(api, family):
    owner = api.as_(OWNER)
    stepdad = (
        await add(owner, family, "Stepdad", "step_parent", "kid", via_person_id=family["mum"])
    ).json()["id"]
    r = await add(owner, family, "Stepbro", "step_sibling", "kid")
    assert r.status_code == 201, r.text
    stepbro = r.json()["id"]
    assert (await relatives(owner, family, "kid"))[stepbro]["relation"] == "step_sibling"
    assert (await relatives(owner, family, None, stepdad))[stepbro]["relation"] == "child"


async def test_helpful_errors_when_the_link_is_missing(api, family):
    owner = api.as_(OWNER)
    loner = (await owner.post(base(family), {"given_names": "Loner"})).json()
    family["loner"] = loner["id"]
    r = await add(owner, family, "X", "step_parent", "loner")
    assert r.status_code == 422 and "Add a parent first" in r.json()["detail"]
    r = await add(owner, family, "X", "step_child", "loner")
    assert r.status_code == 422 and "Add a partner first" in r.json()["detail"]
    r = await add(owner, family, "X", "step_sibling", "loner")
    assert r.status_code == 422 and "Add a step-parent first" in r.json()["detail"]
    r = await add(owner, family, "X", "step_parent", "kid", via_person_id=family["grandpa"])
    assert r.status_code == 422 and "isn't one of their parents" in r.json()["detail"]


async def test_partner_with_status(api, family):
    owner = api.as_(OWNER)
    ex = (await add(owner, family, "Ex", "partner", "kid", status="divorced")).json()["id"]
    assert (await relatives(owner, family, "kid"))[ex]["status"] == "divorced"


async def test_relatives_are_grouped_in_order(api, family):
    owner = api.as_(OWNER)
    await add(owner, family, "Sis", "sibling", "dad")
    order = [
        r["relation"]
        for r in (await owner.get(f"{base(family)}/{family['dad']}")).json()["relatives"]
    ]
    assert order == ["parent", "parent", "partner", "sibling", "sibling", "child"]


# ---- profile details ---------------------------------------------------------------------


async def test_profile_details_round_trip(api, family):
    owner = api.as_(OWNER)
    r = await owner.patch(
        f"{base(family)}/{family['grandpa']}",
        {
            "occupation": "Shipwright",
            "nationality": "British-American",
            "education": "Leeds Trade School",
            "links": [{"url": "instagram.com/arthurlane", "label": ""}],
            "vehicles": ["1962 Ford Falcon"],
            "pets": [{"name": "Duke", "kind": "Border Collie"}],
            "favorites": [
                {"category": "food", "value": "Sunday roast"},
                {"category": "Poet", "value": "Yeats"},
            ],
        },
    )
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["occupation"] == "Shipwright"
    assert p["links"] == [{"url": "https://instagram.com/arthurlane", "label": ""}]
    assert p["vehicles"] == ["1962 Ford Falcon"]
    assert p["pets"] == [{"name": "Duke", "kind": "Border Collie"}]
    assert p["favorites"][1] == {"category": "Poet", "value": "Yeats"}


async def test_links_must_be_web_addresses(api, family):
    owner = api.as_(OWNER)
    for bad in ["javascript:alert(1)", "mailto:someone@example.com", "https://"]:
        r = await owner.patch(f"{base(family)}/{family['grandpa']}", {"links": [{"url": bad}]})
        assert r.status_code == 422, bad


async def test_contributor_cannot_change_living_profile_details(api, family):
    c = await join(api, family["tree"], "c@example.com", "contributor")
    r = await c.patch(f"{base(family)}/{family['dad']}", {"occupation": "Pilot"})
    assert r.status_code == 403
    r = await c.patch(f"{base(family)}/{family['grandpa']}", {"occupation": "Shipwright"})
    assert r.status_code == 200
