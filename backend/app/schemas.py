import re
import uuid
from datetime import datetime
from typing import Annotated, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.dates import FuzzyDate, FuzzyDateOut
from app.kinship import RelationName
from app.models import ChildRelation, EventType, PartnerStatus, Role, Sex, SubtreeDirection


class Schema(BaseModel):
    # Responses always include every field, so mark defaulted fields as required in the
    # OpenAPI output schemas. Request schemas are unaffected.
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


class ORM(Schema):
    model_config = ConfigDict(from_attributes=True)


# ---- users --------------------------------------------------------------------------------


class UserOut(ORM):
    id: uuid.UUID
    email: str
    display_name: str
    avatar_url: str | None


class UserUpdate(Schema):
    display_name: str | None = Field(None, max_length=200)
    avatar_url: str | None = Field(None, max_length=1000)


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
    person_id: uuid.UUID
    relation: RelationKind
    """How the NEW person relates to `person_id` (e.g. "child" = new person is their child)."""
    family_id: uuid.UUID | None = None
    """child: which of the parent's unions; sibling: which set of parents they share."""
    new_family: bool = False
    """child: the other parent isn't recorded, so start a new single-parent family."""
    via_person_id: uuid.UUID | None = None
    """Step relations: the parent (step_parent), partner (step_child) or step-parent
    (step_sibling) the new person is connected through."""
    status: PartnerStatus = PartnerStatus.TOGETHER
    """partner / step_parent: whether the couple is together, separated or divorced."""


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
