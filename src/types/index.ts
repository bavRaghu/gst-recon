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
