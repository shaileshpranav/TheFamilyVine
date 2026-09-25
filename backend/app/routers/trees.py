import uuid

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.deps import DB, Access, CurrentUser, forbidden, not_found
from app.models import Membership, Person, Role, Tree
from app.permissions import TreeAccess, max_role
from app.schemas import (
    MemberOut,
    MemberUpdate,
    MyAccessOut,
    SubtreeRoleOut,
    TransferOwnership,
    TreeCreate,
    TreeDetailOut,
    TreeListItem,
    TreeOut,
    TreeUpdate,
)

router = APIRouter(prefix="/api/trees", tags=["trees"])


async def _access_out(db: DB, access: TreeAccess) -> MyAccessOut:
    my_person_id = await db.scalar(
        select(Person.id).where(
            Person.tree_id == access.tree_id, Person.linked_user_id == access.user.id
        )
    )
    return MyAccessOut(
        tree_role=access.tree_role,
        subtree_roles=[
            SubtreeRoleOut(subtree_id=g.subtree.id, subtree_name=g.subtree.name, role=g.role)
            for g in access.grants
        ],
        highest_role=access.highest_role,
        my_person_id=my_person_id,
        can_manage_members=access.can_manage_members(None)
        or any(access.can_manage_members(g.subtree.id) for g in access.grants),
        can_manage_subtrees=access.can_manage_subtrees(),
        can_create_people=access.can_create_people(),
        is_owner=access.is_owner(),
    )


@router.get("", response_model=list[TreeListItem])
async def list_trees(user: CurrentUser, db: DB):
    rows = (
        await db.execute(
            select(Tree, Membership.role)
            .join(Membership, Membership.tree_id == Tree.id)
            .where(Membership.user_id == user.id)
            .order_by(Tree.name)
        )
    ).all()
    best: dict[uuid.UUID, tuple[Tree, Role]] = {}
    for tree, role in rows:
        prev = best.get(tree.id)
        best[tree.id] = (tree, max_role(prev[1] if prev else None, role) or role)
    return [
        TreeListItem(
            id=t.id,
            name=t.name,
            description=t.description,
            created_at=t.created_at,
            highest_role=r,
        )
        for t, r in best.values()
    ]


@router.post("", response_model=TreeOut, status_code=status.HTTP_201_CREATED)
async def create_tree(body: TreeCreate, user: CurrentUser, db: DB):
    tree = Tree(name=body.name, description=body.description, created_by_id=user.id)
    db.add(tree)
    await db.flush()
    db.add(Membership(tree_id=tree.id, user_id=user.id, role=Role.OWNER))
    await db.commit()
    return tree


@router.get("/{tree_id}", response_model=TreeDetailOut)
async def get_tree(tree_id: uuid.UUID, access: Access, db: DB):
    tree = await db.get(Tree, tree_id)
    visible = access.visible_person_ids()
    if visible is None:
        count = await db.scalar(select(func.count()).where(Person.tree_id == tree_id)) or 0
    else:
        count = len(visible)
    return TreeDetailOut(
        id=tree.id,
        name=tree.name,
        description=tree.description,
        created_at=tree.created_at,
        access=await _access_out(db, access),
        person_count=count,
    )


@router.patch("/{tree_id}", response_model=TreeOut)
async def update_tree(tree_id: uuid.UUID, body: TreeUpdate, access: Access, db: DB):
    if not access.can_edit_tree():
        raise forbidden()
    tree = await db.get(Tree, tree_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(tree, key, value)
    await db.commit()
    return tree


@router.delete("/{tree_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tree(tree_id: uuid.UUID, access: Access, db: DB):
    if not access.is_owner():
        raise forbidden("Only the owner can delete a tree")
    await db.delete(await db.get(Tree, tree_id))
    await db.commit()


@router.post("/{tree_id}/transfer", status_code=status.HTTP_204_NO_CONTENT)
async def transfer_ownership(tree_id: uuid.UUID, body: TransferOwnership, access: Access, db: DB):
    if not access.is_owner():
        raise forbidden("Only the owner can transfer ownership")
    target = await db.scalar(
        select(Membership).where(
            Membership.tree_id == tree_id,
            Membership.user_id == body.user_id,
            Membership.subtree_id.is_(None),
        )
    )
    if target is None:
        raise not_found("The new owner must already be a member of the whole tree")
    if target.user_id == access.user.id:
        return
    mine = await db.scalar(
        select(Membership).where(
            Membership.tree_id == tree_id,
            Membership.user_id == access.user.id,
            Membership.subtree_id.is_(None),
        )
    )
    target.role = Role.OWNER
    mine.role = Role.ADMIN
    await db.commit()


# ---- members ----------------------------------------------------------------------------


def _member_out(m: Membership) -> MemberOut:
    out = MemberOut.model_validate(m)
    out.subtree_name = m.subtree.name if m.subtree else None
    return out


@router.get("/{tree_id}/members", response_model=list[MemberOut])
async def list_members(tree_id: uuid.UUID, access: Access, db: DB):
    rows = (
        await db.scalars(
            select(Membership).where(Membership.tree_id == tree_id).order_by(Membership.created_at)
        )
    ).all()
    return [_member_out(m) for m in rows]


async def _get_membership(db: DB, tree_id: uuid.UUID, member_id: uuid.UUID) -> Membership:
    m = await db.get(Membership, member_id)
    if m is None or m.tree_id != tree_id:
        raise not_found("Member not found")
    return m


@router.patch("/{tree_id}/members/{member_id}", response_model=MemberOut)
async def update_member(
    tree_id: uuid.UUID, member_id: uuid.UUID, body: MemberUpdate, access: Access, db: DB
):
    m = await _get_membership(db, tree_id, member_id)
    if m.role == Role.OWNER:
        raise forbidden("Use ownership transfer to change the owner's role")
    if not access.can_manage_members(m.subtree_id):
        raise forbidden()
    m.role = body.role
    await db.commit()
    return _member_out(m)


@router.delete("/{tree_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(tree_id: uuid.UUID, member_id: uuid.UUID, access: Access, db: DB):
    m = await _get_membership(db, tree_id, member_id)
    if m.role == Role.OWNER:
        raise forbidden("The owner can't be removed; transfer ownership first")
    leaving_self = m.user_id == access.user.id
    if not leaving_self and not access.can_manage_members(m.subtree_id):
        raise forbidden()
    await db.delete(m)
    await db.commit()
