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

export interface BackendProposalItem {
  id: string;
  job_id: string;
  result_id?: string | null;
  source_record_type: string;
  source_record_id: number;
  candidate_record_id: number;
  assessment_status: string; // 'PROPOSED' | 'REJECTED' | 'SKIPPED' | 'UNAVAILABLE' | 'ERROR'
  confidence?: string | null; // 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN'
  reasoning: string;
  conflicting_evidence?: string | null;
  model_metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface BackendReconciliationResult {
  id: string;
  job_id: string;
  purchase_record_id?: number | null;
  gstr2b_record_id?: number | null;
  status: 'MATCHED' | 'MISMATCH' | 'MISSING_IN_GSTR2B' | 'MISSING_IN_PURCHASE_REGISTER' | 'DUPLICATE_AMBIGUOUS' | string;
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
