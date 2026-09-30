import React from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { StatusBadge } from '../common/Badge';
import { GstHelperTooltip } from '../common/Tooltip';
import { 
  AlertOctagon, 
  ArrowRight, 
  CheckCircle, 
  AlertTriangle, 
  FileCheck, 
  Plus, 
  ChevronRight,
  TrendingDown,
  Clock
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { 
    runs, 
    records, 
    setActivePage, 
    selectedPeriod,
  } = useApp();

  // Active run stats
  const totalInvoices = records.length;
  const matchedInvoices = records.filter(r => r.matchStatus === 'matched').length;
  const minorDiscrepancies = records.filter(r => r.severity === 'minor').length;
  const majorDiscrepancies = records.filter(r => r.severity === 'major').length;
  const itcAtRisk = records
    .filter(r => r.severity === 'major')
    .reduce((sum, r) => sum + (r.differenceAmount || r.totalTax), 0);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Dashboard"
        subtitle="Monitor your GST reconciliation activity."
        actionButton={
          <button
            type="button"
            onClick={() => setActivePage('upload')}
            className="inline-flex items-center space-x-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Reconciliation</span>
          </button>
        }
      />

      <main className="p-6 space-y-6 max-w-7xl">
        {/* Action Required Banner: Shown ONLY when major discrepancies exist */}
        {majorDiscrepancies > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-rose-100 text-rose-700 rounded shrink-0 mt-0.5">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-rose-900">
                    Action Required: {majorDiscrepancies} Major Discrepancies
                  </h3>
                  <span className="text-xs font-semibold bg-rose-200 text-rose-900 px-2 py-0.5 rounded font-mono">
                    ₹{itcAtRisk.toLocaleString('en-IN')} ITC at risk
                  </span>
                </div>
                <p className="text-xs text-rose-800 mt-1 max-w-3xl leading-relaxed">
                  These invoices are either missing in GSTR-2B or show tax mismatches. Under GST Section 16(2)(aa), 
                  unmatched input credit cannot be claimed in GSTR-3B without vendor rectification.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5 sm:shrink-0 pt-2 sm:pt-0">
              <button
                type="button"
                onClick={() => setActivePage('discrepancies')}
                className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors flex items-center space-x-1"
              >
                <span>Review Discrepancies</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setActivePage('vendor')}
                className="bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-medium px-3 py-1.5 rounded transition-colors"
              >
                Draft Notices
              </button>
            </div>
          </div>
        )}

        {/* Financial Summary Section (Restrained, clear numbers, not overly card-heavy) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Summary for {selectedPeriod}
            </div>
            <div className="text-xs text-slate-500">
              Rule 36(4) Reconciliation Status
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

            {/* Minor Discrepancies */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <div className="flex items-center">
                  <span>Minor Discrepancies</span>
                  <GstHelperTooltip 
                    term="Minor Discrepancy"
                    content="Differences within acceptable limits, such as syntax variations (INV-01 vs INV/01), invoice date difference < 3 days, or rounding < ₹10."
                  />
                </div>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-amber-700">
                  {minorDiscrepancies}
                </span>
                <span className="text-xs text-slate-500">
                  Eligible for auto-clearance
                </span>
              </div>
            </div>

            {/* Major Discrepancies */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <div className="flex items-center">
                  <span>Major Discrepancies</span>
                  <GstHelperTooltip 
                    term="Major Discrepancy"
                    content="Critical mismatches such as missing invoices in GSTR-2B, wrong tax rates, or value variances. ITC cannot be legally availed until resolved."
                  />
                </div>
                <TrendingDown className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-bold font-mono text-rose-700">
                  {majorDiscrepancies}
                </span>
                <span className="text-xs text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.5 rounded">
                  Action required
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Section: Recent Reconciliation Runs */}
        <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-800">
                Recent Reconciliation Runs
              </h2>
              <p className="text-xs text-slate-500">
                Historical reconciliation jobs and match reports.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('reports')}
              className="text-xs text-blue-700 hover:text-blue-900 font-medium flex items-center space-x-1"
            >
              <span>All Reports</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-semibold">
                  <th className="py-2.5 px-4">GST Period</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Total Invoices</th>
                  <th className="py-2.5 px-4 text-right">Matched Records</th>
                  <th className="py-2.5 px-4 text-right">Discrepancies</th>
                  <th className="py-2.5 px-4">Run Date / Time</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {run.gstPeriod}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {run.totalInvoices}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-700 font-medium">
                      {run.matched}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {run.majorDiscrepancies > 0 ? (
                        <span className="text-rose-700 font-semibold">
                          {run.majorDiscrepancies + run.minorDiscrepancies} ({run.majorDiscrepancies} major)
                        </span>
                      ) : (
                        <span className="text-slate-600">
                          {run.minorDiscrepancies} minor
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{run.runDate}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setActivePage('reports')}
                        className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline px-2 py-1 rounded bg-blue-50/60 hover:bg-blue-100"
                      >
                        View Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Help Guide for MSMEs */}
        <div className="border border-slate-200 bg-white rounded p-4">
          <div className="flex items-center space-x-2 text-xs font-semibold text-slate-700 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <span>Standard GST Reconciliation Workflow for MSMEs</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs text-slate-600">
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="font-semibold text-slate-800 mb-1">1. Upload Files</div>
              <p className="text-slate-600">Upload your monthly Purchase Register from Tally/Busy/Excel and official GSTR-2B from the GST Portal.</p>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="font-semibold text-slate-800 mb-1">2. Review & Match</div>
              <p className="text-slate-600">Review missing GSTINs or duplicates, then execute the rule-based comparison engine.</p>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="font-semibold text-slate-800 mb-1">3. Resolve Discrepancies</div>
              <p className="text-slate-600">Identify unmatched records and generate automated email notices to non-compliant suppliers.</p>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <div className="font-semibold text-slate-800 mb-1">4. File GSTR-3B</div>
              <p className="text-slate-600">Download the reconciled report and confidently claim accurate ITC without fear of tax notices.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
