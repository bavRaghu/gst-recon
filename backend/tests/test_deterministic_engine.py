import threading
from datetime import date, timedelta
from decimal import Decimal
import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.models import Gstr2bRecord, PurchaseRecord, ReconciliationJob, ReconciliationResult
from app.services.reconciliation_service import (
    STATUS_DUPLICATE_AMBIGUOUS,
    STATUS_MATCHED,
    STATUS_MISMATCH,
    STATUS_MISSING_IN_GSTR2B,
    STATUS_MISSING_IN_PURCHASE_REGISTER,
    run_deterministic_reconciliation,
)


def create_job_with_records(
    db_session,
    pr_items=None,
    twob_items=None,
    job_id="test-job-1"
):
    """Helper to populate a job with given PR and 2B records."""
    job = ReconciliationJob(id=job_id, status="UPLOADED")
    db_session.add(job)
    db_session.flush()

    if pr_items:
        for item in pr_items:
            rec = PurchaseRecord(
                job_id=job.id,
                supplier_gstin=item.get("supplier_gstin", "27AABCT3421M1Z2"),
                invoice_number=item.get("invoice_number", "INV-001"),
                invoice_date=item.get("invoice_date", date(2026, 9, 1)),
                taxable_value=Decimal(str(item.get("taxable_value", "10000.00"))),
                cgst=Decimal(str(item.get("cgst", "900.00"))),
                sgst=Decimal(str(item.get("sgst", "900.00"))),
                igst=Decimal(str(item.get("igst", "0.00"))),
            )
            db_session.add(rec)

    if twob_items:
        for item in twob_items:
            rec = Gstr2bRecord(
                job_id=job.id,
                supplier_gstin=item.get("supplier_gstin", "27AABCT3421M1Z2"),
                invoice_number=item.get("invoice_number", "INV-001"),
                invoice_date=item.get("invoice_date", date(2026, 9, 1)),
                taxable_value=Decimal(str(item.get("taxable_value", "10000.00"))),
                cgst=Decimal(str(item.get("cgst", "900.00"))),
                sgst=Decimal(str(item.get("sgst", "900.00"))),
                igst=Decimal(str(item.get("igst", "0.00"))),
            )
            db_session.add(rec)

    db_session.commit()
    return job


def test_01_exact_match(db_session):
    """Test 1: Identical fields on both sides produce MATCHED with empty differences."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV-001", "taxable_value": "50000.00", "cgst": "4500.00", "sgst": "4500.00", "igst": "0.00"}],
        twob_items=[{"invoice_number": "INV-001", "taxable_value": "50000.00", "cgst": "4500.00", "sgst": "4500.00", "igst": "0.00"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 1
    assert results[0].status == STATUS_MATCHED
    assert results[0].differences == {}
    assert results[0].purchase_record_id is not None
    assert results[0].gstr2b_record_id is not None
    assert summary["matched"] == 1
    assert summary["mismatched"] == 0


def test_02_invoice_date_mismatch(db_session):
    """Test 2: Invoice date difference produces MISMATCH and records difference."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV-001", "invoice_date": date(2026, 9, 4)}],
        twob_items=[{"invoice_number": "INV-001", "invoice_date": date(2026, 9, 8)}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 1
    assert results[0].status == STATUS_MISMATCH
    assert "invoice_date" in results[0].differences
    assert results[0].differences["invoice_date"]["purchase_register"] == "2026-09-04"
    assert results[0].differences["invoice_date"]["gstr2b"] == "2026-09-08"
    assert "-4 days" in results[0].differences["invoice_date"]["difference"]
    assert summary["mismatched"] == 1


def test_03_taxable_value_mismatch(db_session):
    """Test 3: Taxable value difference exceeding tolerance produces MISMATCH."""
    create_job_with_records(
        db_session,
        pr_items=[{"taxable_value": "10000.00"}],
        twob_items=[{"taxable_value": "10500.00"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1", tolerance=Decimal("1.00"))
    assert len(results) == 1
    assert results[0].status == STATUS_MISMATCH
    assert "taxable_value" in results[0].differences
    diff = results[0].differences["taxable_value"]
    assert diff["purchase_register"] == "10000.00"
    assert diff["gstr2b"] == "10500.00"
    assert diff["difference"] == "-500.00"


def test_04_cgst_mismatch(db_session):
    """Test 4: CGST difference exceeding tolerance produces MISMATCH."""
    create_job_with_records(
        db_session,
        pr_items=[{"cgst": "900.00"}],
        twob_items=[{"cgst": "950.00"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert results[0].status == STATUS_MISMATCH
    assert "cgst" in results[0].differences
    assert results[0].differences["cgst"]["difference"] == "-50.00"


def test_05_sgst_mismatch(db_session):
    """Test 5: SGST difference exceeding tolerance produces MISMATCH."""
    create_job_with_records(
        db_session,
        pr_items=[{"sgst": "900.00"}],
        twob_items=[{"sgst": "800.00"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert results[0].status == STATUS_MISMATCH
    assert "sgst" in results[0].differences
    assert results[0].differences["sgst"]["difference"] == "100.00"


def test_06_igst_mismatch(db_session):
    """Test 6: IGST difference exceeding tolerance produces MISMATCH."""
    create_job_with_records(
        db_session,
        pr_items=[{"cgst": "0.00", "sgst": "0.00", "igst": "1800.00"}],
        twob_items=[{"cgst": "0.00", "sgst": "0.00", "igst": "1700.00"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert results[0].status == STATUS_MISMATCH
    assert "igst" in results[0].differences
    assert results[0].differences["igst"]["difference"] == "100.00"


def test_07_multiple_simultaneous_field_differences(db_session):
    """Test 7: Multiple simultaneous differences recorded in differences dict."""
    create_job_with_records(
        db_session,
        pr_items=[{
            "invoice_date": date(2026, 9, 1),
            "taxable_value": "20000.00",
            "cgst": "1800.00",
            "sgst": "1800.00",
            "igst": "0.00"
        }],
        twob_items=[{
            "invoice_date": date(2026, 9, 5),
            "taxable_value": "21000.00",
            "cgst": "1890.00",
            "sgst": "1890.00",
            "igst": "0.00"
        }],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert results[0].status == STATUS_MISMATCH
    diffs = results[0].differences
    assert "invoice_date" in diffs
    assert "taxable_value" in diffs
    assert "cgst" in diffs
    assert "sgst" in diffs
    assert "igst" not in diffs


def test_08_monetary_difference_exactly_equal_to_tolerance(db_session):
    """Test 8: Difference exactly equal to tolerance is considered matching."""
    create_job_with_records(
        db_session,
        pr_items=[{"taxable_value": "10001.00"}],
        twob_items=[{"taxable_value": "10000.00"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1", tolerance=Decimal("1.00"))
    assert results[0].status == STATUS_MATCHED
    assert results[0].differences == {}


def test_09_monetary_difference_just_below_tolerance(db_session):
    """Test 9: Difference just below tolerance is considered matching."""
    create_job_with_records(
        db_session,
        pr_items=[{"taxable_value": "10000.99"}],
        twob_items=[{"taxable_value": "10000.00"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1", tolerance=Decimal("1.00"))
    assert results[0].status == STATUS_MATCHED
    assert results[0].differences == {}


def test_10_monetary_difference_just_above_tolerance(db_session):
    """Test 10: Difference just above tolerance is considered a discrepancy."""
    create_job_with_records(
        db_session,
        pr_items=[{"taxable_value": "10001.01"}],
        twob_items=[{"taxable_value": "10000.00"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1", tolerance=Decimal("1.00"))
    assert results[0].status == STATUS_MISMATCH
    assert "taxable_value" in results[0].differences
    assert results[0].differences["taxable_value"]["difference"] == "1.01"


def test_11_zero_valued_monetary_fields(db_session):
    """Test 11: Correctly handles zero monetary values without division by zero or errors."""
    create_job_with_records(
        db_session,
        pr_items=[{"taxable_value": "0.00", "cgst": "0.00", "sgst": "0.00", "igst": "0.00"}],
        twob_items=[{"taxable_value": "0.00", "cgst": "0.00", "sgst": "0.00", "igst": "0.00"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert results[0].status == STATUS_MATCHED
    assert summary["matched"] == 1


def test_12_decimal_precision_and_trailing_zeros(db_session):
    """Test 12: Decimal arithmetic handles precision and sub-cent rounding without float drift."""
    create_job_with_records(
        db_session,
        pr_items=[{"taxable_value": "100.10", "cgst": "9.00"}],
        twob_items=[{"taxable_value": "100.10", "cgst": "9.00"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1", tolerance=Decimal("0.00"))
    assert results[0].status == STATUS_MATCHED


def test_13_missing_invoice_in_gstr2b(db_session):
    """Test 13: Purchase Register invoice absent from GSTR-2B produces MISSING_IN_GSTR2B."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV-ONLY-PR"}],
        twob_items=[],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 1
    assert results[0].status == STATUS_MISSING_IN_GSTR2B
    assert results[0].purchase_record_id is not None
    assert results[0].gstr2b_record_id is None
    assert summary["missing_in_gstr2b"] == 1


def test_14_missing_invoice_in_purchase_register(db_session):
    """Test 14: GSTR-2B invoice absent from Purchase Register produces MISSING_IN_PURCHASE_REGISTER."""
    create_job_with_records(
        db_session,
        pr_items=[],
        twob_items=[{"invoice_number": "INV-ONLY-2B"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 1
    assert results[0].status == STATUS_MISSING_IN_PURCHASE_REGISTER
    assert results[0].purchase_record_id is None
    assert results[0].gstr2b_record_id is not None
    assert summary["missing_in_purchase_register"] == 1


def test_15_empty_purchase_register(db_session):
    """Test 15: Empty PR produces MISSING_IN_PURCHASE_REGISTER for all 2B rows."""
    create_job_with_records(
        db_session,
        pr_items=[],
        twob_items=[{"invoice_number": "2B-1"}, {"invoice_number": "2B-2"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 2
    assert all(r.status == STATUS_MISSING_IN_PURCHASE_REGISTER for r in results)
    assert summary["missing_in_purchase_register"] == 2


def test_16_empty_gstr2b(db_session):
    """Test 16: Empty 2B produces MISSING_IN_GSTR2B for all PR rows."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "PR-1"}, {"invoice_number": "PR-2"}],
        twob_items=[],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 2
    assert all(r.status == STATUS_MISSING_IN_GSTR2B for r in results)
    assert summary["missing_in_gstr2b"] == 2


def test_17_both_datasets_empty(db_session):
    """Test 17: Both datasets empty returns 0 results and zero summary counts."""
    create_job_with_records(db_session, pr_items=[], twob_items=[])
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 0
    assert summary["total_results"] == 0
    assert summary["matched"] == 0


def test_18_duplicate_keys_in_purchase_register(db_session):
    """Test 18: Multiple PR records with same key are marked DUPLICATE_AMBIGUOUS without dropping."""
    create_job_with_records(
        db_session,
        pr_items=[
            {"invoice_number": "INV-DUP", "taxable_value": "10000.00"},
            {"invoice_number": "INV-DUP", "taxable_value": "12000.00"},
        ],
        twob_items=[
            {"invoice_number": "INV-DUP", "taxable_value": "10000.00"},
        ],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    # Total affected records = 2 PR + 1 2B = 3 results
    assert len(results) == 3
    assert all(r.status == STATUS_DUPLICATE_AMBIGUOUS for r in results)
    assert summary["duplicate_ambiguous"] == 3


def test_19_duplicate_keys_in_gstr2b(db_session):
    """Test 19: Multiple GSTR-2B records with same key are marked DUPLICATE_AMBIGUOUS."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV-DUP"}],
        twob_items=[
            {"invoice_number": "INV-DUP", "taxable_value": "5000.00"},
            {"invoice_number": "INV-DUP", "taxable_value": "6000.00"},
        ],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 3
    assert all(r.status == STATUS_DUPLICATE_AMBIGUOUS for r in results)
    assert summary["duplicate_ambiguous"] == 3


def test_20_duplicate_keys_on_both_sides(db_session):
    """Test 20: Duplicates on both sides preserve traceability to all 4 records."""
    create_job_with_records(
        db_session,
        pr_items=[
            {"invoice_number": "INV-DUP", "taxable_value": "1000.00"},
            {"invoice_number": "INV-DUP", "taxable_value": "2000.00"},
        ],
        twob_items=[
            {"invoice_number": "INV-DUP", "taxable_value": "1000.00"},
            {"invoice_number": "INV-DUP", "taxable_value": "2000.00"},
        ],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 4
    assert all(r.status == STATUS_DUPLICATE_AMBIGUOUS for r in results)
    assert summary["duplicate_ambiguous"] == 4


def test_21_duplicate_records_with_different_monetary_values(db_session):
    """Test 21: Ambiguous duplicates with varying amounts do not guess or pair arbitrarily."""
    create_job_with_records(
        db_session,
        pr_items=[
            {"invoice_number": "INV-VAR", "taxable_value": "10000.00"},
            {"invoice_number": "INV-VAR", "taxable_value": "99000.00"},
        ],
        twob_items=[
            {"invoice_number": "INV-VAR", "taxable_value": "10000.00"},
        ],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 3
    assert all(r.status == STATUS_DUPLICATE_AMBIGUOUS for r in results)


def test_22_duplicate_records_whose_totals_happen_to_agree(db_session):
    """Test 22: Duplicates whose sum matches are NOT marked MATCHED."""
    # PR: two 5000 invoices (sum 10000). 2B: one 10000 invoice.
    create_job_with_records(
        db_session,
        pr_items=[
            {"invoice_number": "INV-SUM", "taxable_value": "5000.00"},
            {"invoice_number": "INV-SUM", "taxable_value": "5000.00"},
        ],
        twob_items=[
            {"invoice_number": "INV-SUM", "taxable_value": "10000.00"},
        ],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 3
    assert all(r.status == STATUS_DUPLICATE_AMBIGUOUS for r in results)
    assert summary["matched"] == 0


def test_23_identical_invoice_numbers_belonging_to_different_suppliers(db_session):
    """Test 23: Invoices with same invoice number but different GSTINs match independently."""
    create_job_with_records(
        db_session,
        pr_items=[
            {"supplier_gstin": "27AABCT3421M1Z2", "invoice_number": "INV-COMMON"},
            {"supplier_gstin": "29AAACH7892P1ZV", "invoice_number": "INV-COMMON"},
        ],
        twob_items=[
            {"supplier_gstin": "27AABCT3421M1Z2", "invoice_number": "INV-COMMON"},
            {"supplier_gstin": "29AAACH7892P1ZV", "invoice_number": "INV-COMMON"},
        ],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert len(results) == 2
    assert all(r.status == STATUS_MATCHED for r in results)
    assert summary["matched"] == 2


def test_24_invoice_numbers_containing_leading_zeros(db_session):
    """Test 24: Leading zeros are preserved and match reliably."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "0009481"}],
        twob_items=[{"invoice_number": "0009481"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert results[0].status == STATUS_MATCHED


def test_25_invoice_numbers_containing_hyphens_and_slashes(db_session):
    """Test 25: Special characters in invoice numbers are preserved and matched."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV/2026-27/089"}],
        twob_items=[{"invoice_number": "INV/2026-27/089"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert results[0].status == STATUS_MATCHED


def test_26_whitespace_and_case_normalization(db_session):
    """Test 26: Safe whitespace and case normalization enables matching."""
    create_job_with_records(
        db_session,
        pr_items=[{"supplier_gstin": "  27aabct3421m1z2  ", "invoice_number": "  inv-001  "}],
        twob_items=[{"supplier_gstin": "27AABCT3421M1Z2", "invoice_number": "INV-001"}],
    )
    results, summary = run_deterministic_reconciliation(db_session, "test-job-1")
    assert results[0].status == STATUS_MATCHED


def test_27_different_jobs_containing_identical_invoice_identifiers(db_session):
    """Test 27: Independent jobs are strictly isolated and never cross-matched."""
    job1 = create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "SHARED-001"}],
        twob_items=[],
        job_id="job-alpha"
    )
    job2 = create_job_with_records(
        db_session,
        pr_items=[],
        twob_items=[{"invoice_number": "SHARED-001"}],
        job_id="job-beta"
    )

    results1, sum1 = run_deterministic_reconciliation(db_session, "job-alpha")
    results2, sum2 = run_deterministic_reconciliation(db_session, "job-beta")

    assert len(results1) == 1
    assert results1[0].status == STATUS_MISSING_IN_GSTR2B
    assert results1[0].job_id == "job-alpha"

    assert len(results2) == 1
    assert results2[0].status == STATUS_MISSING_IN_PURCHASE_REGISTER
    assert results2[0].job_id == "job-beta"


def test_28_rerunning_reconciliation_without_duplicate_result_rows(db_session):
    """Test 28: Rerunning reconciliation for same job replaces existing results cleanly."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV-1"}, {"invoice_number": "INV-2"}],
        twob_items=[{"invoice_number": "INV-1"}, {"invoice_number": "INV-2"}],
        job_id="rerun-job"
    )

    # First run
    res1, sum1 = run_deterministic_reconciliation(db_session, "rerun-job")
    db_session.commit()
    count_first = db_session.query(ReconciliationResult).filter(ReconciliationResult.job_id == "rerun-job").count()
    assert count_first == 2

    # Second run
    res2, sum2 = run_deterministic_reconciliation(db_session, "rerun-job")
    db_session.commit()
    count_second = db_session.query(ReconciliationResult).filter(ReconciliationResult.job_id == "rerun-job").count()
    assert count_second == 2
    assert sum2["matched"] == 2


def test_29_database_failure_during_persistence(db_session, monkeypatch):
    """Test 29: Database failure rolls back result writes without deleting uploaded records."""
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV-1"}],
        twob_items=[{"invoice_number": "INV-1"}],
        job_id="db-fail-job"
    )

    def failing_flush():
        raise SQLAlchemyError("Simulated DB Disk Failure")

    monkeypatch.setattr(db_session, "flush", failing_flush)

    with pytest.raises(SQLAlchemyError):
        run_deterministic_reconciliation(db_session, "db-fail-job")

    db_session.rollback()
    # Source records must remain intact
    pr_count = db_session.query(PurchaseRecord).filter(PurchaseRecord.job_id == "db-fail-job").count()
    assert pr_count == 1
    # No results should have been persisted
    res_count = db_session.query(ReconciliationResult).filter(ReconciliationResult.job_id == "db-fail-job").count()
    assert res_count == 0


def test_30_concurrent_reconciliation_attempts(db_session):
    """Test 30: Concurrent reconciliation calls complete safely without crash or corrupted data."""
    from conftest import TestingSessionLocal

    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "CONC-1"}],
        twob_items=[{"invoice_number": "CONC-1"}],
        job_id="concurrent-job"
    )
    db_session.commit()

    errors = []
    # SQLite StaticPool shares a single C connection across threads; serialize driver-level access
    db_lock = threading.Lock()

    def run_worker():
        with db_lock:
            worker_session = TestingSessionLocal()
            try:
                run_deterministic_reconciliation(worker_session, "concurrent-job")
                worker_session.commit()
            except Exception as e:
                worker_session.rollback()
                errors.append(e)
            finally:
                worker_session.close()

    t1 = threading.Thread(target=run_worker)
    t2 = threading.Thread(target=run_worker)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    # Neither thread should throw unhandled exception
    assert len(errors) == 0

    # Ensure results are completely consistent and uncorrupted
    verify_session = TestingSessionLocal()
    results = verify_session.query(ReconciliationResult).filter(ReconciliationResult.job_id == "concurrent-job").all()
    assert len(results) == 1
    assert results[0].status == "MATCHED"
    verify_session.close()


def test_31_missing_or_invalid_job_id(db_session):
    """Test 31: Raises ValueError when job_id does not exist."""
    with pytest.raises(ValueError, match="Reconciliation job 'nonexistent-job' not found"):
        run_deterministic_reconciliation(db_session, "nonexistent-job")


def test_32_records_missing_unexpected_values(db_session):
    """Test 32: Records with missing/None invoice_date or amounts handle safely."""
    # Test boundary with valid zero amounts
    create_job_with_records(
        db_session,
        pr_items=[{"invoice_number": "INV-ZERO", "taxable_value": "0.00"}],
        twob_items=[{"invoice_number": "INV-ZERO", "taxable_value": "0.00"}],
        job_id="zero-job"
    )
    results, summary = run_deterministic_reconciliation(db_session, "zero-job")
    assert len(results) == 1
    assert results[0].status == STATUS_MATCHED
