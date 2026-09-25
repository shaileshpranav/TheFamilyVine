"""Life events (on a person or a couple), couple status, and the tree's place names."""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.deps import DB, Access, forbidden, get_visible_person, not_found
from app.models import (
    FAMILY_EVENT_TYPES,
    ONE_PER_PERSON,
    PERSON_EVENT_TYPES,
    Event,
    EventType,
    Family,
    PartnerStatus,
    Person,
    Place,
)
from app.permissions import TreeAccess
from app.schemas import EventIn, EventOut, EventUpdate, FamilyOut, FamilyUpdate, PlaceOut

router = APIRouter(prefix="/api/trees/{tree_id}", tags=["events"])

# Recording one of these on a couple moves a "together" couple along, never backwards.
_STATUS_AFTER = {
    EventType.SEPARATION: PartnerStatus.SEPARATED,
    EventType.DIVORCE: PartnerStatus.DIVORCED,
}
_STATUS_ORDER = [PartnerStatus.TOGETHER, PartnerStatus.SEPARATED, PartnerStatus.DIVORCED]


def _event_out(event: Event) -> EventOut:
    return EventOut(
        id=event.id,
        person_id=event.person_id,
        family_id=event.family_id,
        type=event.type,
        title=event.title,
        description=event.description,
        date=event.date,
        place=event.place_name,
    )


async def _place(db: DB, tree_id: uuid.UUID, name: str | None) -> Place | None:
    """Reuse the tree's place with this name (ignoring case), or create it."""
    name = " ".join((name or "").split())
    if not name:
        return None
    existing = await db.scalar(
        select(Place).where(Place.tree_id == tree_id, func.lower(Place.name) == name.lower())
    )
    if existing is not None:
        return existing
    place = Place(tree_id=tree_id, name=name)
    db.add(place)
    await db.flush()
    return place


async def _family(db: DB, access: TreeAccess, family_id: uuid.UUID) -> tuple[Family, list[Person]]:
    family = await db.get(Family, family_id)
    if family is None or family.tree_id != access.tree_id:
        raise not_found("Family not found")
    partners = [p for fp in family.partners if (p := await db.get(Person, fp.person_id))]
    if not any(access.can_view_person(p) for p in partners):
        raise not_found("Family not found")
    return family, partners


async def _check_person_event(
    db: DB, access: TreeAccess, person: Person, kind: EventType, event_id: uuid.UUID | None = None
) -> None:
    if kind not in PERSON_EVENT_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That event belongs to a couple")
    if kind in ONE_PER_PERSON:
        clash = await db.scalar(
            select(Event.id).where(
                Event.person_id == person.id, Event.type == kind, Event.id != event_id
            )
        )
        if clash is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"They already have a {kind.value} recorded; edit that instead",
            )
    if kind == EventType.DEATH and person.is_living:
        if not access.can_set_living(person):
            raise forbidden("Only admins can record a death for someone marked living")
        person.is_living = False


def _advance_status(family: Family, kind: EventType) -> None:
    target = _STATUS_AFTER.get(kind)
    if target and _STATUS_ORDER.index(target) > _STATUS_ORDER.index(family.status):
        family.status = target


@router.post(
    "/people/{person_id}/events", response_model=EventOut, status_code=status.HTTP_201_CREATED
)
async def add_person_event(
    tree_id: uuid.UUID, person_id: uuid.UUID, body: EventIn, access: Access, db: DB
):
    person = await get_visible_person(db, access, person_id)
    if not access.can_edit_person(person):
        raise forbidden("You can't edit this person")
    await _check_person_event(db, access, person, body.type)
    event = Event(
        tree_id=tree_id,
        person_id=person.id,
        type=body.type,
        title=body.title.strip(),
        description=body.description.strip(),
        created_by_id=access.user.id,
    )
    event.set_date(body.date)
    event.place = await _place(db, tree_id, body.place)
    db.add(event)
    await db.commit()
    return _event_out(event)


@router.post(
    "/families/{family_id}/events", response_model=EventOut, status_code=status.HTTP_201_CREATED
)
async def add_family_event(
    tree_id: uuid.UUID, family_id: uuid.UUID, body: EventIn, access: Access, db: DB
):
    family, partners = await _family(db, access, family_id)
    if body.type not in FAMILY_EVENT_TYPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That event belongs to a person")
    if not access.can_edit_family(partners):
        raise forbidden("You can't edit this couple")
    event = Event(
        tree_id=tree_id,
        family_id=family.id,
        type=body.type,
        title=body.title.strip(),
        description=body.description.strip(),
        created_by_id=access.user.id,
    )
    event.set_date(body.date)
    event.place = await _place(db, tree_id, body.place)
    db.add(event)
    _advance_status(family, body.type)
    await db.commit()
    return _event_out(event)


async def _editable_event(
    db: DB, access: TreeAccess, event_id: uuid.UUID
) -> tuple[Event, Person | None]:
    event = await db.get(Event, event_id)
    if event is None or event.tree_id != access.tree_id:
        raise not_found("Event not found")
    if event.person_id is not None:
        person = await get_visible_person(db, access, event.person_id)
        if not access.can_edit_person(person):
            raise forbidden("You can't edit this person")
        return event, person
    assert event.family_id is not None
    _family_row, partners = await _family(db, access, event.family_id)
    if not access.can_edit_family(partners):
        raise forbidden("You can't edit this couple")
    return event, None


@router.patch("/events/{event_id}", response_model=EventOut)
async def update_event(
    tree_id: uuid.UUID, event_id: uuid.UUID, body: EventUpdate, access: Access, db: DB
):
    event, person = await _editable_event(db, access, event_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("type") is not None and body.type != event.type:
        assert body.type is not None
        if person is not None:
            await _check_person_event(db, access, person, body.type, event.id)
        elif body.type not in FAMILY_EVENT_TYPES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "That event belongs to a person"
            )
        event.type = body.type
    if body.title is not None:
        event.title = body.title.strip()
    if body.description is not None:
        event.description = body.description.strip()
    if "date" in changes:
        event.set_date(body.date)
    if "place" in changes:
        event.place = await _place(db, tree_id, body.place)
    await db.commit()
    return _event_out(event)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(tree_id: uuid.UUID, event_id: uuid.UUID, access: Access, db: DB):
    event, _person = await _editable_event(db, access, event_id)
    await db.delete(event)
    await db.commit()


@router.patch("/families/{family_id}", response_model=FamilyOut)
async def update_family(
    tree_id: uuid.UUID, family_id: uuid.UUID, body: FamilyUpdate, access: Access, db: DB
):
    family, partners = await _family(db, access, family_id)
    if not access.can_edit_family(partners):
        raise forbidden("You can't edit this couple")
    family.status = body.status
    await db.commit()
    return FamilyOut(
        id=family.id,
        status=family.status,
        partner_ids=[fp.person_id for fp in family.partners],
        child_ids=[c.person_id for c in family.children],
    )


@router.get("/places", response_model=list[PlaceOut])
async def list_places(
    tree_id: uuid.UUID, access: Access, db: DB, q: str | None = Query(None, max_length=200)
):
    stmt = select(Place).where(Place.tree_id == tree_id)
    if q:
        stmt = stmt.where(Place.name.ilike(f"%{q.strip()}%"))
    return (await db.scalars(stmt.order_by(Place.name))).all()
