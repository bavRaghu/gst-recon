import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { 
  CheckCircle2, 
  Loader2, 
  ArrowRight, 
  RotateCw, 
  FileCheck,
  CheckCircle,
  AlertTriangle,
  TrendingDown,
  Upload,
  Sparkles,
  Layers,
  Sliders,
  AlertCircle
} from 'lucide-react';

interface StepStatus {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed';
}

export const ReconciliationRunnerPage: React.FC = () => {
  const { 
    selectedPeriod, 
    setActivePage, 
    activeJobId,
    setActiveJobId,
    backendJobs,
    backendUploadSummary,
    backendSummary,
    backendResults,
    runReconciliationForActiveJob,
    showNotification
  } = useApp();

  const [tolerance, setTolerance] = useState<number>(1.00);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isCompleted = Boolean(backendSummary);
  const [progress, setProgress] = useState<number>(isCompleted ? 100 : 0);

  const [steps, setSteps] = useState<StepStatus[]>([
    {
      id: 'step1',
      name: 'Dataset Normalization & Indexing',
      description: 'Parsing canonical fields, normalizing supplier GSTIN to uppercase, and keying records.',
      status: isCompleted ? 'completed' : 'pending',
    },
    {
      id: 'step2',
      name: 'Duplicate Ambiguity Resolution',
      description: 'Identifying duplicate invoice occurrences. Flagging ambiguous multi-records to prevent arbitrary pairing.',
      status: isCompleted ? 'completed' : 'pending',
    },
    {
      id: 'step3',
      name: 'Deterministic Arithmetic Comparison',
      description: `Comparing Taxable Value, CGST, SGST, IGST with exact decimal precision (tolerance: ₹${tolerance.toFixed(2)}).`,
      status: isCompleted ? 'completed' : 'pending',
    },
    {
      id: 'step4',
      name: 'AI Advisory Discrepancy Matching',
      description: 'Searching candidate records strictly within the same supplier GSTIN for advisory resolution proposals.',
      status: isCompleted ? 'completed' : 'pending',
    },
    {
      id: 'step5',
      name: 'Persistence & Audit Trail Generation',
      description: 'Persisting authoritative reconciliation results and AI candidate proposals in PostgreSQL.',
      status: isCompleted ? 'completed' : 'pending',
    },
  ]);

  // Synchronize state when active job or backend summary changes
  useEffect(() => {
    if (!isRunning) {
      if (backendSummary) {
        setProgress(100);
        setSteps(prev => prev.map(s => ({ ...s, status: 'completed' })));
      } else {
        setProgress(0);
        setSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));
      }
    }
  }, [backendSummary, activeJobId, isRunning]);

  // Total proposals count across backend results
  const totalAiProposals = backendResults.reduce(
    (count, r) => count + (r.proposals?.length || 0), 
    0
  );

  const executeReconciliation = async () => {
    if (!activeJobId) {
      showNotification('Please upload Purchase Register and GSTR-2B datasets first.', 'error');
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);
    setProgress(5);

    setSteps([
      { ...steps[0], status: 'running' },
      { ...steps[1], status: 'pending' },
      { ...steps[2], status: 'pending' },
      { ...steps[3], status: 'pending' },
      { ...steps[4], status: 'pending' },
    ]);

    // Progress animation timer while API executes
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev < 30) return prev + 8;
        if (prev < 60) return prev + 5;
        if (prev < 85) return prev + 3;
        return prev;
      });
    }, 150);

    const stepTimer = setInterval(() => {
      setProgress(curr => {
        if (curr >= 25 && curr < 50) {
          setSteps(s => [
            { ...s[0], status: 'completed' },
            { ...s[1], status: 'running' },
            s[2], s[3], s[4]
          ]);
        } else if (curr >= 50 && curr < 75) {
          setSteps(s => [
            { ...s[0], status: 'completed' },
            { ...s[1], status: 'completed' },
            { ...s[2], status: 'running' },
            s[3], s[4]
          ]);
        } else if (curr >= 75) {
          setSteps(s => [
            { ...s[0], status: 'completed' },
            { ...s[1], status: 'completed' },
            { ...s[2], status: 'completed' },
            { ...s[3], status: 'running' },
            s[4]
          ]);
        }
        return curr;
      });
    }, 200);

    try {
      await runReconciliationForActiveJob(tolerance);
      clearInterval(timer);
      clearInterval(stepTimer);
      setProgress(100);
      setSteps(s => s.map(step => ({ ...step, status: 'completed' })));
    } catch (err: unknown) {
      clearInterval(timer);
      clearInterval(stepTimer);
      const msg = err instanceof Error ? err.message : 'Reconciliation execution failed.';
      setErrorMessage(msg);
      setSteps(s => s.map(step => (step.status === 'running' ? { ...step, status: 'pending' } : step)));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Reconciliation Engine"
        subtitle={`Deterministic rule-based matching & advisory AI assistance for ${selectedPeriod}.`}
      />

      <main className="p-6 space-y-6 max-w-4xl">
        {/* If no active job is uploaded */}
        {!activeJobId ? (
          <div className="bg-white border border-slate-200 rounded p-8 text-center space-y-4 shadow-xs">
            <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">No Dataset Uploaded</h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                To run deterministic reconciliation and AI-assisted matching, please upload both your Purchase Register and GSTR-2B files.
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
            {/* Status & Input Counts Header */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-slate-500 font-medium flex items-center justify-between">
                    <span>Database Job ID</span>
                    {backendJobs.length > 1 && (
                      <span className="text-[10px] text-blue-700 font-sans font-semibold">
                        ({backendJobs.length} jobs)
                      </span>
                    )}
                  </div>
                  {backendJobs.length > 1 ? (
                    <select
                      value={activeJobId}
                      onChange={(e) => setActiveJobId(e.target.value)}
                      className="mt-1 w-full bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    >
                      {backendJobs.map(j => (
                        <option key={j.id} value={j.id}>
                          {j.id.slice(0, 10)}... ({j.purchase_records_count} PR, {j.gstr2b_records_count} 2B) [{j.status}]
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm font-bold font-mono text-slate-900 mt-0.5 truncate" title={activeJobId}>
                      {activeJobId.slice(0, 14)}...
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-slate-500 font-medium">Purchase Register</div>
                  <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                    {backendUploadSummary?.purchase_register_count ?? 0} records
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 font-medium">GSTR-2B Records</div>
                  <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                    {backendUploadSummary?.gstr2b_count ?? 0} records
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 font-medium">Engine Status</div>
                  <div className="mt-0.5">
                    {isRunning ? (
                      <span className="inline-flex items-center text-xs font-semibold text-blue-700 space-x-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Matching ({progress}%)</span>
                      </span>
                    ) : isCompleted ? (
                      <span className="inline-flex items-center text-xs font-semibold text-emerald-700 space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Reconciliation Complete</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs font-semibold text-amber-700 space-x-1">
                        <span>Ready to Reconcile</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tolerance & Configuration Bar */}
            <div className="bg-white border border-slate-200 rounded p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Sliders className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-bold text-slate-800">Monetary Matching Tolerance</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Allowable discrepancy threshold for rounding and fractional tax differences.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {[0.00, 1.00, 5.00, 10.00].map(val => (
                  <button
                    key={val}
                    type="button"
                    disabled={isRunning}
                    onClick={() => setTolerance(val)}
                    className={`px-2.5 py-1 text-xs font-mono font-medium rounded border transition-colors cursor-pointer ${
                      tolerance === val 
                        ? 'bg-blue-50 border-blue-600 text-blue-800 font-bold' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    ₹{val.toFixed(2)}
                  </button>
                ))}
                <div className="flex items-center border border-slate-300 rounded px-2 py-0.5 bg-slate-50 text-xs">
                  <span className="text-slate-500 font-mono mr-1">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    disabled={isRunning}
                    value={tolerance}
                    onChange={(e) => setTolerance(parseFloat(e.target.value) || 0)}
                    className="w-14 bg-transparent text-right font-mono font-bold focus:outline-none text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Execution Trigger Card (if not yet running and not completed) */}
            {!isRunning && !isCompleted && (
              <div className="bg-white border border-slate-200 rounded shadow-xs p-6 text-center space-y-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Run Deterministic & AI Reconciliation</h3>
                  <p className="text-xs text-slate-600 max-w-lg mx-auto mt-1">
                    Reconcile <strong className="font-mono text-slate-900">{backendUploadSummary?.purchase_register_count ?? 0}</strong> Purchase Register records against{' '}
                    <strong className="font-mono text-slate-900">{backendUploadSummary?.gstr2b_count ?? 0}</strong> GSTR-2B records for Job{' '}
                    <code className="font-mono text-slate-800 font-semibold">{activeJobId.slice(0, 10)}...</code>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={executeReconciliation}
                  className="inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-6 py-2.5 rounded shadow-sm transition-colors cursor-pointer"
                >
                  <span>Start Reconciliation Engine</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div className="bg-rose-50 border border-rose-300 rounded p-4 text-xs text-rose-900 flex items-start space-x-3">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-bold">Reconciliation Failed: </span>
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={executeReconciliation}
                  className="text-xs font-semibold text-rose-800 hover:text-rose-950 underline shrink-0 cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Processing Progress Bar & Steps (Shown during or after run) */}
            {(isRunning || isCompleted) && (
              <div className="bg-white border border-slate-200 rounded shadow-xs p-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-800">
                      {isRunning ? 'Executing reconciliation algorithms...' : 'Reconciliation Execution Log'}
                    </span>
                    <span className="font-mono font-bold text-slate-700">{progress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full transition-all duration-300 ease-out ${
                        isCompleted ? 'bg-emerald-600' : 'bg-blue-700'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Sequential Step List */}
                <div className="divide-y divide-slate-100 pt-2">
                  {steps.map((step, idx) => (
                    <div key={step.id} className="py-3 flex items-start space-x-3">
                      <div className="mt-0.5 shrink-0">
                        {step.status === 'completed' && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        )}
                        {step.status === 'running' && (
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        )}
                        {step.status === 'pending' && (
                          <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                            {idx + 1}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-semibold ${
                            step.status === 'completed' 
                              ? 'text-slate-800' 
                              : step.status === 'running' 
                              ? 'text-blue-700 font-bold' 
                              : 'text-slate-400'
                          }`}>
                            {step.name}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {step.status === 'completed' && 'Done'}
                            {step.status === 'running' && 'Processing...'}
                            {step.status === 'pending' && 'Queued'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Results Summary Box (Shown after completion) */}
            {isCompleted && backendSummary && (
              <div className="bg-white border border-slate-200 rounded shadow-xs p-5 space-y-4">
                <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      Deterministic Reconciliation Results
                    </h2>
                    <p className="text-xs text-slate-500">
                      Authoritative Section 16(2)(aa) matching results computed for Job <code className="font-mono text-slate-700 font-semibold">{activeJobId.slice(0, 10)}...</code>
                    </p>
                  </div>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
                    Status: COMPLETED
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Total Evaluated */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                    <div className="text-[11px] text-slate-500 font-medium">Total Invoices</div>
                    <div className="mt-1 font-mono text-xl font-bold text-slate-900">
                      {backendSummary.total_results}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Authoritative audit records</div>
                  </div>

                  {/* Matched */}
                  <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded">
                    <div className="text-[11px] text-emerald-800 font-medium flex items-center space-x-1">
                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                      <span>Exact Matched</span>
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold text-emerald-800">
                      {backendSummary.matched}
                    </div>
                    <div className="text-[10px] text-emerald-700 mt-0.5">Within ₹{tolerance.toFixed(2)} tolerance</div>
                  </div>

                  {/* Discrepancies */}
                  <div className="p-3 bg-rose-50/60 border border-rose-200 rounded">
                    <div className="text-[11px] text-rose-800 font-medium flex items-center space-x-1">
                      <TrendingDown className="w-3 h-3 text-rose-600" />
                      <span>Tax / Value Mismatch</span>
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold text-rose-800">
                      {backendSummary.mismatched}
                    </div>
                    <div className="text-[10px] text-rose-700 mt-0.5">Signed differences logged</div>
                  </div>

                  {/* Missing in 2B */}
                  <div className="p-3 bg-rose-50/40 border border-rose-200 rounded">
                    <div className="text-[11px] text-rose-800 font-medium flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      <span>Missing in GSTR-2B</span>
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold text-rose-800">
                      {backendSummary.missing_in_gstr2b}
                    </div>
                    <div className="text-[10px] text-rose-600 mt-0.5">In books but unfiled</div>
                  </div>

                  {/* Missing in PR */}
                  <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded">
                    <div className="text-[11px] text-indigo-800 font-medium flex items-center space-x-1">
                      <FileCheck className="w-3 h-3 text-indigo-600" />
                      <span>Missing in Books</span>
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold text-indigo-800">
                      {backendSummary.missing_in_purchase_register}
                    </div>
                    <div className="text-[10px] text-indigo-600 mt-0.5">In GSTR-2B not entered</div>
                  </div>

                  {/* Ambiguous Duplicates */}
                  <div className="p-3 bg-amber-50/60 border border-amber-200 rounded">
                    <div className="text-[11px] text-amber-800 font-medium flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      <span>Ambiguous Duplicates</span>
                    </div>
                    <div className="mt-1 font-mono text-xl font-bold text-amber-800">
                      {backendSummary.duplicate_ambiguous}
                    </div>
                    <div className="text-[10px] text-amber-700 mt-0.5">Strict non-arbitrary hold</div>
                  </div>
                </div>

                {/* AI Advisory Callout */}
                {totalAiProposals > 0 && (
                  <div className="bg-blue-50/80 border border-blue-200 rounded p-3 text-xs text-blue-900 flex items-start space-x-2.5">
                    <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-bold text-blue-950">
                        {totalAiProposals} Advisory AI Candidate Match Proposals Available:
                      </span>
                      <p className="text-blue-800 mt-0.5 leading-relaxed">
                        The AI assistant identified potential matches across unresolved invoices within the same supplier GSTIN.
                        These proposals are advisory and do not alter authoritative tax filing status until confirmed.
                      </p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={executeReconciliation}
                    className="inline-flex items-center space-x-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium px-3 py-2 rounded border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Re-run Engine</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActivePage('results')}
                    className="inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-6 py-2.5 rounded shadow-sm transition-colors cursor-pointer"
                  >
                    <span>View Results Register</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};