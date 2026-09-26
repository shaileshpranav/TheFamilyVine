"""Storing uploaded photos on disk, resized, with their camera metadata removed.

Each photo is kept in two sizes as WebP: a thumbnail for avatars, tiles and grids, and a
full-size copy to view. Re-encoding drops EXIF data, including where a picture was taken.
Files live at <media_dir>/<tree>/<photo>-<size>.webp and are only ever served through the
API, which checks who may see them.
"""

import asyncio
import io
import shutil
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings

SIZES = {"thumb": 480, "full": 2048}
MAX_BYTES = 15 * 1024 * 1024


def photo_path(tree_id: uuid.UUID, photo_id: uuid.UUID, size: str) -> Path:
    return get_settings().media_dir / str(tree_id) / f"{photo_id}-{size}.webp"


def _resize(data: bytes) -> tuple[dict[str, bytes], int, int]:
    try:
        with Image.open(io.BytesIO(data)) as original:
            image = ImageOps.exif_transpose(original)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "transparency" in image.info else "RGB")
            width, height = image.size
            out: dict[str, bytes] = {}
            for size, edge in SIZES.items():
                copy = image.copy()
                copy.thumbnail((edge, edge))
                buf = io.BytesIO()
                copy.save(buf, "WEBP", quality=82, method=4)
                out[size] = buf.getvalue()
            return out, width, height
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "That file isn't a picture we can read"
        ) from exc


async def read_image(upload: UploadFile) -> tuple[dict[str, bytes], int, int]:
    """The upload resized for storing, and its original width and height."""
    data = await upload.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "Photos can be up to 15 MB")
    return await asyncio.to_thread(_resize, data)


def save(tree_id: uuid.UUID, photo_id: uuid.UUID, files: dict[str, bytes]) -> None:
    for size, data in files.items():
        path = photo_path(tree_id, photo_id, size)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def remove(tree_id: uuid.UUID, photo_ids: list[uuid.UUID]) -> None:
    for photo_id in photo_ids:
        for size in SIZES:
            photo_path(tree_id, photo_id, size).unlink(missing_ok=True)


def remove_tree(tree_id: uuid.UUID) -> None:
    shutil.rmtree(get_settings().media_dir / str(tree_id), ignore_errors=True)
