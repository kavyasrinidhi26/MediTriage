import os
import sys

# Ensure backend root is on sys.path when running app/main.py directly
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

from contextlib import asynccontextmanager
from app.config import get_settings
from app.db import init_db
from app.api.routes import router as api_router

settings = get_settings()

logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("meditriage-backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing SQLite database tables...")
    init_db()
    yield


# Ensure database tables exist immediately on application import
init_db()

app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "MediTriage AI — Assistive OPD Triage Decision Support Prototype "
        "designed for high-volume government hospital outpatient departments. "
        "Provides transparent, rule-based clinical prioritization and queue management."
    ),
    version=settings.TRIAGE_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Configure CORS
origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes with configured prefix (e.g. /api)
app.include_router(api_router, prefix=settings.API_PREFIX)


from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exceptions import RequestValidationError
from fastapi import HTTPException


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, (HTTPException, StarletteHTTPException)):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None),
        )
    if isinstance(exc, RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors()},
        )
    logger.error(f"Unhandled error processing {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred processing the medical triage request.",
            "path": request.url.path,
        },
    )


@app.get("/")
def root_redirect():
    return {
        "app": settings.APP_NAME,
        "version": settings.TRIAGE_VERSION,
        "docs_url": "/docs",
        "health_check": f"{settings.API_PREFIX}/health",
        "hospital": settings.HOSPITAL_NAME,
    }


@app.get("/health", include_in_schema=False)
def root_health():
    from datetime import datetime, timezone
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "environment": settings.ENVIRONMENT,
        "version": settings.TRIAGE_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "hospital": settings.HOSPITAL_NAME,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
