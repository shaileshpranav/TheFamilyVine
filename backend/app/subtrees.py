"""Family graph traversal used to resolve which people belong to a sub-tree.

Family trees are small enough (thousands, not millions, of people) that loading the
relationship edges for one tree and walking them in memory is simpler and faster than
recursive SQL, and it works the same on SQLite and Postgres.
"""

import uuid
from collections import defaultdict, deque
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChildLink, Family, FamilyPartner, SubtreeDirection

PersonId = uuid.UUID


@dataclass
class FamilyGraph:
    parents: dict[PersonId, set[PersonId]] = field(default_factory=lambda: defaultdict(set))
    children: dict[PersonId, set[PersonId]] = field(default_factory=lambda: defaultdict(set))
    partners: dict[PersonId, set[PersonId]] = field(default_factory=lambda: defaultdict(set))

    @classmethod
    def from_families(
        cls,
        partners_by_family: dict[uuid.UUID, list[PersonId]],
        children_by_family: dict[uuid.UUID, list[PersonId]],
    ) -> "FamilyGraph":
        g = cls()
        for fam_id in partners_by_family.keys() | children_by_family.keys():
            fam_partners = partners_by_family.get(fam_id, [])
            for a in fam_partners:
                for b in fam_partners:
                    if a != b:
                        g.partners[a].add(b)
            for child in children_by_family.get(fam_id, []):
                for parent in fam_partners:
                    g.parents[child].add(parent)
                    g.children[parent].add(child)
        return g

    def _walk(self, start: PersonId, edges: dict[PersonId, set[PersonId]]) -> set[PersonId]:
        seen = {start}
        queue = deque([start])
        while queue:
            for nxt in edges.get(queue.popleft(), ()):
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        return seen

    def descendants(self, root: PersonId) -> set[PersonId]:
        return self._walk(root, self.children)

    def ancestors(self, root: PersonId) -> set[PersonId]:
        return self._walk(root, self.parents)

    def branch(
        self, root: PersonId, direction: SubtreeDirection, include_spouses: bool
    ) -> set[PersonId]:
        members: set[PersonId] = set()
        if direction in (SubtreeDirection.DESCENDANTS, SubtreeDirection.BOTH):
            members |= self.descendants(root)
        if direction in (SubtreeDirection.ANCESTORS, SubtreeDirection.BOTH):
            members |= self.ancestors(root)
        if include_spouses:
            members |= {p for m in list(members) for p in self.partners.get(m, ())}
        return members


async def load_graph(db: AsyncSession, tree_id: uuid.UUID) -> FamilyGraph:
    partner_rows = await db.execute(
        select(FamilyPartner.family_id, FamilyPartner.person_id)
        .join(Family, Family.id == FamilyPartner.family_id)
        .where(Family.tree_id == tree_id)
    )
    child_rows = await db.execute(
        select(ChildLink.family_id, ChildLink.person_id)
        .join(Family, Family.id == ChildLink.family_id)
        .where(Family.tree_id == tree_id)
    )
    partners: dict[uuid.UUID, list[PersonId]] = defaultdict(list)
    children: dict[uuid.UUID, list[PersonId]] = defaultdict(list)
    for fam_id, person_id in partner_rows:
        partners[fam_id].append(person_id)
    for fam_id, person_id in child_rows:
        children[fam_id].append(person_id)
    return FamilyGraph.from_families(partners, children)
