import uuid

from fastapi import APIRouter, status
from sqlalchemy import select

from app.deps import DB, Access, forbidden, not_found
from app.models import Person, Subtree
from app.schemas import PersonOut, SubtreeCreate, SubtreeOut, SubtreeUpdate
from app.subtrees import FamilyGraph, load_graph
from app.timeline import load_vitals, person_out

router = APIRouter(prefix="/api/trees/{tree_id}/subtrees", tags=["subtrees"])


def _out(s: Subtree, graph: FamilyGraph) -> SubtreeOut:
    out = SubtreeOut.model_validate(s)
    out.member_count = len(graph.branch(s.root_person_id, s.direction, s.include_spouses))
    return out


async def _get(db: DB, tree_id: uuid.UUID, subtree_id: uuid.UUID) -> Subtree:
    s = await db.get(Subtree, subtree_id)
    if s is None or s.tree_id != tree_id:
        raise not_found("Sub-tree not found")
    return s


async def _check_root(db: DB, tree_id: uuid.UUID, person_id: uuid.UUID) -> None:
    person = await db.get(Person, person_id)
    if person is None or person.tree_id != tree_id:
        raise not_found("Root person not found in this tree")


@router.get("", response_model=list[SubtreeOut])
async def list_subtrees(tree_id: uuid.UUID, access: Access, db: DB):
    rows = (await db.scalars(select(Subtree).where(Subtree.tree_id == tree_id))).all()
    if access.tree_role is None:  # branch-only members just see their own branches
        mine = {g.subtree.id for g in access.grants}
        rows = [s for s in rows if s.id in mine]
    graph = access.graph or await load_graph(db, tree_id)
    return [_out(s, graph) for s in sorted(rows, key=lambda s: s.name.lower())]


@router.post("", response_model=SubtreeOut, status_code=status.HTTP_201_CREATED)
async def create_subtree(tree_id: uuid.UUID, body: SubtreeCreate, access: Access, db: DB):
    if not access.can_manage_subtrees():
        raise forbidden()
    await _check_root(db, tree_id, body.root_person_id)
    s = Subtree(tree_id=tree_id, **body.model_dump())
    db.add(s)
    await db.commit()
    return _out(s, await load_graph(db, tree_id))


@router.patch("/{subtree_id}", response_model=SubtreeOut)
async def update_subtree(
    tree_id: uuid.UUID, subtree_id: uuid.UUID, body: SubtreeUpdate, access: Access, db: DB
):
    if not access.can_manage_subtrees():
        raise forbidden()
    s = await _get(db, tree_id, subtree_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("root_person_id"):
        await _check_root(db, tree_id, changes["root_person_id"])
    for key, value in changes.items():
        if value is not None:
            setattr(s, key, value)
    await db.commit()
    return _out(s, await load_graph(db, tree_id))


@router.delete("/{subtree_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subtree(tree_id: uuid.UUID, subtree_id: uuid.UUID, access: Access, db: DB):
    if not access.can_manage_subtrees():
        raise forbidden()
    await db.delete(await _get(db, tree_id, subtree_id))
    await db.commit()


@router.get("/{subtree_id}/people", response_model=list[PersonOut])
async def subtree_people(tree_id: uuid.UUID, subtree_id: uuid.UUID, access: Access, db: DB):
    s = await _get(db, tree_id, subtree_id)
    graph = access.graph or await load_graph(db, tree_id)
    ids = graph.branch(s.root_person_id, s.direction, s.include_spouses)
    visible = access.visible_person_ids()
    if visible is not None:
        ids &= visible
    if not ids:
        return []
    people = (
        await db.scalars(
            select(Person).where(Person.id.in_(ids)).order_by(Person.surname, Person.given_names)
        )
    ).all()
    vitals = await load_vitals(db, tree_id, ids)
    return [person_out(p, vitals) for p in people]
