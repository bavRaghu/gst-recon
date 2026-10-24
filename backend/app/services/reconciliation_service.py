import logging
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session

from .. import config
from ..models import (
    Gstr2bRecord, 
    PurchaseRecord, 
    ReconciliationJob, 
    ReconciliationProposal, 
    ReconciliationResult
)
from ..normalizers import normalize_gstin, normalize_invoice_number

logger = logging.getLogger(__name__)

# Canonical status representations
STATUS_MATCHED = "MATCHED"
STATUS_MISMATCH = "MISMATCH"
STATUS_MISSING_IN_GSTR2B = "MISSING_IN_GSTR2B"
STATUS_MISSING_IN_PURCHASE_REGISTER = "MISSING_IN_PURCHASE_REGISTER"
STATUS_DUPLICATE_AMBIGUOUS = "DUPLICATE_AMBIGUOUS"

VALID_STATUSES = {
    STATUS_MATCHED,
    STATUS_MISMATCH,
    STATUS_MISSING_IN_GSTR2B,
    STATUS_MISSING_IN_PURCHASE_REGISTER,
    STATUS_DUPLICATE_AMBIGUOUS,
}


def compute_differences(
    pr: PurchaseRecord, 
    twob: Gstr2bRecord, 
    tolerance: Decimal
) -> Dict[str, dict]:
    """
    Compares normalized invoice fields between Purchase Record and GSTR-2B.
    Difference is defined as (Purchase Register - GSTR-2B).
    Monetary differences within tolerance (inclusive) are considered matching.
    """
    differences: Dict[str, dict] = {}

    # 1. Invoice Date Comparison
    if pr.invoice_date != twob.invoice_date:
        days_diff = (pr.invoice_date - twob.invoice_date).days
        differences["invoice_date"] = {
            "purchase_register": str(pr.invoice_date),
            "gstr2b": str(twob.invoice_date),
            "difference": f"{days_diff} days" if days_diff != 0 else "format variation",
        }

    # 2. Monetary Fields Comparison
    monetary_fields = ["taxable_value", "cgst", "sgst", "igst"]
    for field in monetary_fields:
        pr_val = Decimal(str(getattr(pr, field)))
        twob_val = Decimal(str(getattr(twob, field)))
        diff = pr_val - twob_val

        if abs(diff) > tolerance:
            differences[field] = {
                "purchase_register": f"{pr_val:.2f}",
                "gstr2b": f"{twob_val:.2f}",
                "difference": f"{diff:.2f}",
            }

    return differences


def run_deterministic_reconciliation(
    db: Session,
    job_id: str,
    tolerance: Optional[Decimal] = None
) -> Tuple[List[ReconciliationResult], Dict[str, int]]:
    """
    Executes deterministic reconciliation for the specified job.
    - Operates only on records belonging to the requested job_id.
    - Groups records by (supplier_gstin, invoice_number) using normalized values.
    - Categorizes exact matches, mismatches, missing in GSTR-2B, missing in PR,
      and duplicate ambiguous records.
    - Replaces prior results transactionally without dropping records.
    """
    if tolerance is None:
        tolerance = config.DEFAULT_RECONCILIATION_TOLERANCE

    # 1. Validate Job Existence
    job = db.query(ReconciliationJob).filter(ReconciliationJob.id == job_id).first()
    if not job:
        raise ValueError(f"Reconciliation job '{job_id}' not found.")

    # 2. Fetch records strictly scoped to this job
    pr_records = (
        db.query(PurchaseRecord)
        .filter(PurchaseRecord.job_id == job_id)
        .order_by(PurchaseRecord.id)
        .all()
    )
    twob_records = (
        db.query(Gstr2bRecord)
        .filter(Gstr2bRecord.job_id == job_id)
        .order_by(Gstr2bRecord.id)
        .all()
    )

    # 3. Build Keyed Indexes (supplier_gstin, invoice_number)
    # Preservation of all duplicate records in a list
    pr_by_key: Dict[Tuple[str, str], List[PurchaseRecord]] = defaultdict(list)
    for r in pr_records:
        norm_gstin = normalize_gstin(r.supplier_gstin)
        norm_inv = normalize_invoice_number(r.invoice_number)
        pr_by_key[(norm_gstin, norm_inv)].append(r)

    twob_by_key: Dict[Tuple[str, str], List[Gstr2bRecord]] = defaultdict(list)
    for r in twob_records:
        norm_gstin = normalize_gstin(r.supplier_gstin)
        norm_inv = normalize_invoice_number(r.invoice_number)
        twob_by_key[(norm_gstin, norm_inv)].append(r)

    all_keys = set(pr_by_key.keys()) | set(twob_by_key.keys())

    results_to_create: List[ReconciliationResult] = []

    for key in sorted(all_keys):
        pr_list = pr_by_key.get(key, [])
        twob_list = twob_by_key.get(key, [])

        len_pr = len(pr_list)
        len_twob = len(twob_list)

        # Case A: Duplicate keys on either side
        # Never pair arbitrarily or assume totals match
        if len_pr > 1 or len_twob > 1:
            affected_pr_ids = [r.id for r in pr_list]
            affected_2b_ids = [r.id for r in twob_list]

            # Traceability: Every affected record is recorded with ambiguity metadata
            for pr in pr_list:
                meta = {
                    "reason": "duplicate_key",
                    "matching_key": f"{key[0]}::{key[1]}",
                    "dataset": "purchase_register",
                    "purchase_register_count": len_pr,
                    "gstr2b_count": len_twob,
                    "affected_pr_ids": affected_pr_ids,
                    "affected_2b_ids": affected_2b_ids,
                }
                res = ReconciliationResult(
                    job_id=job_id,
                    purchase_record_id=pr.id,
                    gstr2b_record_id=None,
                    status=STATUS_DUPLICATE_AMBIGUOUS,
                    differences={},
                    ambiguity_metadata=meta,
                )
                results_to_create.append(res)

            for twob in twob_list:
                meta = {
                    "reason": "duplicate_key",
                    "matching_key": f"{key[0]}::{key[1]}",
                    "dataset": "gstr2b",
                    "purchase_register_count": len_pr,
                    "gstr2b_count": len_twob,
                    "affected_pr_ids": affected_pr_ids,
                    "affected_2b_ids": affected_2b_ids,
                }
                res = ReconciliationResult(
                    job_id=job_id,
                    purchase_record_id=None,
                    gstr2b_record_id=twob.id,
                    status=STATUS_DUPLICATE_AMBIGUOUS,
                    differences={},
                    ambiguity_metadata=meta,
                )
                results_to_create.append(res)

        # Case B: Unique record present on both sides
        elif len_pr == 1 and len_twob == 1:
            pr = pr_list[0]
            twob = twob_list[0]
            differences = compute_differences(pr, twob, tolerance)

            status = STATUS_MATCHED if not differences else STATUS_MISMATCH
            res = ReconciliationResult(
                job_id=job_id,
                purchase_record_id=pr.id,
                gstr2b_record_id=twob.id,
                status=status,
                differences=differences,
                ambiguity_metadata=None,
            )
            results_to_create.append(res)

        # Case C: Key present only in Purchase Register
        elif len_pr == 1 and len_twob == 0:
            pr = pr_list[0]
            res = ReconciliationResult(
                job_id=job_id,
                purchase_record_id=pr.id,
                gstr2b_record_id=None,
                status=STATUS_MISSING_IN_GSTR2B,
                differences={},
                ambiguity_metadata={"source_dataset": "purchase_register"},
            )
            results_to_create.append(res)

        # Case D: Key present only in GSTR-2B
        elif len_pr == 0 and len_twob == 1:
            twob = twob_list[0]
            res = ReconciliationResult(
                job_id=job_id,
                purchase_record_id=None,
                gstr2b_record_id=twob.id,
                status=STATUS_MISSING_IN_PURCHASE_REGISTER,
                differences={},
                ambiguity_metadata={"source_dataset": "gstr2b"},
            )
            results_to_create.append(res)

    # 4. Atomic Transactional Persistence for this Job
    # Clear prior results and proposals for this job to prevent duplicate rows on rerun
    db.query(ReconciliationProposal).filter(ReconciliationProposal.job_id == job_id).delete(synchronize_session=False)
    db.query(ReconciliationResult).filter(ReconciliationResult.job_id == job_id).delete(synchronize_session=False)

    for item in results_to_create:
        db.add(item)

    job.status = "COMPLETED"
    db.flush()

    # 5. Compute Summary Counts
    summary = {
        "total_results": len(results_to_create),
        "matched": sum(1 for r in results_to_create if r.status == STATUS_MATCHED),
        "mismatched": sum(1 for r in results_to_create if r.status == STATUS_MISMATCH),
        "missing_in_gstr2b": sum(1 for r in results_to_create if r.status == STATUS_MISSING_IN_GSTR2B),
        "missing_in_purchase_register": sum(1 for r in results_to_create if r.status == STATUS_MISSING_IN_PURCHASE_REGISTER),
        "duplicate_ambiguous": sum(1 for r in results_to_create if r.status == STATUS_DUPLICATE_AMBIGUOUS),
    }
    summary["total_missing"] = summary["missing_in_gstr2b"] + summary["missing_in_purchase_register"]

    logger.info(
        "Deterministic reconciliation for job %s completed: %d results (%d matched, %d mismatch, %d missing in 2B, %d missing in PR, %d ambiguous).",
        job_id,
        summary["total_results"],
        summary["matched"],
        summary["mismatched"],
        summary["missing_in_gstr2b"],
        summary["missing_in_purchase_register"],
        summary["duplicate_ambiguous"],
    )

    return results_to_create, summary
