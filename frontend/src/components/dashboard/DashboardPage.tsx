import React, { useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { StatusBadge } from '../common/Badge';
import { GstHelperTooltip } from '../common/Tooltip';
import { FileUploadSection } from '../upload/FileUploadSection';
import { 
  AlertOctagon, 
  ArrowRight, 
  CheckCircle, 
  AlertTriangle, 
  FileCheck, 
  Plus, 
  ChevronRight,
  TrendingDown,
  Clock,
  Layers
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { 
    backendJobs,
    backendSummary,
    backendUploadSummary,
    activeJobId,
    setActiveJobId,
    setActivePage, 
    selectedPeriod,
  } = useApp();

  const uploadSectionRef = useRef<HTMLDivElement>(null);

  const handleNewReconClick = () => {
    if (uploadSectionRef.current) {
      uploadSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Authoritative run stats derived strictly from backend
  const totalInvoices = backendSummary?.total_results ?? 
    ((backendUploadSummary?.purchase_register_count ?? 0) + (backendUploadSummary?.gstr2b_count ?? 0));
  const matchedInvoices = backendSummary?.matched ?? 0;
  const mismatchedInvoices = backendSummary?.mismatched ?? 0;
  const majorDiscrepancies = backendSummary ? (backendSummary.mismatched + backendSummary.missing_in_gstr2b) : 0;
  const ambiguousInvoices = backendSummary?.duplicate_ambiguous ?? 0;

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

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Dashboard"
        subtitle="Monitor your GST reconciliation activity."
        actionButton={
          <button
            type="button"
            onClick={handleNewReconClick}
            className="inline-flex items-center space-x-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Upload New Files</span>
          </button>
        }
      />

      <main className="p-6 space-y-6 max-w-7xl">
        {/* Action Required Banner: Shown ONLY when major discrepancies exist in active job */}
        {majorDiscrepancies > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-rose-100 text-rose-700 rounded shrink-0 mt-0.5">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-rose-900">
                    Action Required: {majorDiscrepancies} Discrepancies in Job {activeJobId?.slice(0, 8)}...
                  </h3>
                  <span className="text-xs font-semibold bg-rose-200 text-rose-900 px-2 py-0.5 rounded font-mono">
                    Requires Supplier Correction
                  </span>
                </div>
                <p className="text-xs text-rose-800 mt-1 max-w-3xl leading-relaxed">
                  These invoices are either missing in GSTR-2B or show tax mismatches. Under GST Section 16(2)(aa), 
                  unmatched input credit cannot be legally availed in GSTR-3B without vendor rectification.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5 sm:shrink-0 pt-2 sm:pt-0">
              <button
                type="button"
                onClick={() => setActivePage('discrepancies')}
                className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <span>Review Discrepancies</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setActivePage('vendor')}
                className="bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer"
              >
                Draft Notices
              </button>
            </div>
          </div>
        )}

        {/* Financial Summary Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Summary for {selectedPeriod} {activeJobId ? `(Job: ${activeJobId.slice(0, 8)}...)` : ''}
            </div>
            <div className="text-xs text-slate-500">
              Rule 36(4) & Section 16(2)(aa) Authoritative Status
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Invoices */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>Total Invoices</span>
                <FileCheck className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-slate-900">
                  {totalInvoices}
                </span>
                <span className="text-xs text-slate-500">
                  PR & 2B Records
                </span>
              </div>
            </div>

            {/* Matched Invoices */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <div className="flex items-center">
                  <span>Matched Invoices</span>
                  <GstHelperTooltip 
                    term="Matched Invoices"
                    content="Invoices where GSTIN, invoice number, date, and tax amounts match within accepted tolerance."
                  />
                </div>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-emerald-700">
                  {matchedInvoices}
                </span>
                <span className="text-xs text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded">
                  {totalInvoices > 0 ? Math.round((matchedInvoices / totalInvoices) * 100) : 0}% matched
                </span>
              </div>
            </div>

            {/* Tax / Value Discrepancies */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <div className="flex items-center">
                  <span>Tax/Value Mismatches</span>
                  <GstHelperTooltip 
                    term="Tax Mismatch"
                    content="Invoices where taxable value or tax amounts differ between books and GSTR-2B."
                  />
                </div>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-amber-700">
                  {mismatchedInvoices}
                </span>
                <span className="text-xs text-slate-500">
                  Tolerance: ₹1.00
                </span>
              </div>
            </div>

            {/* Critical Discrepancies */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <div className="flex items-center">
                  <span>Discrepancies / Missing</span>
                  <GstHelperTooltip 
                    term="Major Discrepancy"
                    content="Critical mismatches such as missing invoices in GSTR-2B or ambiguous duplicate occurrences."
                  />
                </div>
                <TrendingDown className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-rose-700">
                  {majorDiscrepancies + ambiguousInvoices}
                </span>
                <span className="text-xs text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded">
                  {majorDiscrepancies > 0 ? 'Action required' : 'Verified'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* File Upload Module: Purchase Register & GSTR-2B */}
        <div ref={uploadSectionRef} id="upload-data-section">
          <FileUploadSection />
        </div>

        {/* Main Section: Recent Reconciliation Runs */}
        <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Recent Reconciliation Runs
              </h2>
              <p className="text-xs text-slate-500">
                Authoritative reconciliation jobs persisted in PostgreSQL database.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('reports')}
              className="text-xs text-blue-700 hover:text-blue-900 font-medium flex items-center space-x-1 cursor-pointer"
            >
              <span>All Reports</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-semibold">
                  <th className="py-2.5 px-4">Job Identifier</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">PR Records</th>
                  <th className="py-2.5 px-4 text-right">2B Records</th>
                  <th className="py-2.5 px-4 text-right">Matched</th>
                  <th className="py-2.5 px-4 text-right">Discrepancies</th>
                  <th className="py-2.5 px-4">Run Date / Time</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backendJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 text-xs">
                      No reconciliation jobs uploaded yet. Use the upload module above to ingest Purchase Register and GSTR-2B files.
                    </td>
                  </tr>
                ) : (
                  backendJobs.map((job) => {
                    const isSelected = job.id === activeJobId;
                    const discrepancies = job.summary 
                      ? (job.summary.mismatched + job.summary.missing_in_gstr2b + job.summary.duplicate_ambiguous) 
                      : 0;

                    return (
                      <tr 
                        key={job.id} 
                        className={`transition-colors ${
                          isSelected ? 'bg-blue-50/50 font-medium' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          <div className="flex items-center space-x-1.5">
                            <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{job.id.slice(0, 12)}...</span>
                            {isSelected && (
                              <span className="text-[10px] font-sans font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                                ACTIVE
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">
                          {job.purchase_records_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">
                          {job.gstr2b_records_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">
                          {job.summary ? job.summary.matched : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {job.summary ? (
                            discrepancies > 0 ? (
                              <span className="text-rose-700 font-semibold">
                                {discrepancies} issues
                              </span>
                            ) : (
                              <span className="text-emerald-700 font-semibold">
                                0
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">Pending Run</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono flex items-center space-x-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatDate(job.created_at)}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center space-x-1.5">
                            {job.summary ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveJobId(job.id);
                                  setActivePage('results');
                                }}
                                className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 cursor-pointer"
                              >
                                View Results
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveJobId(job.id);
                                  setActivePage('reconciliation');
                                }}
                                className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline px-2 py-1 rounded bg-emerald-50 hover:bg-emerald-100 cursor-pointer"
                              >
                                Reconcile
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
      </main>
    </div>
  );
};