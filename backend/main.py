import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
try:
    from .app.config import CORS_ORIGINS
    from .app.database import init_db
    from .app.api.reconciliation import router as reconciliation_router
except (ImportError, ValueError):
    from app.config import CORS_ORIGINS
    from app.database import init_db
    from app.api.reconciliation import router as reconciliation_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    logger.info("Initializing database tables...")
    try:
        init_db()
        logger.info("Database tables initialized successfully.")
    except Exception as e:
        logger.error("Error creating database tables: %s", e)
    yield


app = FastAPI(
    title="GSTRecon API",
    description="Backend API for GST Invoice Reconciliation, Parsing, and Normalization",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(reconciliation_router)


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "GSTRecon API"}
