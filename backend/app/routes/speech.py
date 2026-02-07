"""
Speech synthesis routes using OpenAI TTS API.
"""

import logging
from io import BytesIO

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/speech", tags=["speech"])

# Configure logging
logging.basicConfig(level=logging.INFO)


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4096, description="Text to synthesize")
    voice: str = Field(default="nova", description="Voice to use (alloy, echo, fable, onyx, nova, shimmer)")
    model: str = Field(default="tts-1", description="TTS model (tts-1 or tts-1-hd)")
    speed: float = Field(default=1.0, ge=0.25, le=4.0, description="Speech speed (0.25 to 4.0)")

    class Config:
        # Allow extra fields to be ignored
        extra = "ignore"


@router.post("/synthesize/debug")
async def debug_synthesize(raw_request: Request):
    """Debug endpoint to see raw request."""
    body = await raw_request.json()
    logger.info(f"Raw request body: {body}")
    return {"received": body}


@router.post("/synthesize")
async def synthesize_speech(request: TTSRequest):
    """
    Synthesize speech from text using OpenAI TTS API.
    Returns an audio/mpeg stream.
    """
    logger.info(f"TTS request: voice={request.voice}, model={request.model}, speed={request.speed}, text_length={len(request.text)}")

    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    # Validate voice
    valid_voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
    if request.voice not in valid_voices:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid voice. Must be one of: {', '.join(valid_voices)}"
        )

    # Validate model
    valid_models = ["tts-1", "tts-1-hd"]
    if request.model not in valid_models:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model. Must be one of: {', '.join(valid_models)}"
        )

    try:
        client = AsyncOpenAI(api_key=settings.openai_api_key)

        # Call OpenAI TTS API
        response = await client.audio.speech.create(
            model=request.model,
            voice=request.voice,
            input=request.text,
            speed=request.speed,
            response_format="mp3"
        )

        # Get the audio bytes from the streaming response
        audio_content = response.content
        audio_bytes = BytesIO(audio_content)

        return StreamingResponse(
            audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline",
                "Cache-Control": "no-cache"
            }
        )

    except Exception as e:
        logger.error(f"TTS synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")


@router.get("/voices")
async def get_voices():
    """
    Return the list of available OpenAI TTS voices.
    """
    voices = [
        {
            "name": "alloy",
            "description": "Neutral and balanced voice"
        },
        {
            "name": "echo",
            "description": "Male voice with good clarity"
        },
        {
            "name": "fable",
            "description": "British accent, expressive"
        },
        {
            "name": "onyx",
            "description": "Deep, authoritative male voice"
        },
        {
            "name": "nova",
            "description": "Warm and engaging female voice (default)"
        },
        {
            "name": "shimmer",
            "description": "Bright and energetic female voice"
        }
    ]

    return {"voices": voices}
