import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import DATABASE_URL

logger = logging.getLogger(__name__)

# Configure engine arguments based on driver
engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

try:
    engine = create_engine(DATABASE_URL, **engine_kwargs)
except Exception as e:
    logger.error("Failed to initialize database engine with URL %s: %s", DATABASE_URL, e)
    # Safe fallback for isolated test environments
    engine = create_engine("sqlite:///./gstrecon_fallback.db", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency that provides a clean SQLAlchemy session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables defined in models and ensure backward-compatible columns exist."""
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)

    # Safe migration check for existing tables
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        if "reconciliation_results" in inspector.get_table_names():
            columns = [c["name"] for c in inspector.get_columns("reconciliation_results")]
            with engine.begin() as conn:
                if "severity" not in columns:
                    conn.execute(text("ALTER TABLE reconciliation_results ADD COLUMN severity VARCHAR(32) DEFAULT 'UNCLASSIFIED'"))
                if "severity_reason" not in columns:
                    conn.execute(text("ALTER TABLE reconciliation_results ADD COLUMN severity_reason TEXT"))
                if "discrepancy_details" not in columns:
                    col_type = "JSON" if not str(engine.url).startswith("sqlite") else "TEXT"
                    conn.execute(text(f"ALTER TABLE reconciliation_results ADD COLUMN discrepancy_details {col_type}"))
    except Exception as ex:
        logger.warning("Safe migration check completed or skipped: %s", ex)
