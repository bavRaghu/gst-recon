import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { StatusBadge } from '../common/Badge';
import { InvoiceDetailDrawer } from './InvoiceDetailDrawer';
import { 
  Search, 
  Download, 
  ExternalLink, 
  X,
  Mail
} from 'lucide-react';
import type { MatchStatus, DiscrepancySeverity } from '../../types';

export const ReconciliationResultsPage: React.FC = () => {
  const { 
    records, 
    selectedRecordForDetail, 
    setSelectedRecordForDetail, 
    selectedPeriod,
    setSelectedRecordForVendor,
    setActivePage,
    showNotification
  } = useApp();

  const [activeFilter, setActiveFilter] = useState<'all' | 'matched' | 'minor' | 'major' | 'unmatched'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Summary counts
  const totalCount = records.length;
  const matchedCount = records.filter(r => r.matchStatus === 'matched').length;
  const minorCount = records.filter(r => r.severity === 'minor').length;
  const majorCount = records.filter(r => r.severity === 'major').length;
  const unmatchedCount = records.filter(
    r => r.matchStatus === 'unmatched_in_2b' || r.matchStatus === 'unmatched_in_pr'
  ).length;

  // Filtered and searched records
  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      // Status filter
      if (activeFilter === 'matched' && record.matchStatus !== 'matched') return false;
      if (activeFilter === 'minor' && record.severity !== 'minor') return false;
      if (activeFilter === 'major' && record.severity !== 'major') return false;
      if (activeFilter === 'unmatched' && record.matchStatus !== 'unmatched_in_2b' && record.matchStatus !== 'unmatched_in_pr') return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesInvoice = record.invoiceNumber.toLowerCase().includes(q);
        const matchesGstin = record.supplierGstin.toLowerCase().includes(q);
        const matchesName = record.supplierName.toLowerCase().includes(q);
        if (!matchesInvoice && !matchesGstin && !matchesName) return false;
      }

      return true;
    });
  }, [records, activeFilter, searchQuery]);

  const handleExportCsv = () => {
    const headers = 'Supplier GSTIN,Supplier Name,Invoice Number,Invoice Date,Taxable Value,CGST,SGST,IGST,Total Value,Match Status,Discrepancy Type,Difference Amount\n';
    const rows = filteredRecords.map(r => 
      `"${r.supplierGstin}","${r.supplierName}","${r.invoiceNumber}","${r.invoiceDate}",${r.taxableValue},${r.cgst},${r.sgst},${r.igst},${r.totalValue},"${r.matchStatus}","${r.discrepancyType}",${r.differenceAmount}`
    ).join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GST_Reconciliation_${selectedPeriod.replace(' ', '_')}_Export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`Exported ${filteredRecords.length} records to CSV`, 'info');
  };

  const formatCurrency = (val: number) => {
    return '₹' + val.toLocaleString('en-IN');
  };

  const getDiscrepancyLabel = (type: string) => {
    switch (type) {
      case 'none': return 'None (Perfect)';
      case 'taxable_value_mismatch': return 'Taxable Value Mismatch';
      case 'tax_amount_mismatch': return 'Tax Amount Mismatch';
      case 'invoice_number_syntax': return 'Invoice # Syntax';
      case 'invoice_date_mismatch': return 'Date Variation';
      case 'missing_in_gstr2b': return 'Missing in GSTR-2B';
      case 'missing_in_books': return 'Missing in Books';
      case 'gstin_mismatch': return 'GSTIN Mismatch';
      default: return type;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Reconciliation Results"
        subtitle={`Detailed invoice-by-invoice reconciliation register for ${selectedPeriod}.`}
        actionButton={
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center space-x-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium px-3 py-1.5 rounded border border-slate-300 transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        }
      />

      <main className="p-6 space-y-5 max-w-7xl">
        {/* Metric Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
            <div className="text-[11px] font-medium text-slate-500">Total Records</div>
            <div className="text-xl font-bold font-mono text-slate-900 mt-1">{totalCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
            <div className="text-[11px] font-medium text-emerald-800">Matched</div>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-1">{matchedCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
            <div className="text-[11px] font-medium text-amber-800">Minor Discrepancies</div>
            <div className="text-xl font-bold font-mono text-amber-700 mt-1">{minorCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs">
            <div className="text-[11px] font-medium text-rose-800">Major Discrepancies</div>
            <div className="text-xl font-bold font-mono text-rose-700 mt-1">{majorCount}</div>
          </div>
          <div className="bg-white border border-slate-200 rounded p-3 shadow-xs col-span-2 sm:col-span-1">
            <div className="text-[11px] font-medium text-slate-700">Unmatched (Single Side)</div>
            <div className="text-xl font-bold font-mono text-slate-800 mt-1">{unmatchedCount}</div>
          </div>
        </div>

        {/* Filter Tabs and Search Bar */}
        <div className="bg-white border border-slate-200 rounded p-3.5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: `All (${totalCount})` },
              { id: 'matched', label: `Matched (${matchedCount})` },
              { id: 'minor', label: `Minor (${minorCount})` },
              { id: 'major', label: `Major (${majorCount})` },
              { id: 'unmatched', label: `Unmatched (${unmatchedCount})` },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id as typeof activeFilter)}
                className={`px-3 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeFilter === tab.id
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
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
              placeholder="Search invoice #, supplier, or GSTIN..."
              className="w-full pl-9 pr-8 py-1.5 border border-slate-300 rounded text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
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
                  <th className="py-2.5 px-3">Supplier GSTIN & Name</th>
                  <th className="py-2.5 px-3">Invoice Number</th>
                  <th className="py-2.5 px-3">Invoice Date</th>
                  <th className="py-2.5 px-3 text-right">Taxable Value</th>
                  <th className="py-2.5 px-3 text-right">CGST</th>
                  <th className="py-2.5 px-3 text-right">SGST</th>
                  <th className="py-2.5 px-3 text-right">IGST</th>
                  <th className="py-2.5 px-3">Match Status</th>
                  <th className="py-2.5 px-3">Discrepancy Type</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-500">
                      No invoices match the selected filter or search query.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record) => (
                    <tr
                      key={record.id}
                      onClick={() => setSelectedRecordForDetail(record)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                    >
                      {/* Supplier */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 truncate max-w-[200px] group-hover:text-blue-800">
                          {record.supplierName}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {record.supplierGstin}
                        </div>
                      </td>

                      {/* Invoice Number */}
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {record.invoiceNumber}
                      </td>

                      {/* Invoice Date */}
                      <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                        {record.invoiceDate}
                      </td>

                      {/* Taxable Value */}
                      <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800">
                        {formatCurrency(record.taxableValue)}
                      </td>

                      {/* CGST */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {record.cgst > 0 ? formatCurrency(record.cgst) : '—'}
                      </td>

                      {/* SGST */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {record.sgst > 0 ? formatCurrency(record.sgst) : '—'}
                      </td>

                      {/* IGST */}
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {record.igst > 0 ? formatCurrency(record.igst) : '—'}
                      </td>

                      {/* Match Status Badge */}
                      <td className="py-2.5 px-3">
                        <StatusBadge 
                          severity={record.severity as DiscrepancySeverity} 
                          status={record.matchStatus as MatchStatus} 
                        />
                      </td>

                      {/* Discrepancy Type */}
                      <td className="py-2.5 px-3 text-[11px] text-slate-700">
                        <span className={record.severity === 'major' ? 'text-rose-700 font-medium' : record.severity === 'minor' ? 'text-amber-700' : 'text-slate-500'}>
                          {getDiscrepancyLabel(record.discrepancyType)}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => setSelectedRecordForDetail(record)}
                            title="View comparison details"
                            className="p-1 text-slate-400 hover:text-blue-700 hover:bg-slate-100 rounded"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          {record.severity === 'major' && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedRecordForVendor(record);
                                setActivePage('vendor');
                              }}
                              title="Request vendor correction"
                              className="p-1 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer info */}
          <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/70 text-[11px] text-slate-500 flex items-center justify-between">
            <span>
              Showing {filteredRecords.length} of {records.length} records • Click any row to inspect side-by-side field diff
            </span>
            <span>
              Currency: INR (₹)
            </span>
          </div>
        </div>
      </main>

      {/* Invoice Detail Side Drawer */}
      <InvoiceDetailDrawer
        record={selectedRecordForDetail}
        onClose={() => setSelectedRecordForDetail(null)}
      />
    </div>
  );
};
