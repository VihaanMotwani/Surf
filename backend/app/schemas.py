from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class SessionCreateResponse(BaseModel):
    id: UUID
    status: str
    created_at: datetime | None = None


class MessageCreateRequest(BaseModel):
    content: str = Field(min_length=1)


class MessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    created_at: datetime | None = None


class SessionResponse(BaseModel):
    id: UUID
    status: str
    pending_task_prompt: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    messages: list[MessageResponse] = Field(default_factory=list)


class ChatResponse(BaseModel):
    assistant_message: MessageResponse
    task_id: UUID | None = None


class AudioChatResponse(ChatResponse):
    transcription: str


class TaskCreateRequest(BaseModel):
    prompt: str | None = None


class TaskResponse(BaseModel):
    id: UUID
    session_id: UUID
    status: str
    prompt: str
    error: str | None = None
    agreed_at: datetime | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime | None = None


class TaskEventResponse(BaseModel):
    id: int
    type: str
    payload: dict[str, Any]
    created_at: datetime | None = None


class ArtifactResponse(BaseModel):
    id: UUID
    type: str
    location: str | None = None
    data: str | None = None
    created_at: datetime | None = None
