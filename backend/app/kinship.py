"""Who is related to whom, worked out from families (couples plus their children).

Only parent/child and partner links are stored. Everything else is derived, so it stays
correct as the tree changes and maps cleanly to GEDCOM:

- siblings share a parent (full siblings share the same set of known parents);
- a step-parent is a partner of your parent who isn't your parent;
- a step-child is a child of your partner who isn't your child;
- a step-sibling is a child of your step-parent who isn't your sibling.

A child link explicitly typed "step" counts as a step relation, never a blood one.
"""

import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChildLink, ChildRelation, Family, FamilyPartner, PartnerStatus

PersonId = uuid.UUID
FamilyId = uuid.UUID
STEP = ChildRelation.STEP

RelationName = Literal[
    "parent",
    "step_parent",
    "partner",
    "sibling",
    "half_sibling",
    "step_sibling",
    "child",
    "step_child",
]
RELATION_ORDER: dict[str, int] = {
    name: i
    for i, name in enumerate(
        [
            "parent",
            "step_parent",
            "partner",
            "sibling",
            "half_sibling",
            "step_sibling",
            "child",
            "step_child",
        ]
    )
}


@dataclass
class FamilyInfo:
    id: FamilyId
    status: PartnerStatus
    partners: list[PersonId] = field(default_factory=list)
    children: dict[PersonId, ChildRelation] = field(default_factory=dict)


@dataclass
class Relative:
    person_id: PersonId
    relation: RelationName
    pedigree: ChildRelation | None = None  # for parents and children: biological, adopted…
    family_id: FamilyId | None = None  # for partners: their union
    status: PartnerStatus | None = None  # for partners and step-parents
    via_person_id: PersonId | None = None  # for step relations: through whom


@dataclass
class Kin:
    families: dict[FamilyId, FamilyInfo] = field(default_factory=dict)
    child_in: dict[PersonId, list[FamilyId]] = field(default_factory=lambda: defaultdict(list))
    partner_in: dict[PersonId, list[FamilyId]] = field(default_factory=lambda: defaultdict(list))

    # ---- construction ------------------------------------------------------------------

    @classmethod
    def from_rows(
        cls,
        families: list[tuple[FamilyId, PartnerStatus]],
        partners: list[tuple[FamilyId, PersonId]],
        children: list[tuple[FamilyId, PersonId, ChildRelation]],
    ) -> "Kin":
        kin = cls()
        for fid, status in families:
            kin.families[fid] = FamilyInfo(fid, status)
        for fid, pid in partners:
            kin.families[fid].partners.append(pid)
            kin.partner_in[pid].append(fid)
        for fid, pid, relation in children:
            kin.families[fid].children[pid] = relation
            kin.child_in[pid].append(fid)
        return kin

    @classmethod
    async def load(cls, db: AsyncSession, tree_id: uuid.UUID) -> "Kin":
        families = (
            await db.execute(select(Family.id, Family.status).where(Family.tree_id == tree_id))
        ).all()
        partners = (
            await db.execute(
                select(FamilyPartner.family_id, FamilyPartner.person_id)
                .join(Family, Family.id == FamilyPartner.family_id)
                .where(Family.tree_id == tree_id)
            )
        ).all()
        children = (
            await db.execute(
                select(ChildLink.family_id, ChildLink.person_id, ChildLink.relation)
                .join(Family, Family.id == ChildLink.family_id)
                .where(Family.tree_id == tree_id)
            )
        ).all()
        return cls.from_rows(
            [tuple(r) for r in families],
            [tuple(r) for r in partners],
            [tuple(r) for r in children],
        )

    # ---- direct links ------------------------------------------------------------------

    def parents(self, pid: PersonId) -> dict[PersonId, ChildRelation]:
        """Everyone recorded as a parent, with how (biological, adopted, step…)."""
        out: dict[PersonId, ChildRelation] = {}
        for fid in self.child_in.get(pid, ()):
            fam = self.families[fid]
            relation = fam.children[pid]
            for parent in fam.partners:
                if parent != pid and (parent not in out or out[parent] == STEP):
                    out[parent] = relation
        return out

    def blood_parents(self, pid: PersonId) -> set[PersonId]:
        return {p for p, r in self.parents(pid).items() if r != STEP}

    def children(self, pid: PersonId) -> dict[PersonId, ChildRelation]:
        out: dict[PersonId, ChildRelation] = {}
        for fid in self.partner_in.get(pid, ()):
            for child, relation in self.families[fid].children.items():
                if child != pid and (child not in out or out[child] == STEP):
                    out[child] = relation
        return out

    def partners(self, pid: PersonId) -> list[tuple[PersonId, FamilyId, PartnerStatus]]:
        out: list[tuple[PersonId, FamilyId, PartnerStatus]] = []
        seen: set[PersonId] = set()
        for fid in self.partner_in.get(pid, ()):
            fam = self.families[fid]
            for other in fam.partners:
                if other != pid and other not in seen:
                    seen.add(other)
                    out.append((other, fid, fam.status))
        return out

    def birth_families(self, pid: PersonId) -> list[FamilyId]:
        """Families this person was born or adopted into (not step links)."""
        return [f for f in self.child_in.get(pid, ()) if self.families[f].children[pid] != STEP]

    def descendants(self, pid: PersonId) -> set[PersonId]:
        """Everyone below this person: children, their children, and so on."""
        out: set[PersonId] = set()
        stack = [pid]
        while stack:
            for fid in self.partner_in.get(stack.pop(), ()):
                for child in self.families[fid].children:
                    if child not in out:
                        out.add(child)
                        stack.append(child)
        return out

    def couples(self, a: PersonId, b: PersonId) -> list[FamilyId]:
        """Families in which `a` and `b` are partners."""
        return [f for f in self.partner_in.get(a, ()) if b in self.families[f].partners]

    def removable_link(
        self, a: PersonId, b: PersonId
    ) -> Literal["parent", "child", "partner", "sibling"] | None:
        """How `b` is directly linked to `a`, if that link can be removed on its own.

        Half-siblings and step relatives come from other links, siblings who share parents
        are linked through those parents, and a couple with children together stays their
        parents, so none of those can be.
        """
        if b in self.blood_parents(a):
            return "parent"
        if a in self.blood_parents(b):
            return "child"
        couples = self.couples(a, b)
        if couples:
            return None if any(self.families[f].children for f in couples) else "partner"
        shared = set(self.birth_families(a)) & set(self.birth_families(b))
        if any(not self.families[f].partners for f in shared):
            return "sibling"
        return None

    def sole_parent_family(self, child: PersonId, parent: PersonId) -> FamilyId | None:
        """The family in which `parent` is `child`'s only recorded parent, if there is one."""
        for fid in self.birth_families(child):
            if self.families[fid].partners == [parent]:
                return fid
        return None

    def joinable_couple(
        self, child: PersonId, step_parent: PersonId
    ) -> tuple[FamilyId, FamilyId] | None:
        """Can this step-parent be recorded as a parent instead?

        Only when their partner is the child's only recorded parent. Returns the family the
        child is in now and the couple's family, which the child can move into.
        """
        if step_parent in self.blood_parents(child):
            return None
        for partner, couple, _status in self.partners(step_parent):
            source = self.sole_parent_family(child, partner)
            if source is not None:
                return source, couple
        return None

    # ---- derived relations -------------------------------------------------------------

    def siblings(self, pid: PersonId) -> dict[PersonId, Literal["full", "half"]]:
        mine = self.blood_parents(pid)
        out: dict[PersonId, Literal["full", "half"]] = {}

        def consider(other: PersonId) -> None:
            if other != pid and other not in out:
                out[other] = "full" if self.blood_parents(other) == mine else "half"

        for fid in self.birth_families(pid):
            for child, relation in self.families[fid].children.items():
                if relation != STEP:
                    consider(child)
        for parent in mine:
            for child, relation in self.children(parent).items():
                if relation != STEP:
                    consider(child)
        return out

    def step_parents(
        self, pid: PersonId
    ) -> dict[PersonId, tuple[PersonId | None, PartnerStatus | None]]:
        """Step-parent -> (the parent they partner, that couple's status)."""
        blood = self.blood_parents(pid)
        out: dict[PersonId, tuple[PersonId | None, PartnerStatus | None]] = {}
        for parent in sorted(blood, key=str):
            for partner, _fid, status in self.partners(parent):
                if partner != pid and partner not in blood and partner not in out:
                    out[partner] = (parent, status)
        for parent, relation in self.parents(pid).items():
            if relation == STEP and parent not in blood and parent not in out:
                out[parent] = (None, None)
        return out

    def step_children(self, pid: PersonId) -> dict[PersonId, PersonId | None]:
        """Step-child -> the partner who is their parent."""
        own = self.children(pid)
        blood = {c for c, r in own.items() if r != STEP}
        out: dict[PersonId, PersonId | None] = {}
        for partner, _fid, _status in self.partners(pid):
            for child, relation in self.children(partner).items():
                if relation != STEP and child != pid and child not in blood and child not in out:
                    out[child] = partner
        for child, relation in own.items():
            if relation == STEP and child not in out:
                out[child] = None
        return out

    def step_siblings(self, pid: PersonId) -> dict[PersonId, PersonId]:
        """Step-sibling -> the step-parent who is their parent."""
        siblings = self.siblings(pid)
        out: dict[PersonId, PersonId] = {}
        for step_parent in self.step_parents(pid):
            for child, relation in self.children(step_parent).items():
                if relation != STEP and child != pid and child not in siblings and child not in out:
                    out[child] = step_parent
        return out

    def relatives(self, pid: PersonId) -> list[Relative]:
        """Everyone directly related to `pid`, each once, closest relation first."""
        out: list[Relative] = []
        seen: set[PersonId] = {pid}

        def add(rel: Relative) -> None:
            if rel.person_id not in seen:
                seen.add(rel.person_id)
                out.append(rel)

        for parent, relation in self.parents(pid).items():
            if relation != STEP:
                add(Relative(parent, "parent", pedigree=relation))
        for step_parent, (via, status) in self.step_parents(pid).items():
            add(Relative(step_parent, "step_parent", status=status, via_person_id=via))
        for partner, fid, status in self.partners(pid):
            add(Relative(partner, "partner", family_id=fid, status=status))
        for sibling, kind in self.siblings(pid).items():
            add(Relative(sibling, "sibling" if kind == "full" else "half_sibling"))
        for step_sibling, via in self.step_siblings(pid).items():
            add(Relative(step_sibling, "step_sibling", via_person_id=via))
        for child, relation in self.children(pid).items():
            if relation != STEP:
                add(Relative(child, "child", pedigree=relation))
        for step_child, via in self.step_children(pid).items():
            add(Relative(step_child, "step_child", via_person_id=via))
        return out
