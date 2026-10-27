import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { 
  AlertOctagon, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle, 
  Send, 
  RotateCcw, 
  History, 
  User, 
  ShieldAlert, 
  Sparkles, 
  Clock, 
  ArrowRight,
  Upload,
  X,
  Search,
  Check,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import type { DiscrepancyItem, DiscrepancyAuditLog } from '../../types';

export const DiscrepanciesPage: React.FC = () => {
  const { 
    activeJobId,
    selectedPeriod, 
    setActivePage,
    discrepancyItems,
    discrepancySummary,
    refreshDiscrepancies,
    verifyDiscrepancy,
    user,
  } = useApp();

  // Active filter tab: 'all' | 'MAJOR' | 'MINOR' | 'REVIEW_REQUIRED' | 'PENDING' | 'REQUIRES_VENDOR_CORRECTION' | 'RESOLVED'
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<DiscrepancyItem | null>(null);

  // Review Action Form State
  const [actionComments, setActionComments] = useState<string>('');
  const [overrideSeverityValue, setOverrideSeverityValue] = useState<'MAJOR' | 'MINOR' | 'REVIEW_REQUIRED'>('MAJOR');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeActionModal, setActiveActionModal] = useState<string | null>(null); // 'OVERRIDE_SEVERITY' | 'COMMENT' | null

  // Refresh discrepancies when active job changes
  useEffect(() => {
    if (activeJobId) {
      refreshDiscrepancies();
    }
  }, [activeJobId]);

  // Keep selected item synchronized if discrepancyItems update
  useEffect(() => {
    if (selectedItem) {
      const updated = discrepancyItems.find(d => d.id === selectedItem.id);
      if (updated) setSelectedItem(updated);
    }
  }, [discrepancyItems]);

  // Unique suppliers for filter dropdown
  const uniqueSuppliers = useMemo(() => {
    const map = new Map<string, string>();
    discrepancyItems.forEach(d => {
      if (d.supplier_gstin) {
        map.set(d.supplier_gstin, d.supplier_name || d.supplier_gstin);
      }
    });
    return Array.from(map.entries());
  }, [discrepancyItems]);

  // Filtered items list
  const filteredItems = useMemo(() => {
    return discrepancyItems.filter(item => {
      // Tab filter
      if (activeTab === 'MAJOR' && item.severity !== 'MAJOR') return false;
      if (activeTab === 'MINOR' && item.severity !== 'MINOR') return false;
      if (activeTab === 'REVIEW_REQUIRED' && !['REVIEW_REQUIRED', 'UNCLASSIFIED'].includes(item.severity)) return false;
      if (activeTab === 'PENDING' && item.verification_status !== 'PENDING') return false;
      if (activeTab === 'REQUIRES_VENDOR_CORRECTION' && item.verification_status !== 'REQUIRES_VENDOR_CORRECTION') return false;
      if (activeTab === 'RESOLVED' && !['APPROVED', 'RESOLVED'].includes(item.verification_status)) return false;

      // Supplier filter
      if (supplierFilter !== 'all' && item.supplier_gstin !== supplierFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inv = item.invoice_number?.toLowerCase() || '';
        const gstin = item.supplier_gstin?.toLowerCase() || '';
        const name = item.supplier_name?.toLowerCase() || '';
        const rule = item.rule_applied?.toLowerCase() || '';
        if (!inv.includes(q) && !gstin.includes(q) && !name.includes(q) && !rule.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [discrepancyItems, activeTab, supplierFilter, searchQuery]);

  // Format currency
  const formatCurrency = (val?: number | string | null) => {
    if (val === undefined || val === null || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '—';
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Format date
  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  // Severity badge helper
  const renderSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'MAJOR':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertOctagon className="w-3 h-3 text-rose-600" />
            <span>MAJOR</span>
          </span>
        );
      case 'MINOR':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>MINOR</span>
          </span>
        );
      case 'REVIEW_REQUIRED':
      case 'UNCLASSIFIED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-300">
            <HelpCircle className="w-3 h-3 text-indigo-600" />
            <span>REVIEW REQ.</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
            {severity}
          </span>
        );
    }
  };

  // Status badge helper
  const renderVerificationBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>Pending Review</span>
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle className="w-3 h-3 text-emerald-600" />
            <span>Approved</span>
          </span>
        );
      case 'REQUIRES_VENDOR_CORRECTION':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
            <Send className="w-3 h-3 text-blue-700" />
            <span>Requires Vendor Correction</span>
          </span>
        );
      case 'OVERRIDDEN':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-300">
            <RotateCcw className="w-3 h-3 text-purple-600" />
            <span>Severity Overridden</span>
          </span>
        );
      case 'INVESTIGATION_REQUIRED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-300">
            <ShieldAlert className="w-3 h-3 text-orange-600" />
            <span>Under Investigation</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <X className="w-3 h-3 text-rose-600" />
            <span>Rejected / Disputed</span>
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-100 text-teal-800 border border-teal-300">
            <Check className="w-3 h-3 text-teal-600" />
            <span>Resolved</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  // Discrepancy type badge
  const renderDiscrepancyTypeBadge = (type: string) => {
    switch (type) {
      case 'MISSING_IN_GSTR2B':
        return (
          <span className="font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[11px] border border-rose-200">
            Missing in GSTR-2B
          </span>
        );
      case 'MISSING_IN_PURCHASE_REGISTER':
        return (
          <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded text-[11px] border border-indigo-200">
            Missing in Books
          </span>
        );
      case 'DUPLICATE_AMBIGUOUS':
        return (
          <span className="font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-[11px] border border-purple-200">
            Duplicate Ambiguous
          </span>
        );
      case 'MISMATCH':
      default:
        return (
          <span className="font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded text-[11px] border border-amber-200">
            Tax/Value Mismatch
          </span>
        );
    }
  };

  // Handle Reviewer Action
  const handleAction = async (action: 'APPROVE' | 'REQUIRE_VENDOR_CORRECTION' | 'INVESTIGATE' | 'REJECT' | 'RESOLVE') => {
    if (!selectedItem) return;
    setIsSubmitting(true);
    try {
      await verifyDiscrepancy(selectedItem.id, {
        action,
        comments: actionComments.trim() || undefined,
        reviewer_name: user.name,
      });
      setActionComments('');
    } catch {
      // Error notification handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Override Severity
  const handleOverrideSeverity = async () => {
    if (!selectedItem) return;
    setIsSubmitting(true);
    try {
      await verifyDiscrepancy(selectedItem.id, {
        action: 'OVERRIDE_SEVERITY',
        override_severity: overrideSeverityValue,
        comments: actionComments.trim() || `Overridden severity from ${selectedItem.severity} to ${overrideSeverityValue}`,
        reviewer_name: user.name,
      });
      setActionComments('');
      setActiveActionModal(null);
    } catch {
      // Handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Add Comment
  const handleAddComment = async () => {
    if (!selectedItem || !actionComments.trim()) return;
    setIsSubmitting(true);
    try {
      await verifyDiscrepancy(selectedItem.id, {
        action: 'ADD_COMMENT',
        comments: actionComments.trim(),
        reviewer_name: user.name,
      });
      setActionComments('');
      setActiveActionModal(null);
    } catch {
      // Handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Human Verification & Discrepancy Review"
        subtitle={`Authoritative reviewer interface for ${selectedPeriod}. Classify severity, verify financial differences, and qualify invoices requiring vendor correction.`}
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
            {/* Top KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div 
                onClick={() => setActiveTab('all')}
                className={`p-3 rounded border cursor-pointer transition-all ${
                  activeTab === 'all' 
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs' 
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                }`}
              >
                <div className={`text-[11px] font-semibold ${activeTab === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Total Discrepancies
                </div>
                <div className="text-xl font-bold font-mono mt-1">
                  {discrepancySummary?.total_discrepancies ?? discrepancyItems.length}
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('MAJOR')}
                className={`p-3 rounded border cursor-pointer transition-all ${
                  activeTab === 'MAJOR' 
                    ? 'bg-rose-700 text-white border-rose-700 shadow-xs' 
                    : 'bg-rose-50 border-rose-200 hover:border-rose-300 text-rose-900'
                }`}
              >
                <div className={`text-[11px] font-semibold ${activeTab === 'MAJOR' ? 'text-rose-100' : 'text-rose-700'}`}>
                  Major
                </div>
                <div className="text-xl font-bold font-mono mt-1">
                  {discrepancySummary?.major_count ?? discrepancyItems.filter(d => d.severity === 'MAJOR').length}
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('MINOR')}
                className={`p-3 rounded border cursor-pointer transition-all ${
                  activeTab === 'MINOR' 
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs' 
                    : 'bg-amber-50 border-amber-200 hover:border-amber-300 text-amber-900'
                }`}
              >
                <div className={`text-[11px] font-semibold ${activeTab === 'MINOR' ? 'text-amber-100' : 'text-amber-700'}`}>
                  Minor
                </div>
                <div className="text-xl font-bold font-mono mt-1">
                  {discrepancySummary?.minor_count ?? discrepancyItems.filter(d => d.severity === 'MINOR').length}
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('REVIEW_REQUIRED')}
                className={`p-3 rounded border cursor-pointer transition-all ${
                  activeTab === 'REVIEW_REQUIRED' 
                    ? 'bg-indigo-700 text-white border-indigo-700 shadow-xs' 
                    : 'bg-indigo-50 border-indigo-200 hover:border-indigo-300 text-indigo-900'
                }`}
              >
                <div className={`text-[11px] font-semibold ${activeTab === 'REVIEW_REQUIRED' ? 'text-indigo-100' : 'text-indigo-700'}`}>
                  Review Required
                </div>
                <div className="text-xl font-bold font-mono mt-1">
                  {discrepancySummary?.review_required_count ?? discrepancyItems.filter(d => ['REVIEW_REQUIRED', 'UNCLASSIFIED'].includes(d.severity)).length}
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('PENDING')}
                className={`p-3 rounded border cursor-pointer transition-all ${
                  activeTab === 'PENDING' 
                    ? 'bg-amber-700 text-white border-amber-700 shadow-xs' 
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                }`}
              >
                <div className={`text-[11px] font-semibold ${activeTab === 'PENDING' ? 'text-amber-100' : 'text-slate-500'}`}>
                  Pending Review
                </div>
                <div className="text-xl font-bold font-mono mt-1 text-amber-600">
                  {discrepancySummary?.pending_verification_count ?? discrepancyItems.filter(d => d.verification_status === 'PENDING').length}
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('REQUIRES_VENDOR_CORRECTION')}
                className={`p-3 rounded border cursor-pointer transition-all ${
                  activeTab === 'REQUIRES_VENDOR_CORRECTION' 
                    ? 'bg-blue-700 text-white border-blue-700 shadow-xs' 
                    : 'bg-blue-50 border-blue-200 hover:border-blue-300 text-blue-900'
                }`}
              >
                <div className={`text-[11px] font-semibold ${activeTab === 'REQUIRES_VENDOR_CORRECTION' ? 'text-blue-100' : 'text-blue-700'}`}>
                  Vendor Action
                </div>
                <div className="text-xl font-bold font-mono mt-1">
                  {discrepancySummary?.requires_vendor_action_count ?? discrepancyItems.filter(d => d.requires_vendor_action).length}
                </div>
              </div>

              <div 
                onClick={() => setActiveTab('RESOLVED')}
                className={`p-3 rounded border cursor-pointer transition-all ${
                  activeTab === 'RESOLVED' 
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs' 
                    : 'bg-emerald-50 border-emerald-200 hover:border-emerald-300 text-emerald-900'
                }`}
              >
                <div className={`text-[11px] font-semibold ${activeTab === 'RESOLVED' ? 'text-emerald-100' : 'text-emerald-700'}`}>
                  Approved / Done
                </div>
                <div className="text-xl font-bold font-mono mt-1 text-emerald-700">
                  {discrepancySummary?.approved_or_resolved_count ?? discrepancyItems.filter(d => ['APPROVED', 'RESOLVED'].includes(d.verification_status)).length}
                </div>
              </div>
            </div>

            {/* Critical Business Rule Callout */}
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-900 flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <strong>Authoritative Verification Policy:</strong> Only discrepancies classified as <strong>MAJOR</strong> and explicitly confirmed as <strong>Requires Vendor Correction</strong> will appear in the Vendor Communication dispatch queue. Minor discrepancies and unreviewed items are strictly prevented from triggering external supplier notices.
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white border border-slate-200 rounded p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-700">Filter View:</span>
                <select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value)}
                  className="border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 font-medium"
                >
                  <option value="all">All Discrepancies ({discrepancyItems.length})</option>
                  <option value="MAJOR">Major Discrepancies ({discrepancySummary?.major_count ?? 0})</option>
                  <option value="MINOR">Minor Discrepancies ({discrepancySummary?.minor_count ?? 0})</option>
                  <option value="REVIEW_REQUIRED">Review Required ({discrepancySummary?.review_required_count ?? 0})</option>
                  <option value="PENDING">Pending Review ({discrepancySummary?.pending_verification_count ?? 0})</option>
                  <option value="REQUIRES_VENDOR_CORRECTION">Qualified for Vendor Action ({discrepancySummary?.requires_vendor_action_count ?? 0})</option>
                  <option value="RESOLVED">Approved / Resolved ({discrepancySummary?.approved_or_resolved_count ?? 0})</option>
                </select>

                {uniqueSuppliers.length > 1 && (
                  <>
                    <span className="font-semibold text-slate-700 ml-2">Supplier:</span>
                    <select
                      value={supplierFilter}
                      onChange={(e) => setSupplierFilter(e.target.value)}
                      className="border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 font-mono"
                    >
                      <option value="all">All Suppliers ({uniqueSuppliers.length})</option>
                      {uniqueSuppliers.map(([gstin, name]) => (
                        <option key={gstin} value={gstin}>
                          {gstin} — {name.slice(0, 24)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search invoice #, GSTIN, rule..."
                    className="pl-8 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 w-60"
                  />
                </div>
                {(activeTab !== 'all' || supplierFilter !== 'all' || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('all');
                      setSupplierFilter('all');
                      setSearchQuery('');
                    }}
                    className="text-slate-500 hover:text-slate-800 flex items-center space-x-1 cursor-pointer font-medium"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            </div>

            {/* Discrepancies Table */}
            <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
              {discrepancyItems.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-900">Zero Discrepancies</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    All evaluated invoice records in Job <code className="font-mono">{activeJobId.slice(0, 8)}</code> reconcile completely without differences.
                  </p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  No discrepancy items match your selected filter criteria.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/80 text-slate-700 font-semibold select-none">
                        <th className="py-2.5 px-3">Supplier GSTIN & Name</th>
                        <th className="py-2.5 px-3">Invoice #</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Discrepancy Type</th>
                        <th className="py-2.5 px-3">Severity</th>
                        <th className="py-2.5 px-3 text-right">Difference Amount</th>
                        <th className="py-2.5 px-3">Verification Status</th>
                        <th className="py-2.5 px-3 text-center">Vendor Action</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.map((item: DiscrepancyItem) => {
                        const isSelected = selectedItem?.id === item.id;
                        return (
                          <tr
                            key={item.id}
                            onClick={() => setSelectedItem(item)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50/80' : 'hover:bg-blue-50/30'
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <div className="font-mono font-bold text-slate-900">
                                {item.supplier_gstin || '—'}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                                {item.supplier_name || 'Unknown Supplier'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                              {item.invoice_number || '—'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {item.invoice_date || '—'}
                            </td>
                            <td className="py-2.5 px-3">
                              {renderDiscrepancyTypeBadge(item.discrepancy_type)}
                            </td>
                            <td className="py-2.5 px-3">
                              {renderSeverityBadge(item.severity)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(item.difference_amount)}
                            </td>
                            <td className="py-2.5 px-3">
                              {renderVerificationBadge(item.verification_status)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {item.requires_vendor_action ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-300">
                                  YES
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">No</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setSelectedItem(item)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 cursor-pointer"
                              >
                                <span>Review</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
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
                  Showing {filteredItems.length} of {discrepancyItems.length} discrepancy items
                </span>
                <span>
                  Job ID: <code className="font-mono">{activeJobId}</code>
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Reviewer Inspection & Verification Drawer */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-slate-300 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Invoice {selectedItem.invoice_number}
                  </h2>
                  {renderSeverityBadge(selectedItem.severity)}
                  {renderVerificationBadge(selectedItem.verification_status)}
                </div>
                <div className="text-xs text-slate-500 mt-0.5 font-mono">
                  Supplier: {selectedItem.supplier_gstin} ({selectedItem.supplier_name})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-800">
              {/* Field by Field Comparison Table */}
              <div className="border border-slate-200 rounded overflow-hidden">
                <div className="bg-slate-100/90 px-3.5 py-2 font-bold text-slate-800 border-b border-slate-200 flex items-center justify-between">
                  <span>Authoritative Record Comparison</span>
                  <span className="font-mono text-[11px] font-normal text-slate-500">
                    Difference Amount: {formatCurrency(selectedItem.difference_amount)}
                  </span>
                </div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Purchase Register (Books)</th>
                      <th className="py-2 px-3">GSTR-2B (Supplier Filed)</th>
                      <th className="py-2 px-3 text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    <tr>
                      <td className="py-2 px-3 font-sans font-medium text-slate-700">Invoice Number</td>
                      <td className="py-2 px-3">{selectedItem.purchase_record?.invoice_number || 'MISSING'}</td>
                      <td className="py-2 px-3">{selectedItem.gstr2b_record?.invoice_number || 'MISSING'}</td>
                      <td className="py-2 px-3 text-right text-slate-500">—</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-sans font-medium text-slate-700">Invoice Date</td>
                      <td className="py-2 px-3">{selectedItem.purchase_record?.invoice_date || 'MISSING'}</td>
                      <td className="py-2 px-3">{selectedItem.gstr2b_record?.invoice_date || 'MISSING'}</td>
                      <td className="py-2 px-3 text-right text-slate-500">—</td>
                    </tr>
                    <tr className={selectedItem.affected_fields?.includes('taxable_value') ? 'bg-amber-50/70 font-bold' : ''}>
                      <td className="py-2 px-3 font-sans font-medium text-slate-700">Taxable Value</td>
                      <td className="py-2 px-3">{selectedItem.purchase_record ? formatCurrency(selectedItem.purchase_record.taxable_value) : 'MISSING'}</td>
                      <td className="py-2 px-3">{selectedItem.gstr2b_record ? formatCurrency(selectedItem.gstr2b_record.taxable_value) : 'MISSING'}</td>
                      <td className="py-2 px-3 text-right text-rose-700">
                        {selectedItem.purchase_record && selectedItem.gstr2b_record ? formatCurrency(Math.abs(parseFloat(String(selectedItem.purchase_record.taxable_value)) - parseFloat(String(selectedItem.gstr2b_record.taxable_value)))) : '—'}
                      </td>
                    </tr>
                    <tr className={selectedItem.affected_fields?.includes('cgst') ? 'bg-amber-50/70 font-bold' : ''}>
                      <td className="py-2 px-3 font-sans font-medium text-slate-700">CGST</td>
                      <td className="py-2 px-3">{selectedItem.purchase_record ? formatCurrency(selectedItem.purchase_record.cgst) : 'MISSING'}</td>
                      <td className="py-2 px-3">{selectedItem.gstr2b_record ? formatCurrency(selectedItem.gstr2b_record.cgst) : 'MISSING'}</td>
                      <td className="py-2 px-3 text-right text-rose-700">
                        {selectedItem.purchase_record && selectedItem.gstr2b_record ? formatCurrency(Math.abs(parseFloat(String(selectedItem.purchase_record.cgst)) - parseFloat(String(selectedItem.gstr2b_record.cgst)))) : '—'}
                      </td>
                    </tr>
                    <tr className={selectedItem.affected_fields?.includes('sgst') ? 'bg-amber-50/70 font-bold' : ''}>
                      <td className="py-2 px-3 font-sans font-medium text-slate-700">SGST</td>
                      <td className="py-2 px-3">{selectedItem.purchase_record ? formatCurrency(selectedItem.purchase_record.sgst) : 'MISSING'}</td>
                      <td className="py-2 px-3">{selectedItem.gstr2b_record ? formatCurrency(selectedItem.gstr2b_record.sgst) : 'MISSING'}</td>
                      <td className="py-2 px-3 text-right text-rose-700">
                        {selectedItem.purchase_record && selectedItem.gstr2b_record ? formatCurrency(Math.abs(parseFloat(String(selectedItem.purchase_record.sgst)) - parseFloat(String(selectedItem.gstr2b_record.sgst)))) : '—'}
                      </td>
                    </tr>
                    <tr className={selectedItem.affected_fields?.includes('igst') ? 'bg-amber-50/70 font-bold' : ''}>
                      <td className="py-2 px-3 font-sans font-medium text-slate-700">IGST</td>
                      <td className="py-2 px-3">{selectedItem.purchase_record ? formatCurrency(selectedItem.purchase_record.igst) : 'MISSING'}</td>
                      <td className="py-2 px-3">{selectedItem.gstr2b_record ? formatCurrency(selectedItem.gstr2b_record.igst) : 'MISSING'}</td>
                      <td className="py-2 px-3 text-right text-rose-700">
                        {selectedItem.purchase_record && selectedItem.gstr2b_record ? formatCurrency(Math.abs(parseFloat(String(selectedItem.purchase_record.igst)) - parseFloat(String(selectedItem.gstr2b_record.igst)))) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Rule & Deterministic Classification Info */}
              <div className="bg-slate-50 border border-slate-200 rounded p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">Deterministic Rule Applied</span>
                  <code className="bg-slate-200 text-slate-800 px-2 py-0.5 rounded font-mono text-[10px]">
                    {selectedItem.rule_applied}
                  </code>
                </div>
                <p className="text-slate-700 leading-relaxed">
                  {selectedItem.severity_reason}
                </p>
                {selectedItem.original_severity !== selectedItem.severity && (
                  <div className="text-[11px] text-purple-700 font-semibold">
                    * Reviewer override active: Original severity was {selectedItem.original_severity}.
                  </div>
                )}
              </div>

              {/* AI-Assisted Discrepancy Guidance */}
              {selectedItem.ai_explanation && (
                <div className="bg-blue-50 border border-blue-200 rounded p-4 space-y-1.5">
                  <div className="flex items-center space-x-1.5 text-blue-900 font-bold">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>Statutory Explanation & Compliance Guidance</span>
                  </div>
                  <p className="text-blue-900 leading-relaxed">
                    {selectedItem.ai_explanation}
                  </p>
                </div>
              )}

              {/* Resolution Notes / Current Notes */}
              {selectedItem.resolution_notes && (
                <div className="bg-amber-50/60 border border-amber-200 rounded p-3 text-amber-900 space-y-1">
                  <div className="font-bold text-[11px]">Reviewer Notes:</div>
                  <div className="whitespace-pre-wrap text-[11px]">{selectedItem.resolution_notes}</div>
                </div>
              )}

              {/* Direct Shortcut to Vendor Communication if qualified */}
              {selectedItem.verification_status === 'REQUIRES_VENDOR_CORRECTION' && (
                <div className="bg-emerald-50 border border-emerald-300 rounded p-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-emerald-900 text-xs">Qualified for Vendor Notice Dispatch</div>
                    <div className="text-emerald-700 text-[11px]">This invoice is verified and waiting in Vendor Communication.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItem(null);
                      setActivePage('vendor');
                    }}
                    className="inline-flex items-center space-x-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold px-3 py-1.5 rounded cursor-pointer transition-colors"
                  >
                    <span>Open Notice Composer</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Reviewer Action Toolbar */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">
                  Reviewer Decisions
                </h3>

                {/* Optional Comment Input */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Reviewer Comment / Audit Justification (optional):
                  </label>
                  <textarea
                    rows={2}
                    value={actionComments}
                    onChange={(e) => setActionComments(e.target.value)}
                    placeholder="Enter justification or internal audit notes..."
                    className="w-full border border-slate-300 rounded p-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {/* Approve Action */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleAction('APPROVE')}
                    className="inline-flex items-center justify-center space-x-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2 px-3 rounded shadow-xs cursor-pointer transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve (No Vendor Action)</span>
                  </button>

                  {/* Require Vendor Correction (Only allowed for MAJOR) */}
                  <button
                    type="button"
                    disabled={isSubmitting || selectedItem.severity !== 'MAJOR'}
                    onClick={() => handleAction('REQUIRE_VENDOR_CORRECTION')}
                    title={
                      selectedItem.severity !== 'MAJOR'
                        ? 'Disabled: Only MAJOR discrepancies may enter Vendor Communication. Override severity to MAJOR first if needed.'
                        : 'Qualifies this invoice for vendor communication notice'
                    }
                    className={`inline-flex items-center justify-center space-x-1.5 font-bold py-2 px-3 rounded shadow-xs transition-colors ${
                      selectedItem.severity === 'MAJOR'
                        ? 'bg-rose-700 hover:bg-rose-800 text-white cursor-pointer'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Require Vendor Correction</span>
                  </button>

                  {/* Override Severity Modal Trigger */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setActiveActionModal('OVERRIDE_SEVERITY')}
                    className="inline-flex items-center justify-center space-x-1.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 font-semibold py-2 px-3 rounded cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Override Severity</span>
                  </button>

                  {/* Mark Under Investigation */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleAction('INVESTIGATE')}
                    className="inline-flex items-center justify-center space-x-1.5 bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-200 font-semibold py-2 px-3 rounded cursor-pointer transition-colors"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Mark for Investigation</span>
                  </button>

                  {/* Reject / Dispute */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleAction('REJECT')}
                    className="inline-flex items-center justify-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded cursor-pointer transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject / Dispute Entry</span>
                  </button>

                  {/* Mark Resolved */}
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleAction('RESOLVE')}
                    className="inline-flex items-center justify-center space-x-1.5 bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 font-semibold py-2 px-3 rounded cursor-pointer transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Mark Resolved</span>
                  </button>
                </div>
              </div>

              {/* Complete Audit Log Trail */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-bold text-slate-900">
                    <History className="w-4 h-4 text-slate-500" />
                    <span>Immutable Audit Trail ({selectedItem.audit_logs?.length || 0})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveActionModal('COMMENT')}
                    className="text-blue-700 hover:text-blue-900 font-semibold flex items-center space-x-1 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Add Note</span>
                  </button>
                </div>

                {(!selectedItem.audit_logs || selectedItem.audit_logs.length === 0) ? (
                  <div className="text-slate-400 text-xs">No audit logs recorded yet.</div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedItem.audit_logs.map((log: DiscrepancyAuditLog) => (
                      <div key={log.id} className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center space-x-1.5 font-semibold text-slate-900">
                            <User className="w-3 h-3 text-slate-500" />
                            <span>{log.reviewer_name}</span>
                            <span className="text-slate-400 font-normal">executed</span>
                            <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1 rounded">
                              {log.action}
                            </span>
                          </div>
                          <span className="text-slate-500 font-mono text-[10px]">
                            {formatDate(log.created_at)}
                          </span>
                        </div>
                        {log.previous_status && log.new_status && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            Status: <span className="text-slate-700">{log.previous_status}</span> &rarr; <span className="font-bold text-slate-900">{log.new_status}</span>
                            {log.previous_severity && log.new_severity && (
                              <span className="ml-2">
                                | Severity: {log.previous_severity} &rarr; {log.new_severity}
                              </span>
                            )}
                          </div>
                        )}
                        {log.comments && (
                          <div className="text-[11px] text-slate-700 mt-1 pl-2 border-l-2 border-slate-300">
                            {log.comments}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Override Severity Sub-Modal */}
      {activeActionModal === 'OVERRIDE_SEVERITY' && selectedItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                Override Discrepancy Severity
              </h3>
              <button
                type="button"
                onClick={() => setActiveActionModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                You are manually overriding the deterministic rule severity for Invoice <strong>{selectedItem.invoice_number}</strong>.
              </p>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select New Severity:
                </label>
                <select
                  value={overrideSeverityValue}
                  onChange={(e) => setOverrideSeverityValue(e.target.value as any)}
                  className="w-full border border-slate-300 rounded p-2 text-xs bg-white text-slate-900 font-bold focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="MAJOR">MAJOR (Qualifies for vendor communication)</option>
                  <option value="MINOR">MINOR (Within financial materiality)</option>
                  <option value="REVIEW_REQUIRED">REVIEW_REQUIRED (Ambiguous duplicate)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Override Justification / Reason:
                </label>
                <textarea
                  rows={3}
                  value={actionComments}
                  onChange={(e) => setActionComments(e.target.value)}
                  placeholder="Explain why this severity is being adjusted (recorded in audit log)..."
                  className="w-full border border-slate-300 rounded p-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setActiveActionModal(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleOverrideSeverity}
                className="px-4 py-1.5 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded shadow-xs cursor-pointer"
              >
                Apply Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Note Sub-Modal */}
      {activeActionModal === 'COMMENT' && selectedItem && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                Add Note to Audit Trail
              </h3>
              <button
                type="button"
                onClick={() => setActiveActionModal(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <textarea
                rows={4}
                value={actionComments}
                onChange={(e) => setActionComments(e.target.value)}
                placeholder="Enter note or internal audit comment..."
                className="w-full border border-slate-300 rounded p-2 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setActiveActionModal(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !actionComments.trim()}
                onClick={handleAddComment}
                className="px-4 py-1.5 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded shadow-xs cursor-pointer disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
