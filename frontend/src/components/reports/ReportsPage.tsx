import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { StatusBadge } from '../common/Badge';
import { 
  Download, 
  Eye, 
  X, 
  Printer,
  Layers,
  ArrowRight
} from 'lucide-react';
import type { BackendJobDetail } from '../../types';

export const ReportsPage: React.FC = () => {
  const { backendJobs, businessProfile, setActiveJobId, setActivePage, showNotification } = useApp();
  const [selectedJobForView, setSelectedJobForView] = useState<BackendJobDetail | null>(null);

  const formatDate = (isoString?: string) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  const handleDownloadCsv = (job: BackendJobDetail) => {
    const summary = job.summary;
    const discrepancies = summary 
      ? (summary.mismatched + summary.missing_in_gstr2b + summary.duplicate_ambiguous) 
      : 0;

    const csvContent = 
`GST Reconciliation Report - ${businessProfile?.tradeName || 'GSTRecon MSME Audit'}
GSTIN: ${businessProfile?.gstin || '27AABCO4829K1ZX'}
Job ID: ${job.id}
Date Generated: ${job.created_at}
Reconciliation Status: ${job.status}
----------------------------------------
Metric,Count
Purchase Register Records,${job.purchase_records_count}
GSTR-2B Records,${job.gstr2b_records_count}
Total Invoices Evaluated,${summary?.total_results ?? (job.purchase_records_count + job.gstr2b_records_count)}
Exact Matched,${summary?.matched ?? 0}
Mismatched Records,${summary?.mismatched ?? 0}
Missing in GSTR-2B,${summary?.missing_in_gstr2b ?? 0}
Missing in Purchase Register,${summary?.missing_in_purchase_register ?? 0}
Duplicate Ambiguous Records,${summary?.duplicate_ambiguous ?? 0}
Total Discrepancies,${discrepancies}
Major Discrepancies,${summary?.major_discrepancies ?? 0}
Minor Discrepancies,${summary?.minor_discrepancies ?? 0}
`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GST_Reconciliation_Job_${job.id.slice(0, 8)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`Downloaded reconciliation summary CSV for Job ${job.id.slice(0, 8)}`, 'info');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Reconciliation Reports"
        subtitle="Audit-compliant reconciliation summaries and certificates for statutory GST compliance."
      />

      <main className="p-6 space-y-6 max-w-7xl">
        {/* Reports Table */}
        <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Authoritative Reconciliation Jobs
              </h2>
              <p className="text-xs text-slate-500">
                Historical reconciliation runs persisted in PostgreSQL database.
              </p>
            </div>
            <span className="text-xs font-mono font-medium text-slate-500">
              Total Recorded Jobs: {backendJobs.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold">
                  <th className="py-2.5 px-4">Job Identifier</th>
                  <th className="py-2.5 px-4">Date Uploaded</th>
                  <th className="py-2.5 px-4 text-right">PR Records</th>
                  <th className="py-2.5 px-4 text-right">2B Records</th>
                  <th className="py-2.5 px-4 text-right">Matched</th>
                  <th className="py-2.5 px-4 text-right">Discrepancies</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backendJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500 text-xs">
                      No reconciliation jobs recorded yet. Upload files to generate reconciliation reports.
                    </td>
                  </tr>
                ) : (
                  backendJobs.map((job) => {
                    const summary = job.summary;
                    const discrepancies = summary 
                      ? (summary.mismatched + summary.missing_in_gstr2b + summary.duplicate_ambiguous) 
                      : 0;

                    return (
                      <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          <div className="flex items-center space-x-1.5">
                            <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{job.id.slice(0, 12)}...</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {formatDate(job.created_at)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-800 font-medium">
                          {job.purchase_records_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-800 font-medium">
                          {job.gstr2b_records_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">
                          {summary ? summary.matched : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {summary ? (
                            discrepancies > 0 ? (
                              <span className="text-rose-700 font-bold">{discrepancies}</span>
                            ) : (
                              <span className="text-emerald-700 font-semibold">0</span>
                            )
                          ) : (
                            <span className="text-slate-400">Pending</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedJobForView(job)}
                              className="inline-flex items-center space-x-1 text-slate-600 hover:text-blue-700 font-medium text-xs px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                              title="View certificate"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Certificate</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadCsv(job)}
                              className="inline-flex items-center space-x-1 text-slate-600 hover:text-emerald-700 font-medium text-xs px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Download Summary CSV"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>CSV</span>
                            </button>
                            {summary ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveJobId(job.id);
                                  setActivePage('results');
                                }}
                                className="inline-flex items-center space-x-1 text-blue-700 hover:text-blue-900 font-medium text-xs px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
                              >
                                <span>Results</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveJobId(job.id);
                                  setActivePage('reconciliation');
                                }}
                                className="inline-flex items-center space-x-1 text-emerald-700 hover:text-emerald-900 font-medium text-xs px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 transition-colors cursor-pointer"
                              >
                                <span>Reconcile</span>
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
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
      {selectedJobForView && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded shadow-2xl max-w-3xl w-full border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  GST Reconciliation Certificate – Job #{selectedJobForView.id.slice(0, 10)}...
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  Created on {formatDate(selectedJobForView.created_at)}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center space-x-1 text-xs text-slate-600 hover:text-slate-900 px-2.5 py-1.5 rounded border border-slate-300 hover:bg-slate-100 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedJobForView(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
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
                    GSTIN: {businessProfile?.gstin || '27AABCO4829K1ZX'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-block px-2.5 py-1 bg-slate-100 border border-slate-200 rounded font-mono font-semibold text-slate-800 text-[11px]">
                    Status: {selectedJobForView.status}
                  </div>
                </div>
              </div>

              {/* Summary Metrics */}
              <div>
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px] mb-2.5">
                  Authoritative Matching Statistics
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <div className="text-[10px] text-slate-500">Evaluated</div>
                    <div className="font-mono font-bold text-sm text-slate-900 mt-0.5">
                      {selectedJobForView.summary?.total_results ?? 
                        (selectedJobForView.purchase_records_count + selectedJobForView.gstr2b_records_count)}
                    </div>
                  </div>
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded">
                    <div className="text-[10px] text-emerald-800 font-medium">Matched</div>
                    <div className="font-mono font-bold text-sm text-emerald-800 mt-0.5">
                      {selectedJobForView.summary?.matched ?? '—'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded">
                    <div className="text-[10px] text-rose-800 font-medium">Major</div>
                    <div className="font-mono font-bold text-sm text-rose-800 mt-0.5">
                      {selectedJobForView.summary?.major_discrepancies ?? '—'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded">
                    <div className="text-[10px] text-amber-800 font-medium">Minor</div>
                    <div className="font-mono font-bold text-sm text-amber-800 mt-0.5">
                      {selectedJobForView.summary?.minor_discrepancies ?? '—'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded">
                    <div className="text-[10px] text-indigo-800 font-medium">Missing</div>
                    <div className="font-mono font-bold text-sm text-indigo-800 mt-0.5">
                      {selectedJobForView.summary?.total_missing ?? '—'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                    <div className="text-[10px] text-slate-600 font-medium">Ambiguous</div>
                    <div className="font-mono font-bold text-sm text-slate-700 mt-0.5">
                      {selectedJobForView.summary?.duplicate_ambiguous ?? '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Statutory Certification Statement */}
              <div className="bg-slate-50 border border-slate-200 rounded p-4 text-[11px] leading-relaxed text-slate-700">
                This certificate verifies that all purchase records for database Job <code className="font-mono font-semibold">{selectedJobForView.id}</code> were parsed, normalized, 
                and deterministically evaluated against auto-drafted GSTR-2B data in compliance with Section 16(2)(aa) of the CGST Act 2017.
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                Job: {selectedJobForView.id}
              </span>
              <button
                type="button"
                onClick={() => setSelectedJobForView(null)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-800 text-white rounded hover:bg-slate-900 cursor-pointer"
              >
                Close Certificate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};