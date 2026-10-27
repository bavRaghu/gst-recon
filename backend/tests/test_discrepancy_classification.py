from datetime import date
from decimal import Decimal
import pytest

from app.models import Gstr2bRecord, PurchaseRecord, ReconciliationJob, ReconciliationResult
from app.services.discrepancy_classification_service import (
    DiscrepancyClassificationService,
    SEVERITY_MAJOR,
    SEVERITY_MINOR,
    SEVERITY_NONE,
    SEVERITY_UNCLASSIFIED,
)
from app.services.reconciliation_service import (
    STATUS_DUPLICATE_AMBIGUOUS,
    STATUS_MATCHED,
    STATUS_MISMATCH,
    STATUS_MISSING_IN_GSTR2B,
    STATUS_MISSING_IN_PURCHASE_REGISTER,
    run_deterministic_reconciliation,
)
from conftest import make_csv_bytes


def create_job_with_records(
    db_session,
    pr_items=None,
    twob_items=None,
    job_id="test-job-classification"
):
    """Helper to populate a job with given PR and 2B records."""
    job = ReconciliationJob(id=job_id, status="UPLOADED")
    db_session.add(job)
    db_session.flush()

    if pr_items:
        for idx, item in enumerate(pr_items):
            rec = PurchaseRecord(
                job_id=job.id,
                supplier_gstin=item.get("supplier_gstin", "27AABCT3421M1Z2"),
                invoice_number=item.get("invoice_number", f"INV-{idx+1:03d}"),
                invoice_date=item.get("invoice_date", date(2026, 9, 1)),
                taxable_value=Decimal(str(item.get("taxable_value", "10000.00"))),
                cgst=Decimal(str(item.get("cgst", "900.00"))),
                sgst=Decimal(str(item.get("sgst", "900.00"))),
                igst=Decimal(str(item.get("igst", "0.00"))),
            )
            db_session.add(rec)

    if twob_items:
        for idx, item in enumerate(twob_items):
            rec = Gstr2bRecord(
                job_id=job.id,
                supplier_gstin=item.get("supplier_gstin", "27AABCT3421M1Z2"),
                invoice_number=item.get("invoice_number", f"INV-{idx+1:03d}"),
                invoice_date=item.get("invoice_date", date(2026, 9, 1)),
                taxable_value=Decimal(str(item.get("taxable_value", "10000.00"))),
                cgst=Decimal(str(item.get("cgst", "900.00"))),
                sgst=Decimal(str(item.get("sgst", "900.00"))),
                igst=Decimal(str(item.get("igst", "0.00"))),
            )
            db_session.add(rec)

    db_session.commit()
    return job


def test_01_exact_match_classified_as_none(db_session):
    """Test 1: Records matching identically have status MATCHED and severity NONE."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV-100", "taxable_value": "50000.00", "cgst": "4500.00", "sgst": "4500.00"}],
        twob_items=[{"invoice_number": "INV-100", "taxable_value": "50000.00", "cgst": "4500.00", "sgst": "4500.00"}],
        job_id="job-none-1"
    )
    results, summary = run_deterministic_reconciliation(db_session, "job-none-1")
    assert len(results) == 1
    assert results[0].status == STATUS_MATCHED
    assert results[0].severity == SEVERITY_NONE
    assert "No discrepancy" in results[0].severity_reason
    assert summary["major_discrepancies"] == 0
    assert summary["minor_discrepancies"] == 0
    assert summary["none_count"] == 1


def test_02_tolerance_boundary(db_session):
    """Test 2: Differences <= ₹1.00 tolerance are MATCHED (NONE); differences > ₹1.00 are MISMATCH (MINOR or MAJOR)."""
    create_job_with_records(
        db_session,
        pr_items=[
            {"invoice_number": "INV-TOL-1", "taxable_value": "10001.00"},  # Diff exactly 1.00 <= tolerance
            {"invoice_number": "INV-TOL-2", "taxable_value": "10001.01"},  # Diff 1.01 > tolerance, <= 1000 and <= 1%
        ],
        twob_items=[
            {"invoice_number": "INV-TOL-1", "taxable_value": "10000.00"},
            {"invoice_number": "INV-TOL-2", "taxable_value": "10000.00"},
        ],
        job_id="job-tol-1"
    )
    results, summary = run_deterministic_reconciliation(db_session, "job-tol-1", tolerance=Decimal("1.00"))
    assert len(results) == 2
    r1 = next(r for r in results if r.purchase_record.invoice_number == "INV-TOL-1")
    r2 = next(r for r in results if r.purchase_record.invoice_number == "INV-TOL-2")

    assert r1.status == STATUS_MATCHED
    assert r1.severity == SEVERITY_NONE

    assert r2.status == STATUS_MISMATCH
    assert r2.severity == SEVERITY_MINOR
    assert "Minor discrepancy" in r2.severity_reason
    assert summary["minor_discrepancies"] == 1
    assert summary["none_count"] == 1


def test_03_materiality_absolute_threshold_boundary(db_session):
    """Test 3: Absolute threshold boundary at ₹1,000.00.
    At ₹200,000 base, ₹1,000.00 difference is 0.5% (<= 1%) and <= ₹1,000 -> MINOR.
    ₹1,000.01 difference exceeds ₹1,000.00 -> MAJOR."""
    create_job_with_records(
        db_session,
        pr_items=[
            {"invoice_number": "INV-ABS-1", "taxable_value": "201000.00"},  # Diff exactly 1000.00
            {"invoice_number": "INV-ABS-2", "taxable_value": "201000.01"},  # Diff 1000.01 > 1000.00
        ],
        twob_items=[
            {"invoice_number": "INV-ABS-1", "taxable_value": "200000.00"},
            {"invoice_number": "INV-ABS-2", "taxable_value": "200000.00"},
        ],
        job_id="job-abs-1"
    )
    results, summary = run_deterministic_reconciliation(db_session, "job-abs-1")
    r1 = next(r for r in results if r.purchase_record.invoice_number == "INV-ABS-1")
    r2 = next(r for r in results if r.purchase_record.invoice_number == "INV-ABS-2")

    assert r1.status == STATUS_MISMATCH
    assert r1.severity == SEVERITY_MINOR

    assert r2.status == STATUS_MISMATCH
    assert r2.severity == SEVERITY_MAJOR
    assert "exceeds materiality threshold" in r2.severity_reason
    assert summary["major_discrepancies"] == 1
    assert summary["minor_discrepancies"] == 1


def test_04_materiality_percentage_threshold_boundary(db_session):
    """Test 4: Percentage threshold boundary at 1.0%.
    At ₹2,000.00 base:
    Difference of ₹20.00 is exactly 1.0% (<= 1.0% and <= ₹1,000) -> MINOR.
    Difference of ₹20.50 is 1.025% (> 1.0%, even though <= ₹1,000) -> MAJOR."""
    create_job_with_records(
        db_session,
        pr_items=[
            {"invoice_number": "INV-PCT-1", "taxable_value": "2020.00"},  # Diff 20.00 / 2000 = 1.0%
            {"invoice_number": "INV-PCT-2", "taxable_value": "2020.50"},  # Diff 20.50 / 2000 = 1.025%
        ],
        twob_items=[
            {"invoice_number": "INV-PCT-1", "taxable_value": "2000.00"},
            {"invoice_number": "INV-PCT-2", "taxable_value": "2000.00"},
        ],
        job_id="job-pct-1"
    )
    results, summary = run_deterministic_reconciliation(db_session, "job-pct-1")
    r1 = next(r for r in results if r.purchase_record.invoice_number == "INV-PCT-1")
    r2 = next(r for r in results if r.purchase_record.invoice_number == "INV-PCT-2")

    assert r1.status == STATUS_MISMATCH
    assert r1.severity == SEVERITY_MINOR

    assert r2.status == STATUS_MISMATCH
    assert r2.severity == SEVERITY_MAJOR
    assert summary["major_discrepancies"] == 1
    assert summary["minor_discrepancies"] == 1


def test_05_zero_reference_amount_safe_handling(db_session):
    """Test 5: Zero reference amount handled safely without ZeroDivisionError."""
    # When 2B is 0.00 (zero reference amount) and PR is 500.00 (<= 1000) -> MINOR
    # When 2B is 0.00 (zero reference amount) and PR is 1500.00 (> 1000) -> MAJOR
    create_job_with_records(
        db_session,
        pr_items=[
            {"invoice_number": "INV-ZERO-1", "taxable_value": "500.00", "cgst": "0.00", "sgst": "0.00"},
            {"invoice_number": "INV-ZERO-2", "taxable_value": "1500.00", "cgst": "0.00", "sgst": "0.00"},
        ],
        twob_items=[
            {"invoice_number": "INV-ZERO-1", "taxable_value": "0.00", "cgst": "0.00", "sgst": "0.00"},
            {"invoice_number": "INV-ZERO-2", "taxable_value": "0.00", "cgst": "0.00", "sgst": "0.00"},
        ],
        job_id="job-zero-1"
    )
    results, summary = run_deterministic_reconciliation(db_session, "job-zero-1")
    r1 = next(r for r in results if r.purchase_record.invoice_number == "INV-ZERO-1")
    r2 = next(r for r in results if r.purchase_record.invoice_number == "INV-ZERO-2")

    assert r1.severity == SEVERITY_MINOR
    assert r2.severity == SEVERITY_MAJOR


def test_06_tax_component_mismatches(db_session):
    """Test 6: Individual tax field mismatches (CGST, SGST, IGST) evaluated deterministically."""
    create_job_with_records(
        db_session,
        pr_items=[
            # CGST diff of 50 on 1800 tax = 2.77% > 1% -> MAJOR
            {"invoice_number": "INV-TAX-1", "cgst": "1850.00", "sgst": "1800.00"},
            # SGST diff of 10 on 2000 tax = 0.5% <= 1%, <= 1000 -> MINOR
            {"invoice_number": "INV-TAX-2", "cgst": "1800.00", "sgst": "2010.00"},
            # IGST diff of 1200 > 1000 -> MAJOR
            {"invoice_number": "INV-TAX-3", "igst": "3600.00"},
        ],
        twob_items=[
            {"invoice_number": "INV-TAX-1", "cgst": "1800.00", "sgst": "1800.00"},
            {"invoice_number": "INV-TAX-2", "cgst": "1800.00", "sgst": "2000.00"},
            {"invoice_number": "INV-TAX-3", "igst": "2400.00"},
        ],
        job_id="job-tax-1"
    )
    results, summary = run_deterministic_reconciliation(db_session, "job-tax-1")
    r1 = next(r for r in results if r.purchase_record.invoice_number == "INV-TAX-1")
    r2 = next(r for r in results if r.purchase_record.invoice_number == "INV-TAX-2")
    r3 = next(r for r in results if r.purchase_record.invoice_number == "INV-TAX-3")

    assert r1.severity == SEVERITY_MAJOR
    assert r2.severity == SEVERITY_MINOR
    assert r3.severity == SEVERITY_MAJOR


def test_07_missing_in_gstr2b_classified_as_major(db_session):
    """Test 7: Invoices present in PR but missing in GSTR-2B are classified as MAJOR."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV-MISS-2B", "taxable_value": "15000.00", "cgst": "1350.00", "sgst": "1350.00"}],
        twob_items=[],
        job_id="job-miss-2b"
    )
    results, summary = run_deterministic_reconciliation(db_session, "job-miss-2b")
    assert len(results) == 1
    assert results[0].status == STATUS_MISSING_IN_GSTR2B
    assert results[0].severity == SEVERITY_MAJOR
    assert "Section 16(2)(aa)" in results[0].severity_reason
    assert summary["major_discrepancies"] == 1


def test_08_missing_in_purchase_register_classified_as_major(db_session):
    """Test 8: Invoices present in GSTR-2B but missing in PR are classified as MAJOR."""
    create_job_with_records(
        db_session,
        pr_items=[],
        twob_items=[{"invoice_number": "INV-MISS-PR", "taxable_value": "8000.00", "cgst": "720.00", "sgst": "720.00"}],
        job_id="job-miss-pr"
    )
    results, summary = run_deterministic_reconciliation(db_session, "job-miss-pr")
    assert len(results) == 1
    assert results[0].status == STATUS_MISSING_IN_PURCHASE_REGISTER
    assert results[0].severity == SEVERITY_MAJOR
    assert "unrecorded purchase credit" in results[0].severity_reason
    assert summary["major_discrepancies"] == 1


def test_09_duplicate_ambiguous_classified_as_unclassified(db_session):
    """Test 9: Ambiguous duplicate invoice records are classified as UNCLASSIFIED."""
    create_job_with_records(
        db_session,
        pr_items=[
            {"invoice_number": "INV-DUP", "taxable_value": "5000.00"},
            {"invoice_number": "INV-DUP", "taxable_value": "5000.00"},
        ],
        twob_items=[
            {"invoice_number": "INV-DUP", "taxable_value": "5000.00"},
        ],
        job_id="job-dup-1"
    )
    results, summary = run_deterministic_reconciliation(db_session, "job-dup-1")
    assert len(results) == 3
    for r in results:
        assert r.status == STATUS_DUPLICATE_AMBIGUOUS
        assert r.severity == SEVERITY_UNCLASSIFIED
        assert "ambiguous match" in r.severity_reason
    assert summary["unclassified_count"] == 3
    assert summary["major_discrepancies"] == 0
    assert summary["minor_discrepancies"] == 0


def test_10_highest_applicable_severity_wins(db_session):
    """Test 10: Multiple discrepancies on one invoice resolve to the highest severity (MAJOR > MINOR > NONE)."""
    # Invoice has both date mismatch (minor) and taxable difference > 1000 (major)
    create_job_with_records(
        db_session,
        pr_items=[{
            "invoice_number": "INV-MULTI-1",
            "invoice_date": date(2026, 9, 1),
            "taxable_value": "25000.00",
        }],
        twob_items=[{
            "invoice_number": "INV-MULTI-1",
            "invoice_date": date(2026, 9, 5),  # Date diff (minor)
            "taxable_value": "20000.00",       # Taxable diff 5000 > 1000 (major)
        }],
        job_id="job-multi-1"
    )
    results, summary = run_deterministic_reconciliation(db_session, "job-multi-1")
    assert len(results) == 1
    assert results[0].severity == SEVERITY_MAJOR
    assert "Major discrepancy in taxable_value" in results[0].severity_reason


def test_11_database_persistence_and_retrieval(db_session):
    """Test 11: Severity, reason, and discrepancy details are persisted in the database table and retrievable."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV-DB-1", "taxable_value": "12000.00"}],
        twob_items=[{"invoice_number": "INV-DB-1", "taxable_value": "10000.00"}],
        job_id="job-db-1"
    )
    run_deterministic_reconciliation(db_session, "job-db-1")

    # Query directly from DB
    persisted = (
        db_session.query(ReconciliationResult)
        .filter(ReconciliationResult.job_id == "job-db-1")
        .first()
    )
    assert persisted is not None
    assert persisted.severity == SEVERITY_MAJOR
    assert persisted.severity_reason is not None
    assert len(persisted.severity_reason) > 0
    assert persisted.discrepancy_details is not None
    assert "fields" in persisted.discrepancy_details
    assert "taxable_value" in persisted.discrepancy_details["fields"]


def test_12_api_severity_filtering_and_counts(client):
    """Test 12: End-to-end API verification for severity filtering and accurate summary counts."""
    headers = [
        "Supplier GSTIN",
        "Invoice Number",
        "Invoice Date",
        "Taxable Value",
        "CGST",
        "SGST",
        "IGST",
    ]
    pr_rows = [
        # Exactly matching -> NONE
        ["27AABCT3421M1Z2", "INV-API-MATCH", "2026-09-01", "10000.00", "900.00", "900.00", "0.00"],
        # Minor difference: base 50000, diff 50 (0.1% <= 1%, 50 <= 1000) -> MINOR
        ["27AABCT3421M1Z2", "INV-API-MINOR", "2026-09-02", "50050.00", "4500.00", "4500.00", "0.00"],
        # Major difference: diff 5000 > 1000 -> MAJOR
        ["27AABCT3421M1Z2", "INV-API-MAJOR", "2026-09-03", "25000.00", "2250.00", "2250.00", "0.00"],
        # Missing in GSTR-2B -> MAJOR
        ["27AABCT3421M1Z2", "INV-API-MISS2B", "2026-09-04", "15000.00", "1350.00", "1350.00", "0.00"],
    ]
    twob_rows = [
        ["27AABCT3421M1Z2", "INV-API-MATCH", "2026-09-01", "10000.00", "900.00", "900.00", "0.00"],
        ["27AABCT3421M1Z2", "INV-API-MINOR", "2026-09-02", "50000.00", "4500.00", "4500.00", "0.00"],
        ["27AABCT3421M1Z2", "INV-API-MAJOR", "2026-09-03", "20000.00", "1800.00", "1800.00", "0.00"],
    ]

    pr_csv = make_csv_bytes(headers, pr_rows)
    twob_csv = make_csv_bytes(headers, twob_rows)

    # 1. Upload
    up_resp = client.post("/api/reconciliation/upload", files={
        "purchase_register": ("pr.csv", pr_csv, "text/csv"),
        "gstr_2b": ("twob.csv", twob_csv, "text/csv"),
    })
    assert up_resp.status_code == 200
    job_id = up_resp.json()["job_id"]

    # 2. Run Reconciliation
    run_resp = client.post(f"/api/reconciliation/{job_id}/run", json={"tolerance": 1.0, "run_ai_matching": False})
    assert run_resp.status_code == 200
    summary = run_resp.json()["summary"]
    assert summary["major_discrepancies"] == 2  # INV-API-MAJOR, INV-API-MISS2B
    assert summary["minor_discrepancies"] == 1  # INV-API-MINOR
    assert summary["none_count"] == 1           # INV-API-MATCH

    # 3. Check Job Detail API summary
    job_resp = client.get(f"/api/reconciliation/jobs/{job_id}")
    assert job_resp.status_code == 200
    job_summary = job_resp.json()["summary"]
    assert job_summary["major_discrepancies"] == 2
    assert job_summary["minor_discrepancies"] == 1
    assert job_summary["none_count"] == 1

    # 4. Filter by severity: MAJOR
    maj_resp = client.get(f"/api/reconciliation/{job_id}/results?severity_filter=MAJOR")
    assert maj_resp.status_code == 200
    maj_data = maj_resp.json()
    assert len(maj_data) == 2
    for item in maj_data:
        assert item["severity"] == "MAJOR"
        assert item["severity_reason"] is not None

    # 5. Filter by severity: MINOR
    min_resp = client.get(f"/api/reconciliation/{job_id}/results?severity_filter=MINOR")
    assert min_resp.status_code == 200
    min_data = min_resp.json()
    assert len(min_data) == 1
    assert min_data[0]["severity"] == "MINOR"
    assert min_data[0]["purchase_record"]["invoice_number"] == "INV-API-MINOR"

    # 6. Filter by severity: NONE
    none_resp = client.get(f"/api/reconciliation/{job_id}/results?severity_filter=NONE")
    assert none_resp.status_code == 200
    none_data = none_resp.json()
    assert len(none_data) == 1
    assert none_data[0]["severity"] == "NONE"
    assert none_data[0]["purchase_record"]["invoice_number"] == "INV-API-MATCH"
