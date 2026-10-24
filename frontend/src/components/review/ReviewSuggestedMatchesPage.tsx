import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  ArrowRight, 
  Building2, 
  Check, 
  X,
  HelpCircle,
  Loader2,
  Clock,
  Info
} from 'lucide-react';
import type { BackendProposalItem } from '../../types';

export const ReviewSuggestedMatchesPage: React.FC = () => {
  const { 
    backendProposals, 
    reviewProposal, 
    selectedPeriod,
    setActivePage 
  } = useApp();

  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed' | 'rejected' | 'all'>('pending');
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [auditNotes, setAuditNotes] = useState<Record<string, string>>({});

  const formatCurrency = (val?: string | number | null) => {
    if (val === undefined || val === null || val === '') return '—';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '—';
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const pendingProposals = backendProposals.filter(p => p.assessment_status === 'PROPOSED');
  const confirmedProposals = backendProposals.filter(p => p.assessment_status === 'CONFIRMED');
  const rejectedProposals = backendProposals.filter(p => p.assessment_status === 'USER_REJECTED' || p.assessment_status === 'REJECTED');

  const filteredProposals = backendProposals.filter(p => {
    if (activeTab === 'pending') return p.assessment_status === 'PROPOSED';
    if (activeTab === 'confirmed') return p.assessment_status === 'CONFIRMED';
    if (activeTab === 'rejected') return p.assessment_status === 'USER_REJECTED' || p.assessment_status === 'REJECTED';
    return true;
  });

  const handleAction = async (proposalId: string, action: 'CONFIRM_MATCH' | 'REJECT_MATCH') => {
    setSubmittingId(proposalId);
    try {
      const note = auditNotes[proposalId] || '';
      await reviewProposal(proposalId, action, note);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Review Suggested Matches"
        subtitle="Review and confirm invoice pairs that have slight formatting or numbering differences."
      />

      <main className="p-6 space-y-6 max-w-6xl">
        {/* Simple Explanation Banner */}
        <div className="bg-blue-50/80 border border-blue-200 rounded p-4 text-xs text-blue-900 flex items-start space-x-3">
          <Sparkles className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-blue-950">How Suggested Matches Work</div>
            <p className="text-blue-800 leading-relaxed font-normal">
              When an invoice number in your accounting books (e.g. <span className="font-mono font-semibold">INV-2026-004</span>) 
              differs slightly from what your supplier filed in GSTR-2B (e.g. <span className="font-mono font-semibold">INV/2026/004</span>), 
              GSTRecon suggests them as a potential match. All suggestions require your explicit confirmation before updating your reconciliation records.
            </p>
          </div>
        </div>

        {/* Filter Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex space-x-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'pending'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>Pending Review</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'pending' ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-800'
              }`}>
                {pendingProposals.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('confirmed')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'confirmed'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>Confirmed Matches</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'confirmed' ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-800'
              }`}>
                {confirmedProposals.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rejected')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'rejected'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>Rejected</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeTab === 'rejected' ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-800'
              }`}>
                {rejectedProposals.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>All ({backendProposals.length})</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            GST Period: <span className="font-semibold text-slate-800 font-mono">{selectedPeriod}</span>
          </div>
        </div>

        {/* Proposal List */}
        {filteredProposals.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
              <CheckCircle2 className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              {activeTab === 'pending' 
                ? 'No Suggested Matches Pending Review' 
                : activeTab === 'confirmed'
                ? 'No Confirmed Matches in This Period'
                : 'No Suggestions Found'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
              {activeTab === 'pending'
                ? 'All invoices have either been matched deterministically or there are no formatting variations requiring your attention.'
                : 'When ambiguous invoice candidates are resolved, they will appear here with complete audit history.'}
            </p>
            <div className="mt-5 flex items-center justify-center space-x-3">
              <button
                type="button"
                onClick={() => setActivePage('results')}
                className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-3 py-1.5 rounded transition-colors cursor-pointer"
              >
                View Reconciliation Results
              </button>
              <button
                type="button"
                onClick={() => setActivePage('upload')}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer"
              >
                Upload Invoices
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {filteredProposals.map((proposal: BackendProposalItem) => {
              const pr = proposal.source_record;
              const twob = proposal.candidate_record;
              const isSubmitting = submittingId === proposal.id;
              const isPending = proposal.assessment_status === 'PROPOSED';
              const isConfirmed = proposal.assessment_status === 'CONFIRMED';
              const isRejected = proposal.assessment_status === 'USER_REJECTED' || proposal.assessment_status === 'REJECTED';

              const prTotal = pr ? parseFloat(pr.taxable_value) + parseFloat(pr.cgst) + parseFloat(pr.sgst) + parseFloat(pr.igst) : 0;
              const twobTotal = twob ? parseFloat(twob.taxable_value) + parseFloat(twob.cgst) + parseFloat(twob.sgst) + parseFloat(twob.igst) : 0;

              // Confidence indicator
              const confidence = proposal.confidence || 'MEDIUM';
              const confidenceScore = proposal.confidence_score !== undefined && proposal.confidence_score !== null 
                ? Math.round(proposal.confidence_score * 100) 
                : (confidence === 'HIGH' ? 95 : confidence === 'MEDIUM' ? 75 : 40);

              const gstin = pr?.supplier_gstin || twob?.supplier_gstin || '—';

              return (
                <div 
                  key={proposal.id} 
                  className={`bg-white border rounded shadow-xs overflow-hidden transition-all ${
                    isConfirmed 
                      ? 'border-emerald-300 ring-1 ring-emerald-200' 
                      : isRejected 
                      ? 'border-slate-300 opacity-80' 
                      : 'border-slate-300 hover:border-blue-400'
                  }`}
                >
                  {/* Top Bar: Supplier, Confidence, and Status */}
                  <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-slate-500" />
                      <span className="font-semibold text-slate-800">Supplier GSTIN:</span>
                      <span className="font-mono font-bold text-slate-900 bg-slate-200/80 px-2 py-0.5 rounded">
                        {gstin}
                      </span>
                      <span className="text-slate-400">• Same supplier verified</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {/* Confidence badge */}
                      <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded text-[11px] font-semibold ${
                        confidence === 'HIGH'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : confidence === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}>
                        <span>{confidence === 'HIGH' ? 'High Confidence' : confidence === 'MEDIUM' ? 'Medium Confidence' : 'Review Required'}</span>
                        <span className="font-mono">({confidenceScore}%)</span>
                      </span>

                      {/* Status indicator */}
                      {isConfirmed && (
                        <span className="inline-flex items-center space-x-1 bg-emerald-700 text-white px-2 py-0.5 rounded text-[11px] font-semibold">
                          <Check className="w-3 h-3" />
                          <span>Match Confirmed</span>
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center space-x-1 bg-slate-600 text-white px-2 py-0.5 rounded text-[11px] font-semibold">
                          <X className="w-3 h-3" />
                          <span>Suggestion Rejected</span>
                        </span>
                      )}
                      {isPending && (
                        <span className="inline-flex items-center space-x-1 bg-blue-100 text-blue-900 border border-blue-300 px-2 py-0.5 rounded text-[11px] font-semibold">
                          <Clock className="w-3 h-3" />
                          <span>Needs Your Review</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Side-by-Side Comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Purchase Register (Books) */}
                      <div className="bg-blue-50/40 border border-blue-200 rounded p-4 space-y-2.5">
                        <div className="flex items-center justify-between border-b border-blue-200/80 pb-2">
                          <span className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                            Your Purchase Register (Books)
                          </span>
                          <span className="text-[11px] text-blue-800 font-medium">Internal Record</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-500 text-[11px] block">Invoice Number</span>
                            <span className="font-mono font-bold text-slate-900 text-sm">
                              {pr?.invoice_number || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[11px] block">Invoice Date</span>
                            <span className="font-mono text-slate-800">
                              {formatDate(pr?.invoice_date)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[11px] block">Taxable Value</span>
                            <span className="font-mono font-semibold text-slate-900">
                              {formatCurrency(pr?.taxable_value)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[11px] block">Total Tax (CGST+SGST+IGST)</span>
                            <span className="font-mono text-slate-800">
                              {formatCurrency((pr ? parseFloat(pr.cgst) + parseFloat(pr.sgst) + parseFloat(pr.igst) : 0))}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-600">Total Invoice Amount:</span>
                          <span className="font-mono font-bold text-blue-950 text-sm">
                            {formatCurrency(prTotal)}
                          </span>
                        </div>
                      </div>

                      {/* GSTR-2B (Portal) */}
                      <div className="bg-emerald-50/40 border border-emerald-200 rounded p-4 space-y-2.5">
                        <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                          <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                            Supplier's GSTR-2B (Portal Filing)
                          </span>
                          <span className="text-[11px] text-emerald-800 font-medium">Auto-Drafted Filing</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-slate-500 text-[11px] block">Invoice Number</span>
                            <span className="font-mono font-bold text-slate-900 text-sm">
                              {twob?.invoice_number || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[11px] block">Invoice Date</span>
                            <span className="font-mono text-slate-800">
                              {formatDate(twob?.invoice_date)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[11px] block">Taxable Value</span>
                            <span className="font-mono font-semibold text-slate-900">
                              {formatCurrency(twob?.taxable_value)}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 text-[11px] block">Total Tax (CGST+SGST+IGST)</span>
                            <span className="font-mono text-slate-800">
                              {formatCurrency((twob ? parseFloat(twob.cgst) + parseFloat(twob.sgst) + parseFloat(twob.igst) : 0))}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-600">Total Invoice Amount:</span>
                          <span className="font-mono font-bold text-emerald-950 text-sm">
                            {formatCurrency(twobTotal)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Reasoning and Field Comparison Box */}
                    <div className="bg-slate-50 border border-slate-200 rounded p-3.5 space-y-2 text-xs">
                      {proposal.assessment_status === 'UNAVAILABLE' || proposal.assessment_status === 'ERROR' || proposal.reasoning?.toLowerCase().includes('unavailable') ? (
                        <div className="flex items-start space-x-2 bg-slate-100 p-2.5 rounded border border-slate-200">
                          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-800">AI Suggestions Status:</span>
                            <p className="text-slate-700 mt-0.5 leading-relaxed">
                              {proposal.reasoning}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start space-x-2">
                          <HelpCircle className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-slate-900">Why we think these invoices match:</span>
                            <p className="text-slate-700 mt-0.5 leading-relaxed">
                              {proposal.reasoning}
                            </p>
                          </div>
                        </div>
                      )}

                      {proposal.conflicting_evidence && (
                        <div className="text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200 flex items-start space-x-2">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Conflicting Points to Verify:</span>
                            <p className="mt-0.5">{proposal.conflicting_evidence}</p>
                          </div>
                        </div>
                      )}

                      {/* Field Agreement Badges */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-900 rounded text-[11px] font-medium border border-blue-200">
                          Supplier GSTIN: Exact Match
                        </span>
                        {pr && twob && pr.taxable_value === twob.taxable_value && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded text-[11px] font-medium border border-emerald-200">
                            Taxable Value: Exact Match ({formatCurrency(pr.taxable_value)})
                          </span>
                        )}
                        {pr && twob && String(pr.invoice_date) === String(twob.invoice_date) && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded text-[11px] font-medium border border-emerald-200">
                            Date: Exact Match
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-900 rounded text-[11px] font-medium border border-amber-200">
                          Invoice No: Formatting variation ({pr?.invoice_number} vs {twob?.invoice_number})
                        </span>
                      </div>
                    </div>

                    {/* Human Action Controls */}
                    {isPending ? (
                      <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex-1 max-w-md">
                          <input
                            type="text"
                            placeholder="Optional audit note (e.g. Verified with physical invoice)"
                            value={auditNotes[proposal.id] || ''}
                            onChange={(e) => setAuditNotes(prev => ({ ...prev, [proposal.id]: e.target.value }))}
                            className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                            disabled={isSubmitting}
                          />
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleAction(proposal.id, 'REJECT_MATCH')}
                            disabled={isSubmitting}
                            className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer flex items-center space-x-1"
                          >
                            <X className="w-3.5 h-3.5 text-slate-500" />
                            <span>Reject Suggestion</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAction(proposal.id, 'CONFIRM_MATCH')}
                            disabled={isSubmitting}
                            className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold px-4 py-1.5 rounded transition-colors shadow-sm cursor-pointer flex items-center space-x-1.5"
                          >
                            {isSubmitting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>Confirm Match</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                        <div className="flex items-center space-x-1.5">
                          {isConfirmed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-slate-500" />
                          )}
                          <span>
                            {isConfirmed ? 'Confirmed and updated in authoritative reconciliation results.' : 'Rejected. Invoices remain separate.'}
                          </span>
                          {proposal.audit_logs && proposal.audit_logs.length > 0 && (
                            <span className="text-slate-500 font-mono text-[11px]">
                              ({proposal.audit_logs[0].reviewed_by} • {formatDate(proposal.audit_logs[0].created_at)})
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => setActivePage('results')}
                          className="text-blue-700 hover:text-blue-900 font-medium flex items-center space-x-1 cursor-pointer"
                        >
                          <span>View in Results</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
