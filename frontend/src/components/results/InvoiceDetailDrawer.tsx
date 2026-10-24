import React from 'react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../common/Badge';
import type { ReconciliationRecord, BackendReconciliationResult } from '../../types';
import { 
  X, 
  Mail, 
  Check, 
  Building2, 
  HelpCircle,
  Sparkles,
  AlertTriangle
} from 'lucide-react';

interface DrawerProps {
  record?: ReconciliationRecord | null;
  backendResult?: BackendReconciliationResult | null;
  onClose: () => void;
}

export const InvoiceDetailDrawer: React.FC<DrawerProps> = ({ 
  record, 
  backendResult, 
  onClose 
}) => {
  const { setSelectedRecordForVendor, setActivePage, acceptRecordDifference } = useApp();

  // If neither is open, return null
  if (!record && !backendResult) return null;

  const formatCurrency = (val?: number | string | null) => {
    if (val === undefined || val === null || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '—';
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDifference = (diffStr?: string) => {
    if (!diffStr) return null;
    const diffNum = parseFloat(diffStr);
    if (isNaN(diffNum)) return diffStr;
    const sign = diffNum > 0 ? '+' : '';
    return `${sign}₹${diffNum.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Rendering for Backend Reconciliation Result
  if (backendResult) {
    const pr = backendResult.purchase_record;
    const twoB = backendResult.gstr2b_record;
    const diffs = backendResult.differences || {};
    const proposals = backendResult.proposals || [];
    const ambiguity = backendResult.ambiguity_metadata;

    const gstin = pr?.supplier_gstin || twoB?.supplier_gstin || '—';
    const invoiceNum = pr?.invoice_number || twoB?.invoice_number || '—';
    const isMatched = backendResult.status === 'MATCHED';
    const isMismatch = backendResult.status === 'MISMATCH';
    const isAmbiguous = backendResult.status === 'DUPLICATE_AMBIGUOUS';
    const isMissingIn2B = backendResult.status === 'MISSING_IN_GSTR2B';
    const isMissingInPr = backendResult.status === 'MISSING_IN_PURCHASE_REGISTER';
    const ambiguityCounts = ambiguity && typeof ambiguity === 'object' && 'counts' in ambiguity
      ? (ambiguity.counts as { purchase_register?: number; gstr2b?: number })
      : undefined;

    const prTaxable = pr ? parseFloat(pr.taxable_value) : 0;
    const twoBTaxable = twoB ? parseFloat(twoB.taxable_value) : 0;
    const prCgst = pr ? parseFloat(pr.cgst) : 0;
    const twoBCgst = twoB ? parseFloat(twoB.cgst) : 0;
    const prSgst = pr ? parseFloat(pr.sgst) : 0;
    const twoBSgst = twoB ? parseFloat(twoB.sgst) : 0;
    const prIgst = pr ? parseFloat(pr.igst) : 0;
    const twoBIgst = twoB ? parseFloat(twoB.igst) : 0;

    const prTotalTax = prCgst + prSgst + prIgst;
    const twoBTotalTax = twoBCgst + twoBSgst + twoBIgst;
    const prTotalVal = prTaxable + prTotalTax;
    const twoBTotalVal = twoBTaxable + twoBTotalTax;

    return (
      <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-title"
          className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-300 animate-in slide-in-from-right duration-200"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 id="drawer-title" className="text-base font-bold text-slate-900">
                  Reconciliation Record Detail
                </h2>
                <StatusBadge status={backendResult.status} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5 font-mono">
                Invoice #{invoiceNum} • GSTIN: {gstin}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Supplier / Key Information */}
            <div className="bg-slate-50 border border-slate-200 rounded p-3.5 flex items-start space-x-3">
              <Building2 className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
              <div className="text-xs space-y-0.5 flex-1">
                <div className="font-bold text-slate-800">Supplier GSTIN: {gstin}</div>
                <div className="text-slate-600 flex items-center space-x-3 text-[11px]">
                  <span>Job: <code className="font-mono">{backendResult.job_id.slice(0, 10)}...</code></span>
                  <span>•</span>
                  <span>Result ID: <code className="font-mono">{backendResult.id.slice(0, 8)}...</code></span>
                </div>
              </div>
            </div>

            {/* Ambiguous Duplicate Warning Banner */}
            {isAmbiguous && ambiguity && (
              <div className="bg-amber-50 border border-amber-300 rounded p-4 text-xs text-amber-950 space-y-2">
                <div className="flex items-center space-x-2 font-bold text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Duplicate Records Detected (Deterministic Hold)</span>
                </div>
                <p className="text-amber-800 leading-relaxed">
                  Multiple records sharing key <code className="font-mono font-semibold">({gstin}, {invoiceNum})</code> were detected.
                  The reconciliation engine will not arbitrarily pair duplicate records. Manual resolution required.
                </p>
                {ambiguityCounts && (
                  <div className="flex items-center space-x-4 pt-1 text-[11px] font-mono text-amber-900 font-medium">
                    <span>PR Records: {ambiguityCounts.purchase_register ?? 0}</span>
                    <span>•</span>
                    <span>2B Records: {ambiguityCounts.gstr2b ?? 0}</span>
                  </div>
                )}
              </div>
            )}

            {/* Side-by-Side Field Comparison Table */}
            <div className="border border-slate-300 rounded overflow-hidden shadow-xs">
              <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-800 uppercase tracking-wider flex justify-between items-center">
                <span>Side-by-Side Comparison</span>
                <span className="font-normal font-mono text-[11px] text-slate-500 lowercase">Signed diff: Books - 2B</span>
              </div>

              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2 px-3 w-1/4">Field</th>
                    <th className="py-2 px-3 w-1/4 border-l border-slate-200">Purchase Register</th>
                    <th className="py-2 px-3 w-1/4 border-l border-slate-200">GSTR-2B Portal</th>
                    <th className="py-2 px-3 w-1/4 border-l border-slate-200 text-right">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                  {/* Supplier GSTIN */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-700">Supplier GSTIN</td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                      {pr?.supplier_gstin || <span className="text-slate-400 font-sans italic">Not in books</span>}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                      {twoB?.supplier_gstin || <span className="text-rose-600 font-sans italic">Missing in 2B</span>}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-right text-slate-400">
                      —
                    </td>
                  </tr>

                  {/* Invoice Number */}
                  <tr>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-700">Invoice Number</td>
                    <td className="py-2.5 px-3 border-l border-slate-200 font-bold text-slate-900">
                      {pr?.invoice_number || '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 font-bold text-slate-900">
                      {twoB?.invoice_number || '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-right text-slate-400">
                      —
                    </td>
                  </tr>

                  {/* Invoice Date */}
                  <tr className={diffs['invoice_date'] ? 'bg-amber-50/70' : ''}>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-700">Invoice Date</td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                      {pr?.invoice_date || '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                      {twoB?.invoice_date || '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-right font-sans">
                      {diffs['invoice_date'] ? (
                        <span className="text-amber-800 font-bold text-[10px]">Date Diff</span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">Matched</span>
                      )}
                    </td>
                  </tr>

                  {/* Taxable Value */}
                  <tr className={diffs['taxable_value'] ? 'bg-rose-50/80 font-bold' : ''}>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-700">Taxable Value</td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-900">
                      {pr ? formatCurrency(pr.taxable_value) : '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-900">
                      {twoB ? formatCurrency(twoB.taxable_value) : '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-right">
                      {diffs['taxable_value'] ? (
                        <span className="text-rose-700 font-bold">
                          {formatDifference(diffs['taxable_value'].difference)}
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">₹0.00</span>
                      )}
                    </td>
                  </tr>

                  {/* CGST */}
                  <tr className={diffs['cgst'] ? 'bg-rose-50/80' : ''}>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-700">CGST</td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                      {pr ? formatCurrency(pr.cgst) : '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                      {twoB ? formatCurrency(twoB.cgst) : '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-right">
                      {diffs['cgst'] ? (
                        <span className="text-rose-700 font-bold">
                          {formatDifference(diffs['cgst'].difference)}
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">₹0.00</span>
                      )}
                    </td>
                  </tr>

                  {/* SGST */}
                  <tr className={diffs['sgst'] ? 'bg-rose-50/80' : ''}>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-700">SGST</td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                      {pr ? formatCurrency(pr.sgst) : '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                      {twoB ? formatCurrency(twoB.sgst) : '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-right">
                      {diffs['sgst'] ? (
                        <span className="text-rose-700 font-bold">
                          {formatDifference(diffs['sgst'].difference)}
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">₹0.00</span>
                      )}
                    </td>
                  </tr>

                  {/* IGST */}
                  <tr className={diffs['igst'] ? 'bg-rose-50/80' : ''}>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-700">IGST</td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                      {pr ? formatCurrency(pr.igst) : '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                      {twoB ? formatCurrency(twoB.igst) : '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-right">
                      {diffs['igst'] ? (
                        <span className="text-rose-700 font-bold">
                          {formatDifference(diffs['igst'].difference)}
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">₹0.00</span>
                      )}
                    </td>
                  </tr>

                  {/* Total Tax Amount */}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="py-2 px-3 font-sans text-slate-800">Total Tax (CGST+SGST+IGST)</td>
                    <td className="py-2 px-3 border-l border-slate-200 text-slate-800">
                      {pr ? formatCurrency(prTotalTax) : '—'}
                    </td>
                    <td className="py-2 px-3 border-l border-slate-200 text-slate-800">
                      {twoB ? formatCurrency(twoBTotalTax) : '—'}
                    </td>
                    <td className="py-2 px-3 border-l border-slate-200 text-right text-slate-700">
                      {pr && twoB ? formatCurrency(prTotalTax - twoBTotalTax) : '—'}
                    </td>
                  </tr>

                  {/* Total Invoice Value */}
                  <tr className="bg-slate-100 font-bold">
                    <td className="py-2.5 px-3 font-sans text-slate-900">Total Invoice Value</td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-900">
                      {pr ? formatCurrency(prTotalVal) : '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-slate-900">
                      {twoB ? formatCurrency(twoBTotalVal) : '—'}
                    </td>
                    <td className="py-2.5 px-3 border-l border-slate-200 text-right text-slate-900">
                      {pr && twoB ? formatCurrency(prTotalVal - twoBTotalVal) : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* AI Advisory Proposals Section (if any proposal exists) */}
            {proposals.length > 0 && (
              <div className="border border-blue-200 rounded overflow-hidden shadow-xs bg-blue-50/40">
                <div className="bg-blue-100/70 px-4 py-2.5 border-b border-blue-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs font-bold text-blue-950">
                    <Sparkles className="w-4 h-4 text-blue-700" />
                    <span>AI Advisory Candidate Proposal</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-200/80 text-blue-900">
                    Advisory (Non-authoritative)
                  </span>
                </div>

                <div className="p-4 space-y-3 text-xs">
                  {proposals.map((prop, idx) => (
                    <div key={idx} className="bg-white border border-blue-200 rounded p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-slate-800">
                            Assessment: <span className="font-mono text-blue-700">{prop.assessment_status}</span>
                          </span>
                          {prop.confidence && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              prop.confidence === 'HIGH' 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : prop.confidence === 'MEDIUM' 
                                ? 'bg-amber-100 text-amber-800' 
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              Confidence: {prop.confidence}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          Candidate ID: #{prop.candidate_record_id}
                        </span>
                      </div>

                      <div className="text-slate-700 leading-relaxed bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px]">
                        <span className="font-bold text-slate-900 block mb-0.5">Reasoning:</span>
                        {prop.reasoning}
                      </div>

                      {prop.conflicting_evidence && (
                        <div className="text-rose-800 bg-rose-50 p-2 rounded border border-rose-200 text-[11px]">
                          <span className="font-bold block">Conflicting Evidence:</span>
                          {prop.conflicting_evidence}
                        </div>
                      )}
                    </div>
                  ))}

                  <p className="text-[11px] text-blue-800 italic pt-1">
                    * AI proposals are strictly advisory and generated within the same supplier GSTIN. Authoritative reconciliation status is not modified until accepted.
                  </p>
                </div>
              </div>
            )}

            {/* Exact match verified banner */}
            {isMatched && (
              <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-xs text-emerald-900 space-y-1">
                <div className="font-bold flex items-center space-x-1.5 text-emerald-800">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Exact Match Verified</span>
                </div>
                <p className="text-emerald-700">
                  All mandatory attributes match identically within the configured monetary tolerance.
                  Full input tax credit of {formatCurrency(prTotalTax)} is eligible for immediate claim in GSTR-3B Table 4.
                </p>
              </div>
            )}

            {/* Compliance Note */}
            <div className="p-3 bg-slate-100/70 rounded border border-slate-200 text-[11px] text-slate-600 flex items-start space-x-2">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <strong>Section 16(2)(aa) Statutory Note:</strong> Input Tax Credit (ITC) can only be availed if the invoice is furnished by the supplier in GSTR-1 and communicated to the recipient in GSTR-2B.
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Close Panel
            </button>

            <div className="flex items-center space-x-2.5">
              {(isMismatch || isMissingIn2B || isMissingInPr) && (
                <button
                  type="button"
                  onClick={() => {
                    setActivePage('vendor');
                    onClose();
                  }}
                  className="inline-flex items-center space-x-1.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded shadow-sm transition-colors cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Draft Vendor Communication</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Rendering for Demo / Sample Record
  if (!record) {
    return null;
  }

  const pr = record.purchaseInvoice;
  const twoB = record.gstr2bInvoice;

  const handleRequestVendorCorrection = () => {
    setSelectedRecordForVendor(record);
    setActivePage('vendor');
    onClose();
  };

  const handleAcceptDifference = () => {
    acceptRecordDifference(record.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-300 animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 id="drawer-title" className="text-base font-bold text-slate-900">
                Invoice Comparison & Discrepancy Detail
              </h2>
              <StatusBadge severity={record.severity} status={record.matchStatus} />
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Invoice #{record.invoiceNumber} • {record.supplierName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Supplier Info Box */}
          <div className="bg-slate-50 border border-slate-200 rounded p-3.5 flex items-start space-x-3">
            <Building2 className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
            <div className="text-xs space-y-0.5 flex-1">
              <div className="font-bold text-slate-800">{record.supplierName}</div>
              <div className="text-slate-600 flex items-center space-x-2">
                <span className="font-mono">GSTIN: {record.supplierGstin}</span>
                {record.vendorEmail && (
                  <>
                    <span>•</span>
                    <span className="text-blue-700">{record.vendorEmail}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Side-by-Side Comparison Table */}
          <div className="border border-slate-300 rounded overflow-hidden shadow-xs">
            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-800 uppercase tracking-wider">
              Side-by-Side Comparison
            </div>

            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2 px-3 w-1/3">Field</th>
                  <th className="py-2 px-3 w-1/3 border-l border-slate-200">
                    Purchase Register (Books)
                  </th>
                  <th className="py-2 px-3 w-1/3 border-l border-slate-200">
                    GSTR-2B (GST Portal)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                {/* GSTIN */}
                <tr className={pr?.supplierGstin !== twoB?.supplierGstin && twoB ? 'bg-rose-50/70' : ''}>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-700">Supplier GSTIN</td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                    {pr?.supplierGstin || <span className="text-slate-400 font-sans italic">Not in books</span>}
                  </td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                    {twoB?.supplierGstin || <span className="text-rose-600 font-sans italic">Missing in GSTR-2B</span>}
                  </td>
                </tr>

                {/* Invoice Number */}
                <tr className={pr?.invoiceNumber !== twoB?.invoiceNumber && twoB ? 'bg-amber-50/70' : ''}>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-700">Invoice Number</td>
                  <td className="py-2.5 px-3 border-l border-slate-200 font-bold text-slate-900">
                    {pr?.invoiceNumber || '—'}
                  </td>
                  <td className="py-2.5 px-3 border-l border-slate-200 font-bold text-slate-900">
                    {twoB?.invoiceNumber || <span className="text-rose-600 font-sans italic">Missing in GSTR-2B</span>}
                  </td>
                </tr>

                {/* Invoice Date */}
                <tr className={pr?.invoiceDate !== twoB?.invoiceDate && twoB ? 'bg-amber-50/70' : ''}>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-700">Invoice Date</td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                    {pr?.invoiceDate || '—'}
                  </td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                    {twoB?.invoiceDate || '—'}
                  </td>
                </tr>

                {/* Taxable Value */}
                <tr className={pr?.taxableValue !== twoB?.taxableValue && twoB ? 'bg-rose-50/80' : ''}>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-700">Taxable Value</td>
                  <td className="py-2.5 px-3 border-l border-slate-200 font-semibold text-slate-900">
                    {formatCurrency(pr?.taxableValue)}
                  </td>
                  <td className="py-2.5 px-3 border-l border-slate-200 font-semibold text-slate-900">
                    {formatCurrency(twoB?.taxableValue)}
                  </td>
                </tr>

                {/* CGST */}
                <tr className={pr?.cgst !== twoB?.cgst && twoB ? 'bg-rose-50/80' : ''}>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-700">CGST</td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                    {formatCurrency(pr?.cgst)}
                  </td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                    {formatCurrency(twoB?.cgst)}
                  </td>
                </tr>

                {/* SGST */}
                <tr className={pr?.sgst !== twoB?.sgst && twoB ? 'bg-rose-50/80' : ''}>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-700">SGST</td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                    {formatCurrency(pr?.sgst)}
                  </td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                    {formatCurrency(twoB?.sgst)}
                  </td>
                </tr>

                {/* IGST */}
                <tr className={pr?.igst !== twoB?.igst && twoB ? 'bg-rose-50/80' : ''}>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-700">IGST</td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                    {formatCurrency(pr?.igst)}
                  </td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-800">
                    {formatCurrency(twoB?.igst)}
                  </td>
                </tr>

                {/* Total Invoice Value */}
                <tr className={pr?.totalValue !== twoB?.totalValue && twoB ? 'bg-rose-50/80 font-bold' : 'font-bold bg-slate-50'}>
                  <td className="py-2.5 px-3 font-sans text-slate-900">Total Invoice Value</td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-900">
                    {formatCurrency(pr?.totalValue)}
                  </td>
                  <td className="py-2.5 px-3 border-l border-slate-200 text-slate-900">
                    {formatCurrency(twoB?.totalValue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Difference Detected Section */}
          {record.severity !== 'exact' && (
            <div className="bg-amber-50/70 border border-amber-300 rounded p-4 space-y-3">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-xs uppercase tracking-wider text-amber-900">
                  Difference Detected
                </span>
                <span className="text-xs font-mono font-bold bg-amber-200 text-amber-950 px-2 py-0.5 rounded">
                  Diff: {formatCurrency(record.differenceAmount)}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-800">Reason: </span>
                  <span className="text-slate-700">{record.reason}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Recommended Action: </span>
                  <span className="text-slate-700">{record.recommendedAction}</span>
                </div>
              </div>
            </div>
          )}

          {/* Exact match confirmation */}
          {record.severity === 'exact' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-xs text-emerald-900 space-y-1">
              <div className="font-bold flex items-center space-x-1.5 text-emerald-800">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>Perfect Match Verified</span>
              </div>
              <p className="text-emerald-700">
                All mandatory GST reconciliation attributes match identically. 
                Full input tax credit of {formatCurrency(record.totalTax)} is eligible for immediate claim in GSTR-3B.
              </p>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 transition-colors"
          >
            Close Panel
          </button>

          <div className="flex items-center space-x-2.5">
            {record.severity === 'minor' && (
              <button
                type="button"
                onClick={handleAcceptDifference}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 rounded transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Accept Tolerance</span>
              </button>
            )}

            {record.severity === 'major' && (
              <button
                type="button"
                onClick={handleRequestVendorCorrection}
                className="inline-flex items-center space-x-1.5 text-xs font-semibold bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded shadow-sm transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Request Vendor Correction</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};