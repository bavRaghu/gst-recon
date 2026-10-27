import os
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Tuple

# Central configuration settings for GSTRecon backend

# Load environment variables from .env files
try:
    from dotenv import load_dotenv

    current_dir = Path(__file__).resolve().parent  # backend/app
    backend_dir = current_dir.parent              # backend
    root_dir = backend_dir.parent                 # project root

    env_paths = [
        backend_dir / ".env",
        root_dir / ".env",
        Path.cwd() / ".env",
    ]

    for p in env_paths:
        if p.is_file():
            load_dotenv(dotenv_path=p, override=False)
except ImportError:
    pass

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
DEFAULT_RECONCILIATION_TOLERANCE = Decimal(os.getenv("RECONCILIATION_TOLERANCE", "1.00"))

# Discrepancy Materiality Thresholds (Project-defined deterministic rules)
MATERIALITY_ABSOLUTE_THRESHOLD = Decimal(os.getenv("MATERIALITY_ABSOLUTE_THRESHOLD", "1000.00"))
MATERIALITY_PERCENTAGE_THRESHOLD = Decimal(os.getenv("MATERIALITY_PERCENTAGE_THRESHOLD", "0.01"))  # 1% = 0.01

# Date discrepancy tolerance (in days, default 30 days)
DISCREPANCY_DATE_TOLERANCE_DAYS = int(os.getenv("DISCREPANCY_DATE_TOLERANCE_DAYS", "30"))

# AI-Assisted Matching Configuration
# 1. Detect standard API keys
GOOGLE_KEY = os.getenv("GEMINI_API_KEY", "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()
MISTRAL_KEY = os.getenv("MISTRAL_API_KEY", "").strip()
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "").strip()
GENERIC_KEY = os.getenv("LLM_API_KEY", "").strip()

# 2. Determine provider
explicit_provider = os.getenv("LLM_PROVIDER", "").strip().lower()
if explicit_provider:
    LLM_PROVIDER = explicit_provider
elif GOOGLE_KEY:
    LLM_PROVIDER = "gemini"
elif MISTRAL_KEY:
    LLM_PROVIDER = "mistral"
elif OPENAI_KEY:
    LLM_PROVIDER = "openai"
elif GENERIC_KEY:
    LLM_PROVIDER = "gemini"
else:
    LLM_PROVIDER = ""

# 3. Determine active API key
if LLM_PROVIDER == "gemini":
    LLM_API_KEY = GOOGLE_KEY or GENERIC_KEY
elif LLM_PROVIDER == "mistral":
    LLM_API_KEY = MISTRAL_KEY or GENERIC_KEY
elif LLM_PROVIDER == "openai":
    LLM_API_KEY = OPENAI_KEY or GENERIC_KEY
else:
    LLM_API_KEY = GENERIC_KEY

# 4. Model selection (modern, active models per provider)
DEFAULT_MODELS = {
    "gemini": "gemini-3.5-flash",
    "mistral": "mistral-small-latest",
    "openai": "gpt-4o-mini",
    "mock": "mock-rules-v1",
}

explicit_model = os.getenv("LLM_MODEL", "").strip()
if explicit_model:
    LLM_MODEL = explicit_model
else:
    LLM_MODEL = DEFAULT_MODELS.get(LLM_PROVIDER, "gemini-3.5-flash")

LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "15.0"))
MAX_AI_CANDIDATES_PER_RECORD = int(os.getenv("MAX_AI_CANDIDATES_PER_RECORD", "3"))
MAX_AI_ASSESSMENTS_PER_JOB = int(os.getenv("MAX_AI_ASSESSMENTS_PER_JOB", "10"))
CANDIDATE_SIMILARITY_THRESHOLD = float(os.getenv("CANDIDATE_SIMILARITY_THRESHOLD", "0.65"))


def validate_ai_configuration() -> Tuple[bool, str, Dict[str, Any]]:
    """
    Safely validates the AI configuration without logging or exposing secret API keys.
    Returns (is_configured, status_message, safe_metadata)
    """
    safe_metadata = {
        "provider": LLM_PROVIDER or "none",
        "model": LLM_MODEL or "none",
        "key_present": bool(LLM_API_KEY),
        "key_prefix": f"{LLM_API_KEY[:4]}..." if len(LLM_API_KEY) >= 8 else ("present" if LLM_API_KEY else "none"),
    }

    if LLM_PROVIDER == "mock":
        return True, "Mock provider configured for testing.", safe_metadata

    if not LLM_PROVIDER:
        return (
            False,
            "No AI provider configured. Set GEMINI_API_KEY in backend/.env to enable AI suggestions.",
            safe_metadata,
        )

    if not LLM_API_KEY:
        return (
            False,
            f"Provider '{LLM_PROVIDER}' selected, but no API key was found. Set GEMINI_API_KEY or LLM_API_KEY in backend/.env.",
            safe_metadata,
        )

    if LLM_PROVIDER not in ("gemini", "mistral", "openai"):
        return (
            False,
            f"Unsupported provider '{LLM_PROVIDER}'. Supported providers: gemini, mistral, openai, mock.",
            safe_metadata,
        )

    return True, f"AI provider '{LLM_PROVIDER}' configured with model '{LLM_MODEL}'.", safe_metadata


# ==============================================================================
# SMTP Email & Vendor Communication Configuration
# ==============================================================================
SMTP_ENABLED = os.getenv("SMTP_ENABLED", "true").strip().lower() in ("true", "1", "yes")
SMTP_HOST = os.getenv("SMTP_HOST", "localhost").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "accounts@omkarengg.in").strip()
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Omkar Precision Engineering Accounts").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "false").strip().lower() in ("true", "1", "yes")
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "false").strip().lower() in ("true", "1", "yes")
SMTP_TIMEOUT_SECONDS = float(os.getenv("SMTP_TIMEOUT_SECONDS", "5.0"))

# Test Mode Security:
# Enabled by default to strictly protect against sending emails to real supplier contacts from uploaded files
SMTP_TEST_MODE = os.getenv("SMTP_TEST_MODE", "true").strip().lower() in ("true", "1", "yes")
SMTP_TEST_RECIPIENT = os.getenv("SMTP_TEST_RECIPIENT", "test-receiver@gst-recon.local").strip()
_raw_allowed = os.getenv("SMTP_ALLOWED_RECIPIENTS", "test-receiver@gst-recon.local,accounts@omkarengg.in").strip()
SMTP_ALLOWED_RECIPIENTS = [e.strip().lower() for e in _raw_allowed.split(",") if e.strip()]


def get_safe_smtp_config() -> Dict[str, Any]:
    """Returns safe, non-sensitive SMTP configuration status for frontend diagnostics."""
    return {
        "enabled": SMTP_ENABLED,
        "test_mode": SMTP_TEST_MODE,
        "test_recipient": SMTP_TEST_RECIPIENT,
        "allowed_recipients": SMTP_ALLOWED_RECIPIENTS,
        "from_email": SMTP_FROM_EMAIL,
        "from_name": SMTP_FROM_NAME,
        "host": SMTP_HOST,
        "port": SMTP_PORT,
        "use_tls": SMTP_USE_TLS,
        "has_credentials": bool(SMTP_USERNAME and SMTP_PASSWORD),
    }


# CORS Origins allowed to talk to the backend
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
