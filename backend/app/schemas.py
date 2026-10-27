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


class ProposalAuditLogSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    proposal_id: str
    action: str
    reviewed_by: str
    notes: Optional[str] = None
    created_at: datetime


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
    confidence_score: Optional[float] = None
    reasoning: str
    conflicting_evidence: Optional[str] = None
    field_comparison: Optional[dict] = None
    requires_human_review: bool = True
    model_metadata: Optional[dict] = None
    created_at: datetime
    source_record: Optional[RecordSchema] = None
    candidate_record: Optional[RecordSchema] = None
    audit_logs: List[ProposalAuditLogSchema] = []


class ProposalReviewRequest(BaseModel):
    action: str  # 'CONFIRM_MATCH' or 'REJECT_MATCH'
    reviewer_name: Optional[str] = "Accountant"
    notes: Optional[str] = None


class ProposalReviewResponse(BaseModel):
    success: bool = True
    message: str
    proposal: ProposalSchema
    updated_summary: Optional["ReconciliationSummarySchema"] = None


class DiscrepancyExplanationResponse(BaseModel):
    result_id: str
    summary: str
    details: List[str] = []



class ReconciliationResultSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    purchase_record_id: Optional[int] = None
    gstr2b_record_id: Optional[int] = None
    status: str
    severity: str = "UNCLASSIFIED"
    severity_reason: Optional[str] = None
    discrepancy_details: Optional[dict] = None
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
    major_discrepancies: int = 0
    minor_discrepancies: int = 0
    none_count: int = 0
    unclassified_count: int = 0


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


# ==============================================================================
# Vendor Communication & Contact Schemas
# ==============================================================================

class VendorContactSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    supplier_gstin: str
    supplier_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_person: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class VendorContactUpsertRequest(BaseModel):
    supplier_gstin: str
    supplier_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_person: Optional[str] = None
    notes: Optional[str] = None


class VendorCommunicationSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    result_id: str
    supplier_gstin: str
    supplier_name: Optional[str] = None
    recipient_email: str
    cc_email: Optional[str] = None
    subject: str
    body: str
    template_type: str
    status: str  # 'DRAFT', 'SENT', 'FAILED'
    sending_mode: str  # 'test', 'live'
    error_message: Optional[str] = None
    sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class VendorActionInvoiceItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str  # Maps to result_id for seamless UI selection
    result_id: str
    job_id: str
    discrepancy_status: str  # MISSING_IN_GSTR2B, MISMATCH, DUPLICATE_AMBIGUOUS, etc.
    supplier_name: str
    supplier_gstin: str
    invoice_number: str
    invoice_date: str
    total_value: float
    total_tax: float
    difference_amount: float
    reason: str
    recommended_action: str
    severity: str  # 'major', 'minor'
    vendor_communication_status: str  # 'not_contacted', 'draft', 'sent', 'failed'
    vendor_email: Optional[str] = None
    purchase_record: Optional[RecordSchema] = None
    gstr2b_record: Optional[RecordSchema] = None
    latest_communication: Optional[VendorCommunicationSchema] = None


class SaveNoticeDraftRequest(BaseModel):
    recipient_email: str
    cc_email: Optional[str] = None
    subject: str
    body: str
    template_type: str = "standard"
    supplier_name: Optional[str] = None


class SendNoticeRequest(BaseModel):
    recipient_email: str
    cc_email: Optional[str] = None
    subject: str
    body: str
    template_type: str = "standard"
    supplier_name: Optional[str] = None


class SendNoticeResponse(BaseModel):
    success: bool
    message: str
    communication: VendorCommunicationSchema
    smtp_mode: str  # 'test' or 'live'


class SmtpConfigResponse(BaseModel):
    enabled: bool
    test_mode: bool
    test_recipient: str
    allowed_recipients: List[str]
    from_email: str
    from_name: str
    host: str
    port: int
    use_tls: bool
    has_credentials: bool


# ==============================================================================
# Discrepancy Analysis & Human Verification Schemas
# ==============================================================================

class DiscrepancyAuditLogSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    discrepancy_id: str
    job_id: str
    action: str
    previous_status: Optional[str] = None
    new_status: Optional[str] = None
    previous_severity: Optional[str] = None
    new_severity: Optional[str] = None
    reviewer_name: str
    comments: Optional[str] = None
    created_at: datetime


class DiscrepancyItemSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    job_id: str
    result_id: str
    discrepancy_type: str
    severity: str  # 'MAJOR', 'MINOR', 'REVIEW_REQUIRED', 'UNCLASSIFIED'
    original_severity: str
    severity_reason: str
    rule_applied: str
    affected_fields: List[str]
    expected_and_actual: dict
    difference_amount: Decimal
    ai_explanation: Optional[str] = None
    ai_suggested_fields: Optional[dict] = None
    verification_status: str
    requires_vendor_action: bool
    resolution_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    # Denormalized / joined fields for UI display
    supplier_gstin: Optional[str] = None
    supplier_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    purchase_record: Optional[RecordSchema] = None
    gstr2b_record: Optional[RecordSchema] = None
    audit_logs: Optional[List[DiscrepancyAuditLogSchema]] = None

    @field_serializer("difference_amount", when_used="json")
    def serialize_decimal(self, v: Decimal) -> str:
        return f"{v:.2f}"


class DiscrepancyVerificationRequest(BaseModel):
    action: str  # 'APPROVE', 'REQUIRE_VENDOR_CORRECTION', 'OVERRIDE_SEVERITY', 'INVESTIGATE', 'REJECT', 'RESOLVE', 'ADD_COMMENT'
    reviewer_name: Optional[str] = "Reviewer"
    comments: Optional[str] = None
    override_severity: Optional[str] = None  # 'MAJOR', 'MINOR', 'REVIEW_REQUIRED'
    requires_vendor_action: Optional[bool] = None


class DiscrepancyVerificationResponse(BaseModel):
    success: bool
    message: str
    discrepancy: DiscrepancyItemSchema


class DiscrepancySummarySchema(BaseModel):
    total_discrepancies: int
    major_count: int
    minor_count: int
    review_required_count: int
    pending_verification_count: int
    requires_vendor_action_count: int
    approved_or_resolved_count: int


