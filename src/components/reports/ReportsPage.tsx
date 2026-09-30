import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { StatusBadge } from '../common/Badge';
import { 
  FileText, 
  Download, 
  Eye, 
  X, 
  Printer
} from 'lucide-react';
import type { ReconciliationRun } from '../../types';

export const ReportsPage: React.FC = () => {
  const { runs, businessProfile, showNotification } = useApp();
  const [selectedRunForView, setSelectedRunForView] = useState<ReconciliationRun | null>(null);

  const handleDownloadCsv = (run: ReconciliationRun) => {
    const csvContent = 
`GST Reconciliation Report - ${businessProfile?.tradeName || 'Omkar Precision Engineering'}
GSTIN: ${businessProfile?.gstin || '27AABCO4829K1ZX'}
Period: ${run.gstPeriod}
Generated: ${run.runDate}
----------------------------------------
Metric,Count / Amount
Total Invoices,${run.totalInvoices}
Matched Invoices,${run.matched}
Minor Discrepancies,${run.minorDiscrepancies}
Major Discrepancies,${run.majorDiscrepancies}
Eligible ITC (GSTR-3B Table 4),₹${run.eligibleItc.toLocaleString('en-IN')}
Tax Amount at Risk,₹${run.totalTaxRisk.toLocaleString('en-IN')}
Reconciliation Status,${run.status}
`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GST_Reconciliation_${run.gstPeriod.replace(' ', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`Downloaded CSV report for ${run.gstPeriod}`, 'info');
  };

  const handleDownloadPdf = (run: ReconciliationRun) => {
    // In browser, trigger printable PDF preview
    setSelectedRunForView(run);
    showNotification(`Prepared official audit report for ${run.gstPeriod}. Use Print to save PDF.`, 'info');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Reconciliation Reports"
        subtitle="Audit-compliant reconciliation summaries and certificates for your CA or GST filing."
      />

      <main className="p-6 space-y-6 max-w-7xl">
        {/* Reports Table */}
        <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Generated Reconciliation Statements
              </h2>
              <p className="text-xs text-slate-500">
                Official records of Purchase Register vs GSTR-2B matching by filing period.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold">
                  <th className="py-2.5 px-4">GST Period</th>
                  <th className="py-2.5 px-4">Date Generated</th>
                  <th className="py-2.5 px-4 text-right">Total Invoices</th>
                  <th className="py-2.5 px-4 text-right">Matched</th>
                  <th className="py-2.5 px-4 text-right">Minor Discrepancies</th>
                  <th className="py-2.5 px-4 text-right">Major Discrepancies</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {run.gstPeriod}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {run.runDate}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-800 font-medium">
                      {run.totalInvoices}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">
                      {run.matched}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-amber-700">
                      {run.minorDiscrepancies}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {run.majorDiscrepancies > 0 ? (
                        <span className="text-rose-700 font-bold">
                          {run.majorDiscrepancies}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedRunForView(run)}
                          className="inline-flex items-center space-x-1 text-slate-600 hover:text-blue-700 font-medium text-xs px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                          title="View statement"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(run)}
                          className="inline-flex items-center space-x-1 text-slate-600 hover:text-rose-700 font-medium text-xs px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                          title="Download PDF"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadCsv(run)}
                          className="inline-flex items-center space-x-1 text-slate-600 hover:text-emerald-700 font-medium text-xs px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                          title="Download CSV"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>CSV</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Audit Compliance Guidance Card */}
        <div className="bg-slate-50 border border-slate-200 rounded p-4 text-xs text-slate-700">
          <div className="font-semibold text-slate-900 mb-1">
            Reconciliation & Audit Trail Requirements for MSMEs
          </div>
          <p className="text-slate-600 leading-relaxed">
            Under Section 16(2)(aa) of the CGST Act 2017, taxpayers must ensure that Input Tax Credit is claimed only in respect of invoices 
            communicated in GSTR-2B. Keep a downloaded copy of this reconciliation certificate and raw GSTR-2B JSON for 72 months (6 years) 
            as prescribed under Section 36 of the CGST Act.
          </p>
        </div>
      </main>

      {/* Formal Report Preview Modal */}
      {selectedRunForView && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded shadow-2xl max-w-3xl w-full border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  GST Reconciliation Certificate – {selectedRunForView.gstPeriod}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Generated on {selectedRunForView.runDate}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center space-x-1 text-xs text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded border border-slate-300 hover:bg-slate-100"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRunForView(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Printable Certificate Body */}
            <div className="p-6 space-y-6 text-xs text-slate-800">
              {/* Business Header */}
              <div className="border-b border-slate-200 pb-4 flex justify-between items-start">
                <div>
                  <div className="text-base font-bold text-slate-900">
                    {businessProfile?.legalName || 'Omkar Precision Engineering Pvt Ltd'}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Trade Name: {businessProfile?.tradeName || 'Omkar Engineering'}
                  </div>
                  <div className="font-mono text-slate-600 mt-0.5">
                    GSTIN: {businessProfile?.gstin || '27AABCO4829K1ZX'} | State: {businessProfile?.state} ({businessProfile?.stateCode})
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-block px-2.5 py-1 bg-slate-100 border border-slate-200 rounded font-mono font-semibold text-slate-800">
                    Period: {selectedRunForView.gstPeriod}
                  </div>
                </div>
              </div>

              {/* Summary Metrics */}
              <div>
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2.5">
                  1. Matching Statistics
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <div className="text-[10px] text-slate-500">Total Invoices</div>
                    <div className="font-mono font-bold text-sm text-slate-900 mt-0.5">
                      {selectedRunForView.totalInvoices}
                    </div>
                  </div>
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded">
                    <div className="text-[10px] text-emerald-800 font-medium">Matched (Safe)</div>
                    <div className="font-mono font-bold text-sm text-emerald-800 mt-0.5">
                      {selectedRunForView.matched}
                    </div>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded">
                    <div className="text-[10px] text-amber-800 font-medium">Minor Variances</div>
                    <div className="font-mono font-bold text-sm text-amber-800 mt-0.5">
                      {selectedRunForView.minorDiscrepancies}
                    </div>
                  </div>
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded">
                    <div className="text-[10px] text-rose-800 font-medium">Major Discrepancies</div>
                    <div className="font-mono font-bold text-sm text-rose-800 mt-0.5">
                      {selectedRunForView.majorDiscrepancies}
                    </div>
                  </div>
                </div>
              </div>

              {/* ITC Breakdown */}
              <div>
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2.5">
                  2. Input Tax Credit (ITC) Summary for GSTR-3B Table 4
                </h4>
                <div className="border border-slate-200 rounded overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="py-2 px-3 text-slate-700">A. Legitimate & Reconciled ITC Eligible for Claim</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-emerald-800">
                          ₹{selectedRunForView.eligibleItc.toLocaleString('en-IN')}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700">B. Blocked / Ineligible ITC (Due to Discrepancies)</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-rose-700">
                          ₹{selectedRunForView.totalTaxRisk.toLocaleString('en-IN')}
                        </td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="py-2 px-3 text-slate-900">Total Purchase Register Tax Recorded</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-900">
                          ₹{(selectedRunForView.eligibleItc + selectedRunForView.totalTaxRisk).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Auditor Sign-off Area */}
              <div className="pt-4 border-t border-slate-200 flex justify-between items-end text-slate-600">
                <div>
                  <p className="text-[11px]">Prepared by: Internal Accounts Department</p>
                  <p className="text-[11px] mt-0.5">Verified under Rule 36(4) Reconciliation Protocol</p>
                </div>
                <div className="text-right">
                  <div className="w-40 border-b border-slate-400 mb-1" />
                  <p className="text-[11px]">Authorized Signatory / CA</p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedRunForView(null)}
                className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100"
              >
                Close
              </button>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleDownloadCsv(selectedRunForView)}
                  className="text-xs text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 font-semibold px-3 py-1.5 rounded"
                >
                  Download CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
