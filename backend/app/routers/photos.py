"""Photos: people's galleries and profile pictures, and each tree's cover.

Images are only ever served here, to people who may see whoever is in them (a cover, to
anyone in the tree), never from a public folder.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app import photos
from app.deps import DB, Access, forbidden, get_visible_person, not_found
from app.models import Person, Photo, Tree
from app.permissions import TreeAccess
from app.schemas import PhotoOut, PhotoUpdate, ProfilePhoto

router = APIRouter(prefix="/api/trees/{tree_id}", tags=["photos"])


async def _photo(db: DB, access: TreeAccess, photo_id: uuid.UUID) -> tuple[Photo, Person | None]:
    """A photo the viewer may see, and whose it is (none for a tree's cover)."""
    photo = await db.get(Photo, photo_id)
    if photo is None or photo.tree_id != access.tree_id:
        raise not_found()
    person = await get_visible_person(db, access, photo.person_id) if photo.person_id else None
    return photo, person


def _can_edit(access: TreeAccess, person: Person | None) -> bool:
    return access.can_edit_person(person) if person else access.can_edit_tree()


@router.get("/people/{person_id}/photos", response_model=list[PhotoOut])
async def list_photos(tree_id: uuid.UUID, person_id: uuid.UUID, access: Access, db: DB):
    person = await get_visible_person(db, access, person_id)
    return (
        await db.scalars(
            select(Photo).where(Photo.person_id == person.id).order_by(Photo.created_at.desc())
        )
    ).all()


@router.post(
    "/people/{person_id}/photos", response_model=PhotoOut, status_code=status.HTTP_201_CREATED
)
async def upload_photo(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    access: Access,
    db: DB,
    file: Annotated[UploadFile, File()],
    caption: Annotated[str, Form(max_length=500)] = "",
):
    """Add a photo to someone's gallery. Their first becomes their profile picture."""
    person = await get_visible_person(db, access, person_id)
    if not access.can_edit_person(person):
        raise forbidden()
    files, width, height = await photos.read_image(file)
    photo = Photo(
        tree_id=tree_id,
        person_id=person.id,
        caption=caption,
        width=width,
        height=height,
        uploaded_by_id=access.user.id,
    )
    db.add(photo)
    await db.flush()
    photos.save(tree_id, photo.id, files)
    if person.photo_id is None:
        person.photo_id = photo.id
    await db.commit()
    return photo


@router.put("/people/{person_id}/photo", response_model=ProfilePhoto)
async def set_profile_photo(
    tree_id: uuid.UUID, person_id: uuid.UUID, body: ProfilePhoto, access: Access, db: DB
):
    person = await get_visible_person(db, access, person_id)
    if not access.can_edit_person(person):
        raise forbidden()
    if body.photo_id is not None:
        photo = await db.get(Photo, body.photo_id)
        if photo is None or photo.person_id != person.id:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT, "That photo isn't one of theirs"
            )
    person.photo_id = body.photo_id
    await db.commit()
    return ProfilePhoto(photo_id=person.photo_id)


@router.patch("/photos/{photo_id}", response_model=PhotoOut)
async def update_photo(
    tree_id: uuid.UUID, photo_id: uuid.UUID, body: PhotoUpdate, access: Access, db: DB
):
    photo, person = await _photo(db, access, photo_id)
    if not _can_edit(access, person):
        raise forbidden()
    photo.caption = body.caption
    await db.commit()
    return photo


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(tree_id: uuid.UUID, photo_id: uuid.UUID, access: Access, db: DB):
    photo, person = await _photo(db, access, photo_id)
    if not _can_edit(access, person):
        raise forbidden()
    await db.delete(photo)
    await db.commit()
    photos.remove(tree_id, [photo_id])


@router.get("/photos/{photo_id}/{size}")
async def photo_file(tree_id: uuid.UUID, photo_id: uuid.UUID, size: str, access: Access, db: DB):
    """The image, as WebP: `thumb` (up to 480px) or `full` (up to 2048px)."""
    await _photo(db, access, photo_id)
    path = photos.photo_path(tree_id, photo_id, size)
    if size not in photos.SIZES or not path.is_file():
        raise not_found()
    # A photo's files never change, so browsers may keep them.
    return FileResponse(
        path,
        media_type="image/webp",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@router.put("/cover", response_model=PhotoOut)
async def set_cover(
    tree_id: uuid.UUID, access: Access, db: DB, file: Annotated[UploadFile, File()]
):
    """Replace the tree's cover photo (admins)."""
    if not access.can_edit_tree():
        raise forbidden()
    tree = await db.get_one(Tree, tree_id)
    files, width, height = await photos.read_image(file)
    cover = Photo(tree_id=tree_id, width=width, height=height, uploaded_by_id=access.user.id)
    db.add(cover)
    await db.flush()
    photos.save(tree_id, cover.id, files)
    old = tree.cover_photo_id
    tree.cover_photo_id = cover.id
    if old is not None and (previous := await db.get(Photo, old)) is not None:
        await db.delete(previous)
    await db.commit()
    if old is not None:
        photos.remove(tree_id, [old])
    return cover


@router.delete("/cover", status_code=status.HTTP_204_NO_CONTENT)
async def remove_cover(tree_id: uuid.UUID, access: Access, db: DB):
    if not access.can_edit_tree():
        raise forbidden()
    tree = await db.get_one(Tree, tree_id)
    old = tree.cover_photo_id
    if old is None:
        return
    tree.cover_photo_id = None
    if (previous := await db.get(Photo, old)) is not None:
        await db.delete(previous)
    await db.commit()
    photos.remove(tree_id, [old])
