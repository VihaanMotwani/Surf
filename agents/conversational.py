"""
Conversational Agent with OpenAI Realtime API.

Handles voice conversations with Zep memory integration and browser task delegation.
"""

import os
import json
import asyncio
import base64
from typing import Callable, Optional
import numpy as np
import sounddevice as sd
import websockets

from memory import ZepMemory
from agents.browser import BrowserAgent, BrowserTaskResult


# Audio settings for OpenAI Realtime API
SAMPLE_RATE = 24000  # Required by OpenAI
CHANNELS = 1
DTYPE = np.int16
CHUNK_DURATION_MS = 100
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)


class ConversationalAgent:
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
        
        self.memory = ZepMemory()
        self.browser_agent = BrowserAgent()
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.is_running = False
        self.is_playing = False  # Suppress mic input during playback
        self.audio_queue: asyncio.Queue[bytes] = asyncio.Queue()
        self.playback_queue: asyncio.Queue[bytes] = asyncio.Queue()
        self._playback_task: Optional[asyncio.Task] = None
        
    def _build_system_prompt(self) -> str:
        """Build system prompt with Zep context."""
        context = self.memory.get_context()
        
        base_prompt = """You are Surf, a helpful voice assistant that can browse the web for users.

You have access to the user's memory and preferences. Use this context to personalize your responses and tasks.

When the user asks you to do something on the web (search, navigate, fill forms, etc.), use the execute_browser_task function.

When the user tells you a preference or something to remember, acknowledge it naturally - it will be automatically saved.

Be conversational, helpful, and proactive. Keep responses concise since this is a voice interface."""

        if context:
            return f"""{base_prompt}

--- USER CONTEXT ---
{context}
--- END CONTEXT ---"""
        
        return base_prompt
    
    def _get_tools(self) -> list:
        """Define function tools for the Realtime API."""
        return [
            {
                "type": "function",
                "name": "execute_browser_task",
                "description": "Execute a task in the web browser. Use this for any web browsing, searching, navigation, form filling, or web automation tasks.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "task": {
                            "type": "string",
                            "description": "Detailed description of what to do in the browser"
                        }
                    },
                    "required": ["task"]
                }
            },
            {
                "type": "function",
                "name": "remember_preference",
                "description": "Explicitly save a user preference or important information for future reference.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "preference": {
                            "type": "string",
                            "description": "The preference or information to remember"
                        }
                    },
                    "required": ["preference"]
                }
            }
        ]
    
    async def _handle_function_call(self, name: str, arguments: dict) -> str:
        """Handle function calls from the model."""
        if name == "execute_browser_task":
            task = arguments.get("task", "")
            print(f"[Surf] Executing browser task: {task}")
            
            # Get memory context for the browser agent
            context = self.memory.get_context()
            
            # Execute the task
            result = await self.browser_agent.execute(task, context)
            
            # Store result in memory
            self.memory.store_browser_result(
                task=result.task,
                result=result.result,
                success=result.success,
            )
            
            if result.success:
                return f"Task completed successfully. {result.result}"
            else:
                return f"Task failed: {result.error}"
                
        elif name == "remember_preference":
            preference = arguments.get("preference", "")
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
                "input_audio_transcription": {
                    "model": "whisper-1"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500
                },
                "tools": self._get_tools(),
                "tool_choice": "auto",
            }
        }
        await self.ws.send(json.dumps(session_config))
    
    async def _audio_input_loop(self):
        """Capture audio from microphone and send to API."""
        def audio_callback(indata, frames, time, status):
            if status:
                print(f"[Audio] Input status: {status}")
            # Skip if we're playing audio (prevent echo)
            if self.is_playing:
                return
            # Convert to bytes and queue
            audio_bytes = indata.tobytes()
            try:
                self.audio_queue.put_nowait(audio_bytes)
            except asyncio.QueueFull:
                pass
        
        # Start audio input stream
        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype=DTYPE,
            blocksize=CHUNK_SIZE,
            callback=audio_callback
        ):
            while self.is_running:
                try:
                    audio_bytes = await asyncio.wait_for(
                        self.audio_queue.get(),
                        timeout=0.1
                    )
                    # Don't send if we're playing audio or no connection
                    if self.is_playing or not self.ws:
                        continue
                    # Send audio to API
                    audio_b64 = base64.b64encode(audio_bytes).decode()
                    await self.ws.send(json.dumps({
                        "type": "input_audio_buffer.append",
                        "audio": audio_b64
                    }))
                except asyncio.TimeoutError:
                    continue
                except websockets.ConnectionClosed:
                    # Connection closed, exit gracefully
                    break
                except Exception as e:
                    if self.is_running and self.ws:
                        print(f"[Audio] Input error: {e}")
                        break  # Exit loop on persistent errors
    
    async def _playback_loop(self):
        """Background task to play audio using continuous streaming."""
        # Thread-safe buffer for audio data
        audio_buffer = bytearray()
        buffer_lock = asyncio.Lock()
        
        def audio_callback(outdata, frames, time_info, status):
            """Callback for OutputStream - fills output buffer from our audio_buffer."""
            nonlocal audio_buffer
            bytes_needed = frames * 2  # 16-bit = 2 bytes per sample
            
            # Get available audio
            available = len(audio_buffer)
            if available >= bytes_needed:
                outdata[:, 0] = np.frombuffer(bytes(audio_buffer[:bytes_needed]), dtype=DTYPE)
                del audio_buffer[:bytes_needed]
                self.is_playing = True
            elif available > 0:
                # Partial buffer - pad with silence
                partial = np.frombuffer(bytes(audio_buffer), dtype=DTYPE)
                outdata[:len(partial), 0] = partial
                outdata[len(partial):, 0] = 0
                audio_buffer.clear()
                self.is_playing = True
            else:
                # No audio - output silence
                outdata.fill(0)
                self.is_playing = False
        
        # Create output stream that continuously calls our callback
        with sd.OutputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype=DTYPE,
            blocksize=2400,  # 100ms at 24kHz
            callback=audio_callback
        ):
            while self.is_running:
                try:
                    # Get audio chunks and add to buffer
                    chunk = await asyncio.wait_for(
                        self.playback_queue.get(),
                        timeout=0.1
                    )
                    audio_buffer.extend(chunk)
                except asyncio.TimeoutError:
                    continue
                except Exception as e:
                    if self.is_running:
                        print(f"[Audio] Playback error: {e}")
    
    async def _audio_output_handler(self, audio_b64: str):
        """Queue audio response for playback."""
        audio_bytes = base64.b64decode(audio_b64)
        await self.playback_queue.put(audio_bytes)
    
    async def _handle_message(self, message: dict):
        """Process incoming WebSocket messages."""
        msg_type = message.get("type", "")
        
        if msg_type == "session.created":
            print("[Surf] Session created, configuring...")
            await self._send_session_update()
            
        elif msg_type == "session.updated":
            print("[Surf] Ready! Start speaking...")
            
        elif msg_type == "response.audio.delta":
            # Stream audio output
            audio = message.get("delta", "")
            if audio:
                await self._audio_output_handler(audio)
                
        elif msg_type == "response.audio_transcript.delta":
            # Print assistant's transcript
            text = message.get("delta", "")
            if text:
                print(text, end="", flush=True)
                
        elif msg_type == "response.audio_transcript.done":
            print()  # Newline after transcript
            transcript = message.get("transcript", "")
            if transcript:
                self.memory.add_message("assistant", transcript)
                
        elif msg_type == "conversation.item.input_audio_transcription.completed":
            # User's transcribed speech
            transcript = message.get("transcript", "")
            if transcript:
                print(f"\n[You] {transcript}")
                self.memory.add_message("user", transcript)
                
        elif msg_type == "response.function_call_arguments.done":
            # Handle function call
            name = message.get("name", "")
            args_str = message.get("arguments", "{}")
            try:
                args = json.loads(args_str)
                result = await self._handle_function_call(name, args)
                
                # Send function result back
                await self.ws.send(json.dumps({
                    "type": "conversation.item.create",
                    "item": {
                        "type": "function_call_output",
                        "call_id": message.get("call_id"),
                        "output": result
                    }
                }))
                
                # Trigger response generation
                await self.ws.send(json.dumps({
                    "type": "response.create"
                }))
                
            except json.JSONDecodeError:
                print(f"[Surf] Failed to parse function arguments: {args_str}")
                
        elif msg_type == "error":
            error = message.get("error", {})
            print(f"[Surf] Error: {error.get('message', 'Unknown error')}")
    
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
                    print(f"[Surf] Invalid JSON received")
        except websockets.ConnectionClosed:
            print("[Surf] Connection closed")
    
    async def run(self):
        """Start the conversational agent."""
        print("[Surf] Connecting to OpenAI Realtime API...")
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1"
        }
        
        try:
            async with websockets.connect(
                self.REALTIME_API_URL,
                additional_headers=headers,
                ping_interval=20,  # Send ping every 20s
                ping_timeout=30,   # Wait 30s for pong
                close_timeout=5,
            ) as ws:
                self.ws = ws
                self.is_running = True
                
                # Run input, playback, and receive loops concurrently
                await asyncio.gather(
                    self._audio_input_loop(),
                    self._playback_loop(),
                    self._receive_loop()
                )
                
        except KeyboardInterrupt:
            print("\n[Surf] Shutting down...")
        except Exception as e:
            print(f"[Surf] Connection error: {e}")
        finally:
            self.is_running = False
            await self.browser_agent.close()
    
    async def stop(self):
        """Stop the agent."""
        self.is_running = False
        if self.ws:
            await self.ws.close()


async def main():
    """Entry point for the conversational agent."""
    agent = ConversationalAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
