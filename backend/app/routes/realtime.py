"""
WebSocket relay for OpenAI Realtime API.

This module provides a WebSocket endpoint that proxies audio between
the Electron frontend and OpenAI's Realtime API, enabling real-time
voice conversations.
"""

import asyncio
import base64
import json
import logging
import os
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import websockets

from app.config import settings
from app.memory import ZepMemory, create_memory
from app.memory_extractor import ConversationBuffer, MemoryFact

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/realtime", tags=["realtime"])

# OpenAI Realtime API endpoint
REALTIME_API_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"


class RealtimeSession:
    """Manages a single realtime session between client and OpenAI."""

    def __init__(self, client_ws: WebSocket, session_id: str):
        self.client_ws = client_ws
        self.session_id = session_id
        self.openai_ws: Optional[websockets.WebSocketClientProtocol] = None
        self.is_running = False
        self.memory: Optional[ZepMemory] = None
        self._pending_function_calls: dict[str, dict] = {}
        # Turn counter for message ordering - assigned when events START, not when transcripts complete
        self._turn_counter = 0
        # Track pending turn orders by response_id or item_id
        self._pending_response_orders: dict[str, int] = {}  # response_id -> order
        self._pending_input_orders: dict[str, int] = {}     # item_id -> order
        # Conversation buffer for smart memory extraction
        self._conversation_buffer: Optional[ConversationBuffer] = None

    def _next_turn(self) -> int:
        """Get the next turn number."""
        self._turn_counter += 1
        return self._turn_counter

    def _init_memory(self):
        """Initialize Zep memory for context."""
        self.memory = create_memory(
            api_key=settings.zep_api_key,
            user_id=settings.zep_user_id or "surf_user",
            user_name=settings.zep_user_name or "User",
        )
        if self.memory:
            logger.info(f"Zep memory initialized for session {self.session_id}")
            # Initialize conversation buffer for smart extraction
            self._conversation_buffer = ConversationBuffer(
                on_facts_extracted=self._on_facts_extracted,
                buffer_size=2,  # Extract every 2 messages (1 turn) for faster testing
                get_existing_context=self.memory.get_context,
                user_name=str(settings.zep_user_name or "User")
            )
        else:
            logger.warning(f"Zep memory NOT initialized for session {self.session_id} (check ZEP_API_KEY)")

    async def _on_facts_extracted(self, facts: list[MemoryFact]):
        """Callback when facts are extracted from conversation buffer."""
        if not self.memory or not facts:
            return
        try:
            self.memory.store_extracted_facts(facts)
            logger.info(f"[MemoryExtractor] Stored {len(facts)} extracted facts to Zep")
        except Exception as e:
            logger.error(f"[MemoryExtractor] Failed to store extracted facts: {e}")

    def _build_system_prompt(self) -> str:
        """Build system prompt with memory context."""
        context = self.memory.get_context() if self.memory else ""

        base_prompt = (
            "You are Surf, a helpful voice assistant that can browse the web for users.\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "You are multilingual. Follow the user's language.\n\n"
            "When the user asks you to do something on the web (search, navigate, fill forms, etc.), "
            "use the execute_browser_task function.\n\n"
            "If you receive the browser agent's actions or thoughts, you can update the user about the progress."
            "If the user want you to submit an job application, process with the browser agent with only information you have from the user. If there is missing information, ask the user for it. Don't need to blindly create dummy information to submit.\n\n"
            "If the user ask you to remember something even their private context just take that and use the extraction tool to store it.\n\n"
            "Be patient with the browser agent, it may take some time to complete the task."
            "If the user asks about anything that is on the browser, do not make assumptions or hallcuinate. Please only use information from the browser agent's thoughts and actions."
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
                "description": "Execute a task in the web browser. Use this when the user wants to search, navigate, click, fill forms, or interact with websites.",
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
        ]

    async def _send_session_config(self):
        """Send session configuration to OpenAI."""
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": self._build_system_prompt(),
                "voice": "alloy",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "whisper-1",
                    "language": "en"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 700,
                },
                "tools": self._get_tools(),
                "tool_choice": "auto",
            },
        }
        await self.openai_ws.send(json.dumps(session_config))

    async def _handle_openai_message(self, message: dict):
        """Process messages from OpenAI and forward to client."""
        msg_type = message.get("type", "")

        # Track when user conversation items are CREATED (before transcription completes)
        # This is when the user actually spoke, so we assign turn order here
        if msg_type == "conversation.item.created":
            item = message.get("item", {})
            item_id = item.get("id", "")
            item_type = item.get("type", "")
            # User audio messages
            if item_type == "message" and item.get("role") == "user":
                order = self._next_turn()
                self._pending_input_orders[item_id] = order
                logger.debug(f"Assigned order {order} to user item {item_id}")

        # Track when response is CREATED (before audio/transcript completes)
        # This is when the assistant starts responding
        elif msg_type == "response.created":
            response = message.get("response", {})
            response_id = response.get("id", "")
            order = self._next_turn()
            self._pending_response_orders[response_id] = order
            logger.debug(f"Assigned order {order} to response {response_id}")

        # Forward audio deltas directly to client
        elif msg_type == "response.audio.delta":
            await self.client_ws.send_json({
                "type": "audio",
                "data": message.get("delta", "")
            })

        # Forward transcription of user speech
        elif msg_type == "conversation.item.input_audio_transcription.completed":
            transcript = message.get("transcript", "")
            item_id = message.get("item_id", "")
            if transcript:
                # Get the order assigned when the item was created
                order = self._pending_input_orders.pop(item_id, self._next_turn())
                await self.client_ws.send_json({
                    "type": "user_transcript",
                    "text": transcript,
                    "order": order  # Include order for frontend sorting
                })
                # Buffer for smart extraction (instead of storing every message)
                if self._conversation_buffer:
                    self._conversation_buffer.add_message("user", transcript)
                    logger.debug(f"Buffered user message for extraction (order {order}): {transcript[:50]}...")

        # Forward assistant response transcript
        elif msg_type == "response.audio_transcript.delta":
            await self.client_ws.send_json({
                "type": "assistant_transcript_delta",
                "text": message.get("delta", "")
            })

        elif msg_type == "response.audio_transcript.done":
            transcript = message.get("transcript", "")
            response_id = message.get("response_id", "")
            # Get the order assigned when the response was created
            order = self._pending_response_orders.get(response_id, self._next_turn())
            await self.client_ws.send_json({
                "type": "assistant_transcript_done",
                "text": transcript,
                "order": order  # Include order for frontend sorting
            })
            # Buffer for smart extraction (instead of storing every message)
            if self._conversation_buffer and transcript:
                self._conversation_buffer.add_message("assistant", transcript)
                logger.debug(f"Buffered assistant message for extraction (order {order}): {transcript[:50]}...")

        # Handle function calls
        elif msg_type == "response.function_call_arguments.done":
            name = message.get("name", "")
            call_id = message.get("call_id", "")
            args_str = message.get("arguments", "{}")

            try:
                args = json.loads(args_str)
                result = await self._handle_function_call(name, args)
                
                # Send result back to OpenAI
                if self.openai_ws:
                    await self.openai_ws.send(json.dumps({
                        "type": "conversation.item.create",
                        "item": {
                            "type": "function_call_output",
                            "call_id": call_id,
                            "output": result,
                        }
                    }))
                    await self.openai_ws.send(json.dumps({"type": "response.create"}))

            except json.JSONDecodeError:
                logger.error(f"Failed to parse function arguments: {args_str}")

        # Session lifecycle events
        elif msg_type == "session.created":
            await self._send_session_config()
            await self.client_ws.send_json({"type": "session_created"})

        elif msg_type == "session.updated":
            await self.client_ws.send_json({"type": "ready"})

        elif msg_type == "response.done":
            await self.client_ws.send_json({"type": "response_done"})

        elif msg_type == "error":
            error = message.get("error", {})
            logger.error(f"OpenAI Realtime error: {error}")
            await self.client_ws.send_json({
                "type": "error",
                "message": error.get("message", "Unknown error")
            })

    async def _openai_to_client_loop(self):
        """Forward messages from OpenAI to client."""
        try:
            async for message in self.openai_ws:
                if not self.is_running:
                    break
                try:
                    data = json.loads(message)
                    await self._handle_openai_message(data)
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON from OpenAI")
        except websockets.ConnectionClosed:
            logger.info("OpenAI WebSocket closed")
        except Exception as e:
            logger.error(f"OpenAI receive error: {e}")

    async def _client_to_openai_loop(self):
        """Forward messages from client to OpenAI."""
        try:
            while self.is_running:
                try:
                    data = await self.client_ws.receive_json()
                    msg_type = data.get("type", "")

                    if msg_type == "audio":
                        # Forward audio to OpenAI
                        audio_b64 = data.get("data", "")
                        if audio_b64 and self.openai_ws:
                            await self.openai_ws.send(json.dumps({
                                "type": "input_audio_buffer.append",
                                "audio": audio_b64
                            }))

                    elif msg_type == "task_result":
                        # Handle task completion - send function result to OpenAI
                        call_id = data.get("call_id", "")
                        result = data.get("result", "Task completed")

                        if call_id and self.openai_ws:
                            await self.openai_ws.send(json.dumps({
                                "type": "conversation.item.create",
                                "item": {
                                    "type": "function_call_output",
                                    "call_id": call_id,
                                    "output": result,
                                },
                            }))
                            # Trigger response generation
                            await self.openai_ws.send(json.dumps({
                                "type": "response.create"
                            }))

                            # Clean up pending call
                            self._pending_function_calls.pop(call_id, None)

                    elif msg_type == "commit":
                        # Explicitly commit audio buffer (for push-to-talk mode)
                        if self.openai_ws:
                            await self.openai_ws.send(json.dumps({
                                "type": "input_audio_buffer.commit"
                            }))

                except (WebSocketDisconnect, RuntimeError):
                    break
                except Exception as e:
                    logger.error(f"Client receive error: {e}")
                    break
        except Exception as e:
            logger.error(f"Client loop error: {e}")

    async def run(self):
        """Run the realtime session."""
        try:
            self._init_memory()
        except Exception as e:
            logger.warning(f"Failed to initialize memory (continuing without context): {e}")

        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "OpenAI-Beta": "realtime=v1",
        }

        try:
            async with websockets.connect(
                REALTIME_API_URL,
                additional_headers=headers,
                ping_interval=20,
                ping_timeout=30,
                close_timeout=5,
            ) as openai_ws:
                self.openai_ws = openai_ws
                self.is_running = True

                logger.info(f"Realtime session {self.session_id} connected to OpenAI")

                # Run both loops concurrently
                await asyncio.gather(
                    self._openai_to_client_loop(),
                    self._client_to_openai_loop(),
                    return_exceptions=True
                )

        except Exception as e:
            logger.error(f"Realtime session error: {e}")
            try:
                await self.client_ws.send_json({
                    "type": "error",
                    "message": f"Connection error: {str(e)}"
                })
            except:
                pass
        finally:
            self.is_running = False
            # Flush any remaining buffered messages for extraction
            if self._conversation_buffer:
                try:
                    await self._conversation_buffer.flush()
                except Exception as e:
                    logger.warning(f"Failed to flush conversation buffer: {e}")
            logger.info(f"Realtime session {self.session_id} ended")
    async def _run_browser_task(self, task_id: str, session_id: str, prompt: str):
        """Run a browser task in the background and stream steps to OpenAI in real-time."""
        from app.task_executor import execute_task_background
        
        logger.info(f"Starting background browser task {task_id}")
        
        # Define callback to send each step to OpenAI
        async def on_step(step_data):
            if not self.is_running or not self.openai_ws:
                return
            
            # Extract step info for speaking
            step_num = step_data.get("step", 0)
            
            # runner.py sends 'actions' as an array of model_dump() results
            # Each action is like {"click": {"index": 123}} or {"done": {"text": "..."}}
            # The action type is the KEY, not a "type" field
            actions = step_data.get("actions", [])
            action = actions[0] if actions else {}
            
            # Extract action type from the dict key
            action_type = "unknown"
            action_data = {}
            if isinstance(action, dict) and action:
                action_type = list(action.keys())[0]  # Get the first key as the action type
                action_data = action.get(action_type, {})
                if not isinstance(action_data, dict):
                    action_data = {}
            
            # Also get thinking and next_goal for richer context
            thinking = step_data.get("thinking", "")
            next_goal = step_data.get("next_goal", "")
            
            # Create a brief, speakable summary of the step
            step_summaries = {
                "go_to_url": lambda a: f"Navigating to {a.get('url', 'the page')[:50]}",
                "input_text": lambda a: f"Typing into the text field",
                "click": lambda a: f"Clicking on an element",
                "scroll": lambda a: f"Scrolling {'down' if a.get('down') else 'up'} the page",
                "done": lambda a: f"Task complete: {a.get('text', '')[:80]}",
                "search_google": lambda a: f"Searching Google for {a.get('query', '')[:30]}",
            }
            
            summary_fn = step_summaries.get(action_type, lambda a: f"Performing {action_type}")
            action_summary = summary_fn(action_data)
            
            # Build a rich step message with context
            step_parts = [f"Step {step_num}: {action_summary}"]
            if next_goal:
                step_parts.append(f"Goal: {next_goal[:100]}")
            step_text = ". ".join(step_parts)
            
            logger.info(f"Sending step to OpenAI: {step_text}")
            
            try:
                # Send step as a user message context (so the assistant knows what happened)
                await self.openai_ws.send(json.dumps({
                    "type": "conversation.item.create",
                    "item": {
                        "type": "message",
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": f"[BROWSER UPDATE] {step_text}"
                            }
                        ]
                    }
                }))
                
                # If it's a completion step, trigger a response
                if action_type == "done":
                    await self.openai_ws.send(json.dumps({"type": "response.create"}))
                    
            except Exception as e:
                logger.error(f"Failed to send step to OpenAI: {e}")
        
        # Execute the task with step streaming and skip summary (agent already knows)
        await execute_task_background(
            task_id, 
            session_id, 
            prompt,
            on_step_callback=on_step,
            skip_summary=True
        )
        
        logger.info(f"Browser task {task_id} completed")

    async def _handle_function_call(self, name: str, args: dict):
        """Handle function calls from OpenAI."""
        if name == "execute_browser_task":
            task_prompt = args.get("task", "")
            if not task_prompt:
                return "Error: No task prompt provided"

            # Check if this is a follow-up or new task
            # For now, we always create a new task
            
            from app.db import AsyncSessionLocal
            from app.crud import create_task, get_session
            
            async with AsyncSessionLocal() as db:
                session = await get_session(db, self.session_id)
                if not session:
                    return "Error: Session not found"

                # Add [SILENT] marker to suppress legacy TTS since Realtime API will handle audio
                # We append it to the prompt so it's stored in DB but we might want to strip it for display?
                # The prompt is used for the task description.
                # execute_task_background uses it.
                silenced_prompt = f"{task_prompt} [SILENT]"
                
                task = await create_task(db, session, silenced_prompt)
                
                # Start background execution
                asyncio.create_task(self._run_browser_task(str(task.id), str(session.id), silenced_prompt))
                
                return f"I have started the browser task: {task_prompt}. I will let you know when it is finished."
                
        return "Error: Unknown function"


@router.websocket("/session/{session_id}")
async def realtime_session(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for realtime voice sessions.

    The client sends:
    - {"type": "audio", "data": "<base64 PCM16 audio>"}
    - {"type": "task_result", "call_id": "...", "result": "..."}
    - {"type": "commit"} (optional, for push-to-talk)

    The server sends:
    - {"type": "audio", "data": "<base64 PCM16 audio>"}
    - {"type": "user_transcript", "text": "..."}
    - {"type": "assistant_transcript_delta", "text": "..."}
    - {"type": "assistant_transcript_done", "text": "..."}
    - {"type": "task_requested", "task_prompt": "...", "call_id": "..."}
    - {"type": "ready"}
    - {"type": "response_done"}
    - {"type": "error", "message": "..."}
    """
    await websocket.accept()
    logger.info(f"Client connected for realtime session {session_id}")

    session = RealtimeSession(websocket, session_id)

    try:
        await session.run()
    except WebSocketDisconnect:
        logger.info(f"Client disconnected from realtime session {session_id}")
    except Exception as e:
        logger.error(f"Realtime session error: {e}")
    finally:
        session.is_running = False
