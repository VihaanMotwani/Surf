# Backend Plan: Conversational Agent + Browser-Use Task Runner

## Purpose
Build a backend that powers a conversational agent with session management. When a user explicitly agrees to run a task, the backend creates a Browser-Use agent to perform that task, returning results to the chat.

## Scope
- Chat sessions and conversation history
- Task consent and execution flow
- Browser-Use agent orchestration
- APIs for web or mobile clients
- Observability, security, and deployment

## Assumptions
- We will integrate the Python package `browser-use`.
- The backend will run asynchronous tasks.
- Chat client is a separate frontend that calls the backend APIs.
- The backend must be able to store sessions and task runs.
- Backend stack is Python.
- LLM provider is OpenAI.
- Deployment target is local.

## Decisions (Confirmed)
- Backend stack: Python, likely FastAPI for the API service.
- LLM provider: OpenAI.
- Deployment: local development environment.

## Open Decisions
- Database choice: PostgreSQL recommended, or SQLite for minimal local setup.
- Message broker: Redis + RQ/ARQ/Celery, or in-process background tasks for MVP.
- Long-running tasks: dedicated worker vs. in-app background tasks.
- Realtime updates: WebSocket vs. SSE vs. polling.

## High-Level Architecture
- API Service
  - Handles chat sessions, message storage, and task approvals.
  - Publishes task execution jobs.
- Worker Service
  - Runs Browser-Use agents and streams updates.
- Database
  - Stores users, sessions, messages, tasks, and artifacts.
- Object Storage
  - Stores screenshots, HTML, logs, and other artifacts.
- Optional Realtime Channel
  - WebSocket or SSE for streaming updates to clients.

## Data Model (Suggested)
- User
  - id, email, created_at
- Session
  - id, user_id, status, created_at, updated_at
- Message
  - id, session_id, role, content, created_at
- Task
  - id, session_id, status, user_prompt, agreed_at, started_at, finished_at
- TaskEvent
  - id, task_id, type, payload, created_at
- Artifact
  - id, task_id, type, location, created_at

## Core Flows
### 1) Chat Session
- Client creates a session or resumes one.
- Client sends user messages.
- Backend stores the message and calls the LLM for a reply.

### 2) Task Proposal + User Consent
- LLM proposes a task and asks for confirmation.
- If user agrees, backend transitions the session to "task approved".
- Backend creates a Task record.

### 3) Task Execution (Browser-Use)
- Worker receives task.
- Worker runs Browser-Use Agent with the task prompt.
- Worker emits status updates and stores artifacts.

### 4) Result Delivery
- API emits task completion event.
- Client receives summary and artifacts.

## API Design (Draft)
- `POST /sessions`
  - Create new session
- `GET /sessions/{id}`
  - Get session details
- `POST /sessions/{id}/messages`
  - Add user message
- `POST /sessions/{id}/tasks`
  - Create a task after user consent
- `GET /tasks/{id}`
  - Get task status
- `GET /tasks/{id}/events`
  - Stream or poll task events
- `GET /tasks/{id}/artifacts`
  - List artifacts

## Browser-Use Integration
- Worker loads `browser_use` and instantiates:
  - `Browser`
  - `ChatBrowserUse` for the LLM
  - `Agent`
- Task prompt is derived from the user’s confirmed intent.
- Output history is persisted as TaskEvents.

## Browser-Use Integration (Detailed)
### Local Setup
- Install and bootstrap:
  - `uv venv --python 3.12`
  - `uv pip install browser-use`
  - `uvx browser-use install`
- Environment variables:
  - `OPENAI_API_KEY` for OpenAI models
  - Optional: `BROWSER_USE_API_KEY` if using `ChatBrowserUse` later

### Recommended LLM Wiring (OpenAI)
```python
from browser_use import Browser, Agent, ChatBrowserUse

llm = ChatBrowserUse()
browser = Browser()
agent = Agent(task=task_prompt, llm=llm, browser=browser)
history = await agent.run()
```

### History Capture
- `history.urls()`, `history.action_history()`, `history.errors()`
- `history.final_result()` for the final extracted content
- `history.screenshots()` or `history.screenshot_paths()` for artifacts

### Browser Lifecycle
- `await browser.start()` at worker startup
- Create pages via `await browser.new_page(url)`
- `await browser.stop()` on shutdown

### Reliability & Controls
- Browser-Use is CDP-based (not Playwright). Navigation waits are manual.
- Add `asyncio.sleep()` after navigation or use explicit state checks.
- Consider `Browser(allowed_domains=[...])` for safety.
- Consider `use_vision=False` when handling sensitive data.

### Timeout Tuning (Env Vars)
- `TIMEOUT_NavigateToUrlEvent`, `TIMEOUT_TypeTextEvent`, `TIMEOUT_ScreenshotEvent`
- `TIMEOUT_BrowserStartEvent`, `TIMEOUT_BrowserStopEvent`

## Session and Consent Logic
- Each session tracks state:
  - `idle`, `awaiting_confirmation`, `task_running`, `task_completed`
- Consent is explicit: user must confirm before task is created.
- No tasks can be run without a session and a user decision.

## Observability
- Structured logs for all API requests and worker steps.
- Metrics:
  - task duration, success rate, browser errors
- Tracing across API and worker.

## Security
- Authentication: JWT or session cookies.
- Authorization: users can only access their own sessions and tasks.
- Input validation and rate limiting.
- Secrets management for API keys.

## Deployment
- Local development deployment.
- One API service + one worker service (can be separate processes).
- Postgres and Redis via local installs or Docker Compose.

## Testing
- Unit tests for task state transitions.
- Integration tests for API routes.
- Worker test with a mock Browser-Use backend.

## Milestones
1. Establish API scaffold and DB schema.
2. Implement chat session management and message storage.
3. Add consent flow and Task creation.
4. Build worker with Browser-Use integration.
5. Add realtime updates and artifacts storage.
6. Harden with security, monitoring, and load testing.

## Next Inputs Needed
- OpenAI model selection for chat and for Browser-Use (same or different models).
- Local database choice (Postgres vs. SQLite).
- Whether to use a background worker or run tasks inline.
- Whether tasks must run in a stealth or cloud browser.
