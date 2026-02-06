# Backend

Conversational agent backend with Browser-Use task runner. Uses FastAPI, SQLite, and OpenAI.

## Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip
- An OpenAI API key

## Setup

1. Create a virtualenv and install dependencies:

```bash
cd backend
uv venv --python 3.11
source .venv/bin/activate
uv pip install -e "."
```

2. Configure environment variables in `backend/.env`:

```
DATABASE_URL=sqlite+aiosqlite:///./surf.db
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
BROWSER_USE_API_KEY=your_key
TASK_POLL_INTERVAL=2.0
```

3. Install browser-use browsers (one-time):

```bash
uvx browser-use install
```

No database init step needed — tables are created automatically on server startup.

## Run API

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Run Worker

In a separate terminal:

```bash
source .venv/bin/activate
python -m worker.worker
```

The worker polls for queued tasks and runs them with Browser-Use.

## API Endpoints

### Health

- `GET /health` — returns `{"status": "ok"}`

### Sessions

- `POST /sessions` — create a new chat session
- `GET /sessions/{id}` — get session with message history
- `POST /sessions/{id}/messages` — send a message and get a response
- `POST /sessions/{id}/messages/stream` — send a message with SSE streaming

### Tasks

- `POST /tasks/sessions/{session_id}` — create a browser task (after user consent)
- `GET /tasks/{id}` — get task status
- `GET /tasks/{id}/events` — list task events
- `GET /tasks/{id}/events/stream` — SSE stream of task events
- `GET /tasks/{id}/artifacts` — list task artifacts (screenshots, etc.)

## Streaming Chat

SSE endpoint:

```
POST /sessions/{session_id}/messages/stream
```

Event types:

- `delta` — partial text token
- `done` — final message with optional `task_prompt`
- `error` — error message

## Project Structure

```
backend/
├── app/
│   ├── main.py          # FastAPI app + lifespan
│   ├── config.py         # Settings (from .env)
│   ├── db.py             # SQLite engine + session factory
│   ├── models.py         # SQLAlchemy models
│   ├── schemas.py        # Pydantic request/response schemas
│   ├── crud.py           # Database operations
│   ├── llm.py            # OpenAI integration
│   ├── conversation.py   # Chat + consent logic
│   └── routes/
│       ├── health.py
│       ├── sessions.py
│       └── tasks.py
├── worker/
│   ├── worker.py         # Task polling loop
│   └── runner.py         # Browser-Use agent runner
├── scripts/
│   └── init_db.py        # Manual DB init (optional)
├── pyproject.toml
└── .env
```
