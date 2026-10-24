from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_serializer


class ValidationErrorItem(BaseModel):
    file_type: str
    row: Optional[int] = None
    field: Optional[str] = None
    reason: str


class UploadSummary(BaseModel):
    purchase_register_count: int
    gstr2b_count: int
    total_records: int


class UploadSuccessResponse(BaseModel):
    success: bool = True
    job_id: str
    message: str
    summary: UploadSummary


class UploadErrorResponse(BaseModel):
    success: bool = False
    message: str
    errors: List[ValidationErrorItem]


class RecordSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: str
    supplier_gstin: str
    invoice_number: str
    invoice_date: date
    taxable_value: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal

    @field_serializer("taxable_value", "cgst", "sgst", "igst", when_used="json")
    def serialize_decimal(self, v: Decimal) -> str:
        return f"{v:.2f}"


class JobDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    status: str
    purchase_records_count: int
    gstr2b_records_count: int
    summary: Optional["ReconciliationSummarySchema"] = None


class ProposalSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    result_id: Optional[str] = None
    source_record_type: str
    source_record_id: int
    candidate_record_id: int
    assessment_status: str
    confidence: Optional[str] = None
    reasoning: str
    conflicting_evidence: Optional[str] = None
    model_metadata: Optional[dict] = None
    created_at: datetime


class ReconciliationResultSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    purchase_record_id: Optional[int] = None
    gstr2b_record_id: Optional[int] = None
    status: str
    differences: dict
    ambiguity_metadata: Optional[dict] = None
    created_at: datetime
    updated_at: datetime
    purchase_record: Optional[RecordSchema] = None
    gstr2b_record: Optional[RecordSchema] = None
    proposals: List[ProposalSchema] = []


class ReconciliationSummarySchema(BaseModel):
    total_results: int
    matched: int
    mismatched: int
    missing_in_gstr2b: int
    missing_in_purchase_register: int
    duplicate_ambiguous: int
    total_missing: int


class ReconciliationRunResponse(BaseModel):
    success: bool = True
    job_id: str
    status: str
    summary: ReconciliationSummarySchema
    ai_assessment_summary: Optional[dict] = None
    message: str


class ReconciliationRunRequest(BaseModel):
    tolerance: Optional[Decimal] = None
    run_ai_matching: Optional[bool] = True
