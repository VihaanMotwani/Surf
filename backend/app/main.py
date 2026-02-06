from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.db import init_db
from app.routes.health import router as health_router
from app.routes.sessions import router as sessions_router
from app.routes.tasks import router as tasks_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Browser-Use Chat Backend", version="0.1.0", lifespan=lifespan)

app.include_router(health_router)
app.include_router(sessions_router)
app.include_router(tasks_router)

BASE_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = BASE_DIR / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def frontend_index():
    if FRONTEND_DIR.exists():
        return FileResponse(FRONTEND_DIR / "index.html")
    return {"status": "ok"}
