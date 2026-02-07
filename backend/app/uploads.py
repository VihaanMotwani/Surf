from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Dict, List

from fastapi import UploadFile

BASE_DIR = Path(__file__).resolve().parents[2]
UPLOAD_ROOT = BASE_DIR / "uploads"

# In-memory registry: session_id -> list of uploads
_UPLOADS: Dict[str, List[dict]] = {}


def _safe_filename(name: str) -> str:
    base = os.path.basename(name).strip().replace(" ", "_")
    return base or "upload.bin"


def _ensure_unique(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    counter = 1
    while True:
        candidate = path.with_name(f"{stem}_{counter}{suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def list_uploads(session_id: str) -> List[dict]:
    return _UPLOADS.get(session_id, [])


def clear_uploads(session_id: str) -> None:
    _UPLOADS.pop(session_id, None)
    session_dir = UPLOAD_ROOT / session_id
    if session_dir.exists():
        shutil.rmtree(session_dir, ignore_errors=True)


async def save_upload(session_id: str, file: UploadFile) -> dict:
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
    session_dir = UPLOAD_ROOT / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_filename(file.filename or "upload.bin")
    dest = _ensure_unique(session_dir / safe_name)

    content = await file.read()
    dest.write_bytes(content)

    entry = {
        "filename": dest.name,
        "path": str(dest),
        "size": len(content),
        "content_type": file.content_type,
    }

    _UPLOADS.setdefault(session_id, []).append(entry)
    return entry
