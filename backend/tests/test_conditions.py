from tests.conftest import OWNER


async def member(api, family, email, who, role="contributor"):
    """A member whose account is linked to `who` on the tree."""
    r = await api.as_(OWNER).post(
        f"/api/trees/{family['tree']}/invites", {"role": role, "person_id": family[who]}
    )
    client = api.as_(email)
    assert (await client.post(f"/api/invites/{r.json()['token']}/accept")).status_code == 200
    return client


def flags(detail):
    """Whether the viewer may see, and change, the person's health."""
    return detail["permissions"]["can_view_conditions"], detail["permissions"][
        "can_edit_conditions"
    ]


def url(family, who):
    return f"/api/trees/{family['tree']}/people/{family[who]}"


async def record(client, family, who, name, status="diagnosed", **extra):
    r = await client.post(
        f"{url(family, who)}/conditions", {"name": name, "status": status, **extra}
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_shared_only_with_blood_relatives(api, family):
    kid = await member(api, family, "kid@example.com", "kid")
    mum = await member(api, family, "mum@example.com", "mum")
    await record(kid, family, "grandpa", "Type 2 diabetes", year=1990)

    r = await kid.get(f"{url(family, 'grandpa')}/conditions")
    assert [c["name"] for c in r.json()["recorded"]] == ["Type 2 diabetes"]
    # Mum married in, and the owner isn't on the tree at all: neither sees Grandpa's health.
    assert (await mum.get(f"{url(family, 'grandpa')}/conditions")).status_code == 403
    owner = api.as_(OWNER)
    assert (await owner.get(f"{url(family, 'grandpa')}/conditions")).status_code == 403

    assert flags((await kid.get(url(family, "grandpa"))).json()) == (True, True)
    assert flags((await mum.get(url(family, "grandpa"))).json()) == (False, False)
    assert flags((await owner.get(url(family, "grandpa"))).json()) == (False, False)


async def test_living_people_record_their_own(api, family):
    kid = await member(api, family, "kid@example.com", "kid")
    mum = await member(api, family, "mum@example.com", "mum")
    mine = await record(kid, family, "kid", "Asthma", "watch", note="Borderline test, 2024")
    assert (
        await kid.post(f"{url(family, 'dad')}/conditions", {"name": "X", "status": "watch"})
    ).status_code == 403
    assert (
        await mum.post(f"{url(family, 'kid')}/conditions", {"name": "X", "status": "watch"})
    ).status_code == 403
    # Mum is Kid's blood relative, so she can see (but not change) Kid's record.
    assert (await mum.get(f"{url(family, 'kid')}/conditions")).json()["recorded"][0][
        "name"
    ] == "Asthma"

    base = f"/api/trees/{family['tree']}/conditions/{mine['id']}"
    assert (await mum.patch(base, {"status": "diagnosed"})).status_code == 403
    assert (await kid.patch(base, {"status": "diagnosed", "year": 2025})).json()["year"] == 2025
    assert (await kid.delete(base)).status_code == 204


async def test_what_runs_in_the_family(api, family):
    kid = await member(api, family, "kid@example.com", "kid")
    mum = await member(api, family, "mum@example.com", "mum")
    await record(kid, family, "grandpa", "Type 2 diabetes")
    await record(kid, family, "grandma", "BRCA1", "carrier")
    await record(kid, family, "uncle", "Glaucoma")  # an uncle isn't a direct line
    await record(mum, family, "mum", "Coeliac disease")

    inherited = (await kid.get(f"{url(family, 'kid')}/conditions")).json()["inherited"]
    assert [(i["name"], i["generations"]) for i in inherited] == [
        ("Coeliac disease", 1),
        ("BRCA1", 2),
        ("Type 2 diabetes", 2),
    ]
    diabetes = inherited[2]
    assert diabetes["source_id"] == family["grandpa"]
    assert diabetes["via"] == [family["grandpa"], family["dad"]]
    assert diabetes["status"] == "diagnosed" and diabetes["others"] == 0

    # Once Kid has recorded it themselves, it's theirs rather than something to watch.
    await record(kid, family, "kid", "type 2 diabetes", "watch")
    names = [
        i["name"] for i in (await kid.get(f"{url(family, 'kid')}/conditions")).json()["inherited"]
    ]
    assert "Type 2 diabetes" not in names

    # Mum sees Kid's inherited items only from relatives of her own blood.
    names = [
        i["name"] for i in (await mum.get(f"{url(family, 'kid')}/conditions")).json()["inherited"]
    ]
    assert names == ["Coeliac disease"]
