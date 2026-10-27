import os
from decimal import Decimal
from datetime import date
import pytest
from unittest.mock import patch

from app import config
from app.config import validate_ai_configuration
from app.models import (
    Gstr2bRecord,
    PurchaseRecord,
    ReconciliationJob,
    ReconciliationProposal,
    ReconciliationResult,
)
from app.services.ai_service import (
    evaluate_candidates_with_llm,
    run_ai_assisted_matching,
    clear_mock_ai_responses,
    set_mock_ai_response,
)
from app.services.reconciliation_service import run_deterministic_reconciliation


@pytest.fixture(autouse=True)
def cleanup():
    clear_mock_ai_responses()
    yield
    clear_mock_ai_responses()


def test_validate_ai_configuration_mock():
    """Verify mock provider validation for testing."""
    with patch.object(config, "LLM_PROVIDER", "mock"):
        is_cfg, msg, meta = validate_ai_configuration()
        assert is_cfg is True
        assert meta["provider"] == "mock"


def test_validate_ai_configuration_missing_provider_and_key():
    """Verify validation when neither provider nor key is configured."""
    with patch.object(config, "LLM_PROVIDER", ""), patch.object(config, "LLM_API_KEY", ""):
        is_cfg, msg, meta = validate_ai_configuration()
        assert is_cfg is False
        assert "No AI provider configured" in msg
        assert meta["key_present"] is False


def test_validate_ai_configuration_missing_key():
    """Verify validation when provider is specified but key is missing."""
    with patch.object(config, "LLM_PROVIDER", "gemini"), patch.object(config, "LLM_API_KEY", ""):
        is_cfg, msg, meta = validate_ai_configuration()
        assert is_cfg is False
        assert "no API key was found" in msg


def test_validate_ai_configuration_valid_gemini():
    """Verify validation when Gemini provider and key are configured without leaking the key."""
    fake_key = "AIzaSyFakeKey1234567890abcdef"
    with patch.object(config, "LLM_PROVIDER", "gemini"), patch.object(config, "LLM_API_KEY", fake_key), patch.object(config, "LLM_MODEL", "gemini-3.5-flash"):
        is_cfg, msg, meta = validate_ai_configuration()
        assert is_cfg is True
        assert "AI provider 'gemini' configured" in msg
        assert meta["key_present"] is True
        # Never leak the full secret in metadata
        assert fake_key not in meta["key_prefix"]
        assert meta["key_prefix"].startswith("AIza")


@pytest.mark.anyio
async def test_unconfigured_provider_surfaces_calm_user_message(db_session):
    """
    Verify that when AI provider is unconfigured, ambiguous invoices receive the
    non-technical user-friendly fallback explanation instead of technical errors.
    """
    job = ReconciliationJob(id="test-unconf-job", status="UPLOADED")
    db_session.add(job)
    db_session.flush()

    # Create ambiguous candidate pair (same GSTIN, variation in invoice number)
    pr = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="27AABCU9603R1ZM",
        invoice_number="INV/2026/001",
        invoice_date=date(2026, 4, 10),
        taxable_value=Decimal("15000.00"),
        cgst=Decimal("1350.00"),
        sgst=Decimal("1350.00"),
        igst=Decimal("0.00"),
    )
    twob = Gstr2bRecord(
        job_id=job.id,
        supplier_gstin="27AABCU9603R1ZM",
        invoice_number="INV-2026-001",
        invoice_date=date(2026, 4, 10),
        taxable_value=Decimal("15000.00"),
        cgst=Decimal("1350.00"),
        sgst=Decimal("1350.00"),
        igst=Decimal("0.00"),
    )
    db_session.add_all([pr, twob])
    db_session.commit()

    results, _ = run_deterministic_reconciliation(db_session, job.id)
    db_session.commit()

    summary = await run_ai_assisted_matching(
        db=db_session,
        job_id=job.id,
        results=results,
        provider="",
        api_key="",
    )

    assert summary["ai_enabled"] is False
    assert summary["proposals_skipped"] == 1

    prop = db_session.query(ReconciliationProposal).filter(
        ReconciliationProposal.job_id == job.id
    ).first()

    assert prop is not None
    assert prop.assessment_status == "UNAVAILABLE"
    # Ensure exact user-friendly messaging without technical leakage
    assert prop.reasoning == "AI suggestions are currently unavailable. Your invoices have still been reconciled using the standard matching rules."
    # Ensure technical reason is safely preserved in metadata for administrators
    assert "technical_reason" in prop.model_metadata
    assert "AI provider is not configured" in prop.model_metadata["technical_reason"]


@pytest.mark.anyio
async def test_markdown_code_fences_stripped_from_llm_response():
    """Verify that JSON wrapped in markdown code blocks (```json ... ```) is parsed seamlessly."""
    raw_markdown = """```json
{
  "evaluations": [
    {
      "candidate_id": 42,
      "is_match": true,
      "confidence": "HIGH",
      "reasoning": "Matching invoice number despite delimiters.",
      "conflicting_evidence": null
    }
  ]
}
```"""
    set_mock_ai_response("all", raw_markdown)

    task = {
        "result_id": 1,
        "source_pr": PurchaseRecord(
            id=1,
            supplier_gstin="27AABCU9603R1ZM",
            invoice_number="INV/001",
            invoice_date=date(2026, 4, 10),
            taxable_value=Decimal("1000.00"),
            cgst=Decimal("90.00"),
            sgst=Decimal("90.00"),
            igst=Decimal("0.00"),
        ),
        "candidates": [
            Gstr2bRecord(
                id=42,
                supplier_gstin="27AABCU9603R1ZM",
                invoice_number="INV-001",
                invoice_date=date(2026, 4, 10),
                taxable_value=Decimal("1000.00"),
                cgst=Decimal("90.00"),
                sgst=Decimal("90.00"),
                igst=Decimal("0.00"),
            )
        ],
    }

    evals, err = await evaluate_candidates_with_llm(
        task=task,
        provider="mock",
        api_key="mock-key",
        model="mock-model",
    )

    assert err is None
    assert len(evals) == 1
    assert evals[0].candidate_id == 42
    assert evals[0].is_match is True
    assert evals[0].confidence == "HIGH"
