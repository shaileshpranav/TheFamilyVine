"""A person's life in order, and the birth/death summaries shown next to names."""

import datetime as dt
import uuid
from collections import defaultdict
from collections.abc import Collection

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.kinship import STEP, Kin
from app.models import Event, EventType, Person
from app.permissions import TreeAccess
from app.schemas import PersonOut, TimelineItem, VitalOut

EVENT_LABEL: dict[EventType, str] = {
    EventType.BIRTH: "Born",
    EventType.BAPTISM: "Baptised",
    EventType.DEATH: "Died",
    EventType.BURIAL: "Buried",
    EventType.EDUCATION: "Education",
    EventType.OCCUPATION: "Work",
    EventType.RETIREMENT: "Retired",
    EventType.RESIDENCE: "Moved",
    EventType.EMIGRATION: "Emigrated",
    EventType.IMMIGRATION: "Immigrated",
    EventType.MILITARY: "Military service",
    EventType.ENGAGEMENT: "Engaged",
    EventType.MARRIAGE: "Married",
    EventType.SEPARATION: "Separated",
    EventType.DIVORCE: "Divorced",
    EventType.OTHER: "Event",
}

# Couple events read from one partner's side: "Married Beatrice Lane".
_COUPLE_PHRASE: dict[EventType, str] = {
    EventType.ENGAGEMENT: "Engaged to {}",
    EventType.MARRIAGE: "Married {}",
    EventType.SEPARATION: "Separated from {}",
    EventType.DIVORCE: "Divorced {}",
}

# Same-day tie-break: a birth comes first and a burial last.
_RANK = {EventType.BIRTH: 0, EventType.BAPTISM: 1, EventType.DEATH: 8, EventType.BURIAL: 9}


def vital(event: Event) -> VitalOut:
    return VitalOut(event_id=event.id, date=event.date, place=event.place_name)


async def load_vitals(
    db: AsyncSession, tree_id: uuid.UUID, person_ids: Collection[uuid.UUID] | None = None
) -> dict[uuid.UUID, dict[str, VitalOut]]:
    """person id -> {"birth": …, "death": …} for everyone asked about (or the whole tree)."""
    stmt = select(Event).where(
        Event.tree_id == tree_id,
        Event.person_id.is_not(None),
        Event.type.in_([EventType.BIRTH, EventType.DEATH]),
    )
    if person_ids is not None:
        if not person_ids:
            return {}
        stmt = stmt.where(Event.person_id.in_(list(person_ids)))
    out: dict[uuid.UUID, dict[str, VitalOut]] = defaultdict(dict)
    for event in (await db.scalars(stmt)).all():
        assert event.person_id is not None
        out[event.person_id][event.type.value] = vital(event)
    return out


def person_out(person: Person, vitals: dict[uuid.UUID, dict[str, VitalOut]]) -> PersonOut:
    out = PersonOut.model_validate(person)
    mine = vitals.get(person.id, {})
    out.birth = mine.get("birth")
    out.death = mine.get("death")
    return out


def birth_sort_key(vitals: dict[uuid.UUID, dict[str, VitalOut]], pid: uuid.UUID) -> tuple:
    """Order people by birth, unknown births last."""
    birth = vitals.get(pid, {}).get("birth")
    year = birth.date.sort_date() if birth and birth.date else None
    return (year is None, year or dt.date.max)


async def build_timeline(
    db: AsyncSession,
    kin: Kin,
    person: Person,
    people: dict[uuid.UUID, Person],
    access: TreeAccess,
) -> list[TimelineItem]:
    pid = person.id
    visible = {x for x, p in people.items() if access.can_view_person(p)}
    couples = kin.partner_in.get(pid, [])
    children = {c for c, r in kin.children(pid).items() if r != STEP and c in visible}
    partners = {p for p, _fid, _status in kin.partners(pid) if p in visible}

    conditions = [Event.person_id == pid]
    if couples:
        conditions.append(Event.family_id.in_(couples))
    if children or partners:
        conditions.append(
            and_(
                Event.person_id.in_(children | partners),
                Event.type.in_([EventType.BIRTH, EventType.DEATH]),
            )
        )
    events = (await db.scalars(select(Event).where(or_(*conditions)))).all()

    can_edit_self = access.can_edit_person(person)
    rows: list[tuple[tuple, TimelineItem]] = []
    for e in events:
        if e.person_id == pid:
            kind, related, editable = "person", None, can_edit_self
            summary = e.title or EVENT_LABEL[e.type]
        elif e.family_id is not None:
            others = [
                people[x].display_name
                for x in kin.families[e.family_id].partners
                if x != pid and x in visible
            ]
            kind, related = "family", None
            if e.title:
                summary = e.title
            elif others and e.type in _COUPLE_PHRASE:
                summary = _COUPLE_PHRASE[e.type].format(" and ".join(others))
            else:
                summary = EVENT_LABEL[e.type]
            couple = [people[x] for x in kin.families[e.family_id].partners if x in people]
            editable = access.can_edit_family(couple)
        elif e.person_id in children and e.type == EventType.BIRTH:
            kind, related, editable = "child_birth", e.person_id, False
            summary = f"{people[e.person_id].display_name} was born"
        elif e.person_id in partners and e.type == EventType.DEATH:
            kind, related, editable = "partner_death", e.person_id, False
            summary = f"{people[e.person_id].display_name} died"
        else:
            continue

        item = TimelineItem(
            key=f"{kind}:{e.id}",
            event_id=e.id if kind in ("person", "family") else None,
            kind=kind,
            type=e.type,
            type_label=EVENT_LABEL[e.type],
            summary=summary,
            title=e.title,
            description=e.description,
            date=e.date,
            place=e.place_name,
            family_id=e.family_id,
            related_person_id=related,
            editable=editable,
        )
        # SQLite hands back naive timestamps while fresh objects hold aware ones; compare as UTC.
        created = e.created_at.replace(tzinfo=None) if e.created_at else dt.datetime.min
        sort_key = (e.sort_date is None, e.sort_date or dt.date.max, _RANK.get(e.type, 5), created)
        rows.append((sort_key, item))

    rows.sort(key=lambda r: r[0])
    return [item for _key, item in rows]
