import logging
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models import Gstr2bRecord, PurchaseRecord, ReconciliationJob
from ..parsers import parse_file
from ..schemas import (
    JobDetailResponse,
    UploadErrorResponse,
    UploadSuccessResponse,
    UploadSummary,
    ValidationErrorItem,
)

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

    return JobDetailResponse(
        id=job.id,
        created_at=job.created_at,
        status=job.status,
        purchase_records_count=pr_count,
        gstr2b_records_count=gstr2b_count,
    )


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
