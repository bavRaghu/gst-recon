import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { 
  CheckCircle, 
  AlertTriangle, 
  Copy, 
  FileQuestion, 
  ArrowRight, 
  ArrowLeft,
  Check,
  EyeOff
} from 'lucide-react';
import type { AttentionRecord } from '../../types';

export const DataValidationPage: React.FC = () => {
  const { 
    validationSummary, 
    selectedPeriod, 
    setActivePage, 
    uploadPrFile, 
    upload2bFile,
    showNotification
  } = useApp();

  const [attentionList] = useState<AttentionRecord[]>(
    validationSummary?.attentionRecords || []
  );

  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const handleAction = (id: string, actionType: string) => {
    setResolvedIds(prev => new Set([...prev, id]));
    showNotification(`Record ${id} marked as ${actionType}. Will be processed accordingly.`, 'info');
  };

  const handleStartReconciliation = () => {
    setActivePage('reconciliation');
  };

  const totalExtracted = (uploadPrFile?.recordCount || 148) + (upload2bFile?.recordCount || 144);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Data Validation & Review"
        subtitle={`Pre-reconciliation health check for ${selectedPeriod}. Verify extracted records before matching.`}
      />

      <main className="p-6 space-y-6 max-w-6xl">
        {/* Metric Summary Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-white border border-slate-200 rounded p-3.5 shadow-xs">
            <div className="text-[11px] text-slate-500 font-medium">Extracted Records</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-900">
              {totalExtracted}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">PR + GSTR-2B</div>
          </div>

          <div className="bg-white border border-slate-200 rounded p-3.5 shadow-xs">
            <div className="text-[11px] text-slate-500 font-medium">Valid for Matching</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-700">
              {validationSummary?.validRecords || 142}
            </div>
            <div className="text-[10px] text-emerald-600 mt-0.5 flex items-center space-x-1">
              <CheckCircle className="w-3 h-3" />
              <span>100% schema passed</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded p-3.5 shadow-xs">
            <div className="text-[11px] text-slate-500 font-medium">Requiring Attention</div>
            <div className="mt-1 font-mono text-xl font-bold text-amber-700">
              {attentionList.length - resolvedIds.size}
            </div>
            <div className="text-[10px] text-amber-600 mt-0.5 flex items-center space-x-1">
              <AlertTriangle className="w-3 h-3" />
              <span>Action suggested</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded p-3.5 shadow-xs">
            <div className="text-[11px] text-slate-500 font-medium">Duplicates Detected</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-800">
              {validationSummary?.duplicatesDetected || 2}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center space-x-1">
              <Copy className="w-3 h-3" />
              <span>Potential re-upload</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded p-3.5 shadow-xs col-span-2 sm:col-span-1">
            <div className="text-[11px] text-slate-500 font-medium">Missing / Invalid Fields</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-800">
              {validationSummary?.missingInvalidFields || 4}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center space-x-1">
              <FileQuestion className="w-3 h-3" />
              <span>Handled by engine</span>
            </div>
          </div>
        </div>

        {/* Attention Records Table */}
        <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Records Requiring Attention ({attentionList.length - resolvedIds.size} remaining)
              </h2>
              <p className="text-xs text-slate-500">
                Review data quality issues. You can fix, review, or proceed with reconciliation as-is.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 text-slate-700 font-semibold">
                  <th className="py-2.5 px-4">Source</th>
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-4">Supplier GSTIN & Name</th>
                  <th className="py-2.5 px-4">Detected Issue</th>
                  <th className="py-2.5 px-4">Value</th>
                  <th className="py-2.5 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attentionList.map((item) => {
                  const isResolved = resolvedIds.has(item.id);
                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isResolved ? 'opacity-50 bg-slate-50' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <span className={`inline-block font-mono text-[10px] px-1.5 py-0.5 rounded font-medium border ${
                          item.source === 'Purchase Register'
                            ? 'bg-slate-100 text-slate-700 border-slate-300'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {item.source}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">
                        {item.invoiceNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{item.supplierName}</div>
                        <div className="font-mono text-[11px] text-slate-500">{item.supplierGstin}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-sm">
                        <div className="font-medium text-slate-900">{item.field}</div>
                        <div className="text-[11px] text-amber-800 mt-0.5">{item.issue}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {item.currentValue}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isResolved ? (
                          <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center space-x-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>Resolved</span>
                          </span>
                        ) : (
                          <div className="flex items-center justify-center space-x-1.5">
                            {item.suggestedAction === 'Fix' && (
                              <button
                                type="button"
                                onClick={() => handleAction(item.id, 'Fixed')}
                                className="px-2 py-1 text-[11px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 rounded border border-blue-200"
                              >
                                Auto-Fix
                              </button>
                            )}
                            {item.suggestedAction === 'Ignore' && (
                              <button
                                type="button"
                                onClick={() => handleAction(item.id, 'Ignored')}
                                className="px-2 py-1 text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 rounded border border-slate-200 flex items-center space-x-1"
                              >
                                <EyeOff className="w-3 h-3" />
                                <span>Ignore</span>
                              </button>
                            )}
                            {item.suggestedAction === 'Review' && (
                              <button
                                type="button"
                                onClick={() => handleAction(item.id, 'Reviewed')}
                                className="px-2 py-1 text-[11px] font-medium bg-amber-50 text-amber-800 hover:bg-amber-100 rounded border border-amber-200"
                              >
                                Accept & Continue
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => setActivePage('upload')}
            className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded border border-slate-300 hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Upload</span>
          </button>

          <button
            type="button"
            onClick={handleStartReconciliation}
            className="inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-6 py-2.5 rounded shadow-sm transition-colors"
          >
            <span>Start Reconciliation</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
};
