from datetime import date
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

from app import config
from app.database import init_db
from app.models import (
    DiscrepancyItem,
    Gstr2bRecord,
    PurchaseRecord,
    ReconciliationJob,
    ReconciliationResult,
    VendorCommunication,
    VendorContact,
)
from app.services.email_service import (
    clear_mock_emails,
    disable_mock_smtp,
    enable_mock_smtp,
    get_mock_sent_emails,
    validate_recipient,
)
from app.services.reconciliation_service import run_deterministic_reconciliation


@pytest.fixture(autouse=True)
def setup_teardown_smtp():
    enable_mock_smtp()
    clear_mock_emails()
    yield
    disable_mock_smtp()
    clear_mock_emails()


def create_test_reconciled_job(db_session, job_id="vendor-test-job", verify_major_for_vendor: bool = True):
    """Helper to create a job with exact match, missing in 2b, mismatch, and duplicate."""
    job = ReconciliationJob(id=job_id, status="UPLOADED")
    db_session.add(job)
    db_session.flush()

    # 1. Exact match (should NOT appear in vendor communication)
    pr1 = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="27AABCU9603R1ZM",
        invoice_number="INV-EXACT-001",
        invoice_date=date(2026, 4, 10),
        taxable_value=Decimal("10000.00"),
        cgst=Decimal("900.00"),
        sgst=Decimal("900.00"),
        igst=Decimal("0.00"),
    )
    twob1 = Gstr2bRecord(
        job_id=job.id,
        supplier_gstin="27AABCU9603R1ZM",
        invoice_number="INV-EXACT-001",
        invoice_date=date(2026, 4, 10),
        taxable_value=Decimal("10000.00"),
        cgst=Decimal("900.00"),
        sgst=Decimal("900.00"),
        igst=Decimal("0.00"),
    )

    # 2. Missing in GSTR-2B (blocked ITC - major discrepancy)
    pr2 = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="27AABCU9603R1ZM",
        invoice_number="INV-MISSING-002",
        invoice_date=date(2026, 4, 12),
        taxable_value=Decimal("25000.00"),
        cgst=Decimal("2250.00"),
        sgst=Decimal("2250.00"),
        igst=Decimal("0.00"),
    )

    # 3. Tax Mismatch
    pr3 = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="29XYZAB1234C1Z5",
        invoice_number="INV-MISMATCH-003",
        invoice_date=date(2026, 4, 15),
        taxable_value=Decimal("50000.00"),
        cgst=Decimal("4500.00"),
        sgst=Decimal("4500.00"),
        igst=Decimal("0.00"),
    )
    twob3 = Gstr2bRecord(
        job_id=job.id,
        supplier_gstin="29XYZAB1234C1Z5",
        invoice_number="INV-MISMATCH-003",
        invoice_date=date(2026, 4, 15),
        taxable_value=Decimal("40000.00"),
        cgst=Decimal("3600.00"),
        sgst=Decimal("3600.00"),
        igst=Decimal("0.00"),
    )

    db_session.add_all([pr1, twob1, pr2, pr3, twob3])
    db_session.commit()

    run_deterministic_reconciliation(db_session, job.id)
    if verify_major_for_vendor:
        # Mark MAJOR discrepancies as REQUIRES_VENDOR_CORRECTION so they enter vendor communications
        disc_items = (
            db_session.query(DiscrepancyItem)
            .filter(
                DiscrepancyItem.job_id == job.id,
                DiscrepancyItem.severity == "MAJOR",
            )
            .all()
        )
        for d in disc_items:
            d.verification_status = "REQUIRES_VENDOR_CORRECTION"
            d.requires_vendor_action = True
    db_session.commit()
    return job


def test_01_smtp_status_endpoint(client):
    """Verify SMTP status endpoint returns safe diagnostic configuration."""
    resp = client.get("/api/reconciliation/smtp/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "test_mode" in data
    assert "allowed_recipients" in data
    assert "host" in data
    assert "password" not in data


def test_02_validate_recipient_policy():
    """Verify test mode recipient policy blocks real suppliers unless allowlisted."""
    # Blank email
    is_valid, msg = validate_recipient("", is_test_mode=True)
    assert not is_valid

    # Malformed email
    is_valid, msg = validate_recipient("invalid-email", is_test_mode=True)
    assert not is_valid

    # Unapproved email in test mode
    is_valid, msg = validate_recipient(
        "supplier@unapproved-vendor.com",
        is_test_mode=True,
        allowed_recipients=["test-receiver@gst-recon.local"],
        test_recipient="test-receiver@gst-recon.local",
    )
    assert not is_valid
    assert "Sending blocked: Test mode is active" in msg

    # Approved test recipient in test mode
    is_valid, msg = validate_recipient(
        "test-receiver@gst-recon.local",
        is_test_mode=True,
        allowed_recipients=["test-receiver@gst-recon.local"],
        test_recipient="test-receiver@gst-recon.local",
    )
    assert is_valid
    assert msg == ""


def test_03_get_vendor_communications_list(client, db_session):
    """Verify only non-matched records are returned for vendor communication."""
    job = create_test_reconciled_job(db_session, "job-comm-list")

    resp = client.get(f"/api/reconciliation/vendor-communications?job_id={job.id}")
    assert resp.status_code == 200
    items = resp.json()

    # Exact match (INV-EXACT-001) must NOT be present
    inv_numbers = [item["invoice_number"] for item in items]
    assert "INV-EXACT-001" not in inv_numbers
    assert "INV-MISSING-002" in inv_numbers
    assert "INV-MISMATCH-003" in inv_numbers

    # Initial communication status must be 'not_contacted'
    for it in items:
        assert it["vendor_communication_status"] == "not_contacted"
        assert it["difference_amount"] > 0
        assert len(it["reason"]) > 0


def test_04_save_vendor_communication_draft(client, db_session):
    """Verify saving a draft notice persists into database."""
    job = create_test_reconciled_job(db_session, "job-draft-test")

    # Fetch discrepancy result ID
    items = client.get(f"/api/reconciliation/vendor-communications?job_id={job.id}").json()
    target_item = next(it for it in items if it["invoice_number"] == "INV-MISSING-002")
    result_id = target_item["result_id"]

    draft_payload = {
        "recipient_email": "accounts@vendor-missing.com",
        "cc_email": "internal-accounts@omkarengg.in",
        "subject": "URGENT: Missing Invoice INV-MISSING-002",
        "body": "Please upload invoice INV-MISSING-002 to GSTR-1 prior to 11th.",
        "template_type": "urgent",
        "supplier_name": "Precision Supplies Ltd",
    }

    draft_resp = client.post(
        f"/api/reconciliation/vendor-communications/{result_id}/draft",
        json=draft_payload,
    )
    assert draft_resp.status_code == 200
    draft_data = draft_resp.json()
    assert draft_data["status"] == "DRAFT"
    assert draft_data["subject"] == draft_payload["subject"]

    # Re-fetch items: status must now be 'draft'
    refetched = client.get(f"/api/reconciliation/vendor-communications?job_id={job.id}").json()
    refetched_item = next(it for it in refetched if it["id"] == result_id)
    assert refetched_item["vendor_communication_status"] == "draft"
    assert refetched_item["latest_communication"]["subject"] == draft_payload["subject"]


def test_05_send_blocked_in_test_mode(client, db_session):
    """Verify sending to an unapproved supplier email is blocked when test mode is active."""
    job = create_test_reconciled_job(db_session, "job-testmode-block")
    items = client.get(f"/api/reconciliation/vendor-communications?job_id={job.id}").json()
    result_id = items[0]["result_id"]

    send_payload = {
        "recipient_email": "accounts@unapproved-supplier.com",
        "cc_email": None,
        "subject": "Action Required: Missing Invoice",
        "body": "Please amend your filing.",
        "template_type": "standard",
        "supplier_name": "Supplier Corp",
    }

    # In test mode, this must return 400
    send_resp = client.post(
        f"/api/reconciliation/vendor-communications/{result_id}/send",
        json=send_payload,
    )
    assert send_resp.status_code == 400
    assert "Test mode is active" in send_resp.json()["detail"]

    # No emails should have been dispatched
    assert len(get_mock_sent_emails()) == 0


def test_06_send_success_to_approved_test_recipient(client, db_session):
    """Verify sending to approved test recipient succeeds and updates status to sent."""
    job = create_test_reconciled_job(db_session, "job-send-success")
    items = client.get(f"/api/reconciliation/vendor-communications?job_id={job.id}").json()
    result_id = items[0]["result_id"]

    approved_recipient = "test-receiver@gst-recon.local"
    send_payload = {
        "recipient_email": approved_recipient,
        "cc_email": "accounts@omkarengg.in",
        "subject": "GST Discrepancy Notice",
        "body": "Official audit notice for reconciliation.",
        "template_type": "standard",
        "supplier_name": "Verified Supplier",
    }

    send_resp = client.post(
        f"/api/reconciliation/vendor-communications/{result_id}/send",
        json=send_payload,
    )
    assert send_resp.status_code == 200
    data = send_resp.json()
    assert data["success"] is True
    assert data["communication"]["status"] == "SENT"

    # Verify mock SMTP captured the transmission
    sent_emails = get_mock_sent_emails()
    assert len(sent_emails) == 1
    assert sent_emails[0]["recipient"] == approved_recipient
    assert sent_emails[0]["subject"] == send_payload["subject"]

    # Re-fetch items: status must now be 'sent'
    refetched = client.get(f"/api/reconciliation/vendor-communications?job_id={job.id}").json()
    refetched_item = next(it for it in refetched if it["id"] == result_id)
    assert refetched_item["vendor_communication_status"] == "sent"


def test_07_vendor_contacts_upsert_and_auto_populate(client, db_session):
    """Verify vendor contact book stores and auto-populates supplier email across notices."""
    gstin = "27AABCU9603R1ZM"
    contact_payload = {
        "supplier_gstin": gstin,
        "supplier_name": "Apex Engineering Components Pvt Ltd",
        "email": "finance@apexeng.in",
        "phone": "+91 98200 12345",
        "contact_person": "Sunil Mehta",
    }

    # Upsert contact
    post_resp = client.post("/api/reconciliation/vendor-contacts", json=contact_payload)
    assert post_resp.status_code == 200
    assert post_resp.json()["supplier_name"] == contact_payload["supplier_name"]

    # Fetch contacts list
    list_resp = client.get("/api/reconciliation/vendor-contacts")
    assert list_resp.status_code == 200
    contacts = list_resp.json()
    assert any(c["supplier_gstin"] == gstin for c in contacts)

    # Create job and verify vendor-communications auto-populates supplier name & email
    job = create_test_reconciled_job(db_session, "job-contact-autopop")
    items = client.get(f"/api/reconciliation/vendor-communications?job_id={job.id}").json()
    apex_item = next(it for it in items if it["supplier_gstin"] == gstin)
    assert apex_item["supplier_name"] == "Apex Engineering Components Pvt Ltd"
    assert apex_item["vendor_email"] == "finance@apexeng.in"


def test_08_unverified_discrepancies_blocked_from_vendor_communication(client, db_session):
    """
    CRITICAL BUSINESS RULE TEST:
    Unreviewed or unverified discrepancies (verification_status='PENDING') MUST NOT appear in
    Vendor Communication list and cannot be drafted or sent.
    """
    # Create job with verify_major_for_vendor=False -> all discrepancies remain PENDING
    job = create_test_reconciled_job(db_session, "job-unverified-block", verify_major_for_vendor=False)

    # 1. Listing must return EMPTY list
    resp = client.get(f"/api/reconciliation/vendor-communications?job_id={job.id}")
    assert resp.status_code == 200
    assert len(resp.json()) == 0

    # 2. Attempting to draft a notice for any unverified result must return 400
    res = db_session.query(ReconciliationResult).filter(ReconciliationResult.job_id == job.id).first()
    draft_resp = client.post(
        f"/api/reconciliation/vendor-communications/{res.id}/draft",
        json={
            "recipient_email": "test-receiver@gst-recon.local",
            "subject": "Test Unverified",
            "body": "Should fail",
        },
    )
    assert draft_resp.status_code == 400
    assert "restricted to discrepancies classified as MAJOR and explicitly verified" in draft_resp.json()["detail"]


def test_09_minor_discrepancy_cannot_enter_vendor_communication(client, db_session):
    """
    CRITICAL BUSINESS RULE TEST:
    Minor discrepancies (severity='MINOR') must NEVER enter vendor communication,
    and verify endpoint strictly forbids setting them to REQUIRES_VENDOR_CORRECTION.
    """
    job = ReconciliationJob(id="job-minor-guard", status="UPLOADED")
    db_session.add(job)
    db_session.flush()

    # Create a minor discrepancy (taxable diff of INR 10.00 on 10,000 = 0.1% <= 1% -> MINOR)
    pr = PurchaseRecord(
        job_id=job.id,
        supplier_gstin="27AABCU9603R1ZM",
        invoice_number="INV-MINOR-001",
        invoice_date=date(2026, 4, 10),
        taxable_value=Decimal("10010.00"),
        cgst=Decimal("900.00"),
        sgst=Decimal("900.00"),
        igst=Decimal("0.00"),
    )
    twob = Gstr2bRecord(
        job_id=job.id,
        supplier_gstin="27AABCU9603R1ZM",
        invoice_number="INV-MINOR-001",
        invoice_date=date(2026, 4, 10),
        taxable_value=Decimal("10000.00"),
        cgst=Decimal("900.00"),
        sgst=Decimal("900.00"),
        igst=Decimal("0.00"),
    )
    db_session.add_all([pr, twob])
    db_session.commit()

    run_deterministic_reconciliation(db_session, job.id)
    db_session.commit()

    disc = db_session.query(DiscrepancyItem).filter(DiscrepancyItem.job_id == job.id).first()
    assert disc.severity == "MINOR"

    # Attempting to verify minor item as REQUIRE_VENDOR_CORRECTION must be rejected with 400
    verify_resp = client.post(
        f"/api/reconciliation/discrepancies/{disc.id}/verify",
        json={"action": "REQUIRE_VENDOR_CORRECTION", "reviewer_name": "Auditor"},
    )
    assert verify_resp.status_code == 400
    assert "Cannot require vendor correction for discrepancy with severity 'MINOR'" in verify_resp.json()["detail"]

    # Listing must still be empty
    list_resp = client.get(f"/api/reconciliation/vendor-communications?job_id={job.id}")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 0


