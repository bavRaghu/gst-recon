import os

# Central configuration settings for GSTRecon backend

_raw_db_url = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:postgres@localhost:5432/gstrecon"
)

# If postgresql:// is provided without explicit driver, map to postgresql+psycopg2://
if _raw_db_url.startswith("postgresql://"):
    DATABASE_URL = _raw_db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
else:
    DATABASE_URL = _raw_db_url

# Configurable maximum file size in bytes (default 10 MB)
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# Allowed file extensions
ALLOWED_EXTENSIONS = {".csv", ".xlsx"}

# Reconciliation tolerance (default 1.00)
from decimal import Decimal
DEFAULT_RECONCILIATION_TOLERANCE = Decimal(os.getenv("RECONCILIATION_TOLERANCE", "1.00"))

# AI-Assisted Matching Configuration
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "").strip().lower()  # e.g., 'gemini', 'openai', 'mock', or ''
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_MODEL = os.getenv("LLM_MODEL", "gemini-1.5-flash").strip()
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "10.0"))
MAX_AI_CANDIDATES_PER_RECORD = int(os.getenv("MAX_AI_CANDIDATES_PER_RECORD", "3"))
MAX_AI_ASSESSMENTS_PER_JOB = int(os.getenv("MAX_AI_ASSESSMENTS_PER_JOB", "10"))
CANDIDATE_SIMILARITY_THRESHOLD = float(os.getenv("CANDIDATE_SIMILARITY_THRESHOLD", "0.65"))

# CORS Origins allowed to talk to the backend
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
