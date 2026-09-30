import React from 'react';
import { useApp } from '../../context/AppContext';
import { StatusBadge } from '../common/Badge';
import type { ReconciliationRecord } from '../../types';
import { 
  X, 
  Mail, 
  Check, 
  Building2, 
  HelpCircle
} from 'lucide-react';

interface DrawerProps {
  record: ReconciliationRecord | null;
  onClose: () => void;
}

export const InvoiceDetailDrawer: React.FC<DrawerProps> = ({ record, onClose }) => {
  const { setSelectedRecordForVendor, setActivePage, acceptRecordDifference } = useApp();

  if (!record) return null;

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

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return '—';
    return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

              {/* Explanations */}
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

          {/* Compliance Note */}
          <div className="p-3 bg-slate-100/70 rounded border border-slate-200 text-[11px] text-slate-600 flex items-start space-x-2">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <strong>Audit Compliance Note:</strong> Retain copies of supplier invoice and e-way bill for any invoice where ITC exceeds ₹50,000 for statutory GST audits.
            </div>
          </div>
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
