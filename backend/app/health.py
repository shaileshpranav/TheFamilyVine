"""Who may see and record health conditions, and what runs in the family.

Conditions are shared only with the person and their blood relatives, admins included: an
in-law or a friend of the family never sees them. A living person records their own; a
deceased person's are kept by blood relatives who may edit their profile.

"Watch" items come from what close blood relatives have recorded (parents, grandparents,
great-grandparents and siblings), and only from relatives the viewer could see directly.
"""

import uuid
from collections.abc import Callable
from dataclasses import dataclass

from app.kinship import Kin
from app.models import Condition, ConditionStatus, Person
from app.permissions import TreeAccess

PASSED_ON = (ConditionStatus.DIAGNOSED, ConditionStatus.CARRIER)
GENERATIONS_UP = 3


def my_person_id(access: TreeAccess, people: dict[uuid.UUID, Person]) -> uuid.UUID | None:
    return next((p.id for p in people.values() if p.linked_user_id == access.user.id), None)


def can_view(access: TreeAccess, kin: Kin, me: uuid.UUID | None, person: Person) -> bool:
    return (
        me is not None
        and access.can_view_person(person)
        and (me == person.id or kin.blood_related(me, person.id))
    )


def can_edit(access: TreeAccess, kin: Kin, me: uuid.UUID | None, person: Person) -> bool:
    if person.is_living:
        return me == person.id
    return can_view(access, kin, me, person) and access.can_edit_person(person)


@dataclass
class Inherited:
    name: str
    status: ConditionStatus
    source_id: uuid.UUID
    """The closest relative who has it recorded."""
    via: list[uuid.UUID]
    """From that relative down to the person's parent: the line it runs through."""
    generations: int
    """1 for a parent, 2 for a grandparent, 3 for a great-grandparent; 0 for a sibling."""
    others: int
    """How many more relatives have it recorded."""


def _line(kin: Kin, person: uuid.UUID, ancestor: uuid.UUID, gens: int) -> list[uuid.UUID]:
    """The chain from an ancestor down to the person's parent, following recorded parents."""
    chain = [person]
    for _ in range(gens):
        up = [
            p for p in kin.blood_parents(chain[-1]) if p == ancestor or ancestor in kin.ancestry(p)
        ]
        if not up:
            break
        chain.append(sorted(up, key=str)[0])
    return list(reversed(chain[1:]))


def inherited(
    kin: Kin,
    person: uuid.UUID,
    conditions: list[Condition],
    may_see: Callable[[uuid.UUID], bool],
) -> list[Inherited]:
    """Conditions close blood relatives have recorded, which the person hasn't themselves."""
    own = {c.name.strip().casefold() for c in conditions if c.person_id == person}
    ancestry = kin.ancestry(person)
    closeness: dict[uuid.UUID, int] = {
        p: gen
        for p, gen in ancestry.items()
        if isinstance(p, uuid.UUID) and 1 <= gen <= GENERATIONS_UP
    }
    closeness.update({s: 0 for s in kin.siblings(person)})

    found: dict[str, list[tuple[int, Condition]]] = {}
    for c in conditions:
        key = c.name.strip().casefold()
        if (
            c.person_id in closeness
            and may_see(c.person_id)
            and c.status in PASSED_ON
            and key not in own
        ):
            found.setdefault(key, []).append((closeness[c.person_id], c))

    out: list[Inherited] = []
    for matches in found.values():
        # Parents before grandparents; a sibling (0) counts as close as a parent.
        matches.sort(key=lambda m: (max(m[0], 1), m[0], str(m[1].person_id)))
        gens, c = matches[0]
        out.append(
            Inherited(
                name=c.name,
                status=c.status,
                source_id=c.person_id,
                via=_line(kin, person, c.person_id, gens) if gens > 1 else [],
                generations=gens,
                others=len({m[1].person_id for m in matches}) - 1,
            )
        )
    return sorted(out, key=lambda i: (max(i.generations, 1), i.name.casefold()))
