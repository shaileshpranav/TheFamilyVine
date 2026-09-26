import re
import uuid
from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.dates import FuzzyDate, FuzzyDateOut
from app.kinship import RelationName
from app.models import (
    ChildRelation,
    ConditionStatus,
    EventType,
    PartnerStatus,
    Role,
    Sex,
    SubtreeDirection,
)


class Schema(BaseModel):
    # Responses always include every field, so mark defaulted fields as required in the
    # OpenAPI output schemas. Request schemas are unaffected.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class ORM(Schema):
    model_config = ConfigDict(from_attributes=True)


# ---- users --------------------------------------------------------------------------------


Theme = Literal["system", "light", "dark"]
TextSize = Literal["normal", "large"]
StartPage = Literal["home", "tree"]


class Preferences(Schema):
    """App settings, saved to the account so they follow the user between devices."""

    theme: Theme = "system"
    """"system" follows the device's light or dark setting."""
    text_size: TextSize = "normal"
    start_page: StartPage = "home"
    """Where opening a tree lands: its home page, or straight on the tree canvas."""


class PreferencesUpdate(Schema):
    """Only the settings given change."""

    theme: Theme | None = None
    text_size: TextSize | None = None
    start_page: StartPage | None = None


class UserOut(ORM):
    id: uuid.UUID
    email: str
    display_name: str
    avatar_url: str | None
    preferences: Preferences


class UserUpdate(Schema):
    display_name: str | None = Field(None, max_length=200)
    avatar_url: str | None = Field(None, max_length=1000)
    preferences: PreferencesUpdate | None = None


# ---- trees --------------------------------------------------------------------------------


class TreeCreate(Schema):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class TreeUpdate(Schema):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None


class TreeOut(ORM):
    id: uuid.UUID
    name: str
    description: str
    created_at: datetime
    cover_photo_id: uuid.UUID | None = None
    """Show it at /api/trees/{id}/photos/{cover_photo_id}/full (or /thumb)."""


class SubtreeRoleOut(Schema):
    subtree_id: uuid.UUID
    subtree_name: str
    role: Role


class MyAccessOut(Schema):
    tree_role: Role | None
    subtree_roles: list[SubtreeRoleOut]
    highest_role: Role
    my_person_id: uuid.UUID | None
    can_manage_members: bool
    can_manage_subtrees: bool
    can_create_people: bool
    is_owner: bool


class TreeDetailOut(TreeOut):
    access: MyAccessOut
    person_count: int
    photo_count: int
    """Photos of the people the viewer can see."""


class TreeListItem(TreeOut):
    highest_role: Role


class TransferOwnership(Schema):
    user_id: uuid.UUID


# ---- members & invites -------------------------------------------------------------------

AssignableRole = Literal[Role.ADMIN, Role.CONTRIBUTOR, Role.PERSONAL]


class MemberOut(ORM):
    id: uuid.UUID
    user: UserOut
    role: Role
    subtree_id: uuid.UUID | None
    subtree_name: str | None = None
    created_at: datetime


class MemberUpdate(Schema):
    role: AssignableRole


class InviteCreate(Schema):
    role: AssignableRole
    subtree_id: uuid.UUID | None = None
    email: EmailStr | None = None
    person_id: uuid.UUID | None = None


class InviteOut(ORM):
    id: uuid.UUID
    token: str
    role: Role
    subtree_id: uuid.UUID | None
    email: str | None
    person_id: uuid.UUID | None
    expires_at: datetime
    accepted_at: datetime | None
    revoked: bool


class InvitePreview(Schema):
    tree_name: str
    subtree_name: str | None
    role: Role
    person_name: str | None
    usable: bool


class InviteAccepted(Schema):
    tree_id: uuid.UUID


# ---- sub-trees ---------------------------------------------------------------------------


class SubtreeCreate(Schema):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    root_person_id: uuid.UUID
    direction: SubtreeDirection = SubtreeDirection.DESCENDANTS
    include_spouses: bool = True


class SubtreeUpdate(Schema):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    root_person_id: uuid.UUID | None = None
    direction: SubtreeDirection | None = None
    include_spouses: bool | None = None


class SubtreeOut(ORM):
    id: uuid.UUID
    name: str
    description: str
    root_person_id: uuid.UUID
    direction: SubtreeDirection
    include_spouses: bool
    member_count: int = 0


# ---- people ------------------------------------------------------------------------------

_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)


class SocialLink(Schema):
    url: str = Field(max_length=500)
    label: str = Field("", max_length=60)

    @field_validator("url")
    @classmethod
    def _web_address(cls, value: str) -> str:
        value = value.strip()
        if not re.match(r"^https?://", value, re.IGNORECASE):
            if _SCHEME.match(value):  # e.g. javascript:, mailto:
                raise ValueError("Links must be web addresses starting with http:// or https://")
            value = f"https://{value}"
        parsed = urlparse(value)
        if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
            raise ValueError("Enter a web address, such as instagram.com/yourname")
        return value


class Pet(Schema):
    name: str = Field(min_length=1, max_length=100)
    kind: str = Field("", max_length=100)


class Favorite(Schema):
    category: str = Field(min_length=1, max_length=40)
    value: str = Field(min_length=1, max_length=200)


Vehicle = Annotated[str, Field(min_length=1, max_length=120)]


class PersonFields(Schema):
    given_names: str = Field("", max_length=200)
    surname: str = Field("", max_length=200)
    birth_surname: str = Field("", max_length=200)
    nickname: str = Field("", max_length=200)
    native_name: str = Field("", max_length=400)
    sex: Sex = Sex.UNKNOWN
    bio: str = ""
    occupation: str = Field("", max_length=200)
    nationality: str = Field("", max_length=200)
    education: str = Field("", max_length=300)
    links: list[SocialLink] = Field(default_factory=list, max_length=12)
    vehicles: list[Vehicle] = Field(default_factory=list, max_length=12)
    pets: list[Pet] = Field(default_factory=list, max_length=20)
    favorites: list[Favorite] = Field(default_factory=list, max_length=20)


RelationKind = Literal[
    "parent", "child", "partner", "sibling", "step_parent", "step_child", "step_sibling"
]


class RelativeLink(Schema):
    """How a person, new or already on the tree, is connected to `person_id`."""

    person_id: uuid.UUID
    relation: RelationKind
    """How the person relates to `person_id` (e.g. "child" = they're person_id's child)."""
    family_id: uuid.UUID | None = None
    """child: which of the parent's couples the child joins; parent / sibling: which set of
    parents, when there's more than one."""
    new_family: bool = False
    """child: the other parent isn't recorded, so start a new single-parent family."""
    via_person_id: uuid.UUID | None = None
    """Step relations: the parent (step_parent), partner (step_child) or step-parent
    (step_sibling) they're connected through."""
    status: PartnerStatus = PartnerStatus.TOGETHER
    """partner / step_parent: whether the couple is together, separated or divorced."""
    also_parent_of: list[uuid.UUID] = []
    """partner: children with only one of the two recorded as a parent (their
    `only_parent_of`) who are both of theirs. They join the new couple."""


class PersonCreate(PersonFields):
    is_living: bool = True
    is_me: bool = False
    relative: RelativeLink | None = None
    birth: FuzzyDate | None = None
    death: FuzzyDate | None = None

    @model_validator(mode="after")
    def _death_means_deceased(self) -> "PersonCreate":
        if self.death is not None and (self.is_living or self.is_me):
            raise ValueError("Only someone marked deceased can have a date of death")
        return self


class PersonUpdate(Schema):
    given_names: str | None = Field(None, max_length=200)
    surname: str | None = Field(None, max_length=200)
    birth_surname: str | None = Field(None, max_length=200)
    nickname: str | None = Field(None, max_length=200)
    native_name: str | None = Field(None, max_length=400)
    sex: Sex | None = None
    bio: str | None = None
    is_living: bool | None = None
    occupation: str | None = Field(None, max_length=200)
    nationality: str | None = Field(None, max_length=200)
    education: str | None = Field(None, max_length=300)
    links: list[SocialLink] | None = Field(None, max_length=12)
    vehicles: list[Vehicle] | None = Field(None, max_length=12)
    pets: list[Pet] | None = Field(None, max_length=20)
    favorites: list[Favorite] | None = Field(None, max_length=20)


class PersonPermissions(Schema):
    can_edit: bool
    can_set_living: bool
    can_delete: bool
    can_add_relatives: bool
    can_view_conditions: bool
    """Health is shared only with the person and their blood relatives."""
    can_edit_conditions: bool


class VitalOut(Schema):
    """A birth or death: when and where."""

    event_id: uuid.UUID
    date: FuzzyDateOut | None
    place: str | None


class PersonOut(PersonFields, ORM):
    id: uuid.UUID
    tree_id: uuid.UUID
    is_living: bool
    display_name: str
    linked_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    photo_id: uuid.UUID | None = None
    """Their profile picture: /api/trees/{tree_id}/photos/{photo_id}/thumb (or /full)."""
    birth: VitalOut | None = None
    death: VitalOut | None = None


class RelativeOut(Schema):
    person_id: uuid.UUID
    relation: RelationName
    pedigree: ChildRelation | None = None
    family_id: uuid.UUID | None = None
    status: PartnerStatus | None = None
    via_person_id: uuid.UUID | None = None
    can_edit_family: bool = False
    """Partners only: may the viewer change the couple's status and events?"""
    can_make_parent: bool = False
    """Step-parents and step-children only: can the step-parent be recorded as a parent
    instead? True when their partner is the child's only recorded parent and the viewer may
    connect them."""
    can_unlink: bool = False
    """May the viewer remove this link? Only direct links can be removed: parents, children,
    partners with no children together, and siblings recorded without parents."""


class TimelineItem(Schema):
    key: str
    event_id: uuid.UUID | None
    """Set for real events; derived entries (a child's birth, a partner's death) have none."""
    kind: Literal["person", "family", "child_birth", "partner_death"]
    type: EventType
    type_label: str
    summary: str
    title: str
    description: str
    date: FuzzyDateOut | None
    place: str | None
    family_id: uuid.UUID | None
    related_person_id: uuid.UUID | None
    editable: bool


class PersonDetailOut(PersonOut):
    permissions: PersonPermissions
    parents: list[uuid.UUID]
    children: list[uuid.UUID]
    partners: list[uuid.UUID]
    only_parent_of: list[uuid.UUID]
    """Children with no other parent recorded. A new partner can be recorded as their other
    parent (see RelativeLink.also_parent_of)."""
    relatives: list[RelativeOut]
    timeline: list[TimelineItem]


class LinkUser(Schema):
    user_id: uuid.UUID | None


# ---- events, families, places ------------------------------------------------------------


class EventIn(Schema):
    type: EventType
    title: str = Field("", max_length=200)
    description: str = Field("", max_length=5000)
    date: FuzzyDate | None = None
    place: str | None = Field(None, max_length=300)
    """A place name; an existing place in the tree with the same name is reused."""


class EventUpdate(Schema):
    type: EventType | None = None
    title: str | None = Field(None, max_length=200)
    description: str | None = Field(None, max_length=5000)
    date: FuzzyDate | None = None
    place: str | None = Field(None, max_length=300)


class EventOut(Schema):
    id: uuid.UUID
    person_id: uuid.UUID | None
    family_id: uuid.UUID | None
    type: EventType
    title: str
    description: str
    date: FuzzyDateOut | None
    place: str | None


class FamilyUpdate(Schema):
    status: PartnerStatus


class FamilyOut(Schema):
    id: uuid.UUID
    status: PartnerStatus
    partner_ids: list[uuid.UUID]
    child_ids: list[uuid.UUID]


class PlaceOut(ORM):
    id: uuid.UUID
    name: str


# ---- tree canvas ------------------------------------------------------------------------


class GraphPerson(ORM):
    """What the tree canvas needs to draw one person."""

    id: uuid.UUID
    display_name: str
    given_names: str
    surname: str
    sex: Sex
    is_living: bool
    photo_id: uuid.UUID | None = None
    linked_user_id: uuid.UUID | None
    birth: VitalOut | None = None
    death: VitalOut | None = None


class GraphChild(Schema):
    person_id: uuid.UUID
    relation: ChildRelation


class GraphFamily(Schema):
    """A couple (or single parent) and their children, as drawn on the canvas."""

    id: uuid.UUID
    status: PartnerStatus
    partner_ids: list[uuid.UUID]
    children: list[GraphChild]
    married: bool = False
    """A marriage is recorded, with or without a date."""
    marriage: FuzzyDateOut | None = None
    """The date of their first recorded marriage."""


class TreeGraphOut(Schema):
    people: list[GraphPerson]
    families: list[GraphFamily]


# ---- photos -------------------------------------------------------------------------------


class PhotoOut(ORM):
    """A photo. The image is at /api/trees/{tree_id}/photos/{id}/thumb or /full."""

    id: uuid.UUID
    tree_id: uuid.UUID
    person_id: uuid.UUID | None
    caption: str
    width: int
    height: int
    created_at: datetime


class PhotoUpdate(Schema):
    caption: str = Field(max_length=500)


class ProfilePhoto(Schema):
    photo_id: uuid.UUID | None
    """One of the person's photos, or none to go back to their initials."""


# ---- health -------------------------------------------------------------------------------


class ConditionIn(Schema):
    name: str = Field(min_length=1, max_length=200)
    status: ConditionStatus
    year: int | None = Field(None, ge=1, le=9999)
    """When it was diagnosed or found."""
    note: str = Field("", max_length=500)


class ConditionUpdate(Schema):
    name: str | None = Field(None, min_length=1, max_length=200)
    status: ConditionStatus | None = None
    year: int | None = Field(None, ge=1, le=9999)
    note: str | None = Field(None, max_length=500)


class ConditionOut(ORM):
    id: uuid.UUID
    person_id: uuid.UUID
    name: str
    status: ConditionStatus
    year: int | None
    note: str


class InheritedConditionOut(Schema):
    """Something a close blood relative has recorded: worth keeping an eye on."""

    name: str
    status: ConditionStatus
    """What the relative recorded: diagnosed, or carrier."""
    source_id: uuid.UUID
    """The closest relative who has it recorded."""
    via: list[uuid.UUID]
    """For grandparents and beyond: the line from them down to the person's parent."""
    generations: int
    """1 for a parent, 2 for a grandparent, 3 for a great-grandparent; 0 for a sibling."""
    others: int
    """How many more relatives have it recorded."""


class ConditionsOut(Schema):
    recorded: list[ConditionOut]
    inherited: list[InheritedConditionOut]
