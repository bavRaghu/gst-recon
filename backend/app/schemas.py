from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


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


class JobDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    status: str
    purchase_records_count: int
    gstr2b_records_count: int
