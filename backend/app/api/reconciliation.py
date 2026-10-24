import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import config
from ..database import get_db
from ..models import (
    Gstr2bRecord, 
    PurchaseRecord, 
    ReconciliationJob, 
    ReconciliationProposal, 
    ReconciliationResult
)
from ..parsers import parse_file
from ..schemas import (
    JobDetailResponse,
    ProposalSchema,
    ReconciliationResultSchema,
    ReconciliationRunRequest,
    ReconciliationRunResponse,
    ReconciliationSummarySchema,
    UploadErrorResponse,
    UploadSuccessResponse,
    UploadSummary,
    ValidationErrorItem,
)
from ..services.ai_service import run_ai_assisted_matching
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
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Fetches stored reconciliation results for the given job.
    Includes linked source records and AI proposals where available.
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


@router.get("/{job_id}/proposals", response_model=List[ProposalSchema])
def get_reconciliation_proposals_endpoint(
    job_id: str,
    db: Session = Depends(get_db),
):
    """
    Fetches AI-assisted candidate proposals for ambiguous or unresolved records.
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
    return proposals


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
