from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import get_session
from app.db import get_db
from app.uploads import save_upload, list_uploads

router = APIRouter(prefix="/sessions", tags=["uploads"])


@router.post("/{session_id}/uploads")
async def upload_file_endpoint(
    session_id: UUID,
    file: UploadFile,
    db: AsyncSession = Depends(get_db),
):
    session = await get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    entry = await save_upload(str(session_id), file)
    return {
        "filename": entry["filename"],
        "path": entry["path"],
        "size": entry["size"],
        "content_type": entry["content_type"],
    }


@router.get("/{session_id}/uploads")
async def list_uploads_endpoint(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    session = await get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"files": list_uploads(str(session_id))}
