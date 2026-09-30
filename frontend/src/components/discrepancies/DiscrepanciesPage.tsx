import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { StatusBadge } from '../common/Badge';
import { InvoiceDetailDrawer } from '../results/InvoiceDetailDrawer';
import { 
  AlertOctagon, 
  Mail, 
  Check, 
  ExternalLink,
  RotateCcw
} from 'lucide-react';

export const DiscrepanciesPage: React.FC = () => {
  const { 
    records, 
    selectedPeriod, 
    setSelectedRecordForVendor, 
    setActivePage,
    setSelectedRecordForDetail,
    selectedRecordForDetail,
    acceptRecordDifference,
  } = useApp();

  const [severityFilter, setSeverityFilter] = useState<'all' | 'major' | 'minor'>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Filter only records that have discrepancies (severity !== 'exact')
  const discrepancyRecords = useMemo(() => {
    return records.filter(r => r.severity !== 'exact');
  }, [records]);

  // Unique suppliers for dropdown
  const uniqueSuppliers = useMemo(() => {
    const map = new Map<string, string>();
    discrepancyRecords.forEach(r => map.set(r.supplierGstin, r.supplierName));
    return Array.from(map.entries()).map(([gstin, name]) => ({ gstin, name }));
  }, [discrepancyRecords]);

  // Filtered list
  const filteredList = useMemo(() => {
    return discrepancyRecords.filter(r => {
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
      if (supplierFilter !== 'all' && r.supplierGstin !== supplierFilter) return false;
      if (typeFilter !== 'all' && r.discrepancyType !== typeFilter) return false;
      return true;
    });
  }, [discrepancyRecords, severityFilter, supplierFilter, typeFilter]);

  const majorCount = discrepancyRecords.filter(r => r.severity === 'major').length;
  const minorCount = discrepancyRecords.filter(r => r.severity === 'minor').length;
  const itcAtRisk = discrepancyRecords
    .filter(r => r.severity === 'major')
    .reduce((sum, r) => sum + (r.differenceAmount || r.totalTax), 0);

  const formatCurrency = (val?: number) => {
    if (!val) return '₹0.00';
    return '₹' + val.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  };

  const handleVendorAction = (record: typeof records[0]) => {
    setSelectedRecordForVendor(record);
    setActivePage('vendor');
  };

  const handleResetFilters = () => {
    setSeverityFilter('all');
    setSupplierFilter('all');
    setTypeFilter('all');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Discrepancies Register"
        subtitle={`Dedicated audit register for invoices requiring attention or supplier correction in ${selectedPeriod}.`}
      />

      <main className="p-6 space-y-5 max-w-7xl">
        {/* Financial Impact Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-rose-50 border border-rose-200 rounded p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-800">Major Discrepancies</span>
              <AlertOctagon className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-rose-900">{majorCount}</span>
              <span className="text-xs font-bold font-mono text-rose-800 bg-rose-200/80 px-2 py-0.5 rounded">
                ₹{itcAtRisk.toLocaleString('en-IN')} ITC At Risk
              </span>
            </div>
            <p className="text-[11px] text-rose-700 mt-1">
              Directly impact monthly GSTR-3B tax outflow if uncorrected.
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800">Minor Discrepancies</span>
              <span className="text-xs text-amber-600 font-mono">Tolerance Allowed</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-amber-900">{minorCount}</span>
              <span className="text-xs text-slate-600">
                Syntax / Rounding &lt; ₹10
              </span>
            </div>
            <p className="text-[11px] text-amber-800 mt-1">
              Eligible to be accepted and claimed safely.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded p-4 flex flex-col justify-between">
            <div className="text-xs font-semibold text-slate-700">GST Compliance Rule</div>
            <p className="text-xs text-slate-600 leading-relaxed mt-1">
              <strong>Section 16(2)(aa):</strong> ITC can only be taken if invoice is reported in GSTR-1 and appears in GSTR-2B.
            </p>
            <div className="mt-2 text-[11px] text-blue-700 font-medium">
              Deadline: Amendments must be filed by 11th of subsequent month.
            </div>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="bg-white border border-slate-200 rounded p-3.5 shadow-xs flex flex-wrap items-center gap-3">
          {/* Severity selector */}
          <div className="flex items-center space-x-1.5 text-xs">
            <label htmlFor="severity-filter" className="font-semibold text-slate-700">Severity:</label>
            <select
              id="severity-filter"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
              className="border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="all">All Discrepancies ({discrepancyRecords.length})</option>
              <option value="major">Major Only ({majorCount})</option>
              <option value="minor">Minor Only ({minorCount})</option>
            </select>
          </div>

          {/* Supplier selector */}
          <div className="flex items-center space-x-1.5 text-xs">
            <label htmlFor="supplier-filter" className="font-semibold text-slate-700">Supplier:</label>
            <select
              id="supplier-filter"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 max-w-xs truncate"
            >
              <option value="all">All Suppliers</option>
              {uniqueSuppliers.map(s => (
                <option key={s.gstin} value={s.gstin}>
                  {s.name} ({s.gstin})
                </option>
              ))}
            </select>
          </div>

          {/* Discrepancy Type */}
          <div className="flex items-center space-x-1.5 text-xs">
            <label htmlFor="type-filter" className="font-semibold text-slate-700">Issue Type:</label>
            <select
              id="type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
            >
              <option value="all">All Discrepancy Types</option>
              <option value="missing_in_gstr2b">Missing in GSTR-2B</option>
              <option value="taxable_value_mismatch">Taxable Value Mismatch</option>
              <option value="tax_amount_mismatch">Tax Amount Mismatch</option>
              <option value="invoice_number_syntax">Invoice # Syntax</option>
              <option value="missing_in_books">Missing in Books</option>
              <option value="gstin_mismatch">GSTIN Typo</option>
            </select>
          </div>

          {(severityFilter !== 'all' || supplierFilter !== 'all' || typeFilter !== 'all') && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs text-blue-700 hover:underline flex items-center space-x-1 ml-auto"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Discrepancies Table */}
        <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Invoice Number</th>
                  <th className="py-2.5 px-3">Supplier GSTIN & Name</th>
                  <th className="py-2.5 px-3">Discrepancy Details</th>
                  <th className="py-2.5 px-3 text-right">Difference Amount</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Notice Status</th>
                  <th className="py-2.5 px-3 text-center">Required Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      No discrepancies found matching the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredList.map((record) => (
                    <tr 
                      key={record.id} 
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Invoice Number */}
                      <td className="py-3 px-3 font-mono font-bold text-slate-900">
                        {record.invoiceNumber}
                        <div className="text-[11px] text-slate-500 font-sans font-normal">
                          {record.invoiceDate}
                        </div>
                      </td>

                      {/* Supplier */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800 max-w-xs truncate">
                          {record.supplierName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {record.supplierGstin}
                        </div>
                      </td>

                      {/* Discrepancy */}
                      <td className="py-3 px-3 max-w-sm">
                        <div className="font-medium text-slate-900 text-xs">
                          {record.reason}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {record.recommendedAction}
                        </div>
                      </td>

                      {/* Difference Amount */}
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        <span className={record.severity === 'major' ? 'text-rose-700' : 'text-amber-700'}>
                          {formatCurrency(record.differenceAmount)}
                        </span>
                      </td>

                      {/* Severity */}
                      <td className="py-3 px-3">
                        <StatusBadge severity={record.severity} />
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <StatusBadge status={record.vendorCommunicationStatus || 'not_contacted'} />
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {record.severity === 'major' ? (
                            <button
                              type="button"
                              onClick={() => handleVendorAction(record)}
                              className="inline-flex items-center space-x-1 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-[11px] px-2.5 py-1.5 rounded transition-colors shadow-xs"
                            >
                              <Mail className="w-3 h-3" />
                              <span>Request Vendor Correction</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => acceptRecordDifference(record.id)}
                              className="inline-flex items-center space-x-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-medium text-[11px] px-2.5 py-1.5 rounded border border-emerald-200 transition-colors"
                            >
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Accept</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedRecordForDetail(record)}
                            title="Inspect Side-by-Side Diff"
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <InvoiceDetailDrawer
        record={selectedRecordForDetail}
        onClose={() => setSelectedRecordForDetail(null)}
      />
    </div>
  );
};
