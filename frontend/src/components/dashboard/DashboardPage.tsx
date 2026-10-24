import React from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { StatusBadge } from '../common/Badge';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  ArrowRight, 
  ChevronRight, 
  FileText,
  Clock
} from 'lucide-react';
import type { BackendReconciliationResult } from '../../types';

export const DashboardPage: React.FC = () => {
  const { 
    backendJobs,
    backendSummary,
    backendUploadSummary,
    backendResults,
    pendingProposalsCount,
    setActivePage, 
    selectedPeriod,
  } = useApp();

  // Authoritative run stats derived strictly from backend
  const totalInvoices = backendSummary?.total_results ?? 
    ((backendUploadSummary?.purchase_register_count ?? 0) + (backendUploadSummary?.gstr2b_count ?? 0));
  const matchedInvoices = backendSummary?.matched ?? 0;
  const mismatchedInvoices = backendSummary?.mismatched ?? 0;
  const missingIn2b = backendSummary?.missing_in_gstr2b ?? 0;
  const missingInPr = backendSummary?.missing_in_purchase_register ?? 0;
  const ambiguousInvoices = backendSummary?.duplicate_ambiguous ?? 0;

  // Meaningful "Needs Attention" count (tax mismatches + missing filings + ambiguous duplicates)
  const needsAttentionCount = mismatchedInvoices + missingIn2b + missingInPr + ambiguousInvoices;

  // Filter top 5 issues requiring attention for the short list
  const issuesRequiringAttention = backendResults
    .filter(r => r.status !== 'MATCHED')
    .slice(0, 5);

  const formatCurrency = (val?: string | number | null) => {
    if (val === undefined || val === null || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '—';
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

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
        subtitle="Monitor your monthly GST reconciliation and input tax credit compliance."
        actionButton={
          <button
            type="button"
            onClick={() => setActivePage('upload')}
            className="inline-flex items-center space-x-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors shadow-sm cursor-pointer"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload Invoices</span>
          </button>
        }
      />

      <main className="p-6 space-y-6 max-w-7xl">
        {/* Latest Reconciliation Status & Primary Action Banner */}
        <div className="bg-white border border-slate-200 rounded p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Current Filing Period: <strong className="text-slate-800">{selectedPeriod}</strong>
              </span>
              {backendSummary ? (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Reconciliation Complete</span>
                </span>
              ) : (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                  <Clock className="w-3 h-3" />
                  <span>Ready for Reconciliation</span>
                </span>
              )}
            </div>

            <h2 className="text-base font-bold text-slate-900">
              {backendSummary 
                ? `${matchedInvoices} of ${totalInvoices} invoices successfully matched for ${selectedPeriod}`
                : 'Upload your Purchase Register & GSTR-2B files to reconcile input credit'}
            </h2>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Ensure all input tax credit (ITC) is matched before filing GSTR-3B to prevent Section 16(2)(aa) notices from the GST Department.
            </p>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setActivePage('upload')}
              className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-3.5 py-2 rounded transition-colors shadow-sm cursor-pointer flex items-center space-x-1.5"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Upload Invoices</span>
            </button>

            {backendSummary && (
              <button
                type="button"
                onClick={() => setActivePage('results')}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium px-3.5 py-2 rounded transition-colors cursor-pointer flex items-center space-x-1"
              >
                <span>View Results</span>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </button>
            )}
          </div>
        </div>

        {/* 4 Meaningful Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Invoices */}
          <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Total Invoices</span>
              <FileText className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-slate-900">
                {totalInvoices}
              </span>
              <span className="text-xs text-slate-500 font-sans">
                Books & Portal Records
              </span>
            </div>
          </div>

          {/* Card 2: Matched Invoices */}
          <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Matched Invoices</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-emerald-700">
                {matchedInvoices}
              </span>
              <span className="text-xs text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded">
                {totalInvoices > 0 ? Math.round((matchedInvoices / totalInvoices) * 100) : 0}% matched
              </span>
            </div>
          </div>

          {/* Card 3: Needs Attention */}
          <div 
            onClick={() => setActivePage('results')}
            className="bg-white border border-slate-200 hover:border-amber-400 rounded p-4 shadow-xs cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Needs Attention</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-amber-700">
                {needsAttentionCount}
              </span>
              <span className="text-xs text-amber-800 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                {needsAttentionCount > 0 ? 'Requires action' : 'Zero issues'}
              </span>
            </div>
          </div>

          {/* Card 4: Suggested Matches to Review */}
          <div 
            onClick={() => setActivePage('review')}
            className={`bg-white border rounded p-4 shadow-xs cursor-pointer transition-colors ${
              pendingProposalsCount > 0 
                ? 'border-blue-300 ring-1 ring-blue-200 hover:border-blue-500' 
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <div className="flex items-center space-x-1">
                <span>Suggested Matches</span>
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <span className="text-[10px] text-blue-700 font-semibold font-sans">
                Review & Confirm
              </span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-blue-700">
                {pendingProposalsCount}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                pendingProposalsCount > 0 ? 'bg-blue-100 text-blue-900' : 'bg-slate-100 text-slate-600'
              }`}>
                {pendingProposalsCount > 0 ? `${pendingProposalsCount} to review` : 'All reviewed'}
              </span>
            </div>
          </div>
        </div>

        {/* Short List of Most Important Issues Requiring Attention */}
        <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Invoices Requiring Your Attention
              </h3>
              <p className="text-xs text-slate-500">
                Discrepancies and unfiled supplier invoices that affect your ITC claim.
              </p>
            </div>

            {needsAttentionCount > 0 && (
              <button
                type="button"
                onClick={() => setActivePage('results')}
                className="text-xs text-blue-700 hover:text-blue-900 font-medium flex items-center space-x-1 cursor-pointer"
              >
                <span>View All ({needsAttentionCount})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {issuesRequiringAttention.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
              <div className="font-semibold text-slate-800">No discrepancies detected</div>
              <p className="mt-0.5">All uploaded invoices match or no records have been reconciled yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/60 text-slate-700 font-semibold">
                    <th className="py-2.5 px-4">Supplier GSTIN</th>
                    <th className="py-2.5 px-4">Invoice Number</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Taxable Amount</th>
                    <th className="py-2.5 px-4">Reason / Issue</th>
                    <th className="py-2.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {issuesRequiringAttention.map((result: BackendReconciliationResult) => {
                    const gstin = result.purchase_record?.supplier_gstin || result.gstr2b_record?.supplier_gstin || '—';
                    const inv = result.purchase_record?.invoice_number || result.gstr2b_record?.invoice_number || '—';
                    const taxable = result.purchase_record?.taxable_value || result.gstr2b_record?.taxable_value || '0.00';
                    const diffKeys = Object.keys(result.differences || {});

                    let reason = 'Mismatch';
                    if (result.status === 'MISSING_IN_GSTR2B') {
                      reason = 'Supplier has not filed this invoice in GSTR-2B';
                    } else if (result.status === 'MISSING_IN_PURCHASE_REGISTER') {
                      reason = 'Invoice filed in GSTR-2B but missing in your accounting books';
                    } else if (result.status === 'DUPLICATE_AMBIGUOUS') {
                      reason = 'Duplicate entries detected with identical invoice number';
                    } else if (diffKeys.length > 0) {
                      reason = `Tax difference: ${diffKeys.map(k => `${k} diff ${result.differences[k]?.difference}`).join(', ')}`;
                    }

                    return (
                      <tr key={result.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-800">
                          {gstin}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                          {inv}
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusBadge status={result.status} />
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                          {formatCurrency(taxable)}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 text-[11px] max-w-xs truncate" title={reason}>
                          {reason}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => setActivePage('results')}
                            className="text-blue-700 hover:text-blue-900 font-semibold text-xs cursor-pointer"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Past Reconciliation Activity Table */}
        <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Past Reconciliation Runs
            </h3>
            <span className="text-[11px] text-slate-500">
              {backendJobs.length} total reconciliation jobs saved
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/50 text-slate-600 font-semibold">
                  <th className="py-2 px-4">Run Date</th>
                  <th className="py-2 px-4">Status</th>
                  <th className="py-2 px-4 text-right">Invoices in Books</th>
                  <th className="py-2 px-4 text-right">Invoices in 2B</th>
                  <th className="py-2 px-4 text-right">Matched</th>
                  <th className="py-2 px-4 text-right">Discrepancies</th>
                  <th className="py-2 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {backendJobs.slice(0, 5).map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50">
                    <td className="py-2 px-4 text-slate-700 font-mono text-[11px]">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="py-2 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        job.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-slate-800">
                      {job.purchase_records_count}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-slate-800">
                      {job.gstr2b_records_count}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700 font-semibold">
                      {job.summary ? job.summary.matched : '—'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-amber-700">
                      {job.summary ? (job.summary.mismatched + job.summary.total_missing) : '—'}
                    </td>
                    <td className="py-2 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setActivePage('results')}
                        className="text-blue-700 hover:text-blue-900 font-medium text-xs cursor-pointer"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};
