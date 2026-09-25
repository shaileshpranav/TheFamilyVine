import uuid

from app.models import SubtreeDirection
from app.subtrees import FamilyGraph

ids = {name: uuid.uuid4() for name in "gpa gma dad mum kid uncle aunt cousin stepmum".split()}


def graph() -> FamilyGraph:
    f1, f2, f3, f4 = (uuid.uuid4() for _ in range(4))
    partners = {
        f1: [ids["gpa"], ids["gma"]],
        f2: [ids["dad"], ids["mum"]],
        f3: [ids["uncle"], ids["aunt"]],
        f4: [ids["dad"], ids["stepmum"]],
    }
    children = {f1: [ids["dad"], ids["uncle"]], f2: [ids["kid"]], f3: [ids["cousin"]]}
    return FamilyGraph.from_families(partners, children)


def names(members: set[uuid.UUID]) -> set[str]:
    return {n for n, i in ids.items() if i in members}


def test_descendants_without_spouses():
    got = graph().branch(ids["gpa"], SubtreeDirection.DESCENDANTS, include_spouses=False)
    assert names(got) == {"gpa", "dad", "uncle", "kid", "cousin"}


def test_descendants_with_spouses_includes_in_laws_and_second_marriages():
    got = graph().branch(ids["gpa"], SubtreeDirection.DESCENDANTS, include_spouses=True)
    assert names(got) == {"gpa", "gma", "dad", "mum", "stepmum", "uncle", "aunt", "kid", "cousin"}


def test_ancestors():
    got = graph().branch(ids["kid"], SubtreeDirection.ANCESTORS, include_spouses=False)
    assert names(got) == {"kid", "dad", "mum", "gpa", "gma"}


def test_both_directions_from_middle():
    got = graph().branch(ids["uncle"], SubtreeDirection.BOTH, include_spouses=False)
    assert names(got) == {"uncle", "cousin", "gpa", "gma"}


def test_cycles_do_not_loop_forever():
    a, b, f = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    g = FamilyGraph.from_families({f: [a]}, {f: [b]})
    g.children[b].add(a)  # corrupt data: b is also a's parent
    assert g.descendants(a) == {a, b}
