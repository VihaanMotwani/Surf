from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.db import init_db
from app.routes.health import router as health_router
from app.routes.sessions import router as sessions_router
from app.routes.tasks import router as tasks_router
from app.routes.knowledge_graph import router as kg_router
from app.routes.speech import router as speech_router
from app.routes.realtime import router as realtime_router
from app.routes.uploads import router as uploads_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Browser-Use Chat Backend", version="0.1.0", lifespan=lifespan)

# Enable CORS for Electron frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(sessions_router)
app.include_router(tasks_router)
app.include_router(kg_router)
app.include_router(speech_router)
app.include_router(realtime_router)
app.include_router(uploads_router)

BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BASE_DIR / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def frontend_index():
    if FRONTEND_DIR.exists():
        return FileResponse(FRONTEND_DIR / "index.html")
    return {"status": "ok"}
