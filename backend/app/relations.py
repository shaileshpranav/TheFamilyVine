"""Connecting people by creating or reusing a Family, and removing those links again.

Only parent/child and partner links are stored (see app.kinship), so every relation is
expressed through families. `attach_relative` works the same whether the person being
connected was just created or is already on the tree:

- partner:      a new couple of the two of them, taking in any children with only one of
                them recorded as a parent who are both of theirs
- parent:       join the child's recorded parent as the other parent (or start a family); a
                child whose recorded parent is already the new parent's partner moves into
                that couple
- child:        the same from the parent's side; a child with no parents recorded joins one
                of the parent's couples, or a new single-parent family
- sibling:      share parents: whoever has none recorded joins the other's family, along with
                any siblings also recorded without parents (or the two start a parentless one)
- step_parent:  a couple of them and one of the anchor's parents
- step_child:   a child of one of the anchor's partners, in that partner's own family
- step_sibling: a child of one of the anchor's step-parents, in that step-parent's own family

`detach_relative` removes a direct link again (see Kin.removable_link).
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.kinship import Kin
from app.models import ChildLink, Event, Family, FamilyPartner, PartnerStatus, Person
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


def _check_no_loop(kin: Kin, parents: list[uuid.UUID], children: list[uuid.UUID]) -> None:
    """Refuse links that would make someone their own ancestor."""
    for child in children:
        below = kin.descendants(child) | {child}
        if any(p in below for p in parents):
            raise _unprocessable("That would make someone their own ancestor")


async def _family(db: AsyncSession, family_id: uuid.UUID) -> Family:
    family = await db.get(Family, family_id)
    assert family is not None
    return family


async def _tidy(db: AsyncSession, family: Family) -> None:
    """Remove a family that no longer connects two people, unless events belong to it."""
    if len(family.partners) + len(family.children) >= 2:
        return
    has_events = await db.scalar(select(Event.id).where(Event.family_id == family.id).limit(1))
    if has_events is None:
        await db.delete(family)


async def _single_parent_family(
    db: AsyncSession, kin: Kin, parent_id: uuid.UUID, tree_id: uuid.UUID
) -> Family:
    """The parent's family with no other partner, creating it if needed."""
    for fid in kin.partner_in.get(parent_id, ()):
        if kin.families[fid].partners == [parent_id]:
            return await _family(db, fid)
    family = Family(tree_id=tree_id, partners=[FamilyPartner(person_id=parent_id)], children=[])
    db.add(family)
    return family


async def _move_children(
    db: AsyncSession, source_id: uuid.UUID, target: Family, only: list[uuid.UUID] | None = None
) -> None:
    """Move children (all, or `only` these) into `target`, keeping how they're related.

    `target` needs its children loaded: a family read from the database, or a new one made
    with `children=[]` (otherwise a flush below leaves the list to a lazy load, which async
    code can't do). The old family goes if it no longer connects anyone.
    """
    source = await _family(db, source_id)
    for link in [c for c in source.children if only is None or c.person_id in only]:
        source.children.remove(link)
        existing = next((c for c in target.children if c.person_id == link.person_id), None)
        if existing is not None:
            existing.relation = link.relation
        else:
            target.children.append(ChildLink(person_id=link.person_id, relation=link.relation))
    await _tidy(db, source)


# ---- connecting ----------------------------------------------------------------------------


async def _link_partners(
    db: AsyncSession,
    kin: Kin,
    tree_id: uuid.UUID,
    a: uuid.UUID,
    b: uuid.UUID,
    couple_status: PartnerStatus,
    shared_children: list[uuid.UUID],
) -> None:
    if kin.couples(a, b):
        raise _unprocessable("They're already partners")
    sources = {
        c: kin.sole_parent_family(c, a) or kin.sole_parent_family(c, b) for c in shared_children
    }
    if None in sources.values():
        raise _unprocessable(
            "Only children with no other parent recorded can be the new partner's too"
        )
    _check_no_loop(kin, [a, b], list(sources))
    couple = Family(
        tree_id=tree_id,
        status=couple_status,
        partners=[FamilyPartner(person_id=a), FamilyPartner(person_id=b)],
        children=[],
    )
    db.add(couple)
    for child, source in sources.items():
        assert source is not None
        await _move_children(db, source, couple, [child])


async def _link_parent(
    db: AsyncSession,
    kin: Kin,
    tree_id: uuid.UUID,
    parent: uuid.UUID,
    child: uuid.UUID,
    family_id: uuid.UUID | None = None,
    new_family: bool = False,
    own_family: bool = False,
) -> None:
    """Record `parent` as a parent of `child`.

    A child with parents recorded keeps them, and the new parent joins them. One without
    joins one of the parent's families: `family_id` (a couple), a new single-parent family
    (`new_family`), or the parent's existing one (`own_family`, for step relations).
    Siblings recorded with them but without parents come too, since they share parents.
    """
    if parent in kin.parents(child):
        raise _unprocessable("They're already recorded as a parent")
    births = kin.birth_families(child)
    theirs = kin.partner_in.get(parent, [])
    if family_id is not None and family_id not in births and family_id not in theirs:
        raise _unprocessable("That family doesn't connect them")

    if not any(kin.families[f].partners for f in births):
        # No parents recorded, but `births` may hold siblings recorded without them.
        siblings = {c for f in births for c in kin.families[f].children} | {child}
        if own_family:
            target: Family | None = await _single_parent_family(db, kin, parent, tree_id)
        elif family_id in theirs:
            target = await _family(db, family_id)
        elif new_family or family_id in births or not theirs:
            target = None  # the parent starts a family with them
        else:
            fid = _pick(
                theirs,
                None,
                none_msg="",
                many_msg="This person has several partners; choose the other parent",
                wrong_msg="",
            )
            target = await _family(db, fid)
        known = target is not None and target.id in kin.families
        _check_no_loop(kin, kin.families[target.id].partners if known else [parent], list(siblings))

        groups = list(births)
        if target is None and groups:
            target = await _family(db, groups.pop(0))  # their sibling group gains a parent
            target.partners.append(FamilyPartner(person_id=parent))
        elif target is None:
            target = Family(
                tree_id=tree_id, partners=[FamilyPartner(person_id=parent)], children=[]
            )
            db.add(target)
        for group in groups:
            await _move_children(db, group, target)
        if not births:
            target.children.append(ChildLink(person_id=child))
        return

    if family_id in theirs and family_id not in births:
        # One of the parent's couples: fine when the partner is the child's only parent.
        partner = next((p for p in kin.families[family_id].partners if p != parent), None)
        source = kin.sole_parent_family(child, partner) if partner else None
        if source is None:
            raise _unprocessable("They already have parents recorded")
        await _move_children(db, source, await _family(db, family_id), [child])
        return

    fid = _pick(
        [f for f in births if kin.families[f].partners],
        family_id,
        none_msg="",
        many_msg="This person has more than one set of parents; choose which",
        wrong_msg="That family doesn't connect them",
    )
    family = kin.families[fid]
    if len(family.partners) >= 2:
        raise _unprocessable("This person already has two parents recorded")
    _check_no_loop(kin, [parent], list(family.children))
    couple = kin.couples(parent, family.partners[0]) if family.partners else []
    if couple:
        # They're already a couple, so the child moves in with them.
        await _move_children(db, fid, await _family(db, couple[0]), [child])
    else:
        joined = await _family(db, fid)  # keep a reference: the session only holds it weakly
        joined.partners.append(FamilyPartner(person_id=parent))


async def _link_siblings(
    db: AsyncSession,
    kin: Kin,
    tree_id: uuid.UUID,
    a: uuid.UUID,
    b: uuid.UUID,
    family_id: uuid.UUID | None,
) -> None:
    mine, theirs = kin.birth_families(a), kin.birth_families(b)
    if set(mine) & set(theirs):
        raise _unprocessable("They're already siblings")
    if not mine and not theirs:
        # No parents recorded yet: a parentless family keeps the two as siblings, and a
        # parent added later to either of them becomes a parent of both.
        db.add(Family(tree_id=tree_id, children=[ChildLink(person_id=a), ChildLink(person_id=b)]))
        return

    def movable(families: list[uuid.UUID]) -> bool:
        """Recorded without parents (with any siblings), so free to join someone else's."""
        return len(families) <= 1 and all(not kin.families[f].partners for f in families)

    if movable(theirs) and mine:
        group, joining = theirs, mine
    elif movable(mine) and theirs:
        group, joining = mine, theirs
    else:
        raise _unprocessable(
            "They already have different parents recorded; connect their parents instead"
        )
    fid = _pick(
        joining,
        family_id,
        none_msg="",
        many_msg="This person has more than one set of parents; choose which they share",
        wrong_msg="That family isn't one this person was born into",
    )
    target = await _family(db, fid)
    if group:
        _check_no_loop(kin, kin.families[fid].partners, list(kin.families[group[0]].children))
        await _move_children(db, group[0], target)
    else:
        newcomer = b if joining is mine else a
        _check_no_loop(kin, kin.families[fid].partners, [newcomer])
        target.children.append(ChildLink(person_id=newcomer))


async def attach_relative(
    db: AsyncSession, person: Person, link: RelativeLink, anchor: Person
) -> None:
    """Connect `person` to `anchor` as `link.relation` describes (how `person` relates to
    `anchor`). `person` may have just been created or already be on the tree."""
    if person.id == anchor.id:
        raise _unprocessable("Choose someone other than the person themselves")
    tree_id = anchor.tree_id
    kin = await Kin.load(db, tree_id)

    match link.relation:
        case "partner":
            await _link_partners(
                db, kin, tree_id, anchor.id, person.id, link.status, link.also_parent_of
            )

        case "parent":
            await _link_parent(
                db, kin, tree_id, person.id, anchor.id, link.family_id, link.new_family
            )

        case "child":
            await _link_parent(
                db, kin, tree_id, anchor.id, person.id, link.family_id, link.new_family
            )

        case "sibling":
            await _link_siblings(db, kin, tree_id, anchor.id, person.id, link.family_id)

        case "step_parent":
            parents = kin.blood_parents(anchor.id)
            parent_id = _pick(
                sorted(parents, key=str),
                link.via_person_id,
                none_msg="Add a parent first: a step-parent is a parent's partner",
                many_msg="Choose which parent they are a partner of",
                wrong_msg="That person isn't one of their parents",
            )
            if person.id in parents:
                raise _unprocessable("They're already recorded as a parent")
            await _link_partners(db, kin, tree_id, parent_id, person.id, link.status, [])

        case "step_child":
            partner_id = _pick(
                [p for p, _fid, _status in kin.partners(anchor.id)],
                link.via_person_id,
                none_msg="Add a partner first: a step-child is a partner's child",
                many_msg="Choose which partner is their parent",
                wrong_msg="That person isn't one of their partners",
            )
            await _link_parent(db, kin, tree_id, partner_id, person.id, own_family=True)

        case "step_sibling":
            step_parent_id = _pick(
                list(kin.step_parents(anchor.id)),
                link.via_person_id,
                none_msg="Add a step-parent first: a step-sibling is a step-parent's child",
                many_msg="Choose which step-parent is their parent",
                wrong_msg="That person isn't one of their step-parents",
            )
            await _link_parent(db, kin, tree_id, step_parent_id, person.id, own_family=True)


# ---- removing links ------------------------------------------------------------------------


async def _unlink_parent(
    db: AsyncSession, kin: Kin, tree_id: uuid.UUID, parent: uuid.UUID, child: uuid.UUID
) -> None:
    """The child stays with any other parent they had alongside this one."""
    for fid in kin.birth_families(child):
        partners = kin.families[fid].partners
        if parent not in partners:
            continue
        other = next((p for p in partners if p != parent), None)
        if other is not None:
            target = await _single_parent_family(db, kin, other, tree_id)
            await _move_children(db, fid, target, [child])
        else:
            family = await _family(db, fid)
            family.children.remove(next(c for c in family.children if c.person_id == child))
            await _tidy(db, family)


async def detach_relative(db: AsyncSession, person: Person, relative: Person) -> None:
    """Remove the direct link between two people: a parent, a child, a partner with no
    children together (their shared events go too), or a sibling recorded without parents."""
    tree_id = person.tree_id
    kin = await Kin.load(db, tree_id)

    match kin.removable_link(person.id, relative.id):
        case "parent":
            await _unlink_parent(db, kin, tree_id, relative.id, person.id)
        case "child":
            await _unlink_parent(db, kin, tree_id, person.id, relative.id)
        case "partner":
            for fid in kin.couples(person.id, relative.id):
                await db.execute(delete(Event).where(Event.family_id == fid))
                await db.delete(await _family(db, fid))
        case "sibling":
            for fid in set(kin.birth_families(person.id)) & set(kin.birth_families(relative.id)):
                if not kin.families[fid].partners:
                    family = await _family(db, fid)
                    link = next(c for c in family.children if c.person_id == relative.id)
                    family.children.remove(link)
                    await _tidy(db, family)
        case None:
            if kin.couples(person.id, relative.id):
                raise _unprocessable(
                    "They have children together. Remove one of them as those children's "
                    "parent first."
                )
            raise _unprocessable(
                "They aren't linked directly: that relation comes through other people, such "
                "as shared parents or a partner"
            )
