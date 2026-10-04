#!/usr/bin/env python3
"""为静态相册导入照片、分配稳定编号并生成无元信息的 WebP 资源。"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "photo-manifest.json"
PUBLIC_DIR = ROOT / "public"
PHOTOS_DIR = PUBLIC_DIR / "photos"
EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def known_names(entry: dict) -> set[str]:
    return {entry["original_filename"], *entry.get("filenames", [])}


def render_photo(source: Path, photo_id: str) -> dict:
    with Image.open(source) as opened:
        oriented = ImageOps.exif_transpose(opened)
        oriented.load()
        mode = "RGBA" if "A" in oriented.getbands() or "transparency" in oriented.info else "RGB"
        converted = oriented.convert(mode)
        # 重新建立像素画布，避免把 EXIF、GPS、注释或 ICC 信息带入网站。
        clean = Image.new(mode, converted.size)
        clean.paste(converted)
        original_width, original_height = clean.size

    full = clean.copy()
    full.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
    full.save(PHOTOS_DIR / f"{photo_id}.webp", "WEBP", quality=88, method=6)
    thumb = clean.copy()
    thumb.thumbnail((640, 640), Image.Resampling.LANCZOS)
    thumb.save(PHOTOS_DIR / f"{photo_id}-thumb.webp", "WEBP", quality=82, method=6)
    return {
        "width": full.width,
        "height": full.height,
        "original_width": original_width,
        "original_height": original_height,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=ROOT / "source", help="源照片目录，只读取目录直接包含的图片")
    args = parser.parse_args()
    source_dir = args.source.expanduser().resolve()
    if not source_dir.is_dir():
        parser.error(f"源照片目录不存在：{source_dir}")

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) if MANIFEST_PATH.exists() else {"version": 1, "photos": []}
    if manifest.get("version") != 1:
        parser.error("不支持的照片清单版本")
    entries = manifest["photos"]
    ids = [entry["id"] for entry in entries]
    if len(ids) != len(set(ids)) or any(not item.isdigit() for item in ids):
        parser.error("照片清单存在重复或无效编号")

    files = sorted((path for path in source_dir.iterdir() if path.is_file() and path.suffix.lower() in EXTENSIONS), key=lambda path: path.name)
    imports = [{"path": path, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()} for path in files]
    used_ids: set[str] = set()
    matches: dict[Path, dict] = {}

    # 先保留当前文件的名字匹配，再匹配内容相同的重命名文件。
    # 一轮导入内，每个文件只能匹配一个编号，同内容的多个文件仍分别编号。
    for match_kind in ("name_and_hash", "name", "hash"):
        for item in imports:
            path = item["path"]
            if path in matches:
                continue
            for entry in entries:
                if entry["id"] in used_ids:
                    continue
                same_name = path.name in known_names(entry)
                same_hash = item["sha256"] == entry["sha256"]
                found = (same_name and same_hash) if match_kind == "name_and_hash" else same_name if match_kind == "name" else same_hash
                if found:
                    matches[path] = entry
                    used_ids.add(entry["id"])
                    break

    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    next_number = max(manifest.get("next_id", 1), max((int(photo_id) for photo_id in ids), default=0) + 1)
    added = 0
    rendered = 0
    for item in imports:
        path, digest = item["path"], item["sha256"]
        entry = matches.get(path)
        if entry is None:
            entry = {"id": f"{next_number:03d}", "original_filename": path.name, "filenames": [path.name], "sha256": digest}
            entries.append(entry)
            next_number += 1
            added += 1

        photo_id = entry["id"]
        assets_exist = all((PHOTOS_DIR / f"{photo_id}{suffix}.webp").is_file() for suffix in ("", "-thumb"))
        if entry["sha256"] != digest or not assets_exist or not all(key in entry for key in ("width", "height", "original_width", "original_height")):
            entry.update(render_photo(path, photo_id))
            rendered += 1
        entry["sha256"] = digest
        entry["filenames"] = sorted(known_names(entry) | {path.name})

    entries.sort(key=lambda entry: int(entry["id"]))
    # 缺席的源文件保留编号和已生成资源，支持只上传新增照片的增量导入。
    photos = []
    for entry in entries:
        photo_id = entry["id"]
        for suffix in ("", "-thumb"):
            asset = PHOTOS_DIR / f"{photo_id}{suffix}.webp"
            if not asset.is_file():
                parser.error(f"编号 {photo_id} 缺少资源 {asset.name}，请重新提供对应源照片")
        photos.append({
            "id": photo_id,
            "src": f"photos/{photo_id}.webp",
            "thumb": f"photos/{photo_id}-thumb.webp",
            "width": entry["width"],
            "height": entry["height"],
            "originalWidth": entry["original_width"],
            "originalHeight": entry["original_height"],
        })

    manifest["next_id"] = next_number
    write_json(MANIFEST_PATH, manifest)
    write_json(PUBLIC_DIR / "photos.json", {"photos": photos, "total": len(photos)})
    duplicate_count = sum(count - 1 for count in Counter(item["sha256"] for item in imports).values())
    original_bytes = sum(path.stat().st_size for path in files)
    asset_bytes = sum((PHOTOS_DIR / f"{entry['id']}{suffix}.webp").stat().st_size for entry in entries for suffix in ("", "-thumb"))
    print(json.dumps({"source_files": len(files), "new_photos": added, "rendered_photos": rendered, "total_photos": len(photos), "duplicate_files_in_source": duplicate_count, "source_bytes": original_bytes, "website_asset_bytes": asset_bytes}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
