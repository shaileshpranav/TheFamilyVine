import dataclasses
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select

from app.deps import DB, Access, forbidden, get_visible_person, not_found
from app.kinship import RELATION_ORDER, Kin
from app.models import Event, EventType, Family, Membership, Person
from app.permissions import TreeAccess
from app.relations import attach_relative, move_child
from app.schemas import (
    LinkParent,
    LinkUser,
    PersonCreate,
    PersonDetailOut,
    PersonOut,
    PersonPermissions,
    PersonUpdate,
    RelativeOut,
)
from app.timeline import birth_sort_key, build_timeline, load_vitals, person_out

router = APIRouter(prefix="/api/trees/{tree_id}/people", tags=["people"])


async def _detail(db: DB, access: TreeAccess, person: Person) -> PersonDetailOut:
    kin = await Kin.load(db, access.tree_id)
    people = {
        p.id: p for p in (await db.scalars(select(Person).where(Person.tree_id == access.tree_id)))
    }

    def visible(pid: uuid.UUID) -> bool:
        return pid in people and access.can_view_person(people[pid])

    def can_edit_couple(family_id: uuid.UUID) -> bool:
        return access.can_edit_family(
            [people[x] for x in kin.families[family_id].partners if x in people]
        )

    relatives: list[RelativeOut] = []
    for rel in kin.relatives(person.id):
        if not visible(rel.person_id):
            continue
        can_edit_family = can_make_parent = False
        if rel.relation == "partner" and rel.family_id is not None:
            can_edit_family = can_edit_couple(rel.family_id)
        if rel.relation in ("step_parent", "step_child"):
            child, step = (
                (person.id, rel.person_id)
                if rel.relation == "step_parent"
                else (rel.person_id, person.id)
            )
            joinable = kin.joinable_couple(child, step)
            can_make_parent = joinable is not None and can_edit_couple(joinable[1])
        relatives.append(
            RelativeOut(
                **dataclasses.asdict(rel),
                can_edit_family=can_edit_family,
                can_make_parent=can_make_parent,
            )
        )

    vitals = await load_vitals(db, access.tree_id, [person.id, *(r.person_id for r in relatives)])
    relatives.sort(
        key=lambda r: (
            RELATION_ORDER[r.relation],
            birth_sort_key(vitals, r.person_id),
            people[r.person_id].display_name,
        )
    )

    return PersonDetailOut(
        **person_out(person, vitals).model_dump(),
        permissions=PersonPermissions(
            can_edit=access.can_edit_person(person),
            can_set_living=access.can_set_living(person),
            can_delete=access.can_delete_person(person),
            can_add_relatives=access.can_attach_to(person),
        ),
        parents=sorted((p for p in kin.parents(person.id) if visible(p)), key=str),
        children=sorted((c for c in kin.children(person.id) if visible(c)), key=str),
        partners=sorted((p for p, _f, _s in kin.partners(person.id) if visible(p)), key=str),
        only_parent_of=sorted(
            (
                c
                for c in kin.children(person.id)
                if visible(c) and kin.sole_parent_family(c, person.id) is not None
            ),
            key=str,
        ),
        relatives=relatives,
        timeline=await build_timeline(db, kin, person, people, access),
    )


@router.get("", response_model=list[PersonOut])
async def list_people(
    tree_id: uuid.UUID, access: Access, db: DB, q: str | None = Query(None, max_length=200)
):
    stmt = select(Person).where(Person.tree_id == tree_id)
    visible = access.visible_person_ids()
    if visible is not None:
        stmt = stmt.where(or_(Person.id.in_(visible), Person.linked_user_id == access.user.id))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Person.given_names.ilike(like),
                Person.surname.ilike(like),
                Person.birth_surname.ilike(like),
                Person.nickname.ilike(like),
                Person.native_name.ilike(like),
            )
        )
    people = (await db.scalars(stmt.order_by(Person.surname, Person.given_names))).all()
    vitals = await load_vitals(db, tree_id)
    return [person_out(p, vitals) for p in people]


@router.post("", response_model=PersonDetailOut, status_code=status.HTTP_201_CREATED)
async def create_person(tree_id: uuid.UUID, body: PersonCreate, access: Access, db: DB):
    link = body.relative
    anchor = await get_visible_person(db, access, link.person_id) if link else None
    if link and link.via_person_id:
        await get_visible_person(db, access, link.via_person_id)

    if body.is_me:
        existing = await db.scalar(
            select(Person.id).where(
                Person.tree_id == tree_id, Person.linked_user_id == access.user.id
            )
        )
        if existing is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "You already have a profile here")
    else:
        if not access.can_create_people():
            raise forbidden("Your role can only add your own profile")
        if anchor is not None and not access.can_attach_to(anchor):
            raise forbidden()
    if access.tree_role is None and anchor is None:
        # A branch-only member's new person would fall outside every branch they can see.
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Add this person as a relative of someone in your branch",
        )

    person = Person(
        tree_id=tree_id,
        created_by_id=access.user.id,
        linked_user_id=access.user.id if body.is_me else None,
        is_living=True if body.is_me else body.is_living,
        **body.model_dump(exclude={"is_me", "is_living", "relative", "birth", "death"}),
    )
    db.add(person)
    await db.flush()
    for kind, when in ((EventType.BIRTH, body.birth), (EventType.DEATH, body.death)):
        if when is not None:
            event = Event(
                tree_id=tree_id, person_id=person.id, type=kind, created_by_id=access.user.id
            )
            event.set_date(when)
            db.add(event)
    if anchor is not None and link is not None:
        await attach_relative(db, person, link, anchor)
    await db.commit()

    # Reload access so sub-tree membership reflects the new relationship.
    fresh = await TreeAccess.load(db, access.user, tree_id)
    assert fresh is not None
    return await _detail(db, fresh, person)


@router.get("/{person_id}", response_model=PersonDetailOut)
async def get_person(tree_id: uuid.UUID, person_id: uuid.UUID, access: Access, db: DB):
    return await _detail(db, access, await get_visible_person(db, access, person_id))


@router.post("/{person_id}/parents", response_model=PersonDetailOut)
async def add_parent(
    tree_id: uuid.UUID, person_id: uuid.UUID, body: LinkParent, access: Access, db: DB
):
    """Record a step-parent as one of this person's parents.

    This fixes the common mix-up of adding someone's other parent as their parent's partner.
    The person moves out of the family where that partner raises them alone and into the
    couple's family, keeping how they're related (biological, adopted…).
    """
    child = await get_visible_person(db, access, person_id)
    step_parent = await get_visible_person(db, access, body.person_id)
    kin = await Kin.load(db, tree_id)
    joinable = kin.joinable_couple(child.id, step_parent.id)
    if joinable is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Only the partner of this person's only recorded parent can be made a parent",
        )
    source_id, couple_id = joinable
    couple = await db.scalars(select(Person).where(Person.id.in_(kin.families[couple_id].partners)))
    if not access.can_edit_family(list(couple)):
        raise forbidden()
    await move_child(db, child.id, source_id, await db.get_one(Family, couple_id))
    await db.commit()

    # Reload access so sub-tree membership reflects the new relationship.
    fresh = await TreeAccess.load(db, access.user, tree_id)
    assert fresh is not None
    return await _detail(db, fresh, child)


@router.patch("/{person_id}", response_model=PersonDetailOut)
async def update_person(
    tree_id: uuid.UUID, person_id: uuid.UUID, body: PersonUpdate, access: Access, db: DB
):
    person = await get_visible_person(db, access, person_id)
    if not access.can_edit_person(person):
        raise forbidden("You can't edit this person")
    changes = body.model_dump(exclude_unset=True)
    if "is_living" in changes:
        if changes["is_living"] is None:
            changes.pop("is_living")
        elif changes["is_living"] != person.is_living and not access.can_set_living(person):
            raise forbidden("Only admins can change whether someone is living")
    for key, value in changes.items():
        if value is not None:
            setattr(person, key, value)
    await db.commit()
    return await _detail(db, access, person)


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(tree_id: uuid.UUID, person_id: uuid.UUID, access: Access, db: DB):
    person = await get_visible_person(db, access, person_id)
    if not access.can_delete_person(person):
        raise forbidden()
    await db.delete(person)
    await db.commit()


@router.put("/{person_id}/linked-user", response_model=PersonDetailOut)
async def link_user(
    tree_id: uuid.UUID, person_id: uuid.UUID, body: LinkUser, access: Access, db: DB
):
    """Admins connect (or disconnect) a member's account to the person they are."""
    person = await get_visible_person(db, access, person_id)
    if not access.can_set_living(person):
        raise forbidden()
    if body.user_id is not None:
        is_member = await db.scalar(
            select(Membership.id).where(
                Membership.tree_id == tree_id, Membership.user_id == body.user_id
            )
        )
        if is_member is None:
            raise not_found("That user isn't a member of this tree")
        taken = await db.scalar(
            select(Person.id).where(
                Person.tree_id == tree_id,
                Person.linked_user_id == body.user_id,
                Person.id != person.id,
            )
        )
        if taken is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "That user is linked to someone else")
    person.linked_user_id = body.user_id
    await db.commit()
    return await _detail(db, access, person)
