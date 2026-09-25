import secrets
import uuid
from datetime import timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.config import get_settings
from app.db import utcnow
from app.deps import DB, Access, CurrentUser, forbidden, not_found
from app.models import Invite, Membership, Person, Subtree
from app.permissions import max_role
from app.schemas import InviteAccepted, InviteCreate, InviteOut, InvitePreview

router = APIRouter(tags=["invites"])


@router.get("/api/trees/{tree_id}/invites", response_model=list[InviteOut])
async def list_invites(tree_id: uuid.UUID, access: Access, db: DB):
    rows = (
        await db.scalars(
            select(Invite)
            .where(Invite.tree_id == tree_id, Invite.accepted_at.is_(None), ~Invite.revoked)
            .order_by(Invite.created_at.desc())
        )
    ).all()
    return [i for i in rows if access.can_manage_members(i.subtree_id)]


@router.post(
    "/api/trees/{tree_id}/invites", response_model=InviteOut, status_code=status.HTTP_201_CREATED
)
async def create_invite(tree_id: uuid.UUID, body: InviteCreate, access: Access, db: DB):
    if not access.can_manage_members(body.subtree_id):
        raise forbidden()
    if body.subtree_id is not None:
        subtree = await db.get(Subtree, body.subtree_id)
        if subtree is None or subtree.tree_id != tree_id:
            raise not_found("Sub-tree not found")
    if body.person_id is not None:
        person = await db.get(Person, body.person_id)
        if person is None or not access.can_view_person(person):
            raise not_found("Person not found")
        if person.linked_user_id is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "That person is already linked")
    invite = Invite(
        token=secrets.token_urlsafe(32),
        tree_id=tree_id,
        subtree_id=body.subtree_id,
        role=body.role,
        email=body.email.lower() if body.email else None,
        person_id=body.person_id,
        created_by_id=access.user.id,
        expires_at=utcnow() + timedelta(days=get_settings().invite_ttl_days),
    )
    db.add(invite)
    await db.commit()
    return invite


@router.delete("/api/trees/{tree_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(tree_id: uuid.UUID, invite_id: uuid.UUID, access: Access, db: DB):
    invite = await db.get(Invite, invite_id)
    if invite is None or invite.tree_id != tree_id:
        raise not_found("Invite not found")
    if not access.can_manage_members(invite.subtree_id):
        raise forbidden()
    invite.revoked = True
    await db.commit()


async def _get_by_token(db: DB, token: str) -> Invite:
    invite = await db.scalar(select(Invite).where(Invite.token == token))
    if invite is None:
        raise not_found("Invite not found")
    return invite


@router.get("/api/invites/{token}", response_model=InvitePreview)
async def preview_invite(token: str, user: CurrentUser, db: DB):
    invite = await _get_by_token(db, token)
    person = await db.get(Person, invite.person_id) if invite.person_id else None
    return InvitePreview(
        tree_name=invite.tree.name,
        subtree_name=invite.subtree.name if invite.subtree else None,
        role=invite.role,
        person_name=person.display_name if person else None,
        usable=invite.is_usable(),
    )


@router.post("/api/invites/{token}/accept", response_model=InviteAccepted)
async def accept_invite(token: str, user: CurrentUser, db: DB):
    invite = await _get_by_token(db, token)
    if not invite.is_usable():
        raise HTTPException(status.HTTP_410_GONE, "This invite has expired or was already used")
    if invite.email and invite.email != user.email.lower():
        raise forbidden(f"This invite was sent to {invite.email}")

    membership = await db.scalar(
        select(Membership).where(
            Membership.tree_id == invite.tree_id,
            Membership.user_id == user.id,
            Membership.subtree_id.is_(None)
            if invite.subtree_id is None
            else Membership.subtree_id == invite.subtree_id,
        )
    )
    if membership is None:
        db.add(
            Membership(
                tree_id=invite.tree_id,
                user_id=user.id,
                subtree_id=invite.subtree_id,
                role=invite.role,
            )
        )
    else:  # never downgrade an existing membership
        membership.role = max_role(membership.role, invite.role) or invite.role

    if invite.person_id:
        person = await db.get(Person, invite.person_id)
        already_linked = await db.scalar(
            select(Person.id).where(
                Person.tree_id == invite.tree_id, Person.linked_user_id == user.id
            )
        )
        if person and person.linked_user_id is None and already_linked is None:
            person.linked_user_id = user.id

    invite.accepted_at = utcnow()
    invite.accepted_by_id = user.id
    await db.commit()
    return InviteAccepted(tree_id=invite.tree_id)
