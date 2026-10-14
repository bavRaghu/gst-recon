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


def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_end_to_end_upload_and_retrieve_job(client):
    pr_csv = make_csv_bytes(SAMPLE_HEADERS, SAMPLE_PR_ROWS)
    twob_xlsx = make_xlsx_bytes(SAMPLE_HEADERS, SAMPLE_2B_ROWS)

    files = {
        "purchase_register": ("purchase_register.csv", pr_csv, "text/csv"),
        "gstr_2b": ("gstr_2b.xlsx", twob_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    }
    # Upload files
    upload_res = client.post("/api/reconciliation/upload", files=files)
    assert upload_res.status_code == 200
    job_id = upload_res.json()["job_id"]

    # Retrieve job details
    job_res = client.get(f"/api/reconciliation/jobs/{job_id}")
    assert job_res.status_code == 200
    job_data = job_res.json()
    assert job_data["id"] == job_id
    assert job_data["status"] == "UPLOADED"
    assert job_data["purchase_records_count"] == 2
    assert job_data["gstr2b_records_count"] == 2

    # Retrieve job records
    records_res = client.get(f"/api/reconciliation/jobs/{job_id}/records")
    assert records_res.status_code == 200
    records_data = records_res.json()
    assert len(records_data["purchase_records"]) == 2
    assert len(records_data["gstr2b_records"]) == 2
    assert records_data["purchase_records"][0]["invoice_number"] == "INV-2026-001"
    assert records_data["purchase_records"][0]["taxable_value"] == 85000.00


def test_end_to_end_validation_error_response(client):
    pr_csv = make_csv_bytes(SAMPLE_HEADERS, [
        ["27AABCT3421M1Z2", "INV-1", "invalid-date", "1000", "90", "90", "0"]
    ])
    twob_csv = make_csv_bytes(SAMPLE_HEADERS, [
        ["BAD_GSTIN", "INV-1", "2026-09-01", "1000", "90", "90", "0"]
    ])

    files = {
        "purchase_register": ("pr.csv", pr_csv, "text/csv"),
        "gstr_2b": ("2b.csv", twob_csv, "text/csv"),
    }

    res = client.post("/api/reconciliation/upload", files=files)
    assert res.status_code == 422
    data = res.json()
    assert data["success"] is False
    assert len(data["errors"]) == 2
    error_types = {e["file_type"] for e in data["errors"]}
    assert "Purchase Register" in error_types
    assert "GSTR-2B" in error_types
