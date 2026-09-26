"""The whole visible tree in one response, for the tree canvas."""

import uuid

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.deps import DB, Access, not_found
from app.kinship import Kin
from app.models import Event, EventType, Person, Subtree
from app.schemas import GraphChild, GraphFamily, GraphPerson, TreeGraphOut
from app.subtrees import load_graph
from app.timeline import load_vitals

router = APIRouter(prefix="/api/trees/{tree_id}/graph", tags=["graph"])


@router.get("", response_model=TreeGraphOut)
async def tree_graph(
    tree_id: uuid.UUID,
    access: Access,
    db: DB,
    subtree_id: uuid.UUID | None = Query(None, description="Only this branch"),
):
    people = (await db.scalars(select(Person).where(Person.tree_id == tree_id))).all()
    shown = {p.id for p in people if access.can_view_person(p)}
    if subtree_id is not None:
        subtree = await db.get(Subtree, subtree_id)
        if subtree is None or subtree.tree_id != tree_id:
            raise not_found("Branch not found")
        graph = access.graph or await load_graph(db, tree_id)
        shown &= graph.branch(subtree.root_person_id, subtree.direction, subtree.include_spouses)

    kin = await Kin.load(db, tree_id)
    families: list[GraphFamily] = []
    for fam in kin.families.values():
        partners = [p for p in fam.partners if p in shown]
        children = [
            GraphChild(person_id=c, relation=r) for c, r in fam.children.items() if c in shown
        ]
        # Only draw what connects at least two visible people.
        if len(partners) + len(children) < 2:
            continue
        families.append(
            GraphFamily(id=fam.id, status=fam.status, partner_ids=partners, children=children)
        )

    if families:
        marriages = (
            await db.scalars(
                select(Event)
                .where(
                    Event.family_id.in_([f.id for f in families]),
                    Event.type == EventType.MARRIAGE,
                )
                .order_by(Event.sort_date)
            )
        ).all()
        first: dict[uuid.UUID, Event] = {}
        for event in marriages:
            if event.family_id is not None:
                first.setdefault(event.family_id, event)
        for fam_out in families:
            if fam_out.id in first:
                fam_out.marriage = first[fam_out.id].date

    vitals = await load_vitals(db, tree_id, shown)
    out: list[GraphPerson] = []
    for p in people:
        if p.id in shown:
            node = GraphPerson.model_validate(p)
            node.birth = vitals.get(p.id, {}).get("birth")
            node.death = vitals.get(p.id, {}).get("death")
            out.append(node)
    return TreeGraphOut(people=out, families=families)
