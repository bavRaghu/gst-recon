from datetime import date
from decimal import Decimal
import pytest
from conftest import make_csv_bytes, make_xlsx_bytes
from app.models import Gstr2bRecord, PurchaseRecord, ReconciliationJob
from app.services.ai_service import clear_mock_ai_responses, set_mock_ai_response

HEADERS = [
    "Supplier GSTIN",
    "Invoice Number",
    "Invoice Date",
    "Taxable Value",
    "CGST",
    "SGST",
    "IGST",
]


@pytest.fixture(autouse=True)
def cleanup():
    clear_mock_ai_responses()
    yield
    clear_mock_ai_responses()


def test_api_upload_then_reconcile_and_get_results(client):
    """End-to-end API: Upload CSV files -> Run reconciliation -> Fetch results & summary."""
    pr_rows = [
        ["27AABCT3421M1Z2", "INV-101", "2026-09-01", "10000.00", "900.00", "900.00", "0.00"],
        ["27AABCT3421M1Z2", "INV-102", "2026-09-02", "20000.00", "1800.00", "1800.00", "0.00"],
        ["29AAACH7892P1ZV", "INV-103", "2026-09-03", "30000.00", "0.00", "0.00", "5400.00"],
    ]
    twob_rows = [
        # Exactly matching INV-101
        ["27AABCT3421M1Z2", "INV-101", "01/09/2026", "10000.00", "900.00", "900.00", "0.00"],
        # Mismatch in taxable_value on INV-102
        ["27AABCT3421M1Z2", "INV-102", "02-09-2026", "25000.00", "1800.00", "1800.00", "0.00"],
        # 2B-only invoice
        ["27AABCT3421M1Z2", "INV-999", "05-09-2026", "5000.00", "450.00", "450.00", "0.00"],
    ]

    pr_csv = make_csv_bytes(HEADERS, pr_rows)
    twob_csv = make_csv_bytes(HEADERS, twob_rows)

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
    run_data = run_resp.json()
    assert run_data["success"] is True
    assert run_data["job_id"] == job_id
    summary = run_data["summary"]
    assert summary["matched"] == 1       # INV-101
    assert summary["mismatched"] == 1    # INV-102
    assert summary["missing_in_gstr2b"] == 1  # INV-103
    assert summary["missing_in_purchase_register"] == 1  # INV-999
    assert summary["duplicate_ambiguous"] == 0
    assert summary["total_missing"] == 2

    # 3. Retrieve Results
    res_resp = client.get(f"/api/reconciliation/{job_id}/results")
    assert res_resp.status_code == 200
    results = res_resp.json()
    assert len(results) == 4

    statuses = {r["status"] for r in results}
    assert "MATCHED" in statuses
    assert "MISMATCH" in statuses
    assert "MISSING_IN_GSTR2B" in statuses
    assert "MISSING_IN_PURCHASE_REGISTER" in statuses

    # Verify decimal string serialization
    matched_rec = next(r for r in results if r["status"] == "MATCHED")
    assert matched_rec["purchase_record"]["taxable_value"] == "10000.00"
    assert matched_rec["gstr2b_record"]["taxable_value"] == "10000.00"

    mismatch_rec = next(r for r in results if r["status"] == "MISMATCH")
    assert "taxable_value" in mismatch_rec["differences"]
    assert mismatch_rec["differences"]["taxable_value"]["difference"] == "-5000.00"


def test_api_xlsx_upload_and_reconciliation(client):
    """End-to-end API test with Excel XLSX files."""
    pr_rows = [["27AABCT3421M1Z2", "XLSX-01", "2026-09-10", "40000.00", "3600.00", "3600.00", "0.00"]]
    twob_rows = [["27AABCT3421M1Z2", "XLSX-01", "10-09-2026", "40000.00", "3600.00", "3600.00", "0.00"]]

    pr_xlsx = make_xlsx_bytes(HEADERS, pr_rows)
    twob_xlsx = make_xlsx_bytes(HEADERS, twob_rows)

    up_resp = client.post("/api/reconciliation/upload", files={
        "purchase_register": ("pr.xlsx", pr_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "gstr_2b": ("twob.xlsx", twob_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    })
    assert up_resp.status_code == 200
    job_id = up_resp.json()["job_id"]

    run_resp = client.post(f"/api/reconciliation/{job_id}/run")
    assert run_resp.status_code == 200
    assert run_resp.json()["summary"]["matched"] == 1


def test_api_duplicate_ambiguous_results(client):
    """API handles and returns DUPLICATE_AMBIGUOUS records accurately."""
    pr_rows = [
        ["27AABCT3421M1Z2", "DUP-001", "2026-09-01", "1000.00", "90.00", "90.00", "0.00"],
        ["27AABCT3421M1Z2", "DUP-001", "2026-09-01", "2000.00", "180.00", "180.00", "0.00"],
    ]
    twob_rows = [
        ["27AABCT3421M1Z2", "DUP-001", "01/09/2026", "1000.00", "90.00", "90.00", "0.00"],
    ]

    pr_csv = make_csv_bytes(HEADERS, pr_rows)
    twob_csv = make_csv_bytes(HEADERS, twob_rows)

    up_resp = client.post("/api/reconciliation/upload", files={
        "purchase_register": ("pr.csv", pr_csv, "text/csv"),
        "gstr_2b": ("twob.csv", twob_csv, "text/csv"),
    })
    job_id = up_resp.json()["job_id"]

    run_resp = client.post(f"/api/reconciliation/{job_id}/run")
    assert run_resp.status_code == 200
    assert run_resp.json()["summary"]["duplicate_ambiguous"] == 3

    # Check filtering by status
    filter_resp = client.get(f"/api/reconciliation/{job_id}/results?status_filter=DUPLICATE_AMBIGUOUS")
    assert filter_resp.status_code == 200
    assert len(filter_resp.json()) == 3


def test_api_invalid_nonexistent_job_id(client):
    """Returns 404 for invalid/nonexistent job ID."""
    resp = client.post("/api/reconciliation/nonexistent-uuid/run")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()

    resp2 = client.get("/api/reconciliation/nonexistent-uuid/results")
    assert resp2.status_code == 404


def test_api_reconciliation_rerun_idempotency(client):
    """Rerunning reconciliation multiple times does not append duplicate results."""
    pr_rows = [["27AABCT3421M1Z2", "IDEM-01", "2026-09-01", "5000.00", "450.00", "450.00", "0.00"]]
    twob_rows = [["27AABCT3421M1Z2", "IDEM-01", "01/09/2026", "5000.00", "450.00", "450.00", "0.00"]]

    pr_csv = make_csv_bytes(HEADERS, pr_rows)
    twob_csv = make_csv_bytes(HEADERS, twob_rows)

    up_resp = client.post("/api/reconciliation/upload", files={
        "purchase_register": ("pr.csv", pr_csv, "text/csv"),
        "gstr_2b": ("twob.csv", twob_csv, "text/csv"),
    })
    job_id = up_resp.json()["job_id"]

    # First run
    run1 = client.post(f"/api/reconciliation/{job_id}/run")
    assert run1.status_code == 200

    # Second run
    run2 = client.post(f"/api/reconciliation/{job_id}/run")
    assert run2.status_code == 200

    # Check results count
    res_resp = client.get(f"/api/reconciliation/{job_id}/results")
    assert len(res_resp.json()) == 1


def test_api_isolation_between_independent_jobs(client):
    """Verifies complete isolation between separate jobs."""
    pr1 = make_csv_bytes(HEADERS, [["27AABCT3421M1Z2", "JOB1-INV", "2026-09-01", "1000.00", "90.00", "90.00", "0.00"]])
    twob1 = make_csv_bytes(HEADERS, [["27AABCT3421M1Z2", "JOB1-INV", "01/09/2026", "1000.00", "90.00", "90.00", "0.00"]])

    pr2 = make_csv_bytes(HEADERS, [["29AAACH7892P1ZV", "JOB2-INV", "2026-09-01", "2000.00", "180.00", "180.00", "0.00"]])
    twob2 = make_csv_bytes(HEADERS, [["29AAACH7892P1ZV", "JOB2-INV", "01/09/2026", "2000.00", "180.00", "180.00", "0.00"]])

    up1 = client.post("/api/reconciliation/upload", files={"purchase_register": ("pr1.csv", pr1, "text/csv"), "gstr_2b": ("2b1.csv", twob1, "text/csv")}).json()["job_id"]
    up2 = client.post("/api/reconciliation/upload", files={"purchase_register": ("pr2.csv", pr2, "text/csv"), "gstr_2b": ("2b2.csv", twob2, "text/csv")}).json()["job_id"]

    client.post(f"/api/reconciliation/{up1}/run")
    client.post(f"/api/reconciliation/{up2}/run")

    res1 = client.get(f"/api/reconciliation/{up1}/results").json()
    res2 = client.get(f"/api/reconciliation/{up2}/results").json()

    assert len(res1) == 1
    assert len(res2) == 1
    assert res1[0]["job_id"] == up1
    assert res2[0]["job_id"] == up2
    assert res1[0]["purchase_record"]["invoice_number"] == "JOB1-INV"
    assert res2[0]["purchase_record"]["invoice_number"] == "JOB2-INV"


def test_api_ai_candidate_proposals_endpoint(client, db_session):
    """Tests GET /api/reconciliation/{job_id}/proposals endpoint."""
    pr_rows = [["27AABCT3421M1Z2", "INV/001", "2026-09-01", "1000.00", "90.00", "90.00", "0.00"]]
    twob_rows = [["27AABCT3421M1Z2", "INV-001", "01/09/2026", "1000.00", "90.00", "90.00", "0.00"]]

    pr_csv = make_csv_bytes(HEADERS, pr_rows)
    twob_csv = make_csv_bytes(HEADERS, twob_rows)

    up = client.post("/api/reconciliation/upload", files={"purchase_register": ("pr.csv", pr_csv, "text/csv"), "gstr_2b": ("2b.csv", twob_csv, "text/csv")}).json()
    job_id = up["job_id"]

    twob_rec = db_session.query(Gstr2bRecord).filter(Gstr2bRecord.job_id == job_id).first()

    set_mock_ai_response("all", {
        "evaluations": [{
            "candidate_id": twob_rec.id,
            "is_match": True,
            "confidence": "HIGH",
            "reasoning": "Slashes vs hyphens.",
            "conflicting_evidence": None,
        }]
    })

    # Temporarily set mock provider for this test
    import app.config as cfg
    orig_provider = cfg.LLM_PROVIDER
    cfg.LLM_PROVIDER = "mock"
    try:
        run_res = client.post(f"/api/reconciliation/{job_id}/run")
        assert run_res.status_code == 200

        prop_res = client.get(f"/api/reconciliation/{job_id}/proposals")
        assert prop_res.status_code == 200
        proposals = prop_res.json()
        assert len(proposals) == 1
        assert proposals[0]["assessment_status"] == "PROPOSED"
        assert proposals[0]["confidence"] == "HIGH"
        assert "Slashes vs hyphens" in proposals[0]["reasoning"]
    finally:
        cfg.LLM_PROVIDER = orig_provider


def test_api_search_filter_results(client):
    """Tests search parameter on results endpoint."""
    pr_rows = [
        ["27AABCT3421M1Z2", "ALPHA-01", "2026-09-01", "1000.00", "90.00", "90.00", "0.00"],
        ["29AAACH7892P1ZV", "BETA-02", "2026-09-02", "2000.00", "180.00", "180.00", "0.00"],
    ]
    twob_rows = [
        ["27AABCT3421M1Z2", "ALPHA-01", "01/09/2026", "1000.00", "90.00", "90.00", "0.00"],
        ["29AAACH7892P1ZV", "BETA-02", "02/09/2026", "2000.00", "180.00", "180.00", "0.00"],
    ]

    pr_csv = make_csv_bytes(HEADERS, pr_rows)
    twob_csv = make_csv_bytes(HEADERS, twob_rows)

    up = client.post("/api/reconciliation/upload", files={"purchase_register": ("pr.csv", pr_csv, "text/csv"), "gstr_2b": ("2b.csv", twob_csv, "text/csv")}).json()
    job_id = up["job_id"]

    client.post(f"/api/reconciliation/{job_id}/run")

    search_alpha = client.get(f"/api/reconciliation/{job_id}/results?search=ALPHA").json()
    assert len(search_alpha) == 1
    assert search_alpha[0]["purchase_record"]["invoice_number"] == "ALPHA-01"

    search_beta = client.get(f"/api/reconciliation/{job_id}/results?search=BETA").json()
    assert len(search_beta) == 1
    assert search_beta[0]["purchase_record"]["invoice_number"] == "BETA-02"


def test_api_proposal_human_review_confirm(client, db_session):
    """Tests human review confirmation of an AI proposal and authoritative update."""
    pr_rows = [["27AABCT3421M1Z2", "INV/2026/089", "2026-09-01", "25000.00", "2250.00", "2250.00", "0.00"]]
    twob_rows = [["27AABCT3421M1Z2", "INV-2026-089", "01/09/2026", "25000.00", "2250.00", "2250.00", "0.00"]]

    pr_csv = make_csv_bytes(HEADERS, pr_rows)
    twob_csv = make_csv_bytes(HEADERS, twob_rows)

    up = client.post("/api/reconciliation/upload", files={"purchase_register": ("pr.csv", pr_csv, "text/csv"), "gstr_2b": ("2b.csv", twob_csv, "text/csv")}).json()
    job_id = up["job_id"]

    twob_rec = db_session.query(Gstr2bRecord).filter(Gstr2bRecord.job_id == job_id).first()

    set_mock_ai_response("all", {
        "evaluations": [{
            "candidate_id": twob_rec.id,
            "is_match": True,
            "confidence": "HIGH",
            "reasoning": "Identical invoice number with syntax variation.",
            "conflicting_evidence": None,
        }]
    })

    import app.config as cfg
    orig_provider = cfg.LLM_PROVIDER
    cfg.LLM_PROVIDER = "mock"
    try:
        run_res = client.post(f"/api/reconciliation/{job_id}/run").json()
        assert run_res["status"] == "COMPLETED"

        proposals = client.get(f"/api/reconciliation/{job_id}/proposals").json()
        assert len(proposals) == 1
        prop_id = proposals[0]["id"]
        assert proposals[0]["assessment_status"] == "PROPOSED"
        assert proposals[0]["source_record"]["invoice_number"] == "INV/2026/089"
        assert proposals[0]["candidate_record"]["invoice_number"] == "INV-2026-089"

        # Explicit human review: Confirm Match
        review_res = client.post(
            f"/api/reconciliation/{job_id}/proposals/{prop_id}/review",
            json={"action": "CONFIRM_MATCH", "reviewer_name": "Senior Accountant", "notes": "Approved syntax difference"}
        )
        assert review_res.status_code == 200
        review_data = review_res.json()
        assert review_data["success"] is True
        assert review_data["proposal"]["assessment_status"] == "CONFIRMED"
        assert len(review_data["proposal"]["audit_logs"]) == 1
        assert review_data["proposal"]["audit_logs"][0]["action"] == "CONFIRM_MATCH"
        assert review_data["proposal"]["audit_logs"][0]["reviewed_by"] == "Senior Accountant"

        # Check authoritative results: Must now be MATCHED
        results = client.get(f"/api/reconciliation/{job_id}/results").json()
        assert len(results) == 1
        assert results[0]["status"] == "MATCHED"
        assert results[0]["purchase_record"]["invoice_number"] == "INV/2026/089"
        assert results[0]["gstr2b_record"]["invoice_number"] == "INV-2026-089"
        assert results[0]["ambiguity_metadata"]["manually_confirmed"] is True

        # Ensure original database records were NOT deleted or mutated
        pr_in_db = db_session.query(PurchaseRecord).filter(PurchaseRecord.job_id == job_id).first()
        assert pr_in_db.invoice_number == "INV/2026/089"
        twob_in_db = db_session.query(Gstr2bRecord).filter(Gstr2bRecord.job_id == job_id).first()
        assert twob_in_db.invoice_number == "INV-2026-089"
    finally:
        cfg.LLM_PROVIDER = orig_provider


def test_api_proposal_human_review_reject(client, db_session):
    """Tests human review rejection of an AI proposal."""
    pr_rows = [["27AABCT3421M1Z2", "BILL-100", "2026-09-01", "1000.00", "90.00", "90.00", "0.00"]]
    twob_rows = [["27AABCT3421M1Z2", "BILL-101", "01/09/2026", "1000.00", "90.00", "90.00", "0.00"]]

    pr_csv = make_csv_bytes(HEADERS, pr_rows)
    twob_csv = make_csv_bytes(HEADERS, twob_rows)

    up = client.post("/api/reconciliation/upload", files={"purchase_register": ("pr.csv", pr_csv, "text/csv"), "gstr_2b": ("2b.csv", twob_csv, "text/csv")}).json()
    job_id = up["job_id"]

    twob_rec = db_session.query(Gstr2bRecord).filter(Gstr2bRecord.job_id == job_id).first()

    set_mock_ai_response("all", {
        "evaluations": [{
            "candidate_id": twob_rec.id,
            "is_match": True,
            "confidence": "MEDIUM",
            "reasoning": "Sequential invoice number.",
            "conflicting_evidence": None,
        }]
    })

    import app.config as cfg
    orig_provider = cfg.LLM_PROVIDER
    cfg.LLM_PROVIDER = "mock"
    try:
        client.post(f"/api/reconciliation/{job_id}/run")
        proposals = client.get(f"/api/reconciliation/{job_id}/proposals").json()
        prop_id = proposals[0]["id"]

        # Reject match
        review_res = client.post(
            f"/api/reconciliation/{job_id}/proposals/{prop_id}/review",
            json={"action": "REJECT_MATCH", "reviewer_name": "Accountant", "notes": "Different invoice"}
        )
        assert review_res.status_code == 200
        review_data = review_res.json()
        assert review_data["proposal"]["assessment_status"] == "USER_REJECTED"
        assert len(review_data["proposal"]["audit_logs"]) == 1
        assert review_data["proposal"]["audit_logs"][0]["action"] == "REJECT_MATCH"

        # Results must remain unresolved / missing
        results = client.get(f"/api/reconciliation/{job_id}/results").json()
        assert any(r["status"] == "MISSING_IN_GSTR2B" for r in results)
    finally:
        cfg.LLM_PROVIDER = orig_provider


def test_api_discrepancy_explanation(client):
    """Tests plain-English discrepancy explanation endpoint."""
    pr_rows = [["27AABCT3421M1Z2", "INV-MISMATCH", "2026-09-01", "50000.00", "4500.00", "4500.00", "0.00"]]
    twob_rows = [["27AABCT3421M1Z2", "INV-MISMATCH", "01/09/2026", "50000.00", "1000.00", "1000.00", "0.00"]]

    pr_csv = make_csv_bytes(HEADERS, pr_rows)
    twob_csv = make_csv_bytes(HEADERS, twob_rows)

    up = client.post("/api/reconciliation/upload", files={"purchase_register": ("pr.csv", pr_csv, "text/csv"), "gstr_2b": ("2b.csv", twob_csv, "text/csv")}).json()
    job_id = up["job_id"]

    client.post(f"/api/reconciliation/{job_id}/run")
    results = client.get(f"/api/reconciliation/{job_id}/results").json()
    res_id = results[0]["id"]

    exp_res = client.get(f"/api/reconciliation/{job_id}/results/{res_id}/explanation")
    assert exp_res.status_code == 200
    exp_data = exp_res.json()
    assert "Tax or value discrepancy" in exp_data["summary"]
    assert any("CGST" in d for d in exp_data["details"])

