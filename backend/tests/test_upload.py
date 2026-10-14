import pytest
from conftest import make_csv_bytes, make_xlsx_bytes

SAMPLE_HEADERS = [
    "Supplier GSTIN",
    "Invoice Number",
    "Invoice Date",
    "Taxable Value",
    "CGST",
    "SGST",
    "IGST",
]

SAMPLE_PR_ROWS = [
    ["27AABCT3421M1Z2", "INV-2026-001", "2026-09-04", "85000.00", "7650.00", "7650.00", "0.00"],
    ["29AAACH7892P1ZV", "TC-009481", "2026-09-08", "45000.00", "0.00", "0.00", "8100.00"],
]

SAMPLE_2B_ROWS = [
    ["27AABCT3421M1Z2", "INV-2026-001", "04/09/2026", "85000.00", "7650.00", "7650.00", "0.00"],
    ["29AAACH7892P1ZV", "TC-009481", "08-09-2026", "45000.00", "0.00", "0.00", "8100.00"],
]


def test_upload_both_valid_csv(client):
    pr_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_PR_ROWS)
    twob_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_2B_ROWS)

    files = {
        "purchase_register": ("purchase_register.csv", pr_csv, "text/csv"),
        "gstr_2b": ("gstr_2b.csv", twob_csv, "text/csv"),
    }
    response = client.post("/api/reconciliation/upload", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "job_id" in data
    assert data["summary"]["purchase_register_count"] == 2
    assert data["summary"]["gstr2b_count"] == 2
    assert data["summary"]["total_records"] == 4


def test_upload_both_valid_xlsx(client):
    pr_xlsx = make_xlsx_bytes(SAMPLE_HEADERS, SAMPLE_PR_ROWS)
    twob_xlsx = make_xlsx_bytes(SAMPLE_HEADERS, SAMPLE_2B_ROWS)

    files = {
        "purchase_register": ("purchase_register.xlsx", pr_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "gstr_2b": ("gstr_2b.xlsx", twob_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    }
    response = client.post("/api/reconciliation/upload", files=files)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["summary"]["total_records"] == 4


def test_upload_missing_purchase_register(client):
    twob_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_2B_ROWS)
    files = {
        "gstr_2b": ("gstr_2b.csv", twob_csv, "text/csv"),
    }
    response = client.post("/api/reconciliation/upload", files=files)
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert any("Purchase Register file is required" in err["reason"] for err in data["errors"])


def test_upload_missing_gstr2b(client):
    pr_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_PR_ROWS)
    files = {
        "purchase_register": ("purchase_register.csv", pr_csv, "text/csv"),
    }
    response = client.post("/api/reconciliation/upload", files=files)
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert any("GSTR-2B file is required" in err["reason"] for err in data["errors"])


def test_upload_unsupported_file_extension(client):
    pr_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_PR_ROWS)
    files = {
        "purchase_register": ("purchase_register.csv", pr_csv, "text/csv"),
        "gstr_2b": ("gstr_2b.pdf", b"%PDF-1.4 mock pdf data", "application/pdf"),
    }
    response = client.post("/api/reconciliation/upload", files=files)
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert any("Unsupported format 'gstr_2b.pdf'" in err["reason"] for err in data["errors"])


def test_upload_empty_file(client):
    pr_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_PR_ROWS)
    files = {
        "purchase_register": ("purchase_register.csv", pr_csv, "text/csv"),
        "gstr_2b": ("gstr_2b.csv", b"", "text/csv"),
    }
    response = client.post("/api/reconciliation/upload", files=files)
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert any("empty (0 bytes)" in err["reason"] for err in data["errors"])


def test_upload_corrupt_unreadable_file(client):
    pr_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_PR_ROWS)
    # A corrupt xlsx file (not starting with PK)
    files = {
        "purchase_register": ("purchase_register.csv", pr_csv, "text/csv"),
        "gstr_2b": ("gstr_2b.xlsx", b"corrupted random data not a zip file", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    }
    response = client.post("/api/reconciliation/upload", files=files)
    assert response.status_code == 422
    data = response.json()
    assert data["success"] is False
    assert any("not a valid Excel" in err["reason"] for err in data["errors"])


def test_upload_oversized_file(client, monkeypatch):
    # Temporarily set max file size to 100 bytes for test
    from app import config
    monkeypatch.setattr(config, "MAX_FILE_SIZE_BYTES", 100)
    monkeypatch.setattr(config, "MAX_FILE_SIZE_MB", 1)

    pr_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_PR_ROWS) # > 100 bytes
    twob_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_2B_ROWS)

    files = {
        "purchase_register": ("purchase_register.csv", pr_csv, "text/csv"),
        "gstr_2b": ("gstr_2b.csv", twob_csv, "text/csv"),
    }
    response = client.post("/api/reconciliation/upload", files=files)
    assert response.status_code == 413
    data = response.json()
    assert data["success"] is False
    assert any("exceeds maximum allowed size" in err["reason"] for err in data["errors"])


def test_upload_duplicate_submission_handling(client):
    # Submit first time
    pr_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_PR_ROWS)
    twob_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_2B_ROWS)

    files1 = {
        "purchase_register": ("purchase_register.csv", pr_csv, "text/csv"),
        "gstr_2b": ("gstr_2b.csv", twob_csv, "text/csv"),
    }
    res1 = client.post("/api/reconciliation/upload", files=files1)
    assert res1.status_code == 200
    job1_id = res1.json()["job_id"]

    # Submit second time (duplicate upload) -> creates a separate job, does not overwrite
    files2 = {
        "purchase_register": ("purchase_register.csv", pr_csv, "text/csv"),
        "gstr_2b": ("gstr_2b.csv", twob_csv, "text/csv"),
    }
    res2 = client.post("/api/reconciliation/upload", files=files2)
    assert res2.status_code == 200
    job2_id = res2.json()["job_id"]

    assert job1_id != job2_id
