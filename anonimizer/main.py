import logging
import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from config import config
from api.routes_health import router as health_router
from api.routes_upload import router as upload_router
from api.routes_profiles import router as profiles_router
from api.routes_analyze import router as analyze_router
from api.routes_redact import router as redact_router
from api.routes_cache import router as cache_router
from api.routes_export import router as export_router
from services.session_store import cleanup_idle_sessions

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("redactguard")

async def cleanup_task():
    while True:
        await asyncio.sleep(60 * 5)  # Run every 5 minutes
        cleanup_idle_sessions()
        logger.debug("Idle session cleanup completed.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    task = asyncio.create_task(cleanup_task())
    yield
    # Shutdown
    task.cancel()

app = FastAPI(
    title="RedactGuard API",
    description="Local-first document anonymization.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router, prefix="/api", tags=["Health"])
app.include_router(upload_router, prefix="/api", tags=["Document"])
app.include_router(profiles_router, prefix="/api", tags=["Profiles"])
app.include_router(analyze_router, prefix="/api", tags=["Analyze"])
app.include_router(redact_router, prefix="/api", tags=["Redact"])
app.include_router(cache_router, prefix="/api", tags=["Cache"])
app.include_router(export_router, prefix="/api", tags=["Export"])

# Serve frontend static files in production mode
DIST_DIR = Path(__file__).parent.parent / "dist"
if DIST_DIR.exists() and not os.getenv("REDACTGUARD_DEV"):
    from fastapi.responses import FileResponse

    # Mount static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the SPA index.html for all non-API routes."""
        file_path = DIST_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(DIST_DIR / "index.html"))
else:
    @app.get("/")
    def read_root():
        return {"message": "RedactGuard API is running. Check /api/health"}

if __name__ == "__main__":
    import uvicorn
    from uvicorn.config import LOGGING_CONFIG
    
    # Customize uvicorn logging to include timestamps
    log_format = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    LOGGING_CONFIG["formatters"]["access"]["fmt"] = log_format
    LOGGING_CONFIG["formatters"]["default"]["fmt"] = log_format
    
    logger.info(f"Starting RedactGuard on {config.host}:{config.port}")
    uvicorn.run(
        "main:app", 
        host=config.host, 
        port=config.port, 
        reload=True,
        log_config=LOGGING_CONFIG
    )
