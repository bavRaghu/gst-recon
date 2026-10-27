import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session, joinedload, selectinload

from .. import config
from ..models import (
    DiscrepancyAuditLog,
    DiscrepancyItem,
    Gstr2bRecord,
    PurchaseRecord,
    ReconciliationJob,
    ReconciliationResult,
    VendorContact,
)
from .discrepancy_classification_service import (
    DiscrepancyClassificationService,
    SEVERITY_MAJOR,
    SEVERITY_MINOR,
    SEVERITY_NONE,
    SEVERITY_REVIEW_REQUIRED,
    SEVERITY_UNCLASSIFIED,
)

logger = logging.getLogger(__name__)

# Verification status constants
STATUS_PENDING = "PENDING"
STATUS_APPROVED = "APPROVED"
STATUS_OVERRIDDEN = "OVERRIDDEN"
STATUS_REQUIRES_VENDOR_CORRECTION = "REQUIRES_VENDOR_CORRECTION"
STATUS_INVESTIGATION_REQUIRED = "INVESTIGATION_REQUIRED"
STATUS_REJECTED = "REJECTED"
STATUS_RESOLVED = "RESOLVED"

VALID_VERIFICATION_STATUSES = {
    STATUS_PENDING,
    STATUS_APPROVED,
    STATUS_OVERRIDDEN,
    STATUS_REQUIRES_VENDOR_CORRECTION,
    STATUS_INVESTIGATION_REQUIRED,
    STATUS_REJECTED,
    STATUS_RESOLVED,
}


def build_discrepancy_explanation_fallback(
    discrepancy_type: str,
    severity: str,
    severity_reason: str,
    difference_amount: Decimal,
    affected_fields: List[str],
    pr: Optional[PurchaseRecord] = None,
    twob: Optional[Gstr2bRecord] = None,
) -> str:
    """
    Builds a clear, professional plain-English explanation for MSME accountants
    when AI is not configured or fails.
    """
    inv_num = pr.invoice_number if pr else (twob.invoice_number if twob else "N/A")
    gstin = pr.supplier_gstin if pr else (twob.supplier_gstin if twob else "N/A")

    if discrepancy_type == "MISSING_IN_GSTR2B":
        return (
            f"Invoice {inv_num} (Supplier: {gstin}) is recorded in your Purchase Register with total tax of "
            f"INR {difference_amount:.2f}, but is missing from GSTR-2B. Under Section 16(2)(aa) of the CGST Act, "
            f"ITC cannot be availed unless the supplier reports this invoice in their GSTR-1. "
            f"Action: Human review required; mark for vendor correction to notify supplier before the 11th of the month."
        )
    elif discrepancy_type == "MISSING_IN_PURCHASE_REGISTER":
        return (
            f"Invoice {inv_num} (Supplier: {gstin}) has been filed by the supplier in GSTR-2B with total tax of "
            f"INR {difference_amount:.2f}, but does not exist in your Purchase Register. "
            f"This represents unrecorded purchases or unclaimed input tax credit. "
            f"Action: Verify internal physical bills and goods receipt note (GRN) before accounting."
        )
    elif discrepancy_type == "DUPLICATE_AMBIGUOUS":
        return (
            f"Multiple conflicting records detected for Invoice {inv_num} (Supplier: {gstin}). "
            f"Ambiguous duplicates prevent automatic reconciliation to safeguard financial records. "
            f"Action: Verify ledger entries and cancel duplicate accounting entries if applicable."
        )
    else:  # MISMATCH
        fields_str = ", ".join(affected_fields) if affected_fields else "tax/value fields"
        return (
            f"Discrepancy detected in {fields_str} for Invoice {inv_num} (Supplier: {gstin}). "
            f"Difference amount is INR {difference_amount:.2f}. {severity_reason} "
            f"Action: {'Requires vendor amendment in Table 9 of GSTR-1.' if severity == SEVERITY_MAJOR else 'Verify rounding or minor entry variation.'}"
        )


def populate_job_discrepancies(
    db: Session,
    job_id: str,
    tolerance: Optional[Decimal] = None,
) -> List[DiscrepancyItem]:
    """
    Authoritative analysis and population of DiscrepancyItem records for all non-MATCHED
    reconciliation results of a job.
    - Clears previous discrepancy items for the job (cascades to audit logs).
    - Determines affected fields, expected vs actual values, difference amount.
    - Classifies severity deterministically.
    - Creates initial DiscrepancyAuditLog with status PENDING.
    """
    if tolerance is None:
        tolerance = config.DEFAULT_RECONCILIATION_TOLERANCE

    # Delete existing discrepancy items for this job
    db.query(DiscrepancyItem).filter(DiscrepancyItem.job_id == job_id).delete(synchronize_session=False)

    # Fetch all non-matched results for this job
    results = (
        db.query(ReconciliationResult)
        .options(
            joinedload(ReconciliationResult.purchase_record),
            joinedload(ReconciliationResult.gstr2b_record),
        )
        .filter(
            ReconciliationResult.job_id == job_id,
            ReconciliationResult.status != "MATCHED",
        )
        .all()
    )

    created_items: List[DiscrepancyItem] = []

    for res in results:
        pr = res.purchase_record
        twob = res.gstr2b_record

        # Classification
        classification = DiscrepancyClassificationService.classify(
            status=res.status,
            pr=pr,
            twob=twob,
            differences=res.differences,
            tolerance=tolerance,
        )

        # Build affected fields and expected_and_actual
        affected_fields: List[str] = []
        expected_and_actual: Dict[str, Any] = {}
        max_diff = Decimal("0.00")

        if res.status == "MISSING_IN_GSTR2B":
            affected_fields = ["gstr2b_filing"]
            pr_tax = (
                Decimal(str(getattr(pr, "cgst", 0)))
                + Decimal(str(getattr(pr, "sgst", 0)))
                + Decimal(str(getattr(pr, "igst", 0)))
            ) if pr else Decimal("0.00")
            max_diff = pr_tax
            expected_and_actual["purchase_register"] = {
                "taxable_value": str(getattr(pr, "taxable_value", 0)),
                "tax_amount": str(pr_tax),
                "invoice_number": getattr(pr, "invoice_number", ""),
                "invoice_date": str(getattr(pr, "invoice_date", "")),
            }
            expected_and_actual["gstr2b"] = "MISSING"

        elif res.status == "MISSING_IN_PURCHASE_REGISTER":
            affected_fields = ["purchase_register_entry"]
            twob_tax = (
                Decimal(str(getattr(twob, "cgst", 0)))
                + Decimal(str(getattr(twob, "sgst", 0)))
                + Decimal(str(getattr(twob, "igst", 0)))
            ) if twob else Decimal("0.00")
            max_diff = twob_tax
            expected_and_actual["gstr2b"] = {
                "taxable_value": str(getattr(twob, "taxable_value", 0)),
                "tax_amount": str(twob_tax),
                "invoice_number": getattr(twob, "invoice_number", ""),
                "invoice_date": str(getattr(twob, "invoice_date", "")),
            }
            expected_and_actual["purchase_register"] = "MISSING"

        elif res.status == "DUPLICATE_AMBIGUOUS":
            affected_fields = ["duplicate_entry"]
            if pr:
                pr_tax = Decimal(str(pr.cgst)) + Decimal(str(pr.sgst)) + Decimal(str(pr.igst))
                max_diff = pr_tax
            elif twob:
                twob_tax = Decimal(str(twob.cgst)) + Decimal(str(twob.sgst)) + Decimal(str(twob.igst))
                max_diff = twob_tax
            expected_and_actual["ambiguity"] = res.ambiguity_metadata or {}

        else:  # MISMATCH
            diffs = res.differences or {}
            for field_name, vals in diffs.items():
                affected_fields.append(field_name)
                expected_and_actual[field_name] = vals
                if "difference" in vals:
                    try:
                        clean_diff = Decimal(str(vals["difference"]).replace(" days", ""))
                        if abs(clean_diff) > max_diff:
                            max_diff = abs(clean_diff)
                    except Exception:
                        pass

        # Build fallback plain-English explanation
        explanation_text = build_discrepancy_explanation_fallback(
            discrepancy_type=res.status,
            severity=classification.severity,
            severity_reason=classification.reason,
            difference_amount=max_diff,
            affected_fields=affected_fields,
            pr=pr,
            twob=twob,
        )

        item = DiscrepancyItem(
            job_id=job_id,
            result_id=res.id,
            discrepancy_type=res.status,
            severity=classification.severity,
            original_severity=classification.severity,
            severity_reason=classification.reason,
            rule_applied=classification.rule_applied,
            affected_fields=affected_fields,
            expected_and_actual=expected_and_actual,
            difference_amount=max_diff,
            ai_explanation=explanation_text,
            ai_suggested_fields=classification.details.get("fields"),
            verification_status=STATUS_PENDING,
            requires_vendor_action=False,
            resolution_notes=None,
        )
        db.add(item)
        db.flush()

        # Audit log: Initial system classification
        initial_log = DiscrepancyAuditLog(
            discrepancy_id=item.id,
            job_id=job_id,
            action="AUTO_CLASSIFIED",
            previous_status=None,
            new_status=STATUS_PENDING,
            previous_severity=None,
            new_severity=classification.severity,
            reviewer_name="Deterministic Rules Engine",
            comments=f"Automated classification: {classification.reason}",
        )
        db.add(initial_log)
        created_items.append(item)

    db.flush()
    logger.info("Populated %d DiscrepancyItems for job %s.", len(created_items), job_id)
    return created_items


def verify_discrepancy_item(
    db: Session,
    discrepancy_id: str,
    action: str,
    reviewer_name: str = "Reviewer",
    comments: Optional[str] = None,
    override_severity: Optional[str] = None,
    requires_vendor_action: Optional[bool] = None,
) -> DiscrepancyItem:
    """
    Executes human verification on a discrepancy item, enforces business rules,
    and records an immutable audit log.
    
    CRITICAL BUSINESS RULES:
    1. ONLY discrepancies with severity 'MAJOR' can be transitioned to 'REQUIRES_VENDOR_CORRECTION'.
    2. Setting requires_vendor_action=True is strictly reserved for 'REQUIRES_VENDOR_CORRECTION' state.
    3. Overriding severity updates original severity vs new severity and is logged in audit trail.
    """
    item = (
        db.query(DiscrepancyItem)
        .options(
            joinedload(DiscrepancyItem.result).joinedload(ReconciliationResult.purchase_record),
            joinedload(DiscrepancyItem.result).joinedload(ReconciliationResult.gstr2b_record),
            selectinload(DiscrepancyItem.audit_logs),
        )
        .filter(DiscrepancyItem.id == discrepancy_id)
        .first()
    )
    if not item:
        raise ValueError(f"Discrepancy item '{discrepancy_id}' not found.")

    action_upper = action.strip().upper()
    previous_status = item.verification_status
    previous_severity = item.severity
    new_severity = previous_severity
    new_status = previous_status
    log_action = action_upper

    now_utc = datetime.now(timezone.utc)

    if action_upper == "APPROVE":
        new_status = STATUS_APPROVED
        item.requires_vendor_action = False
        item.verified_at = now_utc
        item.verified_by = reviewer_name

    elif action_upper == "REQUIRE_VENDOR_CORRECTION":
        # Business Rule: ONLY discrepancies classified as MAJOR may enter Vendor Communication!
        if item.severity != SEVERITY_MAJOR:
            raise ValueError(
                f"Cannot require vendor correction for discrepancy with severity '{item.severity}'. "
                f"Only discrepancies classified as 'MAJOR' can be flagged for vendor action. "
                f"You may override severity to 'MAJOR' first if appropriate."
            )
        new_status = STATUS_REQUIRES_VENDOR_CORRECTION
        item.requires_vendor_action = True
        item.verified_at = now_utc
        item.verified_by = reviewer_name

    elif action_upper == "OVERRIDE_SEVERITY":
        if not override_severity:
            raise ValueError("override_severity ('MAJOR', 'MINOR', or 'REVIEW_REQUIRED') must be provided.")
        override_upper = override_severity.strip().upper()
        if override_upper not in (SEVERITY_MAJOR, SEVERITY_MINOR, SEVERITY_REVIEW_REQUIRED):
            raise ValueError(f"Invalid override_severity '{override_severity}'. Must be MAJOR, MINOR, or REVIEW_REQUIRED.")

        new_severity = override_upper
        item.severity = new_severity
        new_status = STATUS_OVERRIDDEN
        item.verified_at = now_utc
        item.verified_by = reviewer_name

        # If downgraded away from MAJOR, clear vendor action flag
        if new_severity != SEVERITY_MAJOR:
            item.requires_vendor_action = False

    elif action_upper == "INVESTIGATE":
        new_status = STATUS_INVESTIGATION_REQUIRED
        item.requires_vendor_action = False
        item.verified_at = now_utc
        item.verified_by = reviewer_name

    elif action_upper == "REJECT":
        new_status = STATUS_REJECTED
        item.requires_vendor_action = False
        item.verified_at = now_utc
        item.verified_by = reviewer_name

    elif action_upper == "RESOLVE":
        new_status = STATUS_RESOLVED
        item.requires_vendor_action = False
        item.resolution_notes = comments
        item.verified_at = now_utc
        item.verified_by = reviewer_name

    elif action_upper == "ADD_COMMENT":
        # Retain current status and severity, simply append audit log comment
        new_status = previous_status
        new_severity = previous_severity
        log_action = "COMMENT"

    else:
        raise ValueError(f"Unknown verification action '{action}'.")

    item.verification_status = new_status
    if comments and action_upper != "RESOLVE":
        if item.resolution_notes:
            item.resolution_notes += f"\n[{reviewer_name}]: {comments}"
        else:
            item.resolution_notes = f"[{reviewer_name}]: {comments}"

    # Create immutable audit log entry
    audit_entry = DiscrepancyAuditLog(
        discrepancy_id=item.id,
        job_id=item.job_id,
        action=log_action,
        previous_status=previous_status,
        new_status=new_status,
        previous_severity=previous_severity,
        new_severity=new_severity,
        reviewer_name=reviewer_name,
        comments=comments or f"Executed action {log_action}",
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(item)

    logger.info(
        "Discrepancy %s action %s by %s: status %s -> %s, severity %s -> %s, vendor_action=%s",
        item.id,
        log_action,
        reviewer_name,
        previous_status,
        new_status,
        previous_severity,
        new_severity,
        item.requires_vendor_action,
    )
    return item


def get_job_discrepancy_summary(db: Session, job_id: str) -> Dict[str, int]:
    """Computes real summary metrics across all discrepancy items for a job."""
    items = db.query(DiscrepancyItem).filter(DiscrepancyItem.job_id == job_id).all()

    return {
        "total_discrepancies": len(items),
        "major_count": sum(1 for it in items if it.severity == SEVERITY_MAJOR),
        "minor_count": sum(1 for it in items if it.severity == SEVERITY_MINOR),
        "review_required_count": sum(1 for it in items if it.severity in (SEVERITY_REVIEW_REQUIRED, SEVERITY_UNCLASSIFIED)),
        "pending_verification_count": sum(1 for it in items if it.verification_status == STATUS_PENDING),
        "requires_vendor_action_count": sum(1 for it in items if it.requires_vendor_action),
        "approved_or_resolved_count": sum(1 for it in items if it.verification_status in (STATUS_APPROVED, STATUS_RESOLVED)),
    }
