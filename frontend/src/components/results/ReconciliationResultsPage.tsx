import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { StatusBadge, SeverityBadge } from '../common/Badge';
import { InvoiceDetailDrawer } from './InvoiceDetailDrawer';
import { 
  Search, 
  Download, 
  ExternalLink, 
  X,
  Sparkles,
  AlertTriangle,
  RotateCw,
  Upload,
  ArrowRight
} from 'lucide-react';
import type { BackendReconciliationResult } from '../../types';

export const ReconciliationResultsPage: React.FC = () => {
  const { 
    selectedBackendResult,
    setSelectedBackendResult,
    backendResults,
    backendSummary,
    backendJobs,
    activeJobId,
    setActiveJobId,
    selectedPeriod,
    setActivePage,
    showNotification
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const hasResults = backendResults && backendResults.length > 0;

  // Real backend summary counts strictly derived from backend authoritative data
  const totalCount = backendSummary?.total_results ?? backendResults.length;
  const matchedCount = backendSummary?.matched ?? backendResults.filter(r => r.status === 'MATCHED').length;
  const missing2bCount = backendSummary?.missing_in_gstr2b ?? backendResults.filter(r => r.status === 'MISSING_IN_GSTR2B').length;
  const missingPrCount = backendSummary?.missing_in_purchase_register ?? backendResults.filter(r => r.status === 'MISSING_IN_PURCHASE_REGISTER').length;
  const duplicateAmbiguousCount = backendSummary?.duplicate_ambiguous ?? backendResults.filter(r => r.status === 'DUPLICATE_AMBIGUOUS').length;
  const majorCount = backendSummary?.major_discrepancies ?? backendResults.filter(r => r.severity === 'MAJOR').length;
  const minorCount = backendSummary?.minor_discrepancies ?? backendResults.filter(r => r.severity === 'MINOR').length;
  const noneCount = backendSummary?.none_count ?? backendResults.filter(r => r.severity === 'NONE' || r.status === 'MATCHED').length;
  const unclassifiedCount = backendSummary?.unclassified_count ?? backendResults.filter(r => r.severity === 'UNCLASSIFIED' || r.status === 'DUPLICATE_AMBIGUOUS').length;
  const suggestionsCount = backendResults.filter(r => r.proposals && r.proposals.length > 0).length;

  // Filtered backend records
  const filteredBackendResults = useMemo(() => {
    if (!hasResults) return [];
    return backendResults.filter(item => {
      // Severity filter tabs
      if (activeFilter === 'major' && item.severity !== 'MAJOR') return false;
      if (activeFilter === 'minor' && item.severity !== 'MINOR') return false;
      if (activeFilter === 'none' && item.severity !== 'NONE' && item.status !== 'MATCHED') return false;
      if (activeFilter === 'unclassified' && item.severity !== 'UNCLASSIFIED' && item.status !== 'DUPLICATE_AMBIGUOUS') return false;

      // Status filter tabs
      if (activeFilter === 'matched' && item.status !== 'MATCHED') return false;
      if (activeFilter === 'attention' && item.status === 'MATCHED') return false;
      if (activeFilter === 'suggestions' && (!item.proposals || item.proposals.length === 0)) return false;

      // Sub-filter support
      if (activeFilter === 'mismatch' && item.status !== 'MISMATCH') return false;
      if (activeFilter === 'missing_2b' && item.status !== 'MISSING_IN_GSTR2B') return false;
      if (activeFilter === 'missing_pr' && item.status !== 'MISSING_IN_PURCHASE_REGISTER') return false;
      if (activeFilter === 'ambiguous' && item.status !== 'DUPLICATE_AMBIGUOUS') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const prInv = item.purchase_record?.invoice_number?.toLowerCase() || '';
        const twoBInv = item.gstr2b_record?.invoice_number?.toLowerCase() || '';
        const prGstin = item.purchase_record?.supplier_gstin?.toLowerCase() || '';
        const twoBGstin = item.gstr2b_record?.supplier_gstin?.toLowerCase() || '';
        if (!prInv.includes(q) && !twoBInv.includes(q) && !prGstin.includes(q) && !twoBGstin.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [backendResults, hasResults, activeFilter, searchQuery]);

  const handleExportCsv = () => {
    if (!hasResults) {
      showNotification('No reconciliation records to export. Please run reconciliation first.', 'warning');
      return;
    }

    const headers = 'Result ID,Status,Severity,Severity Reason,Supplier GSTIN,Invoice Number,Invoice Date,PR Taxable,PR CGST,PR SGST,PR IGST,2B Taxable,2B CGST,2B SGST,2B IGST,Differences,AI Proposals\n';
    const rows = filteredBackendResults.map(r => {
      const gstin = r.purchase_record?.supplier_gstin || r.gstr2b_record?.supplier_gstin || '';
      const invNum = r.purchase_record?.invoice_number || r.gstr2b_record?.invoice_number || '';
      const invDate = r.purchase_record?.invoice_date || r.gstr2b_record?.invoice_date || '';
      const severity = r.severity || 'UNCLASSIFIED';
      const severityReason = (r.severity_reason || '').replace(/"/g, '""');
      const prTaxable = r.purchase_record?.taxable_value || '0.00';
      const prCgst = r.purchase_record?.cgst || '0.00';
      const prSgst = r.purchase_record?.sgst || '0.00';
      const prIgst = r.purchase_record?.igst || '0.00';
      const twoBTaxable = r.gstr2b_record?.taxable_value || '0.00';
      const twoBCgst = r.gstr2b_record?.cgst || '0.00';
      const twoBSgst = r.gstr2b_record?.sgst || '0.00';
      const twoBIgst = r.gstr2b_record?.igst || '0.00';
      const diffText = Object.entries(r.differences || {})
        .map(([k, v]) => `${k}:${v.difference}`)
        .join(';');
      const aiText = (r.proposals || [])
        .map(p => `Candidate#${p.candidate_record_id}:${p.confidence}`)
        .join(';');
      return `"${r.id}","${r.status}","${severity}","${severityReason}","${gstin}","${invNum}","${invDate}",${prTaxable},${prCgst},${prSgst},${prIgst},${twoBTaxable},${twoBCgst},${twoBSgst},${twoBIgst},"${diffText}","${aiText}"`;
    }).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GST_Reconciliation_${activeJobId ? activeJobId.slice(0, 8) : 'Export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`Exported ${filteredBackendResults.length} authoritative reconciliation records to CSV`, 'info');
  };

  const formatCurrency = (val: number | string | null | undefined) => {
    if (val === undefined || val === null || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '—';
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Reconciliation Results"
        subtitle={
          activeJobId 
            ? `Authoritative results register for Job ${activeJobId.slice(0, 10)}... (${selectedPeriod}).`
            : `Authoritative results register for ${selectedPeriod}.`
        }
        actionButton={
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActivePage('reconciliation')}
              className="inline-flex items-center space-x-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium px-3 py-1.5 rounded border border-slate-300 transition-colors shadow-xs cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Re-run Matching</span>
            </button>
            <button
              type="button"
              disabled={!hasResults}
              onClick={handleExportCsv}
              className={`inline-flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded border transition-colors shadow-xs ${
                hasResults 
                  ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 cursor-pointer' 
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        }
      />

      <main className="p-6 space-y-5 max-w-7xl">
        {/* Job Switcher if multiple jobs exist */}
        {backendJobs.length > 1 && (
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Reconciliation Dataset:</span>
              <select
                value={activeJobId || ''}
                onChange={(e) => setActiveJobId(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded px-2 py-1 font-mono font-medium text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-blue-600"
              >
                {backendJobs.map(j => (
                  <option key={j.id} value={j.id}>
                    Job {j.id.slice(0, 10)}... ({j.purchase_records_count} PR, {j.gstr2b_records_count} 2B) [{j.status}]
                  </option>
                ))}
              </select>
            </div>
            <span className="text-slate-500 font-mono text-[11px]">
              Showing authoritative results for active job
            </span>
          </div>
        )}

        {/* Metric Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
            <div className="text-[11px] font-medium text-slate-500">Total Evaluated</div>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">{totalCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
            <div className="text-[11px] font-medium text-emerald-800">Exact Matched</div>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">{matchedCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
            <div className="text-[11px] font-medium text-rose-800">Major Discrepancy</div>
            <div className="text-xl font-bold font-mono text-rose-700 mt-1">{majorCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
            <div className="text-[11px] font-medium text-amber-800">Minor Discrepancy</div>
            <div className="text-xl font-bold font-mono text-amber-700 mt-1">{minorCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
            <div className="text-[11px] font-medium text-indigo-800">Missing Invoices</div>
            <div className="text-xl font-bold font-mono text-indigo-700 mt-1">{missing2bCount + missingPrCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
            <div className="text-[11px] font-medium text-slate-600">Ambiguous Duplicates</div>
            <div className="text-xl font-bold font-mono text-slate-700 mt-1">{duplicateAmbiguousCount}</div>
          </div>
        </div>

        {/* Empty / Prompt State: No job loaded */}
        {!activeJobId ? (
          <div className="bg-white border border-slate-200 rounded p-12 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">No Reconciliation Job Selected</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Please upload your Purchase Register and GSTR-2B files to perform deterministic reconciliation.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('upload')}
              className="inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-5 py-2.5 rounded shadow-xs transition-colors cursor-pointer"
            >
              <span>Go to Upload Data</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : !hasResults ? (
          /* Empty / Prompt State: Job uploaded but reconciliation not yet executed */
          <div className="bg-white border border-slate-200 rounded p-12 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 bg-amber-50 text-amber-700 rounded-full flex items-center justify-center mx-auto">
              <RotateCw className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Reconciliation Not Yet Executed</h2>
              <p className="text-xs text-slate-600 max-w-lg mx-auto mt-1">
                Job <code className="font-mono text-slate-900 font-semibold">{activeJobId.slice(0, 10)}...</code> has been uploaded to the database, but deterministic reconciliation has not been executed yet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActivePage('reconciliation')}
              className="inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-6 py-2.5 rounded shadow-sm transition-colors cursor-pointer"
            >
              <span>Go to Reconciliation Engine & Run</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {/* Filter Tabs and Search Bar */}
            <div className="bg-white border border-slate-200 rounded p-3.5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              {/* Severity & Status Tabs */}
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
                {[
                  { id: 'all', label: `All (${totalCount})` },
                  { id: 'major', label: `Major (${majorCount})` },
                  { id: 'minor', label: `Minor (${minorCount})` },
                  { id: 'none', label: `None (${noneCount})` },
                  { id: 'unclassified', label: `Unclassified (${unclassifiedCount})` },
                  { id: 'suggestions', label: `Suggestions (${suggestionsCount})` },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFilter(tab.id)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      activeFilter === tab.id
                        ? 'bg-blue-700 text-white shadow-xs'
                        : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div className="relative w-full md:w-80">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search invoice # or GSTIN..."
                  className="w-full pl-9 pr-8 py-1.5 border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Main Reconciliation Table */}
            <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-700 font-semibold select-none">
                      <th className="py-2.5 px-3">Supplier GSTIN</th>
                      <th className="py-2.5 px-3">Invoice Number</th>
                      <th className="py-2.5 px-3">Invoice Date</th>
                      <th className="py-2.5 px-3">Match Status</th>
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3 text-right">Books Taxable</th>
                      <th className="py-2.5 px-3 text-right">GSTR-2B Taxable</th>
                      <th className="py-2.5 px-3">Difference / Reason</th>
                      <th className="py-2.5 px-3">Suggested Match</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredBackendResults.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-500">
                          No reconciliation results match the selected filter or search query.
                        </td>
                      </tr>
                    ) : (
                      filteredBackendResults.map((result: BackendReconciliationResult) => {
                        const gstin = result.purchase_record?.supplier_gstin || result.gstr2b_record?.supplier_gstin || '—';
                        const invNum = result.purchase_record?.invoice_number || result.gstr2b_record?.invoice_number || '—';
                        const invDate = result.purchase_record?.invoice_date || result.gstr2b_record?.invoice_date || '—';
                        const diffKeys = Object.keys(result.differences || {});
                        const proposals = result.proposals || [];

                        return (
                          <tr
                            key={result.id}
                            onClick={() => setSelectedBackendResult(result)}
                            className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                          >
                            {/* Supplier GSTIN */}
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-900 group-hover:text-blue-800">
                              {gstin}
                            </td>

                            {/* Invoice Number */}
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                              {invNum}
                            </td>

                            {/* Invoice Date */}
                            <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                              {invDate}
                            </td>

                            {/* Status Badge */}
                            <td className="py-2.5 px-3">
                              <StatusBadge status={result.status} />
                            </td>

                            {/* Severity Badge */}
                            <td className="py-2.5 px-3">
                              <SeverityBadge severity={result.severity} />
                            </td>

                            {/* PR Taxable */}
                            <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                              {result.purchase_record ? formatCurrency(result.purchase_record.taxable_value) : '—'}
                            </td>

                            {/* 2B Taxable */}
                            <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                              {result.gstr2b_record ? formatCurrency(result.gstr2b_record.taxable_value) : '—'}
                            </td>

                            {/* Differences Detected / Reason */}
                            <td className="py-2.5 px-3 text-[11px] max-w-xs">
                              {result.status === 'MATCHED' ? (
                                <span className="text-emerald-700 font-semibold font-mono">Matched (₹0.00)</span>
                              ) : result.severity_reason ? (
                                <div className="truncate text-slate-700" title={result.severity_reason}>
                                  {result.severity_reason}
                                </div>
                              ) : result.status === 'DUPLICATE_AMBIGUOUS' ? (
                                <span className="text-amber-700 font-semibold flex items-center space-x-1">
                                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                                  <span>Duplicate Keys Hold</span>
                                </span>
                              ) : result.status === 'MISSING_IN_GSTR2B' ? (
                                <span className="text-rose-700 font-medium">Missing in GSTR-2B</span>
                              ) : result.status === 'MISSING_IN_PURCHASE_REGISTER' ? (
                                <span className="text-indigo-700 font-medium">Missing in Books</span>
                              ) : diffKeys.length > 0 ? (
                                <div className="space-y-0.5">
                                  {diffKeys.slice(0, 2).map((k) => (
                                    <div key={k} className="text-rose-700 font-mono text-[10px]">
                                      {k}: {result.differences[k]?.difference}
                                    </div>
                                  ))}
                                  {diffKeys.length > 2 && (
                                    <span className="text-[10px] text-slate-400">+{diffKeys.length - 2} more</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>

                            {/* Suggested Match */}
                            <td className="py-2.5 px-3">
                              {proposals.length > 0 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActivePage('review');
                                  }}
                                  className="inline-flex items-center space-x-1 bg-blue-100 hover:bg-blue-200 text-blue-900 border border-blue-300 text-[11px] font-semibold px-2 py-0.5 rounded transition-colors cursor-pointer"
                                  title="Review AI suggested match"
                                >
                                  <Sparkles className="w-3 h-3 text-blue-700" />
                                  <span>Suggested Match</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 text-[11px]">—</span>
                              )}
                            </td>

                            {/* Action */}
                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center space-x-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedBackendResult(result)}
                                  title="View side-by-side comparison"
                                  className="p-1 text-slate-400 hover:text-blue-700 hover:bg-slate-100 rounded cursor-pointer"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Footer info */}
              <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/70 text-[11px] text-slate-500 flex items-center justify-between">
                <span>
                  Showing {filteredBackendResults.length} of {totalCount} records • Click any row to inspect side-by-side field diff
                </span>
                <span>
                  All tax arithmetic uses signed decimal precision (Books - 2B)
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Invoice Detail Side Drawer */}
      <InvoiceDetailDrawer
        backendResult={selectedBackendResult}
        onClose={() => setSelectedBackendResult(null)}
      />
    </div>
  );
};