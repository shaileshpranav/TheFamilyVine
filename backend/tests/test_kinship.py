import uuid

from app.kinship import Kin
from app.models import ChildRelation, PartnerStatus

B, STEP = ChildRelation.BIOLOGICAL, ChildRelation.STEP
TOGETHER, SEPARATED, DIVORCED = (
    PartnerStatus.TOGETHER,
    PartnerStatus.SEPARATED,
    PartnerStatus.DIVORCED,
)

names = (
    "arthur beatrice margaret david james ellie tom grace susan marco sofia nina leo x y p q c"
).split()
ids = {n: uuid.uuid4() for n in names}
fam = {f: uuid.uuid4() for f in "F1 F2 F3 F4 F5 F6 F7 F8".split()}


def build() -> Kin:
    """The Hollis family from the design, plus a remarriage and two edge cases.

    F1 Arthur + Beatrice          -> Margaret, David
    F2 James + Margaret           -> Ellie, Tom
    F3 David (alone)              -> Grace
    F4 David + Susan (separated)  -> (none)       Susan is Grace's step-mother
    F5 Ellie + Marco (divorced)   -> Sofia
    F6 Marco + Nina               -> Leo          Leo is Sofia's half-brother
    F7 (no parents recorded)      -> X, Y         siblings all the same
    F8 P + Q                      -> C (step)     an explicit step link
    """
    families = [
        (fam["F1"], TOGETHER),
        (fam["F2"], TOGETHER),
        (fam["F3"], TOGETHER),
        (fam["F4"], SEPARATED),
        (fam["F5"], DIVORCED),
        (fam["F6"], TOGETHER),
        (fam["F7"], TOGETHER),
        (fam["F8"], TOGETHER),
    ]
    partners = [
        (fam["F1"], ids["arthur"]),
        (fam["F1"], ids["beatrice"]),
        (fam["F2"], ids["james"]),
        (fam["F2"], ids["margaret"]),
        (fam["F3"], ids["david"]),
        (fam["F4"], ids["david"]),
        (fam["F4"], ids["susan"]),
        (fam["F5"], ids["ellie"]),
        (fam["F5"], ids["marco"]),
        (fam["F6"], ids["marco"]),
        (fam["F6"], ids["nina"]),
        (fam["F8"], ids["p"]),
        (fam["F8"], ids["q"]),
    ]
    children = [
        (fam["F1"], ids["margaret"], B),
        (fam["F1"], ids["david"], B),
        (fam["F2"], ids["ellie"], B),
        (fam["F2"], ids["tom"], B),
        (fam["F3"], ids["grace"], B),
        (fam["F5"], ids["sofia"], B),
        (fam["F6"], ids["leo"], B),
        (fam["F7"], ids["x"], B),
        (fam["F7"], ids["y"], B),
        (fam["F8"], ids["c"], STEP),
    ]
    return Kin.from_rows(families, partners, children)


def rel(kin: Kin, who: str) -> dict[str, str]:
    by_id = {v: k for k, v in ids.items()}
    return {by_id[r.person_id]: r.relation for r in kin.relatives(ids[who])}


def test_parents_partners_children_and_full_siblings():
    kin = build()
    assert rel(kin, "margaret") == {
        "arthur": "parent",
        "beatrice": "parent",
        "james": "partner",
        "david": "sibling",
        "ellie": "child",
        "tom": "child",
    }


def test_step_parent_through_a_separated_partner():
    kin = build()
    assert rel(kin, "grace") == {"david": "parent", "susan": "step_parent"}
    susan = next(r for r in kin.relatives(ids["grace"]) if r.relation == "step_parent")
    assert susan.via_person_id == ids["david"]
    assert susan.status == SEPARATED
    assert rel(kin, "susan") == {"david": "partner", "grace": "step_child"}


def test_half_siblings_and_step_parent_after_remarriage():
    kin = build()
    assert rel(kin, "sofia") == {
        "ellie": "parent",
        "marco": "parent",
        "nina": "step_parent",
        "leo": "half_sibling",
    }


def test_half_sibling_is_not_also_a_step_sibling():
    # Ellie is Leo's step-mother, and her daughter Sofia is Leo's half-sister, not step-sister.
    kin = build()
    assert rel(kin, "leo") == {
        "marco": "parent",
        "nina": "parent",
        "ellie": "step_parent",
        "sofia": "half_sibling",
    }


def test_step_child_of_a_former_partner():
    kin = build()
    assert rel(kin, "ellie")["leo"] == "step_child"


def test_partner_carries_the_couple_status_and_family():
    kin = build()
    marco = next(r for r in kin.relatives(ids["ellie"]) if r.relation == "partner")
    assert marco.status == DIVORCED
    assert marco.family_id == fam["F5"]


def test_siblings_without_recorded_parents():
    kin = build()
    assert rel(kin, "x") == {"y": "sibling"}


def test_explicit_step_links_are_never_blood():
    kin = build()
    assert rel(kin, "c") == {"p": "step_parent", "q": "step_parent"}
    assert rel(kin, "p")["c"] == "step_child"
