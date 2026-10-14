import pytest
from datetime import date
from decimal import Decimal
from app.models import ReconciliationJob, PurchaseRecord, Gstr2bRecord
from conftest import make_csv_bytes

SAMPLE_HEADERS = [
    "Supplier GSTIN",
    "Invoice Number",
    "Invoice Date",
    "Taxable Value",
    "CGST",
    "SGST",
    "IGST",
]


def test_successful_import_persists_records_with_job(client, db_session):
    pr_rows = [
        ["27AABCT3421M1Z2", "INV-PR-1", "2026-09-01", "10000.00", "900.00", "900.00", "0.00"],
        ["27AABCT3421M1Z2", "INV-PR-2", "2026-09-02", "20000.00", "1800.00", "1800.00", "0.00"],
    ]
    twob_rows = [
        ["27AABCT3421M1Z2", "INV-2B-1", "2026-09-01", "10000.00", "900.00", "900.00", "0.00"],
    ]

    files = {
        "purchase_register": ("pr.csv", make_csv_bytes(SAMPLE_HEADERS, pr_rows), "text/csv"),
        "gstr_2b": ("2b.csv", make_csv_bytes(SAMPLE_HEADERS, twob_rows), "text/csv"),
    }

    res = client.post("/api/reconciliation/upload", files=files)
    assert res.status_code == 200
    job_id = res.json()["job_id"]

    # Verify job persisted
    job = db_session.query(ReconciliationJob).filter_by(id=job_id).first()
    assert job is not None
    assert job.status == "UPLOADED"

    # Verify purchase records belong to this job
    pr_db = db_session.query(PurchaseRecord).filter_by(job_id=job_id).all()
    assert len(pr_db) == 2
    assert {r.invoice_number for r in pr_db} == {"INV-PR-1", "INV-PR-2"}

    # Verify gstr2b records belong to this job
    twob_db = db_session.query(Gstr2bRecord).filter_by(job_id=job_id).all()
    assert len(twob_db) == 1
    assert twob_db[0].invoice_number == "INV-2B-1"


def test_purchase_and_gstr2b_records_remain_separate(client, db_session):
    # Both files have an invoice with same invoice number "INV-100"
    pr_rows = [["27AABCT3421M1Z2", "INV-100", "2026-09-01", "5000.00", "450.00", "450.00", "0.00"]]
    twob_rows = [["27AABCT3421M1Z2", "INV-100", "2026-09-01", "5500.00", "495.00", "495.00", "0.00"]]

    files = {
        "purchase_register": ("pr.csv", make_csv_bytes(SAMPLE_HEADERS, pr_rows), "text/csv"),
        "gstr_2b": ("2b.csv", make_csv_bytes(SAMPLE_HEADERS, twob_rows), "text/csv"),
    }

    res = client.post("/api/reconciliation/upload", files=files)
    assert res.status_code == 200
    job_id = res.json()["job_id"]

    pr_rec = db_session.query(PurchaseRecord).filter_by(job_id=job_id).first()
    twob_rec = db_session.query(Gstr2bRecord).filter_by(job_id=job_id).first()

    assert pr_rec.taxable_value == Decimal("5000.00")
    assert twob_rec.taxable_value == Decimal("5500.00")


def test_duplicate_rows_in_file_are_preserved(client, db_session):
    # Two identical invoice entries in purchase register
    pr_rows = [
        ["27AABCT3421M1Z2", "DUP-INV-1", "2026-09-01", "1000.00", "90.00", "90.00", "0.00"],
        ["27AABCT3421M1Z2", "DUP-INV-1", "2026-09-01", "1000.00", "90.00", "90.00", "0.00"],
    ]
    twob_rows = [
        ["27AABCT3421M1Z2", "DUP-INV-1", "2026-09-01", "1000.00", "90.00", "90.00", "0.00"],
    ]

    files = {
        "purchase_register": ("pr.csv", make_csv_bytes(SAMPLE_HEADERS, pr_rows), "text/csv"),
        "gstr_2b": ("2b.csv", make_csv_bytes(SAMPLE_HEADERS, twob_rows), "text/csv"),
    }

    res = client.post("/api/reconciliation/upload", files=files)
    assert res.status_code == 200
    job_id = res.json()["job_id"]

    # Both duplicate records must be present in the database, not collapsed or overwritten
    pr_records = db_session.query(PurchaseRecord).filter_by(job_id=job_id).all()
    assert len(pr_records) == 2


def test_failed_validation_rolls_back_and_leaves_no_data(client, db_session):
    # Valid PR, but GSTR-2B has invalid rows
    pr_rows = [
        ["27AABCT3421M1Z2", "INV-VALID", "2026-09-01", "1000.00", "90.00", "90.00", "0.00"]
    ]
    twob_rows = [
        ["27AABCT3421M1Z2", "INV-BAD", "2026-09-01", "BAD_AMOUNT", "90.00", "90.00", "0.00"]
    ]

    files = {
        "purchase_register": ("pr.csv", make_csv_bytes(SAMPLE_HEADERS, pr_rows), "text/csv"),
        "gstr_2b": ("2b.csv", make_csv_bytes(SAMPLE_HEADERS, twob_rows), "text/csv"),
    }

    res = client.post("/api/reconciliation/upload", files=files)
    assert res.status_code == 422

    # Zero jobs or records should be left in database
    assert db_session.query(ReconciliationJob).count() == 0
    assert db_session.query(PurchaseRecord).count() == 0
    assert db_session.query(Gstr2bRecord).count() == 0
