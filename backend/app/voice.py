"""
Standalone Voice Agent using OpenAI Realtime API.

This module is a standalone runnable entry point — NOT wired into FastAPI routes.
It provides a voice-controlled conversational interface with Zep memory and browser
task delegation via the OpenAI Realtime WebSocket API.

Usage:
    cd backend
    python -m app.voice
"""

import os
import json
import asyncio
import base64
import logging
from typing import Optional

import numpy as np
import sounddevice as sd
import websockets

from app.memory import ZepMemory, create_memory

logger = logging.getLogger(__name__)

# Audio settings for OpenAI Realtime API
SAMPLE_RATE = 24000  # Required by OpenAI
CHANNELS = 1
DTYPE = np.int16
CHUNK_DURATION_MS = 100
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)


class VoiceAgent:
    """
    Voice-controlled agent using OpenAI Realtime API with Zep memory.

    Features:
    - Server VAD for natural turn detection
    - Zep context injection into system prompt
    - Function calling for browser task delegation
    - Audio I/O via sounddevice
    """

    REALTIME_API_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"

    def __init__(self):
        self.api_key = os.environ.get("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable is required")

        self.memory: Optional[ZepMemory] = create_memory(
            api_key=os.environ.get("ZEP_API_KEY"),
            user_id=os.environ.get("ZEP_USER_ID", "surf_local_user"),
            user_name=os.environ.get("ZEP_USER_NAME", "User"),
        )
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.is_running = False
        self.is_playing = False
        self.audio_queue: asyncio.Queue[bytes] = asyncio.Queue()
        self.playback_queue: asyncio.Queue[bytes] = asyncio.Queue()

    def _build_system_prompt(self) -> str:
        """Build system prompt with Zep context."""
        context = self.memory.get_context() if self.memory else ""

        base_prompt = (
            "You are Surf, a helpful voice assistant that can browse the web for users.\n\n"
            "Always respond in english, even if the user speaks in another language.\n\n"
            "You have access to the user's memory and preferences. Use this context to "
            "personalize your responses and tasks.\n\n"
            "When the user asks you to do something on the web (search, navigate, fill forms, etc.), "
            "use the execute_browser_task function.\n\n"
            "When the user tells you a preference or something to remember, acknowledge it naturally "
            "— it will be automatically saved.\n\n"
            "Be conversational, helpful, and proactive. Keep responses concise since this is a voice interface."
        )

        if context:
            return f"{base_prompt}\n\n--- USER CONTEXT ---\n{context}\n--- END CONTEXT ---"

        return base_prompt

    def _get_tools(self) -> list:
        """Define function tools for the Realtime API."""
        return [
            {
                "type": "function",
                "name": "execute_browser_task",
                "description": "Execute a task in the web browser.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task": {
                            "type": "string",
                            "description": "Detailed description of what to do in the browser",
                        }
                    },
                    "required": ["task"],
                },
            },
            {
                "type": "function",
                "name": "remember_preference",
                "description": "Explicitly save a user preference or important information.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "preference": {
                            "type": "string",
                            "description": "The preference or information to remember",
                        }
                    },
                    "required": ["preference"],
                },
            },
        ]

    async def _handle_function_call(self, name: str, arguments: dict) -> str:
        """Handle function calls from the model."""
        if name == "execute_browser_task":
            task = arguments.get("task", "")
            logger.info(f"Browser task requested: {task}")
            # Browser execution would be wired here in the future
            return f"Browser task noted: {task} (browser execution not yet wired in voice mode)"

        elif name == "remember_preference":
            preference = arguments.get("preference", "")
            if self.memory:
                self.memory.add_user_preference(preference)
            return f"I'll remember that: {preference}"

        return "Unknown function"

    async def _send_session_update(self):
        """Send session configuration to the Realtime API."""
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": self._build_system_prompt(),
                "voice": "alloy",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {"model": "whisper-1"},
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500,
                },
                "tools": self._get_tools(),
                "tool_choice": "auto",
            },
        }
        await self.ws.send(json.dumps(session_config))

    async def _audio_input_loop(self):
        """Capture audio from microphone and send to API."""

        def audio_callback(indata, frames, time, status):
            if status:
                logger.debug(f"Audio input status: {status}")
            if self.is_playing:
                return
            try:
                self.audio_queue.put_nowait(indata.tobytes())
            except asyncio.QueueFull:
                pass

        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype=DTYPE,
            blocksize=CHUNK_SIZE,
            callback=audio_callback,
        ):
            while self.is_running:
                try:
                    audio_bytes = await asyncio.wait_for(self.audio_queue.get(), timeout=0.1)
                    if self.is_playing or not self.ws:
                        continue
                    audio_b64 = base64.b64encode(audio_bytes).decode()
                    await self.ws.send(
                        json.dumps({"type": "input_audio_buffer.append", "audio": audio_b64})
                    )
                except asyncio.TimeoutError:
                    continue
                except websockets.ConnectionClosed:
                    break
                except Exception as e:
                    if self.is_running and self.ws:
                        logger.error(f"Audio input error: {e}")
                        break

    async def _playback_loop(self):
        """Background task to play audio using continuous streaming."""
        audio_buffer = bytearray()

        def audio_callback(outdata, frames, time_info, status):
            nonlocal audio_buffer
            bytes_needed = frames * 2
            available = len(audio_buffer)
            if available >= bytes_needed:
                outdata[:, 0] = np.frombuffer(bytes(audio_buffer[:bytes_needed]), dtype=DTYPE)
                del audio_buffer[:bytes_needed]
                self.is_playing = True
            elif available > 0:
                partial = np.frombuffer(bytes(audio_buffer), dtype=DTYPE)
                outdata[: len(partial), 0] = partial
                outdata[len(partial) :, 0] = 0
                audio_buffer.clear()
                self.is_playing = True
            else:
                outdata.fill(0)
                self.is_playing = False

        with sd.OutputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype=DTYPE,
            blocksize=2400,
            callback=audio_callback,
        ):
            while self.is_running:
                try:
                    chunk = await asyncio.wait_for(self.playback_queue.get(), timeout=0.1)
                    audio_buffer.extend(chunk)
                except asyncio.TimeoutError:
                    continue
                except Exception as e:
                    if self.is_running:
                        logger.error(f"Playback error: {e}")

    async def _handle_message(self, message: dict):
        """Process incoming WebSocket messages."""
        msg_type = message.get("type", "")

        if msg_type == "session.created":
            print("[Surf] Session created, configuring...")
            await self._send_session_update()

        elif msg_type == "session.updated":
            print("[Surf] Ready! Start speaking...")

        elif msg_type == "response.audio.delta":
            audio = message.get("delta", "")
            if audio:
                audio_bytes = base64.b64decode(audio)
                await self.playback_queue.put(audio_bytes)

        elif msg_type == "response.audio_transcript.delta":
            text = message.get("delta", "")
            if text:
                print(text, end="", flush=True)

        elif msg_type == "response.audio_transcript.done":
            print()
            transcript = message.get("transcript", "")
            if transcript and self.memory:
                self.memory.add_message("assistant", transcript)

        elif msg_type == "conversation.item.input_audio_transcription.completed":
            transcript = message.get("transcript", "")
            if transcript:
                print(f"\n[You] {transcript}")
                if self.memory:
                    self.memory.add_message("user", transcript)

        elif msg_type == "response.function_call_arguments.done":
            name = message.get("name", "")
            args_str = message.get("arguments", "{}")
            try:
                args = json.loads(args_str)
                result = await self._handle_function_call(name, args)
                await self.ws.send(
                    json.dumps(
                        {
                            "type": "conversation.item.create",
                            "item": {
                                "type": "function_call_output",
                                "call_id": message.get("call_id"),
                                "output": result,
                            },
                        }
                    )
                )
                await self.ws.send(json.dumps({"type": "response.create"}))
            except json.JSONDecodeError:
                logger.error(f"Failed to parse function arguments: {args_str}")

        elif msg_type == "error":
            error = message.get("error", {})
            logger.error(f"Realtime API error: {error.get('message', 'Unknown error')}")

    async def _receive_loop(self):
        """Receive and process messages from the API."""
        try:
            async for message in self.ws:
                if not self.is_running:
                    break
                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON received from Realtime API")
        except websockets.ConnectionClosed:
            print("[Surf] Connection closed")

    async def run(self):
        """Start the voice agent."""
        print("[Surf] Connecting to OpenAI Realtime API...")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1",
        }

        try:
            async with websockets.connect(
                self.REALTIME_API_URL,
                additional_headers=headers,
                ping_interval=20,
                ping_timeout=30,
                close_timeout=5,
            ) as ws:
                self.ws = ws
                self.is_running = True
                await asyncio.gather(
                    self._audio_input_loop(),
                    self._playback_loop(),
                    self._receive_loop(),
                )
        except KeyboardInterrupt:
            print("\n[Surf] Shutting down...")
        except Exception as e:
            print(f"[Surf] Connection error: {e}")
        finally:
            self.is_running = False

    async def stop(self):
        """Stop the agent."""
        self.is_running = False
        if self.ws:
            await self.ws.close()


async def main():
    """Entry point for the voice agent."""
    from dotenv import load_dotenv

    load_dotenv()

    print("=" * 50)
    print("  SURF - Voice-Controlled Browser Assistant")
    print("=" * 50)
    print()
    print("Starting up... (make sure your microphone is ready)")
    print()

    agent = VoiceAgent()

    try:
        await agent.run()
    except KeyboardInterrupt:
        print("\n[Surf] Goodbye!")
        await agent.stop()


if __name__ == "__main__":
    asyncio.run(main())
