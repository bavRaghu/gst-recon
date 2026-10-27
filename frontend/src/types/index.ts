export type MatchStatus = 
  | 'matched'
  | 'minor_discrepancy'
  | 'major_discrepancy'
  | 'unmatched_in_2b'
  | 'unmatched_in_pr';

export type DiscrepancyType = 
  | 'none'
  | 'taxable_value_mismatch'
  | 'tax_amount_mismatch'
  | 'invoice_number_syntax'
  | 'invoice_date_mismatch'
  | 'missing_in_gstr2b'
  | 'missing_in_books'
  | 'gstin_mismatch';

export type DiscrepancySeverity = 'exact' | 'minor' | 'major';

export interface InvoiceItem {
  id: string;
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalValue: number;
  source: 'purchase_register' | 'gstr_2b';
  hsnCode?: string;
  pos?: string; // Place of Supply
  reverseCharge?: boolean;
}

export interface DifferenceField {
  fieldName: string;
  fieldLabel: string;
  prValue: string | number;
  gstr2bValue: string | number;
  difference?: number | string;
  isMismatch: boolean;
}

export interface ReconciliationRecord {
  id: string;
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalValue: number;
  matchStatus: MatchStatus;
  discrepancyType: DiscrepancyType;
  severity: DiscrepancySeverity;
  reason: string;
  recommendedAction: string;
  differenceAmount: number;
  purchaseInvoice?: InvoiceItem;
  gstr2bInvoice?: InvoiceItem;
  vendorEmail?: string;
  vendorPhone?: string;
  vendorCommunicationStatus?: 'not_contacted' | 'draft' | 'sent' | 'resolved';
  communicationHistory?: VendorMessage[];
  differences?: DifferenceField[];
}

export interface VendorMessage {
  id: string;
  date: string;
  subject: string;
  body: string;
  recipientEmail: string;
  status: 'sent' | 'draft';
}

export interface ReconciliationRun {
  id: string;
  gstPeriod: string;
  runDate: string;
  totalInvoices: number;
  matched: number;
  minorDiscrepancies: number;
  majorDiscrepancies: number;
  unmatched: number;
  totalTaxRisk: number;
  eligibleItc: number;
  status: 'Completed' | 'In Progress' | 'Action Needed';
}

export interface UploadedFileInfo {
  name: string;
  size: number;
  format: 'xlsx' | 'csv' | 'json' | 'pdf';
  recordCount: number;
  uploadedAt: string;
  status: 'ready' | 'processing' | 'error';
  errorMessage?: string;
}

export interface AttentionRecord {
  id: string;
  source: 'Purchase Register' | 'GSTR-2B';
  invoiceNumber: string;
  supplierGstin: string;
  supplierName: string;
  issue: string;
  field: string;
  currentValue: string;
  suggestedAction: 'Fix' | 'Ignore' | 'Review';
}

export interface ValidationSummary {
  totalExtracted: number;
  validRecords: number;
  recordsRequiringAttention: number;
  duplicatesDetected: number;
  missingInvalidFields: number;
  attentionRecords: AttentionRecord[];
}

export interface BusinessProfile {
  legalName: string;
  tradeName: string;
  gstin: string;
  pan: string;
  state: string;
  stateCode: string;
  filingFrequency: 'Monthly' | 'Quarterly (QRMP)';
  email: string;
  contactNumber: string;
}

export interface ReconciliationSettings {
  taxToleranceAmount: number; // e.g. 1.00 or 5.00
  fuzzyInvoiceMatching: boolean; // ignore leading zeros, special characters / -
  dateToleranceDays: number; // e.g. 3 days
  autoDraftVendorNotice: boolean;
  emailAlertOnMajorDiscrepancy: boolean;
  weeklySummaryDigest: boolean;
}

export interface UserAccount {
  name: string;
  email: string;
  role: string;
  isAuthenticated: boolean;
}

export type ActivePage = 
  | 'dashboard'
  | 'upload'
  | 'validation'
  | 'reconciliation'
  | 'results'
  | 'review'
  | 'discrepancies'
  | 'reports'
  | 'vendor'
  | 'settings';

export interface BackendValidationError {
  file_type: string;
  row?: number | null;
  field?: string | null;
  reason: string;
}

export interface BackendUploadSummary {
  purchase_register_count: number;
  gstr2b_count: number;
  total_records: number;
}

export interface BackendUploadResponse {
  success: boolean;
  job_id?: string;
  message: string;
  summary?: BackendUploadSummary;
  errors?: BackendValidationError[];
}

// Stage 2 & 3 Backend Reconciliation Interfaces
export interface BackendRecordItem {
  id: number;
  job_id: string;
  supplier_gstin: string;
  invoice_number: string;
  invoice_date: string;
  taxable_value: string;
  cgst: string;
  sgst: string;
  igst: string;
}

export interface BackendProposalAuditLog {
  id: string;
  job_id: string;
  proposal_id: string;
  action: string;
  reviewed_by: string;
  notes?: string | null;
  created_at: string;
}

export interface BackendProposalItem {
  id: string;
  job_id: string;
  result_id?: string | null;
  source_record_type: string;
  source_record_id: number;
  candidate_record_id: number;
  assessment_status: string; // 'PROPOSED' | 'CONFIRMED' | 'USER_REJECTED' | 'REJECTED' | 'SKIPPED' | 'UNAVAILABLE' | 'ERROR'
  confidence?: string | null; // 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN'
  confidence_score?: number | null; // 0.0 to 1.0
  reasoning: string;
  conflicting_evidence?: string | null;
  field_comparison?: Record<string, {
    source?: string;
    candidate?: string;
    match?: boolean;
    type?: string;
    difference?: string;
  }> | null;
  requires_human_review?: boolean;
  model_metadata?: Record<string, unknown> | null;
  created_at: string;
  source_record?: BackendRecordItem | null;
  candidate_record?: BackendRecordItem | null;
  audit_logs?: BackendProposalAuditLog[];
}

export interface BackendProposalReviewResponse {
  success: boolean;
  message: string;
  proposal: BackendProposalItem;
  updated_summary?: BackendReconciliationSummary | null;
}

export interface BackendDiscrepancyExplanation {
  result_id: string;
  summary: string;
  details: string[];
}

export interface BackendReconciliationResult {
  id: string;
  job_id: string;
  purchase_record_id?: number | null;
  gstr2b_record_id?: number | null;
  status: 'MATCHED' | 'MISMATCH' | 'MISSING_IN_GSTR2B' | 'MISSING_IN_PURCHASE_REGISTER' | 'DUPLICATE_AMBIGUOUS' | string;
  severity?: 'MAJOR' | 'MINOR' | 'NONE' | 'UNCLASSIFIED' | string | null;
  severity_reason?: string | null;
  discrepancy_details?: Record<string, unknown> | null;
  differences: Record<string, { purchase_register?: string; gstr2b?: string; difference?: string }>;
  ambiguity_metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  purchase_record?: BackendRecordItem | null;
  gstr2b_record?: BackendRecordItem | null;
  proposals?: BackendProposalItem[];
}

export interface BackendReconciliationSummary {
  total_results: number;
  matched: number;
  mismatched: number;
  missing_in_gstr2b: number;
  missing_in_purchase_register: number;
  duplicate_ambiguous: number;
  total_missing: number;
  major_discrepancies?: number;
  minor_discrepancies?: number;
  none_count?: number;
  unclassified_count?: number;
}

export interface BackendReconciliationRunResponse {
  success: boolean;
  job_id: string;
  status: string;
  summary: BackendReconciliationSummary;
  ai_assessment_summary?: Record<string, unknown> | null;
  message: string;
}

export interface BackendJobDetail {
  id: string;
  created_at: string;
  status: string;
  purchase_records_count: number;
  gstr2b_records_count: number;
  summary?: BackendReconciliationSummary | null;
}

export interface VendorCommunicationRecord {
  id: string;
  job_id: string;
  result_id: string;
  supplier_gstin: string;
  supplier_name?: string | null;
  recipient_email: string;
  cc_email?: string | null;
  subject: string;
  body: string;
  template_type: 'standard' | 'urgent' | 'amendment';
  status: 'DRAFT' | 'SENT' | 'FAILED' | string;
  sending_mode: 'test' | 'live' | string;
  error_message?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackendVendorActionItem {
  id: string;
  result_id: string;
  job_id: string;
  discrepancy_status: string;
  supplier_name: string;
  supplier_gstin: string;
  invoice_number: string;
  invoice_date: string;
  total_value: number;
  total_tax: number;
  difference_amount: number;
  reason: string;
  recommended_action: string;
  severity: 'major' | 'minor';
  vendor_communication_status: 'not_contacted' | 'draft' | 'sent' | 'failed' | string;
  vendor_email?: string | null;
  purchase_record?: BackendRecordItem | null;
  gstr2b_record?: BackendRecordItem | null;
  latest_communication?: VendorCommunicationRecord | null;
}

export interface SmtpConfigStatus {
  enabled: boolean;
  test_mode: boolean;
  test_recipient: string;
  allowed_recipients: string[];
  from_email: string;
  from_name: string;
  host: string;
  port: number;
  use_tls: boolean;
  has_credentials: boolean;
}

export interface VendorContact {
  id?: number;
  supplier_gstin: string;
  supplier_name?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_person?: string | null;
  notes?: string | null;
}

export interface DiscrepancyAuditLog {
  id: string;
  discrepancy_id: string;
  job_id: string;
  action: string;
  previous_status?: string | null;
  new_status: string;
  previous_severity?: string | null;
  new_severity?: string | null;
  reviewer_name: string;
  comments?: string | null;
  created_at: string;
}

export interface DiscrepancyItem {
  id: string;
  job_id: string;
  result_id: string;
  discrepancy_type: string;
  severity: 'MAJOR' | 'MINOR' | 'REVIEW_REQUIRED' | 'UNCLASSIFIED';
  original_severity: string;
  severity_reason: string;
  rule_applied: string;
  affected_fields: string[];
  expected_and_actual: Record<string, unknown>;
  difference_amount: string | number;
  ai_explanation?: string | null;
  ai_suggested_fields?: Record<string, unknown> | null;
  verification_status: 'PENDING' | 'APPROVED' | 'OVERRIDDEN' | 'REQUIRES_VENDOR_CORRECTION' | 'INVESTIGATION_REQUIRED' | 'REJECTED' | 'RESOLVED';
  requires_vendor_action: boolean;
  resolution_notes?: string | null;
  created_at: string;
  updated_at: string;

  supplier_gstin?: string;
  supplier_name?: string;
  invoice_number?: string;
  invoice_date?: string;
  purchase_record?: BackendRecordItem | null;
  gstr2b_record?: BackendRecordItem | null;
  audit_logs?: DiscrepancyAuditLog[];
}

export interface DiscrepancyVerificationRequest {
  action: 'APPROVE' | 'REQUIRE_VENDOR_CORRECTION' | 'OVERRIDE_SEVERITY' | 'INVESTIGATE' | 'REJECT' | 'RESOLVE' | 'ADD_COMMENT';
  reviewer_name?: string;
  comments?: string;
  override_severity?: 'MAJOR' | 'MINOR' | 'REVIEW_REQUIRED';
  requires_vendor_action?: boolean;
}

export interface DiscrepancyVerificationResponse {
  success: boolean;
  message: string;
  discrepancy: DiscrepancyItem;
}

export interface DiscrepancySummary {
  total_discrepancies: number;
  major_count: number;
  minor_count: number;
  review_required_count: number;
  pending_verification_count: number;
  requires_vendor_action_count: number;
  approved_or_resolved_count: number;
}

