from datetime import date
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from app.models import (
    DiscrepancyAuditLog,
    DiscrepancyItem,
    Gstr2bRecord,
    PurchaseRecord,
    ReconciliationJob,
    ReconciliationResult,
)
from app.services.reconciliation_service import run_deterministic_reconciliation


def create_sample_job_with_discrepancies(db_session, job_id="disc-test-job"):
    job = ReconciliationJob(id=job_id, status="UPLOADED")
    db_session.add(job)
    db_session.flush()

    # 1. Exact match (Should NOT create DiscrepancyItem)
    pr1 = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="27AABCT3421M1Z2",
        invoice_number="INV-001",
        invoice_date=date(2026, 4, 1),
        taxable_value=Decimal("10000.00"),
        cgst=Decimal("900.00"),
        sgst=Decimal("900.00"),
        igst=Decimal("0.00"),
    )
    twob1 = Gstr2bRecord(
        job_id=job.id,
        supplier_gstin="27AABCT3421M1Z2",
        invoice_number="INV-001",
        invoice_date=date(2026, 4, 1),
        taxable_value=Decimal("10000.00"),
        cgst=Decimal("900.00"),
        sgst=Decimal("900.00"),
        igst=Decimal("0.00"),
    )

    # 2. Major discrepancy: Missing in GSTR-2B (blocked ITC)
    pr2 = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="27AABCT3421M1Z2",
        invoice_number="INV-002",
        invoice_date=date(2026, 4, 2),
        taxable_value=Decimal("30000.00"),
        cgst=Decimal("2700.00"),
        sgst=Decimal("2700.00"),
        igst=Decimal("0.00"),
    )

    # 3. Major discrepancy: Tax difference > INR 1,000 (taxable diff of 5,000)
    pr3 = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="29XYZAB1234C1Z5",
        invoice_number="INV-003",
        invoice_date=date(2026, 4, 5),
        taxable_value=Decimal("25000.00"),
        cgst=Decimal("2250.00"),
        sgst=Decimal("2250.00"),
        igst=Decimal("0.00"),
    )
    twob3 = Gstr2bRecord(
        job_id=job.id,
        supplier_gstin="29XYZAB1234C1Z5",
        invoice_number="INV-003",
        invoice_date=date(2026, 4, 5),
        taxable_value=Decimal("20000.00"),
        cgst=Decimal("1800.00"),
        sgst=Decimal("1800.00"),
        igst=Decimal("0.00"),
    )

    # 4. Minor discrepancy: Taxable diff of INR 10.00 on 20,000 base (0.05% <= 1%, <= 1000)
    pr4 = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="27AABCT3421M1Z2",
        invoice_number="INV-004",
        invoice_date=date(2026, 4, 6),
        taxable_value=Decimal("20010.00"),
        cgst=Decimal("1800.00"),
        sgst=Decimal("1800.00"),
        igst=Decimal("0.00"),
    )
    twob4 = Gstr2bRecord(
        job_id=job.id,
        supplier_gstin="27AABCT3421M1Z2",
        invoice_number="INV-004",
        invoice_date=date(2026, 4, 6),
        taxable_value=Decimal("20000.00"),
        cgst=Decimal("1800.00"),
        sgst=Decimal("1800.00"),
        igst=Decimal("0.00"),
    )

    # 5. Major discrepancy: Date difference of 45 days (> 30 days tolerance)
    pr5 = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="27AABCT3421M1Z2",
        invoice_number="INV-005",
        invoice_date=date(2026, 4, 1),
        taxable_value=Decimal("15000.00"),
        cgst=Decimal("1350.00"),
        sgst=Decimal("1350.00"),
        igst=Decimal("0.00"),
    )
    twob5 = Gstr2bRecord(
        job_id=job.id,
        supplier_gstin="27AABCT3421M1Z2",
        invoice_number="INV-005",
        invoice_date=date(2026, 5, 20),  # 49 days later
        taxable_value=Decimal("15000.00"),
        cgst=Decimal("1350.00"),
        sgst=Decimal("1350.00"),
        igst=Decimal("0.00"),
    )

    # 6. Major discrepancy: Tax structure mismatch (Intra vs Inter)
    pr6 = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="27AABCT3421M1Z2",
        invoice_number="INV-006",
        invoice_date=date(2026, 4, 10),
        taxable_value=Decimal("10000.00"),
        cgst=Decimal("900.00"),
        sgst=Decimal("900.00"),
        igst=Decimal("0.00"),
    )
    twob6 = Gstr2bRecord(
        job_id=job.id,
        supplier_gstin="27AABCT3421M1Z2",
        invoice_number="INV-006",
        invoice_date=date(2026, 4, 10),
        taxable_value=Decimal("10000.00"),
        cgst=Decimal("0.00"),
        sgst=Decimal("0.00"),
        igst=Decimal("1800.00"),
    )

    db_session.add_all([pr1, twob1, pr2, pr3, twob3, pr4, twob4, pr5, twob5, pr6, twob6])
    db_session.commit()

    run_deterministic_reconciliation(db_session, job.id)
    db_session.commit()
    return job


def test_01_auto_population_of_discrepancies(db_session):
    """Verify that every discrepancy result creates a DiscrepancyItem, while matched records do not."""
    job = create_sample_job_with_discrepancies(db_session, "job-pop-1")

    items = db_session.query(DiscrepancyItem).filter(DiscrepancyItem.job_id == job.id).all()
    # 5 discrepancies created (INV-002, 003, 004, 005, 006). Exact match (INV-001) must NOT create an item.
    assert len(items) == 5

    # Check that initial audit log exists for each
    for it in items:
        assert it.verification_status == "PENDING"
        assert it.requires_vendor_action is False
        assert len(it.audit_logs) == 1
        assert it.audit_logs[0].action == "AUTO_CLASSIFIED"


def test_02_deterministic_severities(db_session):
    """Verify deterministic severity classifications."""
    job = create_sample_job_with_discrepancies(db_session, "job-sev-1")

    items = db_session.query(DiscrepancyItem).filter(DiscrepancyItem.job_id == job.id).all()
    by_inv = {}
    for it in items:
        pr = it.result.purchase_record
        twob = it.result.gstr2b_record
        inv = pr.invoice_number if pr else twob.invoice_number
        by_inv[inv] = it

    # INV-002: Missing in 2B -> MAJOR
    assert by_inv["INV-002"].severity == "MAJOR"
    assert by_inv["INV-002"].rule_applied == "MISSING_IN_PORTAL_MAJOR"

    # INV-003: Taxable difference 5000 > 1000 -> MAJOR
    assert by_inv["INV-003"].severity == "MAJOR"

    # INV-004: Taxable difference 10.00 <= 1000 and <= 1% -> MINOR
    assert by_inv["INV-004"].severity == "MINOR"

    # INV-005: Date difference 49 days > 30 days -> MAJOR
    assert by_inv["INV-005"].severity == "MAJOR"
    assert "DATE_VARIATION_MAJOR" in by_inv["INV-005"].rule_applied

    # INV-006: Tax structure mismatch (CGST/SGST vs IGST) -> MAJOR
    assert by_inv["INV-006"].severity == "MAJOR"
    assert by_inv["INV-006"].rule_applied == "TAX_STRUCTURE_MISMATCH_MAJOR"


def test_03_get_discrepancies_and_summary_endpoints(client, db_session):
    """Verify listing and summary API endpoints."""
    job = create_sample_job_with_discrepancies(db_session, "job-api-1")

    # 1. Summary endpoint
    sum_resp = client.get(f"/api/reconciliation/jobs/{job.id}/discrepancies/summary")
    assert sum_resp.status_code == 200
    summary = sum_resp.json()
    assert summary["total_discrepancies"] == 5
    assert summary["major_count"] == 4
    assert summary["minor_count"] == 1
    assert summary["pending_verification_count"] == 5
    assert summary["requires_vendor_action_count"] == 0

    # 2. Filter by severity=MAJOR
    maj_resp = client.get(f"/api/reconciliation/jobs/{job.id}/discrepancies?severity=MAJOR")
    assert maj_resp.status_code == 200
    maj_items = maj_resp.json()
    assert len(maj_items) == 4
    assert all(it["severity"] == "MAJOR" for it in maj_items)

    # 3. Filter by severity=MINOR
    min_resp = client.get(f"/api/reconciliation/jobs/{job.id}/discrepancies?severity=MINOR")
    assert min_resp.status_code == 200
    min_items = min_resp.json()
    assert len(min_items) == 1
    assert min_items[0]["severity"] == "MINOR"


def test_04_human_verification_approve(client, db_session):
    """Verify reviewer action 'APPROVE'."""
    job = create_sample_job_with_discrepancies(db_session, "job-app-1")
    items = client.get(f"/api/reconciliation/jobs/{job.id}/discrepancies").json()
    target = items[0]

    resp = client.post(
        f"/api/reconciliation/discrepancies/{target['id']}/verify",
        json={"action": "APPROVE", "reviewer_name": "Senior Accountant", "comments": "Tolerable variation approved."},
    )
    assert resp.status_code == 200
    data = resp.json()["discrepancy"]
    assert data["verification_status"] == "APPROVED"
    assert data["requires_vendor_action"] is False

    # Check audit log
    assert len(data["audit_logs"]) >= 2
    latest_log = data["audit_logs"][0]
    assert latest_log["action"] == "APPROVE"
    assert latest_log["reviewer_name"] == "Senior Accountant"
    assert "Tolerable variation approved" in latest_log["comments"]


def test_05_human_verification_require_vendor_correction(client, db_session):
    """Verify reviewer action 'REQUIRE_VENDOR_CORRECTION' for MAJOR discrepancy."""
    job = create_sample_job_with_discrepancies(db_session, "job-vc-1")
    items = client.get(f"/api/reconciliation/jobs/{job.id}/discrepancies?severity=MAJOR").json()
    target = next(it for it in items if it["invoice_number"] == "INV-002")

    resp = client.post(
        f"/api/reconciliation/discrepancies/{target['id']}/verify",
        json={"action": "REQUIRE_VENDOR_CORRECTION", "reviewer_name": "Tax Lead", "comments": "Supplier must file before 11th."},
    )
    assert resp.status_code == 200
    data = resp.json()["discrepancy"]
    assert data["verification_status"] == "REQUIRES_VENDOR_CORRECTION"
    assert data["requires_vendor_action"] is True

    # Now verify that it DOES appear in Vendor Communications
    vc_resp = client.get(f"/api/reconciliation/vendor-communications?job_id={job.id}")
    assert vc_resp.status_code == 200
    vc_items = vc_resp.json()
    assert len(vc_items) == 1
    assert vc_items[0]["invoice_number"] == "INV-002"


def test_06_human_verification_override_severity(client, db_session):
    """Verify reviewer overriding severity (e.g. MINOR to MAJOR)."""
    job = create_sample_job_with_discrepancies(db_session, "job-over-1")
    min_items = client.get(f"/api/reconciliation/jobs/{job.id}/discrepancies?severity=MINOR").json()
    target = min_items[0]

    # Override MINOR to MAJOR
    resp = client.post(
        f"/api/reconciliation/discrepancies/{target['id']}/verify",
        json={
            "action": "OVERRIDE_SEVERITY",
            "override_severity": "MAJOR",
            "reviewer_name": "CFO",
            "comments": "Recurring supplier issue elevated to MAJOR.",
        },
    )
    assert resp.status_code == 200
    data = resp.json()["discrepancy"]
    assert data["severity"] == "MAJOR"
    assert data["original_severity"] == "MINOR"
    assert data["verification_status"] == "OVERRIDDEN"

    # Now that it's MAJOR, it CAN be marked for vendor correction
    vc_resp = client.post(
        f"/api/reconciliation/discrepancies/{target['id']}/verify",
        json={"action": "REQUIRE_VENDOR_CORRECTION", "reviewer_name": "CFO"},
    )
    assert vc_resp.status_code == 200
    assert vc_resp.json()["discrepancy"]["verification_status"] == "REQUIRES_VENDOR_CORRECTION"


def test_07_investigate_and_reject_actions(client, db_session):
    """Verify 'INVESTIGATE' and 'REJECT' actions and their audit trails."""
    job = create_sample_job_with_discrepancies(db_session, "job-inv-1")
    items = client.get(f"/api/reconciliation/jobs/{job.id}/discrepancies").json()

    # Investigate
    inv_resp = client.post(
        f"/api/reconciliation/discrepancies/{items[0]['id']}/verify",
        json={"action": "INVESTIGATE", "reviewer_name": "Auditor", "comments": "Contacting warehouse team."},
    )
    assert inv_resp.status_code == 200
    assert inv_resp.json()["discrepancy"]["verification_status"] == "INVESTIGATION_REQUIRED"

    # Reject
    rej_resp = client.post(
        f"/api/reconciliation/discrepancies/{items[1]['id']}/verify",
        json={"action": "REJECT", "reviewer_name": "Auditor", "comments": "Disputed purchase entry."},
    )
    assert rej_resp.status_code == 200
    assert rej_resp.json()["discrepancy"]["verification_status"] == "REJECTED"


def test_08_resolve_action(client, db_session):
    """Verify 'RESOLVE' action marks discrepancy resolved."""
    job = create_sample_job_with_discrepancies(db_session, "job-res-1")
    items = client.get(f"/api/reconciliation/jobs/{job.id}/discrepancies").json()

    res_resp = client.post(
        f"/api/reconciliation/discrepancies/{items[0]['id']}/verify",
        json={"action": "RESOLVE", "reviewer_name": "Accountant", "comments": "Supplier sent debit note; resolved."},
    )
    assert res_resp.status_code == 200
    assert res_resp.json()["discrepancy"]["verification_status"] == "RESOLVED"
    assert "Supplier sent debit note; resolved" in res_resp.json()["discrepancy"]["resolution_notes"]
