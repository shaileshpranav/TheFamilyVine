from tests.conftest import OWNER, join


def path(family, who=None):
    base = f"/api/trees/{family['tree']}"
    return f"{base}/people/{family[who]}" if who else base


async def add_event(client, family, who, body):
    return await client.post(f"{path(family, who)}/events", body)


async def person(client, family, who):
    r = await client.get(path(family, who))
    assert r.status_code == 200, r.text
    return r.json()


async def couple_id(client, family, a, b):
    """The family id of the couple a + b, from a's relatives."""
    rels = (await person(client, family, a))["relatives"]
    return next(
        r["family_id"] for r in rels if r["relation"] == "partner" and r["person_id"] == family[b]
    )


# ---- person events -----------------------------------------------------------------------


async def test_birth_with_place_shows_as_vital_and_in_lists(api, family):
    owner = api.as_(OWNER)
    r = await add_event(
        owner,
        family,
        "grandpa",
        {
            "type": "birth",
            "date": {"year": 1931, "month": 3, "day": 12},
            "place": "Leeds, England",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["date"]["label"] == "12 March 1931"
    assert r.json()["place"] == "Leeds, England"

    detail = await person(owner, family, "grandpa")
    assert detail["birth"]["date"]["short"] == "1931"
    assert detail["birth"]["place"] == "Leeds, England"
    listed = (await owner.get(f"{path(family)}/people")).json()
    grandpa = next(p for p in listed if p["id"] == family["grandpa"])
    assert grandpa["birth"]["date"]["label"] == "12 March 1931"
    assert grandpa["death"] is None


async def test_only_one_birth(api, family):
    owner = api.as_(OWNER)
    assert (
        await add_event(owner, family, "dad", {"type": "birth", "date": {"year": 1955}})
    ).status_code == 201
    r = await add_event(owner, family, "dad", {"type": "birth", "date": {"year": 1956}})
    assert r.status_code == 409


async def test_invalid_date_and_wrong_event_kind(api, family):
    owner = api.as_(OWNER)
    r = await add_event(
        owner, family, "dad", {"type": "birth", "date": {"year": 1955, "month": 2, "day": 30}}
    )
    assert r.status_code == 422
    r = await add_event(owner, family, "dad", {"type": "marriage", "date": {"year": 1980}})
    assert r.status_code == 422


async def test_contributor_events_follow_edit_rules(api, family):
    c = await join(api, family["tree"], "c@example.com", "contributor")
    assert (
        await add_event(c, family, "grandpa", {"type": "occupation", "title": "Shipwright"})
    ).status_code == 201
    assert (
        await add_event(c, family, "dad", {"type": "occupation", "title": "Carpenter"})
    ).status_code == 403


async def test_death_of_living_person_needs_admin_and_marks_deceased(api, family):
    me = await join(api, family["tree"], "me@example.com", "personal")
    mine = (await me.post(f"{path(family)}/people", {"given_names": "Me", "is_me": True})).json()
    r = await me.post(
        f"{path(family)}/people/{mine['id']}/events", {"type": "death", "date": {"year": 2030}}
    )
    assert r.status_code == 403

    owner = api.as_(OWNER)
    r = await add_event(owner, family, "dad", {"type": "death", "date": {"year": 2024}})
    assert r.status_code == 201
    assert (await person(owner, family, "dad"))["is_living"] is False


async def test_update_and_delete_event(api, family):
    owner = api.as_(OWNER)
    e = (await add_event(owner, family, "uncle", {"type": "residence", "place": "Boston"})).json()
    r = await owner.patch(
        f"{path(family)}/events/{e['id']}",
        {
            "date": {"qualifier": "about", "year": 1990},
            "place": "Denver, Colorado",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["date"]["label"] == "about 1990"
    assert r.json()["place"] == "Denver, Colorado"
    r = await owner.patch(f"{path(family)}/events/{e['id']}", {"place": None, "date": None})
    assert r.json()["place"] is None and r.json()["date"] is None
    assert (await owner.delete(f"{path(family)}/events/{e['id']}")).status_code == 204
    assert (await person(owner, family, "uncle"))["timeline"] == []


async def test_places_are_reused_ignoring_case(api, family):
    owner = api.as_(OWNER)
    await add_event(
        owner,
        family,
        "grandpa",
        {"type": "birth", "date": {"year": 1931}, "place": "Leeds, England"},
    )
    await add_event(
        owner,
        family,
        "grandma",
        {"type": "birth", "date": {"year": 1934}, "place": "leeds,  england"},
    )
    places = (await owner.get(f"{path(family)}/places")).json()
    assert [p["name"] for p in places] == ["Leeds, England"]
    grandma = await person(owner, family, "grandma")
    assert grandma["birth"]["place"] == "Leeds, England"


# ---- couples -----------------------------------------------------------------------------


async def test_marriage_appears_on_both_timelines_with_the_partner_named(api, family):
    owner = api.as_(OWNER)
    fid = await couple_id(owner, family, "grandpa", "grandma")
    r = await owner.post(
        f"{path(family)}/families/{fid}/events", {"type": "marriage", "date": {"year": 1958}}
    )
    assert r.status_code == 201, r.text
    grandpa = await person(owner, family, "grandpa")
    grandma = await person(owner, family, "grandma")
    assert [i["summary"] for i in grandpa["timeline"]] == ["Married Grandma Test"]
    assert [i["summary"] for i in grandma["timeline"]] == ["Married Grandpa Test"]
    assert grandpa["timeline"][0]["kind"] == "family"


async def test_divorce_moves_status_forward_only(api, family):
    owner = api.as_(OWNER)
    fid = await couple_id(owner, family, "dad", "mum")
    await owner.post(
        f"{path(family)}/families/{fid}/events", {"type": "divorce", "date": {"year": 2020}}
    )
    dad = await person(owner, family, "dad")
    assert next(r for r in dad["relatives"] if r["relation"] == "partner")["status"] == "divorced"
    await owner.post(
        f"{path(family)}/families/{fid}/events", {"type": "separation", "date": {"year": 2019}}
    )
    dad = await person(owner, family, "dad")
    assert next(r for r in dad["relatives"] if r["relation"] == "partner")["status"] == "divorced"


async def test_couple_edit_rules(api, family):
    owner = api.as_(OWNER)
    living_couple = await couple_id(owner, family, "dad", "mum")
    deceased_couple = await couple_id(owner, family, "grandpa", "grandma")

    c = await join(api, family["tree"], "c@example.com", "contributor")
    body = {"type": "marriage", "date": {"year": 1986}}
    assert (
        await c.post(f"{path(family)}/families/{living_couple}/events", body)
    ).status_code == 403
    assert (
        await c.post(f"{path(family)}/families/{deceased_couple}/events", body)
    ).status_code == 201
    assert (
        await c.patch(f"{path(family)}/families/{living_couple}", {"status": "separated"})
    ).status_code == 403
    dad_for_c = await person(c, family, "dad")
    assert (
        next(r for r in dad_for_c["relatives"] if r["relation"] == "partner")["can_edit_family"]
        is False
    )

    # Mum, linked to her own profile with only the Personal role, may edit her own couple.
    r = await owner.post(
        f"{path(family)}/invites", {"role": "personal", "person_id": family["mum"]}
    )
    mum = api.as_("mum@example.com")
    await mum.post(f"/api/invites/{r.json()['token']}/accept")
    assert (
        await mum.patch(f"{path(family)}/families/{living_couple}", {"status": "separated"})
    ).status_code == 200
    assert (
        await mum.post(f"{path(family)}/families/{living_couple}/events", body)
    ).status_code == 201


# ---- timeline ----------------------------------------------------------------------------


async def test_timeline_includes_children_births_and_partner_deaths_in_order(api, family):
    owner = api.as_(OWNER)
    await add_event(owner, family, "dad", {"type": "birth", "date": {"year": 1955}})
    await add_event(owner, family, "kid", {"type": "birth", "date": {"year": 1989, "month": 5}})
    await add_event(
        owner,
        family,
        "dad",
        {"type": "education", "title": "Apprenticeship", "date": {"year": 1973}},
    )
    fid = await couple_id(owner, family, "dad", "mum")
    await owner.post(
        f"{path(family)}/families/{fid}/events", {"type": "marriage", "date": {"year": 1986}}
    )
    await add_event(owner, family, "mum", {"type": "death", "date": {"year": 2021}})

    dad = await person(owner, family, "dad")
    assert [(i["date"]["short"], i["summary"]) for i in dad["timeline"]] == [
        ("1955", "Born"),
        ("1973", "Apprenticeship"),
        ("1986", "Married Mum Test"),
        ("1989", "Kid Test was born"),
        ("2021", "Mum Test died"),
    ]
    editable = {i["summary"]: i["editable"] for i in dad["timeline"]}
    assert editable["Kid Test was born"] is False and editable["Born"] is True


async def test_create_person_with_birth_and_death(api, family):
    owner = api.as_(OWNER)
    r = await owner.post(
        f"{path(family)}/people",
        {
            "given_names": "Great",
            "surname": "Aunt",
            "is_living": False,
            "birth": {"qualifier": "about", "year": 1901},
            "death": {"year": 1980},
            "relative": {"person_id": family["grandpa"], "relation": "sibling"},
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["birth"]["date"]["short"] == "c. 1901"
    assert r.json()["death"]["date"]["short"] == "1980"

    r = await owner.post(
        f"{path(family)}/people", {"given_names": "X", "is_living": True, "death": {"year": 1990}}
    )
    assert r.status_code == 422
