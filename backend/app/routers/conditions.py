"""Health conditions, shared only with the person and their blood relatives (see app.health)."""

import dataclasses
import uuid

from fastapi import APIRouter, status
from sqlalchemy import select

from app import health
from app.deps import DB, Access, forbidden, get_visible_person, not_found
from app.kinship import Kin
from app.models import Condition, ConditionStatus, Person
from app.permissions import TreeAccess
from app.schemas import (
    ConditionIn,
    ConditionOut,
    ConditionsOut,
    ConditionUpdate,
    InheritedConditionOut,
)

router = APIRouter(prefix="/api/trees/{tree_id}", tags=["health"])

ORDER = {s: i for i, s in enumerate(ConditionStatus)}


async def _context(db: DB, access: TreeAccess, person_id: uuid.UUID):
    person = await get_visible_person(db, access, person_id)
    kin = await Kin.load(db, access.tree_id)
    people = {
        p.id: p for p in await db.scalars(select(Person).where(Person.tree_id == access.tree_id))
    }
    return person, kin, people, health.my_person_id(access, people)


@router.get("/people/{person_id}/conditions", response_model=ConditionsOut)
async def list_conditions(tree_id: uuid.UUID, person_id: uuid.UUID, access: Access, db: DB):
    """Their recorded conditions, and what close blood relatives have recorded."""
    person, kin, people, me = await _context(db, access, person_id)
    if not health.can_view(access, kin, me, person):
        raise forbidden("Health is shared only with the person and their blood relatives")
    conditions = list(await db.scalars(select(Condition).where(Condition.tree_id == tree_id)))
    recorded = sorted(
        (c for c in conditions if c.person_id == person.id),
        key=lambda c: (ORDER[c.status], c.name.casefold()),
    )
    inherited = health.inherited(
        kin,
        person.id,
        conditions,
        lambda pid: pid in people and health.can_view(access, kin, me, people[pid]),
    )
    return ConditionsOut(
        recorded=[ConditionOut.model_validate(c) for c in recorded],
        inherited=[InheritedConditionOut(**dataclasses.asdict(i)) for i in inherited],
    )


@router.post(
    "/people/{person_id}/conditions",
    response_model=ConditionOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_condition(
    tree_id: uuid.UUID, person_id: uuid.UUID, body: ConditionIn, access: Access, db: DB
):
    person, kin, _people, me = await _context(db, access, person_id)
    if not health.can_edit(access, kin, me, person):
        raise forbidden("Living people record their own health")
    condition = Condition(
        tree_id=tree_id, person_id=person.id, created_by_id=access.user.id, **body.model_dump()
    )
    db.add(condition)
    await db.commit()
    return condition


async def _editable(db: DB, access: TreeAccess, condition_id: uuid.UUID) -> Condition:
    condition = await db.get(Condition, condition_id)
    if condition is None or condition.tree_id != access.tree_id:
        raise not_found()
    person, kin, _people, me = await _context(db, access, condition.person_id)
    if not health.can_view(access, kin, me, person):
        raise not_found()
    if not health.can_edit(access, kin, me, person):
        raise forbidden()
    return condition


@router.patch("/conditions/{condition_id}", response_model=ConditionOut)
async def update_condition(
    tree_id: uuid.UUID, condition_id: uuid.UUID, body: ConditionUpdate, access: Access, db: DB
):
    condition = await _editable(db, access, condition_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(condition, key, value)
    await db.commit()
    return condition


@router.delete("/conditions/{condition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_condition(tree_id: uuid.UUID, condition_id: uuid.UUID, access: Access, db: DB):
    condition = await _editable(db, access, condition_id)
    await db.delete(condition)
    await db.commit()
