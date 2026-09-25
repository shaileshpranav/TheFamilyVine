"""Attaching a new person to an existing relative by creating or reusing a Family.

Only parent/child and partner links are stored (see app.kinship), so every relation is
expressed through families:

- partner:      a new couple of the two of them
- parent:       join the anchor's birth family as a parent (or start one)
- child:        join one of the anchor's couples as a child (or start a single-parent family)
- sibling:      join the anchor's birth family as a child (or start a parentless one)
- step_parent:  a new couple of the new person and one of the anchor's parents
- step_child:   a child of one of the anchor's partners, in that partner's own family
- step_sibling: a child of one of the anchor's step-parents, in that step-parent's own family
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.kinship import Kin
from app.models import ChildLink, Family, FamilyPartner, Person
from app.schemas import RelativeLink


def _unprocessable(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


def _pick(
    candidates: list[uuid.UUID],
    chosen: uuid.UUID | None,
    none_msg: str,
    many_msg: str,
    wrong_msg: str,
) -> uuid.UUID:
    """Use the chosen id if it's a candidate; otherwise the only candidate."""
    if chosen is not None:
        if chosen not in candidates:
            raise _unprocessable(wrong_msg)
        return chosen
    if not candidates:
        raise _unprocessable(none_msg)
    if len(candidates) > 1:
        raise _unprocessable(many_msg)
    return candidates[0]


async def _family(db: AsyncSession, family_id: uuid.UUID) -> Family:
    family = await db.get(Family, family_id)
    assert family is not None
    return family


async def _single_parent_family(
    db: AsyncSession, kin: Kin, parent_id: uuid.UUID, tree_id: uuid.UUID
) -> Family:
    """The parent's family with no other partner, creating it if needed."""
    for fid in kin.partner_in.get(parent_id, ()):
        if kin.families[fid].partners == [parent_id]:
            return await _family(db, fid)
    family = Family(tree_id=tree_id, partners=[FamilyPartner(person_id=parent_id)])
    db.add(family)
    return family


async def attach_relative(
    db: AsyncSession, new: Person, link: RelativeLink, anchor: Person
) -> None:
    """Link `new` to `anchor` as described by `link.relation` (relative to `anchor`)."""
    tree_id = anchor.tree_id
    kin = await Kin.load(db, tree_id)

    match link.relation:
        case "partner":
            db.add(
                Family(
                    tree_id=tree_id,
                    status=link.status,
                    partners=[FamilyPartner(person_id=anchor.id), FamilyPartner(person_id=new.id)],
                )
            )

        case "parent":
            births = kin.birth_families(anchor.id)
            if link.family_id is not None and link.family_id not in births:
                raise _unprocessable("That family isn't one this person was born into")
            if link.family_id is None and len(births) > 1:
                raise _unprocessable("This person has more than one set of parents; choose which")
            if not births:
                db.add(
                    Family(
                        tree_id=tree_id,
                        partners=[FamilyPartner(person_id=new.id)],
                        children=[ChildLink(person_id=anchor.id)],
                    )
                )
                return
            family = await _family(db, link.family_id or births[0])
            if len(family.partners) >= 2:
                raise _unprocessable("This person already has two parents recorded")
            family.partners.append(FamilyPartner(person_id=new.id))

        case "child":
            couples = kin.partner_in.get(anchor.id, [])
            if link.new_family or not couples:
                family = Family(tree_id=tree_id, partners=[FamilyPartner(person_id=anchor.id)])
                db.add(family)
            else:
                fid = _pick(
                    couples,
                    link.family_id,
                    none_msg="",
                    many_msg="This person has several partners; choose the other parent",
                    wrong_msg="That family doesn't include this parent",
                )
                family = await _family(db, fid)
            family.children.append(ChildLink(person_id=new.id))

        case "sibling":
            births = kin.birth_families(anchor.id)
            if not births and link.family_id is None:
                # No parents recorded yet: a parentless family keeps the two as siblings, and
                # a parent added later to either of them becomes a parent of both.
                db.add(
                    Family(
                        tree_id=tree_id,
                        children=[ChildLink(person_id=anchor.id), ChildLink(person_id=new.id)],
                    )
                )
                return
            fid = _pick(
                births,
                link.family_id,
                none_msg="",
                many_msg="This person has more than one set of parents; choose which they share",
                wrong_msg="That family isn't one this person was born into",
            )
            family = await _family(db, fid)  # keep a reference: the session only holds it weakly
            family.children.append(ChildLink(person_id=new.id))

        case "step_parent":
            parent_id = _pick(
                sorted(kin.blood_parents(anchor.id), key=str),
                link.via_person_id,
                none_msg="Add a parent first: a step-parent is a parent's partner",
                many_msg="Choose which parent they are a partner of",
                wrong_msg="That person isn't one of their parents",
            )
            db.add(
                Family(
                    tree_id=tree_id,
                    status=link.status,
                    partners=[FamilyPartner(person_id=parent_id), FamilyPartner(person_id=new.id)],
                )
            )

        case "step_child":
            partner_id = _pick(
                [p for p, _fid, _status in kin.partners(anchor.id)],
                link.via_person_id,
                none_msg="Add a partner first: a step-child is a partner's child",
                many_msg="Choose which partner is their parent",
                wrong_msg="That person isn't one of their partners",
            )
            family = await _single_parent_family(db, kin, partner_id, tree_id)
            family.children.append(ChildLink(person_id=new.id))

        case "step_sibling":
            step_parent_id = _pick(
                list(kin.step_parents(anchor.id)),
                link.via_person_id,
                none_msg="Add a step-parent first: a step-sibling is a step-parent's child",
                many_msg="Choose which step-parent is their parent",
                wrong_msg="That person isn't one of their step-parents",
            )
            family = await _single_parent_family(db, kin, step_parent_id, tree_id)
            family.children.append(ChildLink(person_id=new.id))
