import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import config
from ..database import get_db
from ..models import (
    DiscrepancyAuditLog,
    DiscrepancyItem,
    Gstr2bRecord, 
    ProposalAuditLog,
    PurchaseRecord, 
    ReconciliationJob, 
    ReconciliationProposal, 
    ReconciliationResult,
    VendorCommunication,
    VendorContact,
)
from ..parsers import parse_file
from ..schemas import (
    DiscrepancyAuditLogSchema,
    DiscrepancyExplanationResponse,
    DiscrepancyItemSchema,
    DiscrepancySummarySchema,
    DiscrepancyVerificationRequest,
    DiscrepancyVerificationResponse,
    JobDetailResponse,
    ProposalAuditLogSchema,
    ProposalReviewRequest,
    ProposalReviewResponse,
    ProposalSchema,
    RecordSchema,
    ReconciliationResultSchema,
    ReconciliationRunRequest,
    ReconciliationRunResponse,
    ReconciliationSummarySchema,
    SaveNoticeDraftRequest,
    SendNoticeRequest,
    SendNoticeResponse,
    SmtpConfigResponse,
    UploadErrorResponse,
    UploadSuccessResponse,
    UploadSummary,
    ValidationErrorItem,
    VendorActionInvoiceItem,
    VendorCommunicationSchema,
    VendorContactSchema,
    VendorContactUpsertRequest,
)
from ..services.ai_service import generate_discrepancy_explanation, run_ai_assisted_matching
from ..services.discrepancy_service import (
    get_job_discrepancy_summary,
    populate_job_discrepancies,
    verify_discrepancy_item,
)
from ..services.email_service import send_email_smtp, validate_recipient
from ..services.reconciliation_service import run_deterministic_reconciliation

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/reconciliation", tags=["Reconciliation"])


@router.post(
    "/upload",
    response_model=UploadSuccessResponse,
    responses={
        400: {"model": UploadErrorResponse},
        413: {"model": UploadErrorResponse},
        422: {"model": UploadErrorResponse},
        500: {"model": UploadErrorResponse},
    },
)
async def upload_reconciliation_files(
    purchase_register: Optional[UploadFile] = File(None),
    gstr_2b: Optional[UploadFile] = File(None),
    gstr2b: Optional[UploadFile] = File(None),  # Alias for flexibility
    db: Session = Depends(get_db),
):
    """
    Receives Purchase Register and GSTR-2B files, parses, normalizes,
    validates, and persists all records in a single database transaction.
    """
    effective_gstr2b = gstr_2b or gstr2b

    # 1. Validate file presence
    missing_errors = []
    if not purchase_register or not purchase_register.filename:
        missing_errors.append(
            ValidationErrorItem(
                file_type="Purchase Register",
                row=None,
                field=None,
                reason="Purchase Register file is required.",
            )
        )
    if not effective_gstr2b or not effective_gstr2b.filename:
        missing_errors.append(
            ValidationErrorItem(
                file_type="GSTR-2B",
                row=None,
                field=None,
                reason="GSTR-2B file is required.",
            )
        )

    if missing_errors:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=UploadErrorResponse(
                success=False,
                message="Both Purchase Register and GSTR-2B files must be uploaded.",
                errors=missing_errors,
            ).model_dump(),
        )

    assert purchase_register is not None
    assert effective_gstr2b is not None

    # 2. Validate file extensions
    pr_ext = "." + purchase_register.filename.split(".")[-1].lower() if "." in purchase_register.filename else ""
    gstr2b_ext = "." + effective_gstr2b.filename.split(".")[-1].lower() if "." in effective_gstr2b.filename else ""

    format_errors = []
    if pr_ext not in config.ALLOWED_EXTENSIONS:
        format_errors.append(
            ValidationErrorItem(
                file_type="Purchase Register",
                row=None,
                field=None,
                reason=(
                    f"Unsupported format '{purchase_register.filename}'. "
                    f"Only .csv and .xlsx files are supported."
                ),
            )
        )
    if gstr2b_ext not in config.ALLOWED_EXTENSIONS:
        format_errors.append(
            ValidationErrorItem(
                file_type="GSTR-2B",
                row=None,
                field=None,
                reason=(
                    f"Unsupported format '{effective_gstr2b.filename}'. "
                    f"Only .csv and .xlsx files are supported."
                ),
            )
        )

    if format_errors:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=UploadErrorResponse(
                success=False,
                message="Invalid file format uploaded. Only .csv and .xlsx are allowed.",
                errors=format_errors,
            ).model_dump(),
        )

    # 3. Read content and validate file sizes
    try:
        pr_bytes = await purchase_register.read()
        gstr2b_bytes = await effective_gstr2b.read()
    except Exception as ex:
        logger.error("Error reading uploaded files: %s", ex)
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=UploadErrorResponse(
                success=False,
                message="Could not read uploaded files from stream.",
                errors=[
                    ValidationErrorItem(
                        file_type="Upload",
                        row=None,
                        field=None,
                        reason=f"Failed to read file contents: {str(ex)}",
                    )
                ],
            ).model_dump(),
        )

    size_errors = []
    if len(pr_bytes) == 0:
        size_errors.append(
            ValidationErrorItem(
                file_type="Purchase Register",
                row=None,
                field=None,
                reason="Purchase Register file is empty (0 bytes).",
            )
        )
    elif len(pr_bytes) > config.MAX_FILE_SIZE_BYTES:
        size_errors.append(
            ValidationErrorItem(
                file_type="Purchase Register",
                row=None,
                field=None,
                reason=f"File exceeds maximum allowed size of {config.MAX_FILE_SIZE_MB}MB.",
            )
        )

    if len(gstr2b_bytes) == 0:
        size_errors.append(
            ValidationErrorItem(
                file_type="GSTR-2B",
                row=None,
                field=None,
                reason="GSTR-2B file is empty (0 bytes).",
            )
        )
    elif len(gstr2b_bytes) > config.MAX_FILE_SIZE_BYTES:
        size_errors.append(
            ValidationErrorItem(
                file_type="GSTR-2B",
                row=None,
                field=None,
                reason=f"File exceeds maximum allowed size of {config.MAX_FILE_SIZE_MB}MB.",
            )
        )

    if size_errors:
        # Check if oversized
        is_oversized = any("exceeds maximum allowed size" in e.reason for e in size_errors)
        status_code = 413 if is_oversized else 400
        return JSONResponse(
            status_code=status_code,
            content=UploadErrorResponse(
                success=False,
                message="File size validation failed.",
                errors=size_errors,
            ).model_dump(),
        )

    # 4. Parse & Normalize both files independently
    pr_records, pr_errors = parse_file(
        purchase_register.filename, 
        pr_bytes, 
        "Purchase Register"
    )
    gstr2b_records, gstr2b_errors = parse_file(
        effective_gstr2b.filename, 
        gstr2b_bytes, 
        "GSTR-2B"
    )

    all_errors = pr_errors + gstr2b_errors
    if all_errors:
        return JSONResponse(
            status_code=422,
            content=UploadErrorResponse(
                success=False,
                message="Validation failed for uploaded files. Please correct the errors and retry.",
                errors=all_errors,
            ).model_dump(),
        )

    # 5. Database Transaction: Persist job and records atomically
    try:
        job = ReconciliationJob(status="UPLOADED")
        db.add(job)
        db.flush()  # Generates job.id

        # Insert Purchase Records
        for item in pr_records:
            pr_rec = PurchaseRecord(
                job_id=job.id,
                supplier_gstin=item["supplier_gstin"],
                invoice_number=item["invoice_number"],
                invoice_date=item["invoice_date"],
                taxable_value=item["taxable_value"],
                cgst=item["cgst"],
                sgst=item["sgst"],
                igst=item["igst"],
            )
            db.add(pr_rec)

        # Insert GSTR-2B Records
        for item in gstr2b_records:
            gstr2b_rec = Gstr2bRecord(
                job_id=job.id,
                supplier_gstin=item["supplier_gstin"],
                invoice_number=item["invoice_number"],
                invoice_date=item["invoice_date"],
                taxable_value=item["taxable_value"],
                cgst=item["cgst"],
                sgst=item["sgst"],
                igst=item["igst"],
            )
            db.add(gstr2b_rec)

        db.commit()
        db.refresh(job)

        logger.info(
            "Reconciliation job %s created with %d PR records and %d 2B records.",
            job.id,
            len(pr_records),
            len(gstr2b_records),
        )

        return UploadSuccessResponse(
            success=True,
            job_id=job.id,
            message="Files successfully uploaded, parsed, normalized, and stored.",
            summary=UploadSummary(
                purchase_register_count=len(pr_records),
                gstr2b_count=len(gstr2b_records),
                total_records=len(pr_records) + len(gstr2b_records),
            ),
        )

    except Exception as ex:
        db.rollback()
        logger.error("Database transaction failed during upload: %s", ex)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=UploadErrorResponse(
                success=False,
                message="An unexpected error occurred while saving records. Transaction was rolled back.",
                errors=[
                    ValidationErrorItem(
                        file_type="Database",
                        row=None,
                        field=None,
                        reason="Failed to persist records into database.",
                    )
                ],
            ).model_dump(),
        )


@router.get("/jobs", response_model=List[JobDetailResponse])
def list_reconciliation_jobs(db: Session = Depends(get_db)):
    """Fetch all reconciliation jobs with status, counts, and summaries, ordered by newest first."""
    jobs = db.query(ReconciliationJob).order_by(ReconciliationJob.created_at.desc()).all()
    response_list = []
    for job in jobs:
        pr_count = db.query(PurchaseRecord).filter(PurchaseRecord.job_id == job.id).count()
        gstr2b_count = db.query(Gstr2bRecord).filter(Gstr2bRecord.job_id == job.id).count()
        results = db.query(ReconciliationResult).filter(ReconciliationResult.job_id == job.id).all()
        summary_data = None
        if results:
            matched = sum(1 for r in results if r.status == "MATCHED")
            mismatched = sum(1 for r in results if r.status == "MISMATCH")
            missing_2b = sum(1 for r in results if r.status == "MISSING_IN_GSTR2B")
            missing_pr = sum(1 for r in results if r.status == "MISSING_IN_PURCHASE_REGISTER")
            ambiguous = sum(1 for r in results if r.status == "DUPLICATE_AMBIGUOUS")
            summary_data = ReconciliationSummarySchema(
                total_results=len(results),
                matched=matched,
                mismatched=mismatched,
                missing_in_gstr2b=missing_2b,
                missing_in_purchase_register=missing_pr,
                duplicate_ambiguous=ambiguous,
                total_missing=missing_2b + missing_pr,
                major_discrepancies=sum(1 for r in results if r.severity == "MAJOR"),
                minor_discrepancies=sum(1 for r in results if r.severity == "MINOR"),
                none_count=sum(1 for r in results if r.severity == "NONE"),
                unclassified_count=sum(1 for r in results if r.severity == "UNCLASSIFIED"),
            )
        response_list.append(
            JobDetailResponse(
                id=job.id,
                created_at=job.created_at,
                status=job.status,
                purchase_records_count=pr_count,
                gstr2b_records_count=gstr2b_count,
                summary=summary_data,
            )
        )
    return response_list


@router.get("/jobs/{job_id}", response_model=JobDetailResponse)
def get_reconciliation_job(job_id: str, db: Session = Depends(get_db)):
    """Fetch status and record counts for an uploaded reconciliation job."""
    job = db.query(ReconciliationJob).filter(ReconciliationJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Reconciliation job '{job_id}' not found."
        )

    pr_count = db.query(PurchaseRecord).filter(PurchaseRecord.job_id == job_id).count()
    gstr2b_count = db.query(Gstr2bRecord).filter(Gstr2bRecord.job_id == job_id).count()

    # Compute summary if job has results
    summary_data = None
    results = db.query(ReconciliationResult).filter(ReconciliationResult.job_id == job_id).all()
    if results:
        matched = sum(1 for r in results if r.status == "MATCHED")
        mismatched = sum(1 for r in results if r.status == "MISMATCH")
        missing_2b = sum(1 for r in results if r.status == "MISSING_IN_GSTR2B")
        missing_pr = sum(1 for r in results if r.status == "MISSING_IN_PURCHASE_REGISTER")
        ambiguous = sum(1 for r in results if r.status == "DUPLICATE_AMBIGUOUS")
        summary_data = ReconciliationSummarySchema(
            total_results=len(results),
            matched=matched,
            mismatched=mismatched,
            missing_in_gstr2b=missing_2b,
            missing_in_purchase_register=missing_pr,
            duplicate_ambiguous=ambiguous,
            total_missing=missing_2b + missing_pr,
            major_discrepancies=sum(1 for r in results if r.severity == "MAJOR"),
            minor_discrepancies=sum(1 for r in results if r.severity == "MINOR"),
            none_count=sum(1 for r in results if r.severity == "NONE"),
            unclassified_count=sum(1 for r in results if r.severity == "UNCLASSIFIED"),
        )

    return JobDetailResponse(
        id=job.id,
        created_at=job.created_at,
        status=job.status,
        purchase_records_count=pr_count,
        gstr2b_records_count=gstr2b_count,
        summary=summary_data,
    )


@router.post("/{job_id}/run", response_model=ReconciliationRunResponse)
async def run_reconciliation_endpoint(
    job_id: str,
    request: Optional[ReconciliationRunRequest] = None,
    db: Session = Depends(get_db),
):
    """
    Executes Stage 2 (Deterministic Reconciliation Engine) and optionally
    Stage 3 (AI-Assisted Ambiguous Candidate Assessment).
    - Idempotent and transaction-safe: rerunning replaces prior results for this job.
    - Preserves results of unrelated jobs.
    """
    job = db.query(ReconciliationJob).filter(ReconciliationJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reconciliation job '{job_id}' not found.",
        )

    tolerance = request.tolerance if request and request.tolerance is not None else None
    run_ai = request.run_ai_matching if request and request.run_ai_matching is not None else True

    try:
        # 1. Deterministic Reconciliation Engine
        results, summary = run_deterministic_reconciliation(db, job_id, tolerance=tolerance)

        # 2. AI-Assisted Candidate Matching (if requested)
        ai_summary = None
        if run_ai:
            try:
                ai_summary = await run_ai_assisted_matching(db, job_id, results)
            except Exception as ai_ex:
                logger.warning("AI candidate matching error for job %s: %s", job_id, ai_ex)
                ai_summary = {
                    "ai_enabled": False,
                    "error": str(ai_ex),
                    "notes": "Deterministic reconciliation completed; AI assessment failed gracefully.",
                }

        db.commit()
        db.refresh(job)

        return ReconciliationRunResponse(
            success=True,
            job_id=job.id,
            status=job.status,
            summary=ReconciliationSummarySchema(**summary),
            ai_assessment_summary=ai_summary,
            message="Reconciliation executed successfully.",
        )
    except ValueError as ve:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as ex:
        db.rollback()
        logger.error("Error running reconciliation for job %s: %s", job_id, ex)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Reconciliation failed: {str(ex)}",
        )


@router.get("/{job_id}/results", response_model=List[ReconciliationResultSchema])
def get_reconciliation_results_endpoint(
    job_id: str,
    status_filter: Optional[str] = None,
    severity_filter: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Fetches stored reconciliation results for the given job.
    Includes linked source records and AI proposals where available.
    Supports filtering by match status and discrepancy severity.
    """
    job = db.query(ReconciliationJob).filter(ReconciliationJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reconciliation job '{job_id}' not found.",
        )

    query = (
        db.query(ReconciliationResult)
        .filter(ReconciliationResult.job_id == job_id)
        .options(
            joinedload(ReconciliationResult.purchase_record),
            joinedload(ReconciliationResult.gstr2b_record),
            selectinload(ReconciliationResult.proposals),
        )
    )

    if status_filter and status_filter.upper() != "ALL":
        query = query.filter(ReconciliationResult.status == status_filter.upper())

    if severity_filter and severity_filter.upper() != "ALL":
        query = query.filter(ReconciliationResult.severity == severity_filter.upper())

    results = query.order_by(ReconciliationResult.id).all()

    if search and search.strip():
        q = search.strip().lower()
        filtered = []
        for r in results:
            inv_pr = r.purchase_record.invoice_number.lower() if r.purchase_record else ""
            inv_2b = r.gstr2b_record.invoice_number.lower() if r.gstr2b_record else ""
            gstin_pr = r.purchase_record.supplier_gstin.lower() if r.purchase_record else ""
            gstin_2b = r.gstr2b_record.supplier_gstin.lower() if r.gstr2b_record else ""
            if q in inv_pr or q in inv_2b or q in gstin_pr or q in gstin_2b:
                filtered.append(r)
        results = filtered

    return results


def serialize_proposal(prop: ReconciliationProposal, db: Session) -> ProposalSchema:
    meta = prop.model_metadata or {}
    source_pr = db.query(PurchaseRecord).filter(PurchaseRecord.id == prop.source_record_id).first() if prop.source_record_type == "purchase_record" else None
    cand_2b = db.query(Gstr2bRecord).filter(Gstr2bRecord.id == prop.candidate_record_id).first()
    audit_logs = db.query(ProposalAuditLog).filter(ProposalAuditLog.proposal_id == prop.id).order_by(ProposalAuditLog.created_at.asc()).all()

    conf_score = meta.get("confidence_score")
    if conf_score is None:
        if prop.confidence == "HIGH":
            conf_score = 0.95
        elif prop.confidence == "MEDIUM":
            conf_score = 0.75
        elif prop.confidence == "LOW":
            conf_score = 0.40
        else:
            conf_score = 0.15

    return ProposalSchema(
        id=prop.id,
        job_id=prop.job_id,
        result_id=prop.result_id,
        source_record_type=prop.source_record_type,
        source_record_id=prop.source_record_id,
        candidate_record_id=prop.candidate_record_id,
        assessment_status=prop.assessment_status,
        confidence=prop.confidence,
        confidence_score=conf_score,
        reasoning=prop.reasoning,
        conflicting_evidence=prop.conflicting_evidence,
        field_comparison=meta.get("field_comparison"),
        requires_human_review=meta.get("requires_human_review", True),
        model_metadata=meta,
        created_at=prop.created_at,
        source_record=RecordSchema.model_validate(source_pr) if source_pr else None,
        candidate_record=RecordSchema.model_validate(cand_2b) if cand_2b else None,
        audit_logs=[ProposalAuditLogSchema.model_validate(a) for a in audit_logs],
    )


@router.get("/{job_id}/proposals", response_model=List[ProposalSchema])
def get_reconciliation_proposals_endpoint(
    job_id: str,
    db: Session = Depends(get_db),
):
    """
    Fetches AI-assisted candidate proposals for ambiguous or unresolved records,
    enriched with linked source and candidate records for side-by-side review.
    """
    job = db.query(ReconciliationJob).filter(ReconciliationJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reconciliation job '{job_id}' not found.",
        )

    proposals = (
        db.query(ReconciliationProposal)
        .filter(ReconciliationProposal.job_id == job_id)
        .order_by(ReconciliationProposal.id)
        .all()
    )
    return [serialize_proposal(p, db) for p in proposals]


@router.post("/{job_id}/proposals/{proposal_id}/review", response_model=ProposalReviewResponse)
def review_proposal_endpoint(
    job_id: str,
    proposal_id: str,
    request: ProposalReviewRequest,
    db: Session = Depends(get_db),
):
    """
    Explicit human review workflow:
    - User confirms or rejects the proposed AI match.
    - If CONFIRM_MATCH:
        - Links source PR record and candidate GSTR-2B record in authoritative results.
        - Updates status to MATCHED (or MISMATCH if monetary diffs exist).
        - Merges/removes any unlinked single-side result.
        - Persists decision in ProposalAuditLog and updates proposal assessment_status to CONFIRMED.
    - If REJECT_MATCH:
        - Sets proposal assessment_status to USER_REJECTED.
        - Persists decision in ProposalAuditLog.
        - Authoritative results remain unchanged.
    """
    proposal = db.query(ReconciliationProposal).filter(
        ReconciliationProposal.id == proposal_id,
        ReconciliationProposal.job_id == job_id
    ).first()
    if not proposal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    action = request.action.upper()
    if action not in ("CONFIRM_MATCH", "REJECT_MATCH"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Action must be either CONFIRM_MATCH or REJECT_MATCH."
        )

    pr = db.query(PurchaseRecord).filter(PurchaseRecord.id == proposal.source_record_id).first()
    twob = db.query(Gstr2bRecord).filter(Gstr2bRecord.id == proposal.candidate_record_id).first()

    if action == "CONFIRM_MATCH":
        proposal.assessment_status = "CONFIRMED"

        # 1. Check if candidate 2B already had a standalone MISSING_IN_PURCHASE_REGISTER result
        existing_twob_result = db.query(ReconciliationResult).filter(
            ReconciliationResult.job_id == job_id,
            ReconciliationResult.gstr2b_record_id == proposal.candidate_record_id,
            ReconciliationResult.purchase_record_id.is_(None)
        ).first()
        if existing_twob_result:
            db.delete(existing_twob_result)

        # 2. Find or create the PR result
        pr_result = None
        if proposal.result_id:
            pr_result = db.query(ReconciliationResult).filter(ReconciliationResult.id == proposal.result_id).first()
        if not pr_result:
            pr_result = db.query(ReconciliationResult).filter(
                ReconciliationResult.job_id == job_id,
                ReconciliationResult.purchase_record_id == proposal.source_record_id
            ).first()

        if pr_result and pr and twob:
            pr_result.gstr2b_record_id = twob.id
            diffs = {}
            if pr.invoice_date != twob.invoice_date:
                diffs["invoice_date"] = {
                    "pr_value": str(pr.invoice_date),
                    "gstr2b_value": str(twob.invoice_date),
                    "difference": "Date mismatch",
                }
            taxable_diff = pr.taxable_value - twob.taxable_value
            if abs(taxable_diff) > Decimal("1.00"):
                diffs["taxable_value"] = {
                    "pr_value": f"{pr.taxable_value:.2f}",
                    "gstr2b_value": f"{twob.taxable_value:.2f}",
                    "difference": f"{taxable_diff:.2f}",
                }
            cgst_diff = pr.cgst - twob.cgst
            if abs(cgst_diff) > Decimal("1.00"):
                diffs["cgst"] = {
                    "pr_value": f"{pr.cgst:.2f}",
                    "gstr2b_value": f"{twob.cgst:.2f}",
                    "difference": f"{cgst_diff:.2f}",
                }
            sgst_diff = pr.sgst - twob.sgst
            if abs(sgst_diff) > Decimal("1.00"):
                diffs["sgst"] = {
                    "pr_value": f"{pr.sgst:.2f}",
                    "gstr2b_value": f"{twob.sgst:.2f}",
                    "difference": f"{sgst_diff:.2f}",
                }
            igst_diff = pr.igst - twob.igst
            if abs(igst_diff) > Decimal("1.00"):
                diffs["igst"] = {
                    "pr_value": f"{pr.igst:.2f}",
                    "gstr2b_value": f"{twob.igst:.2f}",
                    "difference": f"{igst_diff:.2f}",
                }

            pr_result.differences = diffs
            pr_result.status = "MATCHED" if len(diffs) == 0 else "MISMATCH"
            pr_result.ambiguity_metadata = {
                "manually_confirmed": True,
                "ai_matched": True,
                "proposal_id": proposal.id,
                "confirmed_by": request.reviewer_name or "Accountant",
                "confirmed_at": datetime.now(timezone.utc).isoformat(),
                "notes": request.notes,
            }

        # Add Audit Log
        audit = ProposalAuditLog(
            job_id=job_id,
            proposal_id=proposal.id,
            action="CONFIRM_MATCH",
            reviewed_by=request.reviewer_name or "Accountant",
            notes=request.notes,
        )
        db.add(audit)
        db.commit()
        db.refresh(proposal)
        msg = f"Match confirmed between invoice {pr.invoice_number if pr else ''} and {twob.invoice_number if twob else ''}."

    else:  # REJECT_MATCH
        proposal.assessment_status = "USER_REJECTED"
        audit = ProposalAuditLog(
            job_id=job_id,
            proposal_id=proposal.id,
            action="REJECT_MATCH",
            reviewed_by=request.reviewer_name or "Accountant",
            notes=request.notes,
        )
        db.add(audit)
        db.commit()
        db.refresh(proposal)
        msg = "Suggested match rejected. Records remain unlinked."

    # Recalculate job summary
    results = db.query(ReconciliationResult).filter(ReconciliationResult.job_id == job_id).all()
    matched = sum(1 for r in results if r.status == "MATCHED")
    mismatched = sum(1 for r in results if r.status == "MISMATCH")
    missing_2b = sum(1 for r in results if r.status == "MISSING_IN_GSTR2B")
    missing_pr = sum(1 for r in results if r.status == "MISSING_IN_PURCHASE_REGISTER")
    ambiguous = sum(1 for r in results if r.status == "DUPLICATE_AMBIGUOUS")
    updated_summary = ReconciliationSummarySchema(
        total_results=len(results),
        matched=matched,
        mismatched=mismatched,
        missing_in_gstr2b=missing_2b,
        missing_in_purchase_register=missing_pr,
        duplicate_ambiguous=ambiguous,
        total_missing=missing_2b + missing_pr,
    )

    return ProposalReviewResponse(
        success=True,
        message=msg,
        proposal=serialize_proposal(proposal, db),
        updated_summary=updated_summary,
    )


@router.get("/{job_id}/results/{result_id}/explanation", response_model=DiscrepancyExplanationResponse)
def get_result_explanation_endpoint(
    job_id: str,
    result_id: str,
    db: Session = Depends(get_db),
):
    """Returns a simple plain-English explanation for an invoice discrepancy."""
    res = db.query(ReconciliationResult).filter(
        ReconciliationResult.id == result_id,
        ReconciliationResult.job_id == job_id,
    ).options(
        joinedload(ReconciliationResult.purchase_record),
        joinedload(ReconciliationResult.gstr2b_record),
    ).first()
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found.")

    explanation = generate_discrepancy_explanation(res)
    return DiscrepancyExplanationResponse(**explanation)


@router.get("/jobs/{job_id}/records")
def get_job_records(job_id: str, db: Session = Depends(get_db)):
    """Fetch parsed records associated with a reconciliation job."""
    job = db.query(ReconciliationJob).filter(ReconciliationJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Reconciliation job '{job_id}' not found."
        )

    purchase_records = db.query(PurchaseRecord).filter(PurchaseRecord.job_id == job_id).all()
    gstr2b_records = db.query(Gstr2bRecord).filter(Gstr2bRecord.job_id == job_id).all()

    return {
        "job_id": job.id,
        "status": job.status,
        "purchase_records": [
            {
                "id": r.id,
                "supplier_gstin": r.supplier_gstin,
                "invoice_number": r.invoice_number,
                "invoice_date": str(r.invoice_date),
                "taxable_value": float(r.taxable_value),
                "cgst": float(r.cgst),
                "sgst": float(r.sgst),
                "igst": float(r.igst),
            }
            for r in purchase_records
        ],
        "gstr2b_records": [
            {
                "id": r.id,
                "supplier_gstin": r.supplier_gstin,
                "invoice_number": r.invoice_number,
                "invoice_date": str(r.invoice_date),
                "taxable_value": float(r.taxable_value),
                "cgst": float(r.cgst),
                "sgst": float(r.sgst),
                "igst": float(r.igst),
            }
            for r in gstr2b_records
        ],
    }


# ==============================================================================
# Vendor Communication & Notice Dispatch Endpoints
# ==============================================================================

@router.get("/vendor-communications", response_model=List[VendorActionInvoiceItem])
def get_vendor_communications_endpoint(
    job_id: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Fetches real reconciliation results requiring vendor clarification or notice dispatch
    for the selected or latest reconciliation job, enriched with vendor contacts and communication history.
    """
    effective_job_id = job_id
    if not effective_job_id:
        latest_job = db.query(ReconciliationJob).order_by(ReconciliationJob.created_at.desc()).first()
        if not latest_job:
            return []
        effective_job_id = latest_job.id

    # STRICT GATING: ONLY discrepancies classified as MAJOR and explicitly verified
    # by a human reviewer as REQUIRES_VENDOR_CORRECTION may appear in Vendor Communication.
    results = (
        db.query(ReconciliationResult)
        .join(DiscrepancyItem, ReconciliationResult.id == DiscrepancyItem.result_id)
        .options(
            joinedload(ReconciliationResult.purchase_record),
            joinedload(ReconciliationResult.gstr2b_record),
            joinedload(ReconciliationResult.discrepancy_item),
            selectinload(ReconciliationResult.vendor_communications),
        )
        .filter(
            ReconciliationResult.job_id == effective_job_id,
            DiscrepancyItem.severity == "MAJOR",
            DiscrepancyItem.verification_status == "REQUIRES_VENDOR_CORRECTION",
        )
        .order_by(ReconciliationResult.created_at.asc())
        .all()
    )

    items: List[VendorActionInvoiceItem] = []
    for r in results:
        pr = r.purchase_record
        twob = r.gstr2b_record

        supplier_gstin = pr.supplier_gstin if pr else (twob.supplier_gstin if twob else "")
        inv_number = pr.invoice_number if pr else (twob.invoice_number if twob else "N/A")
        inv_date_str = str(pr.invoice_date) if pr else (str(twob.invoice_date) if twob else "")

        # Look up stored vendor contact
        contact = None
        if supplier_gstin:
            contact = db.query(VendorContact).filter(VendorContact.supplier_gstin == supplier_gstin).first()

        supplier_name = (
            contact.supplier_name
            if (contact and contact.supplier_name)
            else f"Supplier ({supplier_gstin})"
        )
        vendor_email = contact.email if (contact and contact.email) else None

        # Values & Tax calculation
        pr_tax = float(pr.cgst + pr.sgst + pr.igst) if pr else 0.0
        twob_tax = float(twob.cgst + twob.sgst + twob.igst) if twob else 0.0
        total_tax = pr_tax if pr else twob_tax
        total_val = float(pr.taxable_value) if pr else (float(twob.taxable_value) if twob else 0.0)

        # Discrepancy Amount
        if r.status == "MISSING_IN_GSTR2B":
            diff_amount = pr_tax  # Full tax credit is blocked
        elif r.status == "MISMATCH":
            diff_amount = abs(pr_tax - twob_tax)
            if diff_amount == 0.0 and pr and twob:
                diff_amount = abs(float(pr.taxable_value) - float(twob.taxable_value))
        elif r.status == "DUPLICATE_AMBIGUOUS":
            diff_amount = pr_tax
        else:
            diff_amount = twob_tax

        explanation = generate_discrepancy_explanation(r)
        reason = explanation.get("summary", "Discrepancy identified between accounting books and GSTR-2B.")

        recommended_action = "Review invoice records with supplier."
        if r.status == "MISSING_IN_GSTR2B":
            recommended_action = "Upload to GSTR-1 prior to the 11th to unblock Input Tax Credit under Section 16(2)(aa)."
        elif r.status == "MISMATCH":
            recommended_action = "Report Table 9 amendment in upcoming GSTR-1 filing to correct tax mismatch."
        elif r.status == "DUPLICATE_AMBIGUOUS":
            recommended_action = "Verify invoice entry and confirm genuine commercial transaction."

        severity = "major" if (diff_amount >= 1000.0 or r.status in ("MISSING_IN_GSTR2B", "MISMATCH")) else "minor"

        # Communication status from persisted communications
        latest_comm = None
        comm_status = "not_contacted"
        if r.vendor_communications:
            # Sort newest first
            sorted_comms = sorted(r.vendor_communications, key=lambda c: c.created_at, reverse=True)
            latest_comm = sorted_comms[0]
            comm_status = latest_comm.status.lower()

        # If latest communication has a recipient email, use that
        if latest_comm and latest_comm.recipient_email:
            vendor_email = latest_comm.recipient_email

        items.append(
            VendorActionInvoiceItem(
                id=r.id,
                result_id=r.id,
                job_id=effective_job_id,
                discrepancy_status=r.status,
                supplier_name=supplier_name,
                supplier_gstin=supplier_gstin,
                invoice_number=inv_number,
                invoice_date=inv_date_str,
                total_value=total_val,
                total_tax=total_tax,
                difference_amount=diff_amount,
                reason=reason,
                recommended_action=recommended_action,
                severity=severity,
                vendor_communication_status=comm_status,
                vendor_email=vendor_email,
                purchase_record=RecordSchema.model_validate(pr) if pr else None,
                gstr2b_record=RecordSchema.model_validate(twob) if twob else None,
                latest_communication=VendorCommunicationSchema.model_validate(latest_comm) if latest_comm else None,
            )
        )

    return items


@router.get("/vendor-communications/{result_id}/history", response_model=List[VendorCommunicationSchema])
def get_vendor_communication_history_endpoint(
    result_id: str,
    db: Session = Depends(get_db),
):
    """Fetches communication log history for a specific reconciliation result."""
    comms = (
        db.query(VendorCommunication)
        .filter(VendorCommunication.result_id == result_id)
        .order_by(VendorCommunication.created_at.desc())
        .all()
    )
    return [VendorCommunicationSchema.model_validate(c) for c in comms]


@router.post("/vendor-communications/{result_id}/draft", response_model=VendorCommunicationSchema)
def save_vendor_communication_draft_endpoint(
    result_id: str,
    request: SaveNoticeDraftRequest,
    db: Session = Depends(get_db),
):
    """Saves or updates a notice draft for an invoice discrepancy."""
    result = db.query(ReconciliationResult).filter(ReconciliationResult.id == result_id).first()
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reconciliation result '{result_id}' not found.",
        )

    # STRICT GATING: Vendor notices can ONLY be drafted for discrepancies verified as requiring vendor correction
    disc_item = db.query(DiscrepancyItem).filter(DiscrepancyItem.result_id == result.id).first()
    if not disc_item or disc_item.severity != "MAJOR" or disc_item.verification_status != "REQUIRES_VENDOR_CORRECTION":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Vendor communication is restricted to discrepancies classified as MAJOR "
                "and explicitly verified by a human reviewer as requiring vendor correction."
            ),
        )

    pr = result.purchase_record
    twob = result.gstr2b_record
    supplier_gstin = pr.supplier_gstin if pr else (twob.supplier_gstin if twob else "")

    # Look for existing draft
    existing_draft = (
        db.query(VendorCommunication)
        .filter(
            VendorCommunication.result_id == result.id,
            VendorCommunication.status == "DRAFT"
        )
        .first()
    )

    clean_to = request.recipient_email.strip()
    clean_cc = request.cc_email.strip() if request.cc_email else None

    if existing_draft:
        existing_draft.recipient_email = clean_to
        existing_draft.cc_email = clean_cc
        existing_draft.subject = request.subject.strip()
        existing_draft.body = request.body
        existing_draft.template_type = request.template_type
        if request.supplier_name:
            existing_draft.supplier_name = request.supplier_name.strip()
        existing_draft.updated_at = datetime.now(timezone.utc)
        comm = existing_draft
    else:
        comm = VendorCommunication(
            job_id=result.job_id,
            result_id=result.id,
            supplier_gstin=supplier_gstin,
            supplier_name=request.supplier_name.strip() if request.supplier_name else None,
            recipient_email=clean_to,
            cc_email=clean_cc,
            subject=request.subject.strip(),
            body=request.body,
            template_type=request.template_type,
            status="DRAFT",
            sending_mode="test" if config.SMTP_TEST_MODE else "live",
        )
        db.add(comm)

    # Persist or update vendor contact details if email provided
    if supplier_gstin and clean_to:
        contact = db.query(VendorContact).filter(VendorContact.supplier_gstin == supplier_gstin).first()
        if not contact:
            contact = VendorContact(
                supplier_gstin=supplier_gstin,
                supplier_name=request.supplier_name.strip() if request.supplier_name else None,
                email=clean_to,
            )
            db.add(contact)
        else:
            contact.email = clean_to
            if request.supplier_name:
                contact.supplier_name = request.supplier_name.strip()

    db.commit()
    db.refresh(comm)
    return VendorCommunicationSchema.model_validate(comm)


@router.post("/vendor-communications/{result_id}/send", response_model=SendNoticeResponse)
def send_vendor_communication_endpoint(
    result_id: str,
    request: SendNoticeRequest,
    db: Session = Depends(get_db),
):
    """
    Dispatches a GST discrepancy notice via SMTP adhering strictly to test-mode rules.
    Persists communication outcome as SENT or FAILED in the audit log.
    """
    result = db.query(ReconciliationResult).filter(ReconciliationResult.id == result_id).first()
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reconciliation result '{result_id}' not found.",
        )

    # STRICT GATING: Vendor notices can ONLY be drafted for discrepancies verified as requiring vendor correction
    disc_item = db.query(DiscrepancyItem).filter(DiscrepancyItem.result_id == result.id).first()
    if not disc_item or disc_item.severity != "MAJOR" or disc_item.verification_status != "REQUIRES_VENDOR_CORRECTION":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Vendor communication is restricted to discrepancies classified as MAJOR "
                "and explicitly verified by a human reviewer as requiring vendor correction."
            ),
        )

    clean_to = request.recipient_email.strip()
    clean_cc = request.cc_email.strip() if request.cc_email else None

    # First check test mode policy before attempting connection
    is_valid, validation_err = validate_recipient(clean_to)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=validation_err,
        )

    pr = result.purchase_record
    twob = result.gstr2b_record
    supplier_gstin = pr.supplier_gstin if pr else (twob.supplier_gstin if twob else "")

    # Attempt transmission via SMTP service
    success, status_msg, message_id = send_email_smtp(
        recipient=clean_to,
        subject=request.subject.strip(),
        body=request.body,
        cc=clean_cc,
    )

    sending_mode = "test" if config.SMTP_TEST_MODE else "live"
    comm_status = "SENT" if success else "FAILED"

    # Persist record in communication history
    comm = VendorCommunication(
        job_id=result.job_id,
        result_id=result.id,
        supplier_gstin=supplier_gstin,
        supplier_name=request.supplier_name.strip() if request.supplier_name else None,
        recipient_email=clean_to,
        cc_email=clean_cc,
        subject=request.subject.strip(),
        body=request.body,
        template_type=request.template_type,
        status=comm_status,
        sending_mode=sending_mode,
        error_message=None if success else status_msg,
        sent_at=datetime.now(timezone.utc) if success else None,
    )
    db.add(comm)

    # If successfully sent, update supplier contact email in master
    if success and supplier_gstin and clean_to:
        contact = db.query(VendorContact).filter(VendorContact.supplier_gstin == supplier_gstin).first()
        if not contact:
            contact = VendorContact(
                supplier_gstin=supplier_gstin,
                supplier_name=request.supplier_name.strip() if request.supplier_name else None,
                email=clean_to,
            )
            db.add(contact)
        else:
            contact.email = clean_to
            if request.supplier_name:
                contact.supplier_name = request.supplier_name.strip()

    db.commit()
    db.refresh(comm)

    if not success:
        logger.warning("Vendor notice delivery failed for result %s: %s", result_id, status_msg)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Email dispatch failed: {status_msg}",
        )

    return SendNoticeResponse(
        success=True,
        message=f"Notice successfully dispatched to {clean_to}.",
        communication=VendorCommunicationSchema.model_validate(comm),
        smtp_mode=sending_mode,
    )


@router.get("/smtp/status", response_model=SmtpConfigResponse)
def get_smtp_status_endpoint():
    """Returns safe diagnostics about the active SMTP email configuration."""
    return SmtpConfigResponse(**config.get_safe_smtp_config())


@router.get("/vendor-contacts", response_model=List[VendorContactSchema])
def get_vendor_contacts_endpoint(db: Session = Depends(get_db)):
    """Lists all stored vendor contacts."""
    contacts = db.query(VendorContact).order_by(VendorContact.supplier_gstin.asc()).all()
    return [VendorContactSchema.model_validate(c) for c in contacts]


@router.post("/vendor-contacts", response_model=VendorContactSchema)
def upsert_vendor_contact_endpoint(
    request: VendorContactUpsertRequest,
    db: Session = Depends(get_db),
):
    """Creates or updates contact details for a supplier GSTIN."""
    clean_gstin = request.supplier_gstin.strip().upper()
    contact = db.query(VendorContact).filter(VendorContact.supplier_gstin == clean_gstin).first()
    if not contact:
        contact = VendorContact(
            supplier_gstin=clean_gstin,
            supplier_name=request.supplier_name.strip() if request.supplier_name else None,
            email=request.email.strip() if request.email else None,
            phone=request.phone.strip() if request.phone else None,
            contact_person=request.contact_person.strip() if request.contact_person else None,
            notes=request.notes.strip() if request.notes else None,
        )
        db.add(contact)
    else:
        if request.supplier_name is not None:
            contact.supplier_name = request.supplier_name.strip()
        if request.email is not None:
            contact.email = request.email.strip()
        if request.phone is not None:
            contact.phone = request.phone.strip()
        if request.contact_person is not None:
            contact.contact_person = request.contact_person.strip()
        if request.notes is not None:
            contact.notes = request.notes.strip()

    db.commit()
    db.refresh(contact)
    return VendorContactSchema.model_validate(contact)


# ==============================================================================
# Discrepancy Analysis & Human Verification Endpoints
# ==============================================================================

@router.get("/jobs/{job_id}/discrepancies", response_model=List[DiscrepancyItemSchema])
def get_job_discrepancies_endpoint(
    job_id: str,
    severity: Optional[str] = None,
    verification_status: Optional[str] = None,
    requires_vendor_action: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    """
    Returns all discrepancy items for a job, optionally filtered by severity or verification status.
    Each item is populated with purchase and GSTR-2B details, supplier metadata, and audit logs.
    """
    query = (
        db.query(DiscrepancyItem)
        .options(
            joinedload(DiscrepancyItem.result).joinedload(ReconciliationResult.purchase_record),
            joinedload(DiscrepancyItem.result).joinedload(ReconciliationResult.gstr2b_record),
            selectinload(DiscrepancyItem.audit_logs),
        )
        .filter(DiscrepancyItem.job_id == job_id)
    )

    if severity:
        query = query.filter(DiscrepancyItem.severity == severity.strip().upper())
    if verification_status:
        query = query.filter(DiscrepancyItem.verification_status == verification_status.strip().upper())
    if requires_vendor_action is not None:
        query = query.filter(DiscrepancyItem.requires_vendor_action == requires_vendor_action)

    items = query.order_by(DiscrepancyItem.created_at.desc()).all()

    schemas = []
    for it in items:
        res = it.result
        pr = res.purchase_record if res else None
        twob = res.gstr2b_record if res else None

        gstin = pr.supplier_gstin if pr else (twob.supplier_gstin if twob else "")
        inv_num = pr.invoice_number if pr else (twob.invoice_number if twob else "N/A")
        inv_date = str(pr.invoice_date) if pr else (str(twob.invoice_date) if twob else "")

        contact = db.query(VendorContact).filter(VendorContact.supplier_gstin == gstin).first() if gstin else None
        supplier_name = contact.supplier_name if (contact and contact.supplier_name) else (f"Supplier ({gstin})" if gstin else "Unknown Supplier")

        schema_obj = DiscrepancyItemSchema.model_validate(it)
        schema_obj.supplier_gstin = gstin
        schema_obj.supplier_name = supplier_name
        schema_obj.invoice_number = inv_num
        schema_obj.invoice_date = inv_date
        schema_obj.purchase_record = RecordSchema.model_validate(pr) if pr else None
        schema_obj.gstr2b_record = RecordSchema.model_validate(twob) if twob else None
        schema_obj.audit_logs = [DiscrepancyAuditLogSchema.model_validate(log) for log in it.audit_logs] if it.audit_logs else []
        schemas.append(schema_obj)

    return schemas


@router.get("/jobs/{job_id}/discrepancies/summary", response_model=DiscrepancySummarySchema)
def get_job_discrepancy_summary_endpoint(
    job_id: str,
    db: Session = Depends(get_db),
):
    """Returns summary count statistics for human verifier dashboard."""
    summary = get_job_discrepancy_summary(db, job_id)
    return DiscrepancySummarySchema(**summary)


@router.get("/discrepancies/{discrepancy_id}", response_model=DiscrepancyItemSchema)
def get_discrepancy_item_endpoint(
    discrepancy_id: str,
    db: Session = Depends(get_db),
):
    """Fetches a single discrepancy item with its complete audit history."""
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Discrepancy item '{discrepancy_id}' not found.",
        )

    res = item.result
    pr = res.purchase_record if res else None
    twob = res.gstr2b_record if res else None

    gstin = pr.supplier_gstin if pr else (twob.supplier_gstin if twob else "")
    inv_num = pr.invoice_number if pr else (twob.invoice_number if twob else "N/A")
    inv_date = str(pr.invoice_date) if pr else (str(twob.invoice_date) if twob else "")

    contact = db.query(VendorContact).filter(VendorContact.supplier_gstin == gstin).first() if gstin else None
    supplier_name = contact.supplier_name if (contact and contact.supplier_name) else (f"Supplier ({gstin})" if gstin else "Unknown Supplier")

    schema_obj = DiscrepancyItemSchema.model_validate(item)
    schema_obj.supplier_gstin = gstin
    schema_obj.supplier_name = supplier_name
    schema_obj.invoice_number = inv_num
    schema_obj.invoice_date = inv_date
    schema_obj.purchase_record = RecordSchema.model_validate(pr) if pr else None
    schema_obj.gstr2b_record = RecordSchema.model_validate(twob) if twob else None
    schema_obj.audit_logs = [DiscrepancyAuditLogSchema.model_validate(log) for log in item.audit_logs] if item.audit_logs else []
    return schema_obj


@router.post("/discrepancies/{discrepancy_id}/verify", response_model=DiscrepancyVerificationResponse)
def verify_discrepancy_endpoint(
    discrepancy_id: str,
    request: DiscrepancyVerificationRequest,
    db: Session = Depends(get_db),
):
    """
    Submits a human verification decision on a discrepancy item.
    Enforces business rules (e.g. only MAJOR items may require vendor correction)
    and records an immutable audit log entry.
    """
    try:
        updated_item = verify_discrepancy_item(
            db=db,
            discrepancy_id=discrepancy_id,
            action=request.action,
            reviewer_name=request.reviewer_name or "Reviewer",
            comments=request.comments,
            override_severity=request.override_severity,
            requires_vendor_action=request.requires_vendor_action,
        )
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    res = updated_item.result
    pr = res.purchase_record if res else None
    twob = res.gstr2b_record if res else None

    gstin = pr.supplier_gstin if pr else (twob.supplier_gstin if twob else "")
    inv_num = pr.invoice_number if pr else (twob.invoice_number if twob else "N/A")
    inv_date = str(pr.invoice_date) if pr else (str(twob.invoice_date) if twob else "")

    contact = db.query(VendorContact).filter(VendorContact.supplier_gstin == gstin).first() if gstin else None
    supplier_name = contact.supplier_name if (contact and contact.supplier_name) else (f"Supplier ({gstin})" if gstin else "Unknown Supplier")

    schema_obj = DiscrepancyItemSchema.model_validate(updated_item)
    schema_obj.supplier_gstin = gstin
    schema_obj.supplier_name = supplier_name
    schema_obj.invoice_number = inv_num
    schema_obj.invoice_date = inv_date
    schema_obj.purchase_record = RecordSchema.model_validate(pr) if pr else None
    schema_obj.gstr2b_record = RecordSchema.model_validate(twob) if twob else None
    schema_obj.audit_logs = [DiscrepancyAuditLogSchema.model_validate(log) for log in updated_item.audit_logs] if updated_item.audit_logs else []

    return DiscrepancyVerificationResponse(
        success=True,
        message=f"Discrepancy action '{request.action}' executed successfully.",
        discrepancy=schema_obj,
    )


@router.post("/jobs/{job_id}/analyze-discrepancies")
def analyze_job_discrepancies_endpoint(
    job_id: str,
    db: Session = Depends(get_db),
):
    """
    Re-runs deterministic discrepancy analysis and populates DiscrepancyItems for the specified job.
    """
    job = db.query(ReconciliationJob).filter(ReconciliationJob.id == job_id).first()
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reconciliation job '{job_id}' not found.",
        )

    items = populate_job_discrepancies(db, job_id)
    summary = get_job_discrepancy_summary(db, job_id)
    return {
        "success": True,
        "job_id": job_id,
        "discrepancies_count": len(items),
        "summary": summary,
    }


