import io

import pytest
from PIL import Image

from app import photos
from app.config import get_settings
from tests.conftest import OWNER, join


@pytest.fixture(autouse=True)
def media(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "media_dir", tmp_path)
    return tmp_path


def picture(width=1200, height=800, orientation=None, gps=False) -> bytes:
    """A JPEG, optionally tagged with a camera orientation and a location."""
    image = Image.new("RGB", (width, height), (180, 120, 60))
    exif = Image.Exif()
    if orientation:
        exif[0x0112] = orientation
    if gps:
        exif[0x8825] = {1: "N", 2: (51.0, 30.0, 0.0), 3: "W", 4: (0.0, 7.0, 0.0)}
    buf = io.BytesIO()
    image.save(buf, "JPEG", exif=exif)
    return buf.getvalue()


def people(family):
    return f"/api/trees/{family['tree']}/people"


async def upload(client, family, who, data=None, caption=""):
    return await client.post(
        f"{people(family)}/{family[who]}/photos",
        files={"file": ("photo.jpg", data or picture(), "image/jpeg")},
        data={"caption": caption},
    )


async def test_upload_resizes_strips_location_and_becomes_the_profile_picture(api, family, media):
    owner = api.as_(OWNER)
    r = await upload(owner, family, "grandpa", picture(3000, 2000, gps=True), "At the docks")
    assert r.status_code == 201, r.text
    photo = r.json()
    assert (photo["width"], photo["height"], photo["caption"]) == (3000, 2000, "At the docks")

    person = (await owner.get(f"{people(family)}/{family['grandpa']}")).json()
    assert person["photo_id"] == photo["id"]
    listed = (await owner.get(f"{people(family)}/{family['grandpa']}/photos")).json()
    assert [p["id"] for p in listed] == [photo["id"]]

    r = await owner.get(f"/api/trees/{family['tree']}/photos/{photo['id']}/thumb")
    assert r.status_code == 200 and r.headers["content-type"] == "image/webp"
    thumb = Image.open(io.BytesIO(r.content))
    assert max(thumb.size) == 480 and not thumb.getexif()
    full = Image.open(
        io.BytesIO(photos.photo_path(family["tree"], photo["id"], "full").read_bytes())
    )
    assert max(full.size) == 2048 and not full.getexif()


async def test_turned_the_right_way_up(api, family):
    r = await upload(api.as_(OWNER), family, "grandpa", picture(400, 200, orientation=6))
    assert (r.json()["width"], r.json()["height"]) == (200, 400)


async def test_only_pictures_and_not_too_big(api, family, monkeypatch):
    owner = api.as_(OWNER)
    r = await upload(owner, family, "grandpa", b"not a picture at all")
    assert r.status_code == 422
    monkeypatch.setattr(photos, "MAX_BYTES", 1000)
    assert (await upload(owner, family, "grandpa", picture())).status_code == 413


async def test_who_may_add_and_see_photos(api, family):
    tid = family["tree"]
    owner = api.as_(OWNER)
    # Contributors can't change living people's profiles, photos included.
    c = await join(api, tid, "c@example.com", "contributor")
    assert (await upload(c, family, "dad")).status_code == 403
    grandpa_photo = (await upload(c, family, "grandpa")).json()

    # A member of Dad's branch can't see photos of anyone outside it.
    branch = (
        await owner.post(
            f"/api/trees/{tid}/subtrees", {"name": "Dad's line", "root_person_id": family["dad"]}
        )
    ).json()
    member = await join(api, tid, "branch@example.com", "personal", branch["id"])
    r = await member.get(f"/api/trees/{tid}/photos/{grandpa_photo['id']}/thumb")
    assert r.status_code == 404
    dad_photo = (await upload(owner, family, "dad")).json()
    assert (await member.get(f"/api/trees/{tid}/photos/{dad_photo['id']}/thumb")).status_code == 200
    detail = (await member.get(f"/api/trees/{tid}")).json()
    assert detail["photo_count"] == 1
    assert (await owner.get(f"/api/trees/{tid}")).json()["photo_count"] == 2


async def test_choosing_and_removing_photos(api, family, media):
    owner = api.as_(OWNER)
    first = (await upload(owner, family, "grandpa")).json()
    second = (await upload(owner, family, "grandpa")).json()
    base = f"/api/trees/{family['tree']}"
    r = await owner.put(f"{people(family)}/{family['grandpa']}/photo", {"photo_id": second["id"]})
    assert r.json() == {"photo_id": second["id"]}
    # Only their own photos can be their profile picture.
    other = (await upload(owner, family, "uncle")).json()
    r = await owner.put(f"{people(family)}/{family['grandpa']}/photo", {"photo_id": other["id"]})
    assert r.status_code == 422

    assert (await owner.patch(f"{base}/photos/{first['id']}", {"caption": "Wedding"})).json()[
        "caption"
    ] == "Wedding"
    assert (await owner.delete(f"{base}/photos/{second['id']}")).status_code == 204
    assert (await owner.get(f"{people(family)}/{family['grandpa']}")).json()["photo_id"] is None
    assert not photos.photo_path(family["tree"], second["id"], "thumb").exists()

    # Deleting someone deletes their pictures too.
    await owner.delete(f"{people(family)}/{family['uncle']}")
    assert not photos.photo_path(family["tree"], other["id"], "full").exists()


async def test_tree_cover(api, family):
    tid = family["tree"]
    owner = api.as_(OWNER)
    c = await join(api, tid, "c@example.com", "contributor")
    cover = {"file": ("cover.jpg", picture(), "image/jpeg")}
    assert (await c.put(f"/api/trees/{tid}/cover", files=cover)).status_code == 403

    first = (await owner.put(f"/api/trees/{tid}/cover", files=cover)).json()
    assert (await owner.get(f"/api/trees/{tid}")).json()["cover_photo_id"] == first["id"]
    assert (await c.get(f"/api/trees/{tid}/photos/{first['id']}/full")).status_code == 200
    second = (await owner.put(f"/api/trees/{tid}/cover", files=cover)).json()
    assert not photos.photo_path(tid, first["id"], "full").exists()
    assert (await owner.get(f"/api/trees/{tid}")).json()["photo_count"] == 0

    assert (await owner.delete(f"/api/trees/{tid}/cover")).status_code == 204
    assert (await owner.get(f"/api/trees/{tid}")).json()["cover_photo_id"] is None
    assert not photos.photo_path(tid, second["id"], "full").exists()
