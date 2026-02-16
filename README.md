# Surf - Speech-Driven Web Assistant

An accessibility-focused desktop application that empowers users with physical disabilities, visual impairments, or cognitive challenges to browse the web using natural speech. Surf combines voice-controlled browser automation, a persistent memory system, and a multimodal chat interface into a single Electron app.

> **Demo video**:

https://github.com/user-attachments/assets/ea65908e-d17d-41f2-88ac-6389097bde8c

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup Guide](#setup-guide)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
  - [4. Run the Application](#4-run-the-application)
- [Environment Variables](#environment-variables)
- [API Keys](#api-keys)
- [Usage](#usage)
- [Accessibility](#accessibility)

---

## Features

- **Voice-Controlled Browsing** - Speak naturally to automate web tasks (search, navigate, fill forms, extract data). Powered by [browser-use](https://github.com/browser-use/browser-use).
- **Streaming Chat Interface** - Real-time SSE streaming responses with support for both text and voice input.
- **Speech-to-Text** - Record voice messages transcribed via OpenAI Whisper, sent as chat input.
- **Text-to-Speech** - Responses are narrated aloud via the Web Speech API for visually impaired users.
- **Browser Task Status** - Live task cards show running/succeeded/failed states for browser automation jobs.
- **Persistent Conversations** - Sessions are saved to SQLite and reload automatically on app restart.
- **Session History** - Browse, resume, or delete previous conversation sessions.
- **Knowledge Graph** - Visualize learned user preferences, facts, and browsing habits as an interactive graph (Sigma.js).
- **Local Memory System** - LLM-powered fact extraction stores user preferences across sessions for personalized responses.
- **Zep Cloud Memory** - Optional integration with Zep for advanced semantic memory (graceful fallback when not configured).
- **Accessibility Controls** - High-contrast mode, text scaling (80%-200%), reduced motion support, WCAG 2.2 AA compliance.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Electron App                       │
│  ┌──────────┐   IPC    ┌──────────────────────────┐ │
│  │ Renderer │ <------> │     Main Process         │ │
│  │ (React)  │          │  (API client, IPC hdlrs) │ │
│  └──────────┘          └───────────┬──────────────┘ │
└────────────────────────────────────┼────────────────┘
                                     │ HTTP / SSE
                                     ▼
                          ┌─────────────────────┐
                          │   FastAPI Backend    │
                          │  (localhost:8000)    │
                          ├─────────────────────┤
                          │ - Chat streaming    │
                          │ - Whisper STT       │
                          │ - Browser-use agent │
                          │ - Memory / Facts    │
                          │ - Knowledge Graph   │
                          ├─────────────────────┤
                          │   SQLite (surf.db)  │
                          └────────┬────────────┘
                                   │
                          ┌────────▼────────────┐
                          │   External APIs      │
                          │ - OpenAI (GPT, STT) │
                          │ - Browser-Use Cloud │
                          │ - Zep Cloud (opt.)  │
                          └─────────────────────┘
```

---

## Tech Stack

| Layer               | Technology                                    |
| ------------------- | --------------------------------------------- |
| Desktop Shell       | Electron 28 + electron-vite                   |
| Frontend            | React 19, TypeScript, Tailwind CSS, shadcn/ui |
| State Management    | Zustand                                       |
| Graph Visualization | Sigma.js + Graphology                         |
| Backend             | FastAPI (Python 3.11+)                        |
| Database            | SQLite via SQLAlchemy + aiosqlite             |
| LLM                 | OpenAI GPT-4.1-mini (configurable)            |
| Speech-to-Text      | OpenAI Whisper                                |
| Text-to-Speech      | Web Speech API (browser-native)               |
| Browser Automation  | browser-use                                   |
| Memory              | Local SQLite facts + Zep Cloud (optional)     |

---

## Project Structure

```
surf/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py             # FastAPI app, CORS, lifespan
│   │   ├── config.py           # Pydantic settings (reads .env)
│   │   ├── db.py               # SQLAlchemy async engine + init
│   │   ├── models.py           # ORM models (Session, Message, Task, Fact)
│   │   ├── schemas.py          # Pydantic request/response schemas
│   │   ├── crud.py             # Database CRUD operations
│   │   ├── llm.py              # OpenAI chat + streaming + vision
│   │   ├── conversation.py     # Chat flow orchestration
│   │   ├── task_executor.py    # Browser-use task runner (in-process)
│   │   ├── local_memory.py     # Fact extraction + knowledge graph
│   │   ├── memory.py           # Zep Cloud integration (optional)
│   │   ├── voice.py            # Standalone voice agent (experimental)
│   │   └── routes/
│   │       ├── sessions.py     # Session CRUD, chat, audio streaming
│   │       ├── tasks.py        # Task polling endpoints
│   │       ├── knowledge_graph.py  # Graph data + search
│   │       └── health.py       # Health check
│   ├── worker/
│   │   ├── runner.py           # Browser-use runner + history summarizer
│   │   └── worker.py           # Background worker (legacy)
│   ├── .env.example            # Environment variable template
│   └── pyproject.toml          # Python dependencies
│
├── src/                        # Electron + React frontend
│   ├── main/                   # Electron main process
│   │   ├── index.ts            # App entry, window creation
│   │   ├── api.ts              # HTTP client for FastAPI backend
│   │   └── ipc/
│   │       ├── channels.ts     # IPC channel constants
│   │       └── handlers/
│   │           ├── chat.ts     # Text + audio streaming handlers
│   │           └── session.ts  # Session CRUD handlers
│   ├── preload/
│   │   └── index.ts            # Context bridge (window.electron)
│   └── renderer/src/
│       ├── App.tsx             # Root layout
│       ├── components/
│       │   ├── ChatInterface/  # Chat messages, input, task cards
│       │   ├── KnowledgeGraph/ # Sigma.js graph visualization
│       │   ├── SessionHistory/ # Session list, cards, details
│       │   ├── Layout/         # Sidebar, Header
│       │   ├── AccessibilityControls/
│       │   └── ui/             # shadcn/ui primitives
│       ├── hooks/
│       │   ├── useIPC.ts       # Electron IPC hook
│       │   └── useSpeech.ts    # TTS + audio recording
│       ├── store/
│       │   ├── chat.ts         # Chat state (Zustand)
│       │   ├── session.ts      # Session history state
│       │   └── ui.ts           # UI state (view, sidebar, a11y)
│       └── lib/
│           ├── types.ts        # TypeScript interfaces
│           └── utils.ts        # Utility functions
│
├── package.json                # Node.js dependencies
├── electron.vite.config.ts     # Electron-vite configuration
├── tailwind.config.js          # Tailwind CSS configuration
├── tsconfig.json               # TypeScript configuration
└── README.md                   # This file
```

---

## Prerequisites

| Requirement       | Version |
| ----------------- | ------- |
| **Node.js** | 20+     |
| **npm**     | 10+     |
| **Python**  | 3.11+   |
| **pip**     | Latest  |

---

## Setup Guide

### 1. Clone the Repository

```bash
git clone https://github.com/VihaanMotwani/Surf.git
cd surf
```

### 2. Backend Setup

```bash
# Navigate to backend
cd backend

# Create and activate a Python virtual environment
python3 -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows

# Install Python dependencies
pip install -e .

# Create your environment file
cp .env.example .env
```

Now edit `backend/.env` and fill in your API keys (see [API Keys](#api-keys) below):

```env
OPENAI_API_KEY=sk-your-key-here
BROWSER_USE_API_KEY=bu_your-key-here
```

Start the backend server:

```bash
uvicorn app.main:app --port 8000 --reload
```

The backend will automatically create the SQLite database (`surf.db`) on first startup.

### 3. Frontend Setup

Open a **new terminal** at the project root:

```bash
# Navigate to project root (not backend/)
cd surf

# Install Node.js dependencies
npm install
```

### 4. Run the Application

With the backend running on port 8000, start the Electron app:

```bash
npm run dev
```

This launches the Electron window which connects to the FastAPI backend at `http://localhost:8000`.

**Summary of terminals needed:**

| Terminal   | Command                                       | Directory    |
| ---------- | --------------------------------------------- | ------------ |
| Terminal 1 | `uvicorn app.main:app --port 8000 --reload` | `backend/` |
| Terminal 2 | `npm run dev`                               | project root |

---

## Environment Variables

All environment variables go in `backend/.env`. A template is provided at `backend/.env.example`.

| Variable                | Required | Description                                             |
| ----------------------- | -------- | ------------------------------------------------------- |
| `OPENAI_API_KEY`      | Yes      | OpenAI API key for GPT and Whisper                      |
| `OPENAI_MODEL`        | No       | Model name (default:`gpt-4.1-mini`)                   |
| `BROWSER_USE_API_KEY` | Yes      | Browser-Use cloud API key for browser automation        |
| `DATABASE_URL`        | No       | SQLite path (default:`sqlite+aiosqlite:///./surf.db`) |
| `TASK_POLL_INTERVAL`  | No       | Task polling interval in seconds (default:`2.0`)      |
| `ZEP_API_KEY`         | No       | Zep Cloud API key for semantic memory (optional)        |
| `ZEP_USER_ID`         | No       | Zep user identifier (default:`surf_local_user`)       |
| `ZEP_USER_NAME`       | No       | Zep display name (default:`User`)                     |

---

## API Keys

### OpenAI API Key (Required)

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new API key
3. Add it to `backend/.env` as `OPENAI_API_KEY`
4. This key is used for:
   - Chat responses (GPT-4.1-mini)
   - Voice transcription (Whisper)
   - Fact extraction from conversations
   - Screen description (vision model)

### Browser-Use API Key (Required)

1. Go to [browser-use.com](https://browser-use.com)
2. Sign up and generate an API key
3. Add it to `backend/.env` as `BROWSER_USE_API_KEY`
4. This key powers the autonomous browser agent that executes web tasks

### Zep Cloud API Key (Optional)

1. Go to [getzep.com](https://www.getzep.com)
2. Create a project and get your API key
3. Add it to `backend/.env` as `ZEP_API_KEY`
4. The app works fully without Zep - it falls back to local SQLite-based memory

---

## Usage

### Text Chat

Type a message in the chat input and press Enter. The assistant streams responses in real-time.

### Voice Input

Click the microphone button to record a voice message. The audio is sent to OpenAI Whisper for transcription, then processed as a regular chat message.

### Browser Tasks

Ask the assistant to perform a web task in natural language:

- *"Search for cat images on Google"*
- *"Go to Wikipedia and find information about climate change"*
- *"Open YouTube and search for cooking tutorials"*

The assistant acknowledges the task and launches a browser-use agent in the background. A task status card shows progress in the chat.

### Session History

Click **Session History** in the sidebar to view past conversations. Click any session to resume it, or delete sessions you no longer need.

### Knowledge Graph

Click **Knowledge Graph** in the sidebar to visualize learned facts about the user as an interactive node graph.

### New Conversation

Click **New Chat** in the sidebar to start a fresh conversation. Previous conversations are preserved in session history.

---

## Accessibility

Surf is built with accessibility as a core requirement, not an afterthought:

- **Screen reader support** - Semantic HTML with ARIA labels, live regions for dynamic content
- **Keyboard navigation** - Full keyboard support for all features with visible focus indicators
- **High contrast mode** - Toggle via accessibility controls in the header
- **Text scaling** - Adjustable from 80% to 200% via accessibility controls
- **Reduced motion** - Respects system preferences and provides a manual toggle
- **Voice narration** - All assistant responses can be read aloud via Web Speech API
- **Voice input** - Hands-free interaction via microphone recording

---

## License

MIT
