"""The single place that decides who may do what.

A user's access to a tree comes from their memberships: at most one tree-wide role plus
any number of sub-tree roles. For any given person the *effective role* is the highest
role among the memberships whose scope covers that person.

Rules (see docs/PLAN.md):
  personal     view; add/edit only their own profile
  contributor  add people (living or deceased); edit own profile and deceased people
  admin        edit anyone; change the living flag; manage members and sub-trees
  owner        admin + delete tree + transfer ownership
Anyone may always edit the person linked to their own account.
"""

import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Membership, Person, Role, Subtree, User
from app.subtrees import FamilyGraph, load_graph


def max_role(*roles: Role | None) -> Role | None:
    present = [r for r in roles if r is not None]
    return max(present, key=lambda r: r.rank) if present else None


def can_edit_person_with_role(role: Role | None, person: Person, user_id: uuid.UUID) -> bool:
    if person.linked_user_id == user_id:
        return True
    if role is None:
        return False
    if role.rank >= Role.ADMIN.rank:
        return True
    if role == Role.CONTRIBUTOR:
        return not person.is_living
    return False


@dataclass
class SubtreeGrant:
    subtree: Subtree
    role: Role
    members: set[uuid.UUID] = field(default_factory=set)


@dataclass
class TreeAccess:
    user: User
    tree_id: uuid.UUID
    tree_role: Role | None
    grants: list[SubtreeGrant]
    graph: FamilyGraph | None = None

    @classmethod
    async def load(cls, db: AsyncSession, user: User, tree_id: uuid.UUID) -> "TreeAccess | None":
        rows = (
            await db.scalars(
                select(Membership).where(
                    Membership.tree_id == tree_id, Membership.user_id == user.id
                )
            )
        ).all()
        if not rows:
            return None
        tree_role = next((m.role for m in rows if m.subtree_id is None), None)
        grants = [SubtreeGrant(m.subtree, m.role) for m in rows if m.subtree is not None]
        access = cls(user=user, tree_id=tree_id, tree_role=tree_role, grants=grants)
        if grants:
            access.graph = await load_graph(db, tree_id)
            for g in grants:
                g.members = access.graph.branch(
                    g.subtree.root_person_id, g.subtree.direction, g.subtree.include_spouses
                )
        return access

    # ---- roles -------------------------------------------------------------------------

    @property
    def highest_role(self) -> Role:
        role = max_role(self.tree_role, *(g.role for g in self.grants))
        assert role is not None  # load() returns None when there are no memberships
        return role

    def role_for_person(self, person_id: uuid.UUID) -> Role | None:
        return max_role(self.tree_role, *(g.role for g in self.grants if person_id in g.members))

    def role_for_subtree(self, subtree_id: uuid.UUID | None) -> Role | None:
        """Role that applies to managing a sub-tree (or the whole tree when None)."""
        if subtree_id is None:
            return self.tree_role
        return max_role(
            self.tree_role, *(g.role for g in self.grants if g.subtree.id == subtree_id)
        )

    # ---- people ------------------------------------------------------------------------

    def visible_person_ids(self) -> set[uuid.UUID] | None:
        """None means every person in the tree is visible."""
        if self.tree_role is not None:
            return None
        return set().union(*(g.members for g in self.grants))

    def can_view_person(self, person: Person) -> bool:
        if person.tree_id != self.tree_id:
            return False
        if person.linked_user_id == self.user.id:
            return True
        visible = self.visible_person_ids()
        return visible is None or person.id in visible

    def can_edit_person(self, person: Person) -> bool:
        return self.can_view_person(person) and can_edit_person_with_role(
            self.role_for_person(person.id), person, self.user.id
        )

    def can_set_living(self, person: Person) -> bool:
        role = self.role_for_person(person.id)
        return role is not None and role.rank >= Role.ADMIN.rank

    def can_delete_person(self, person: Person) -> bool:
        return self.can_set_living(person)

    def can_create_people(self) -> bool:
        """Adding people other than oneself."""
        return self.highest_role.rank >= Role.CONTRIBUTOR.rank

    def can_attach_to(self, person: Person) -> bool:
        """May a new (non-self) person be added as a relative of `person`?

        Uses the highest role anywhere rather than the role for `person`, so a sub-tree
        contributor can attach relatives to their own profile even if it sits just outside
        the branch.
        """
        return self.can_view_person(person) and self.can_create_people()

    def can_edit_family(self, partners: list[Person]) -> bool:
        """May the couple's status and shared events (marriage, divorce…) be changed?

        Either partner may always edit their own couple. Anyone else needs edit rights on
        every partner, so living people stay protected from contributors.
        """
        if not partners:
            return self.can_create_people()
        if any(p.linked_user_id == self.user.id for p in partners):
            return all(self.can_view_person(p) for p in partners)
        return all(self.can_edit_person(p) for p in partners)

    # ---- administration ----------------------------------------------------------------

    def can_manage_members(self, subtree_id: uuid.UUID | None = None) -> bool:
        role = self.role_for_subtree(subtree_id)
        return role is not None and role.rank >= Role.ADMIN.rank

    def can_manage_subtrees(self) -> bool:
        return self.tree_role is not None and self.tree_role.rank >= Role.ADMIN.rank

    def can_edit_tree(self) -> bool:
        return self.can_manage_subtrees()

    def is_owner(self) -> bool:
        return self.tree_role == Role.OWNER
