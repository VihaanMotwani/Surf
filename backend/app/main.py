from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI

from app.db import init_db
from app.routes.health import router as health_router
from app.routes.sessions import router as sessions_router
from app.routes.tasks import router as tasks_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Browser-Use Chat Backend", version="0.1.0", lifespan=lifespan)

app.include_router(health_router)
app.include_router(sessions_router)
app.include_router(tasks_router)
