from tests.conftest import OWNER, join


def url(family, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    return f"/api/trees/{family['tree']}/graph" + (f"?{query}" if query else "")


def by_partners(graph):
    """Families keyed by their set of partner ids."""
    return {frozenset(f["partner_ids"]): f for f in graph["families"]}


async def test_owner_sees_everyone_and_every_family(api, family):
    graph = (await api.as_(OWNER).get(url(family))).json()
    assert {p["id"] for p in graph["people"]} == {
        family[k] for k in ("grandpa", "grandma", "dad", "uncle", "mum", "kid")
    }
    families = by_partners(graph)
    grandparents = families[frozenset({family["grandpa"], family["grandma"]})]
    assert {c["person_id"] for c in grandparents["children"]} == {family["dad"], family["uncle"]}
    parents = families[frozenset({family["dad"], family["mum"]})]
    assert [c["person_id"] for c in parents["children"]] == [family["kid"]]
    assert parents["status"] == "together"
    assert parents["children"][0]["relation"] == "biological"


async def test_couple_status_marriage_date_and_years(api, family):
    owner = api.as_(OWNER)
    base = f"/api/trees/{family['tree']}"
    detail = (await owner.get(f"{base}/people/{family['dad']}")).json()
    fid = next(r["family_id"] for r in detail["relatives"] if r["relation"] == "partner")
    await owner.post(f"{base}/families/{fid}/events", {"type": "marriage", "date": {"year": 1986}})
    await owner.post(f"{base}/families/{fid}/events", {"type": "divorce", "date": {"year": 2001}})
    await owner.post(
        f"{base}/people/{family['dad']}/events", {"type": "birth", "date": {"year": 1955}}
    )

    graph = (await owner.get(url(family))).json()
    couple = by_partners(graph)[frozenset({family["dad"], family["mum"]})]
    assert couple["status"] == "divorced"
    assert couple["married"] and couple["marriage"]["short"] == "1986"
    grandparents = by_partners(graph)[frozenset({family["grandpa"], family["grandma"]})]
    assert not grandparents["married"] and grandparents["marriage"] is None

    # A marriage with no date still counts.
    gp = (await owner.get(f"{base}/people/{family['grandpa']}")).json()
    gfid = next(r["family_id"] for r in gp["relatives"] if r["relation"] == "partner")
    await owner.post(f"{base}/families/{gfid}/events", {"type": "marriage"})
    graph = (await owner.get(url(family))).json()
    grandparents = by_partners(graph)[frozenset({family["grandpa"], family["grandma"]})]
    assert grandparents["married"] and grandparents["marriage"] is None
    dad = next(p for p in graph["people"] if p["id"] == family["dad"])
    assert dad["birth"]["date"]["short"] == "1955"
    assert dad["display_name"] == "Dad Test"


async def test_branch_only_member_sees_only_their_branch(api, family):
    tid = family["tree"]
    branch = (
        await api.as_(OWNER).post(
            f"/api/trees/{tid}/subtrees", {"name": "Dad's line", "root_person_id": family["dad"]}
        )
    ).json()
    member = await join(api, tid, "branch@example.com", "personal", branch["id"])
    graph = (await member.get(url(family))).json()
    assert {p["id"] for p in graph["people"]} == {family["dad"], family["mum"], family["kid"]}
    # The grandparents' family would only connect Dad, so it isn't sent.
    assert [frozenset(f["partner_ids"]) for f in graph["families"]] == [
        frozenset({family["dad"], family["mum"]})
    ]


async def test_filter_by_branch(api, family):
    tid = family["tree"]
    owner = api.as_(OWNER)
    branch = (
        await owner.post(
            f"/api/trees/{tid}/subtrees", {"name": "Uncle", "root_person_id": family["uncle"]}
        )
    ).json()
    graph = (await owner.get(url(family, subtree_id=branch["id"]))).json()
    assert [p["id"] for p in graph["people"]] == [family["uncle"]]
    assert graph["families"] == []


async def test_unknown_branch_and_strangers_get_404(api, family):
    owner = api.as_(OWNER)
    r = await owner.get(url(family, subtree_id="00000000-0000-0000-0000-000000000000"))
    assert r.status_code == 404
    assert (await api.as_("stranger@example.com").get(url(family))).status_code == 404
