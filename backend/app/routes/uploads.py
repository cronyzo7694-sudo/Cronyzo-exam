"""Image upload + delivery.

Routes
------
``POST /api/uploads/image``   — signed-in user uploads a cover/photo
``GET  /api/images/<id>``     — public, cacheable delivery of that image
``DELETE /api/uploads/image/<id>`` — uploader (or an admin) removes it

Design notes
------------
* One normalised format (JPEG, long edge ≤ 1600 px) keeps pages fast and makes
  the stored size predictable.
* The delivery route is public on purpose: a cover photo has to render on the
  shop grid before anyone signs in — same as any CDN URL.
* ``ETag`` + ``immutable`` caching means a returning visitor downloads each
  cover once, which matters on a free-tier API that sleeps.
"""

from __future__ import annotations

import hashlib
import io
import logging
from pathlib import PurePath

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required

from app.extensions import db
from app.models.upload import UploadedImage, new_image_id

logger = logging.getLogger("cronyzo.uploads")

uploads_bp = Blueprint("uploads", __name__)
images_bp = Blueprint("images", __name__)

MAX_INPUT_BYTES = 8 * 1024 * 1024  # 8 MB coming in from the phone
MAX_EDGE = 1600  # px — plenty for a 3:4 cover on a retina phone
JPEG_QUALITY = 82

_ALLOWED_EXT = {"jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff"}


def _api_base() -> str:
    """Absolute base URL of the API (the frontend is hosted separately)."""
    root = request.url_root.rstrip("/")
    if root.startswith("http://") and "localhost" not in root and "127.0.0.1" not in root:
        root = "https://" + root[len("http://") :]
    return root


def _normalise(raw: bytes, filename: str) -> tuple[bytes, int, int]:
    """Re-encode any accepted image as a sized-down JPEG.

    Pillow is the only dependency doing this work — it is pinned in
    ``requirements.txt``. EXIF rotation is applied so a phone photo taken
    sideways does not land sideways on the shop grid.
    """
    from PIL import Image, ImageOps  # imported lazily: boot must not depend on it

    with Image.open(io.BytesIO(raw)) as img:
        img = ImageOps.exif_transpose(img)
        if getattr(img, "is_animated", False):
            img.seek(0)
        img = img.convert("RGBA") if "A" in img.getbands() else img.convert("RGB")
        if img.mode == "RGBA":
            # Flatten transparency onto white — JPEG has no alpha channel.
            from PIL import Image as _Image

            bg = _Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[-1])
            img = bg
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)

        out = io.BytesIO()
        img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
        return out.getvalue(), img.width, img.height


@uploads_bp.post("/image")
@jwt_required()
def upload_image():
    """Accept one image (multipart ``file``) and return its public URL."""
    file = request.files.get("file") or request.files.get("image")
    if file is None or not (file.filename or ""):
        return jsonify({"error": "No image supplied", "message": "Pick a photo and try again."}), 400

    ext = PurePath(file.filename).suffix.lower().lstrip(".")
    mime = (file.mimetype or "").lower()
    if ext not in _ALLOWED_EXT and not mime.startswith("image/"):
        return (
            jsonify(
                {
                    "error": "unsupported_type",
                    "message": "That file is not an image — use JPG, PNG or WEBP.",
                }
            ),
            400,
        )

    raw = file.read(MAX_INPUT_BYTES + 1)
    if not raw:
        return jsonify({"error": "empty_file", "message": "The image looks empty."}), 400
    if len(raw) > MAX_INPUT_BYTES:
        return (
            jsonify({"error": "too_large", "message": "Image is larger than 8 MB — pick a smaller one."}),
            413,
        )

    try:
        data, width, height = _normalise(raw, file.filename)
    except Exception:  # noqa: BLE001 — a corrupt file is a 400, never a 500
        logger.info("image decode failed filename=%s", file.filename, exc_info=True)
        return (
            jsonify({"error": "bad_image", "message": "That image could not be read — try another file."}),
            400,
        )

    digest = hashlib.sha256(data).hexdigest()
    existing = UploadedImage.query.filter_by(sha256=digest).first()
    if existing is not None:
        return jsonify({**existing.to_dict(_api_base()), "deduplicated": True}), 200

    claims = get_jwt() or {}
    owner_id = None
    try:
        owner_id = int(claims.get("sub"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        owner_id = None

    image = UploadedImage(
        id=new_image_id(),
        owner_id=owner_id,
        mime="image/jpeg",
        data=data,
        size_bytes=len(data),
        width=width,
        height=height,
        sha256=digest,
        original_name=(file.filename or "")[:180],
    )
    try:
        db.session.add(image)
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        logger.exception("image commit failed")
        return jsonify({"error": "upload_failed", "message": "Could not save the image."}), 500

    logger.info("image stored id=%s %sx%s %sB", image.id, width, height, image.size_bytes)
    return jsonify(image.to_dict(_api_base())), 201


@images_bp.get("/<image_id>")
def serve_image(image_id: str):
    """Public image bytes with a one-year immutable cache."""
    image = db.session.get(UploadedImage, image_id)
    if image is None:
        return jsonify({"error": "Not found"}), 404

    etag = f'"{image.sha256[:32]}"' if image.sha256 else f'"{image.id}"'
    if request.headers.get("If-None-Match") == etag:
        return Response(status=304, headers={"ETag": etag})

    resp = Response(image.data, mimetype=image.mime or "image/jpeg")
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    resp.headers["ETag"] = etag
    resp.headers["Content-Length"] = str(len(image.data))
    return resp


@uploads_bp.delete("/image/<image_id>")
@jwt_required()
def delete_image(image_id: str):
    image = db.session.get(UploadedImage, image_id)
    if image is None:
        return jsonify({"error": "Not found"}), 404

    claims = get_jwt() or {}
    try:
        uid = int(claims.get("sub"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        uid = None
    if image.owner_id not in (None, uid) and (claims.get("role") or "") != "admin":
        return jsonify({"error": "Not allowed"}), 403

    db.session.delete(image)
    db.session.commit()
    return jsonify({"deleted": True, "id": image_id})
