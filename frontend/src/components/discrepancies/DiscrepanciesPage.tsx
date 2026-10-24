import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { StatusBadge } from '../common/Badge';
import { InvoiceDetailDrawer } from '../results/InvoiceDetailDrawer';
import { 
  AlertOctagon, 
  Mail, 
  ExternalLink,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Upload
} from 'lucide-react';
import type { BackendReconciliationResult } from '../../types';

export const DiscrepanciesPage: React.FC = () => {
  const { 
    backendResults,
    backendSummary,
    activeJobId,
    selectedPeriod, 
    setActivePage,
    selectedBackendResult,
    setSelectedBackendResult,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Filter only records that have discrepancies (status !== 'MATCHED')
  const discrepancyResults = useMemo(() => {
    return backendResults.filter(r => r.status !== 'MATCHED');
  }, [backendResults]);

  // Unique suppliers for dropdown
  const uniqueSuppliers = useMemo(() => {
    const set = new Set<string>();
    discrepancyResults.forEach(r => {
      const gstin = r.purchase_record?.supplier_gstin || r.gstr2b_record?.supplier_gstin;
      if (gstin) set.add(gstin);
    });
    return Array.from(set);
  }, [discrepancyResults]);

  // Filtered list
  const filteredList = useMemo(() => {
    return discrepancyResults.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      const gstin = r.purchase_record?.supplier_gstin || r.gstr2b_record?.supplier_gstin || '';
      if (supplierFilter !== 'all' && gstin !== supplierFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const prInv = r.purchase_record?.invoice_number?.toLowerCase() || '';
        const twoBInv = r.gstr2b_record?.invoice_number?.toLowerCase() || '';
        if (!prInv.includes(q) && !twoBInv.includes(q) && !gstin.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [discrepancyResults, statusFilter, supplierFilter, searchQuery]);

  // Calculate tax at risk
  const itcAtRisk = useMemo(() => {
    return discrepancyResults.reduce((sum, r) => {
      if (r.status === 'MISSING_IN_GSTR2B' && r.purchase_record) {
        const cgst = parseFloat(r.purchase_record.cgst) || 0;
        const sgst = parseFloat(r.purchase_record.sgst) || 0;
        const igst = parseFloat(r.purchase_record.igst) || 0;
        return sum + cgst + sgst + igst;
      }
      if (r.status === 'MISMATCH' && r.differences) {
        let diffSum = 0;
        ['cgst', 'sgst', 'igst'].forEach(f => {
          if (r.differences[f]?.difference) {
            diffSum += Math.abs(parseFloat(r.differences[f].difference) || 0);
          }
        });
        return sum + diffSum;
      }
      return sum;
    }, 0);
  }, [discrepancyResults]);

  const mismatchCount = backendSummary?.mismatched ?? discrepancyResults.filter(r => r.status === 'MISMATCH').length;
  const missing2bCount = backendSummary?.missing_in_gstr2b ?? discrepancyResults.filter(r => r.status === 'MISSING_IN_GSTR2B').length;
  const missingPrCount = backendSummary?.missing_in_purchase_register ?? discrepancyResults.filter(r => r.status === 'MISSING_IN_PURCHASE_REGISTER').length;
  const duplicateAmbiguousCount = backendSummary?.duplicate_ambiguous ?? discrepancyResults.filter(r => r.status === 'DUPLICATE_AMBIGUOUS').length;

  const formatCurrency = (val?: number | string | null) => {
    if (val === undefined || val === null || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '—';
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Discrepancies Register"
        subtitle={`Dedicated audit register for invoices requiring attention or supplier correction for ${selectedPeriod}.`}
      />

      <main className="p-6 space-y-5 max-w-7xl">
        {/* If no active job loaded */}
        {!activeJobId ? (
          <div className="bg-white border border-slate-200 rounded p-12 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">No Reconciliation Job Selected</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Please upload datasets to analyze invoice discrepancies.
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
        ) : (
          <>
            {/* Financial Impact Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-rose-50 border border-rose-200 rounded p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-rose-800">Critical Discrepancies</span>
                  <AlertOctagon className="w-4 h-4 text-rose-600" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-rose-900">
                    {missing2bCount + mismatchCount}
                  </span>
                  <span className="text-xs font-bold font-mono text-rose-800 bg-rose-200/80 px-2 py-0.5 rounded">
                    {formatCurrency(itcAtRisk)} ITC At Risk
                  </span>
                </div>
                <p className="text-[11px] text-rose-700 mt-1">
                  Invoices missing in GSTR-2B or with tax variances under Section 16(2)(aa).
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-800">Ambiguous & Missing in Books</span>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-amber-900">
                    {duplicateAmbiguousCount + missingPrCount}
                  </span>
                  <span className="text-xs text-amber-800 font-mono font-medium">
                    {duplicateAmbiguousCount} duplicate hold, {missingPrCount} unrecorded
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 mt-1">
                  Requires ledger entry or human review of duplicate supplier invoices.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded p-4 flex flex-col justify-between shadow-xs">
                <div className="text-xs font-semibold text-slate-700">GST Compliance Rule</div>
                <p className="text-xs text-slate-600 leading-relaxed mt-1">
                  <strong>Section 16(2)(aa):</strong> Input Tax Credit can only be legally availed if the invoice is furnished by the supplier in GSTR-1 and appears in GSTR-2B.
                </p>
                <div className="mt-2 text-[11px] text-blue-700 font-medium">
                  Authoritative Job: <code className="font-mono">{activeJobId.slice(0, 10)}...</code>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="bg-white border border-slate-200 rounded p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-slate-700">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="all">All Discrepancies ({discrepancyResults.length})</option>
                  <option value="MISMATCH">Tax/Value Mismatch ({mismatchCount})</option>
                  <option value="MISSING_IN_GSTR2B">Missing in GSTR-2B ({missing2bCount})</option>
                  <option value="MISSING_IN_PURCHASE_REGISTER">Missing in Books ({missingPrCount})</option>
                  {duplicateAmbiguousCount > 0 && (
                    <option value="DUPLICATE_AMBIGUOUS">Duplicate Ambiguous ({duplicateAmbiguousCount})</option>
                  )}
                </select>

                {uniqueSuppliers.length > 1 && (
                  <>
                    <span className="font-medium text-slate-700 ml-2">Supplier:</span>
                    <select
                      value={supplierFilter}
                      onChange={(e) => setSupplierFilter(e.target.value)}
                      className="border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                    >
                      <option value="all">All Suppliers</option>
                      {uniqueSuppliers.map(gstin => (
                        <option key={gstin} value={gstin}>{gstin}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search invoice # or GSTIN..."
                  className="border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 w-52"
                />
                {(statusFilter !== 'all' || supplierFilter !== 'all' || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('all');
                      setSupplierFilter('all');
                      setSearchQuery('');
                    }}
                    className="text-slate-500 hover:text-slate-800 flex items-center space-x-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Main Discrepancy Table */}
            <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
              {discrepancyResults.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-900">Zero Discrepancies Detected</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    All evaluated invoice records in Job <code className="font-mono">{activeJobId.slice(0, 8)}</code> match identically between books and GSTR-2B.
                  </p>
                </div>
              ) : filteredList.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  No discrepancy records match your current filter or search criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-700 font-semibold select-none">
                        <th className="py-2.5 px-3">Supplier GSTIN</th>
                        <th className="py-2.5 px-3">Invoice Number</th>
                        <th className="py-2.5 px-3">Invoice Date</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">PR Taxable</th>
                        <th className="py-2.5 px-3 text-right">2B Taxable</th>
                        <th className="py-2.5 px-3">Discrepancy Details</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredList.map((result: BackendReconciliationResult) => {
                        const gstin = result.purchase_record?.supplier_gstin || result.gstr2b_record?.supplier_gstin || '—';
                        const invNum = result.purchase_record?.invoice_number || result.gstr2b_record?.invoice_number || '—';
                        const invDate = result.purchase_record?.invoice_date || result.gstr2b_record?.invoice_date || '—';
                        const diffKeys = Object.keys(result.differences || {});

                        return (
                          <tr
                            key={result.id}
                            onClick={() => setSelectedBackendResult(result)}
                            className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                          >
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-900 group-hover:text-blue-800">
                              {gstin}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                              {invNum}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                              {invDate}
                            </td>
                            <td className="py-2.5 px-3">
                              <StatusBadge status={result.status} />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                              {result.purchase_record ? formatCurrency(result.purchase_record.taxable_value) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-800">
                              {result.gstr2b_record ? formatCurrency(result.gstr2b_record.taxable_value) : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-[11px]">
                              {result.status === 'DUPLICATE_AMBIGUOUS' ? (
                                <span className="text-amber-700 font-medium">Multiple identical keys held</span>
                              ) : result.status === 'MISSING_IN_GSTR2B' ? (
                                <span className="text-rose-700 font-medium">Invoice not uploaded by vendor</span>
                              ) : result.status === 'MISSING_IN_PURCHASE_REGISTER' ? (
                                <span className="text-indigo-700 font-medium">Invoice missing in purchase ledger</span>
                              ) : diffKeys.length > 0 ? (
                                <div className="space-y-0.5">
                                  {diffKeys.map((k) => (
                                    <div key={k} className="text-rose-700 font-mono text-[10px]">
                                      {k}: {result.differences[k]?.difference}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center space-x-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedBackendResult(result)}
                                  title="View comparison details"
                                  className="p-1 text-slate-400 hover:text-blue-700 hover:bg-slate-100 rounded cursor-pointer"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                                {(result.status === 'MISMATCH' || result.status === 'MISSING_IN_GSTR2B') && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedBackendResult(result);
                                      setActivePage('vendor');
                                    }}
                                    title="Draft vendor notice"
                                    className="p-1 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/70 text-[11px] text-slate-500 flex items-center justify-between">
                <span>
                  Showing {filteredList.length} of {discrepancyResults.length} discrepancies for active job
                </span>
                <span>
                  Section 16(2)(aa) statutory audit view
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