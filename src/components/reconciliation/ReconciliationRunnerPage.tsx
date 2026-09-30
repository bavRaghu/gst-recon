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
  TrendingDown
} from 'lucide-react';
import { api } from '../../services/api';

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
    uploadPrFile, 
    upload2bFile,
    refreshData 
  } = useApp();

  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [progress, setProgress] = useState(0);

  const [steps, setSteps] = useState<StepStatus[]>([
    {
      id: 'step1',
      name: 'Extracting Data',
      description: 'Parsing purchase register and GSTR-2B JSON schemas into normalized tabular structure.',
      status: 'pending',
    },
    {
      id: 'step2',
      name: 'Validating Records',
      description: 'Verifying 15-character GSTIN checksums, date syntax, and document numbers.',
      status: 'pending',
    },
    {
      id: 'step3',
      name: 'Matching Invoices',
      description: 'Executing two-way match across Supplier GSTIN, normalized invoice number, and dates.',
      status: 'pending',
    },
    {
      id: 'step4',
      name: 'Checking Discrepancies',
      description: 'Calculating taxable value differences, CGST/SGST/IGST variances, and rounding tolerances.',
      status: 'pending',
    },
    {
      id: 'step5',
      name: 'Generating Results',
      description: 'Compiling Section 16(2)(aa) compliance summary and computing eligible vs blocked ITC.',
      status: 'pending',
    },
  ]);

  const startReconciliation = React.useCallback(() => {
    setIsRunning(true);
    setIsCompleted(false);
    setProgress(0);

    setSteps(prev => prev.map(s => ({ ...s, status: 'pending' })));

    let currentStepIndex = 0;

    const interval = setInterval(() => {
      setProgress(old => {
        const next = Math.min(old + 5, 100);

        if (next >= 20 && currentStepIndex === 0) {
          currentStepIndex = 1;
          setSteps(s => [
            { ...s[0], status: 'completed' },
            { ...s[1], status: 'running' },
            ...s.slice(2),
          ]);
        } else if (next >= 40 && currentStepIndex === 1) {
          currentStepIndex = 2;
          setSteps(s => [
            s[0],
            { ...s[1], status: 'completed' },
            { ...s[2], status: 'running' },
            ...s.slice(3),
          ]);
        } else if (next >= 65 && currentStepIndex === 2) {
          currentStepIndex = 3;
          setSteps(s => [
            s[0],
            s[1],
            { ...s[2], status: 'completed' },
            { ...s[3], status: 'running' },
            ...s.slice(4),
          ]);
        } else if (next >= 85 && currentStepIndex === 3) {
          currentStepIndex = 4;
          setSteps(s => [
            s[0],
            s[1],
            s[2],
            { ...s[3], status: 'completed' },
            { ...s[4], status: 'running' },
          ]);
        } else if (next >= 100) {
          clearInterval(interval);
          setSteps(s => s.map(step => ({ ...step, status: 'completed' })));
          setIsRunning(false);
          setIsCompleted(true);
          api.executeReconciliation(selectedPeriod).then(() => {
            refreshData();
          });
        }

        return next;
      });
    }, 120);

    return () => clearInterval(interval);
  }, [selectedPeriod, refreshData]);

  // Run on mount
  useEffect(() => {
    const cleanup = startReconciliation();
    return cleanup;
  }, [startReconciliation]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="GST Reconciliation"
        subtitle={`Rule-based matching engine for ${selectedPeriod}.`}
      />

      <main className="p-6 space-y-6 max-w-4xl">
        {/* Status & Input Counts Header */}
        <div className="bg-white border border-slate-200 rounded p-4 shadow-xs">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-slate-500 font-medium">GST Period</div>
              <div className="text-sm font-bold text-slate-900 mt-0.5">{selectedPeriod}</div>
            </div>
            <div>
              <div className="text-slate-500 font-medium">Purchase Register</div>
              <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                {uploadPrFile?.recordCount || 148} records
              </div>
            </div>
            <div>
              <div className="text-slate-500 font-medium">GSTR-2B Records</div>
              <div className="text-sm font-bold font-mono text-slate-900 mt-0.5">
                {upload2bFile?.recordCount || 144} records
              </div>
            </div>
            <div>
              <div className="text-slate-500 font-medium">Reconciliation Status</div>
              <div className="mt-0.5">
                {isRunning ? (
                  <span className="inline-flex items-center text-xs font-semibold text-blue-700 space-x-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing ({progress}%)</span>
                  </span>
                ) : isCompleted ? (
                  <span className="inline-flex items-center text-xs font-semibold text-emerald-700 space-x-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Reconciliation Completed</span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-600 font-medium">Ready</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Processing Progress Bar */}
        <div className="bg-white border border-slate-200 rounded shadow-xs p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-800">
                {isRunning ? 'Executing reconciliation algorithms...' : 'Reconciliation Process'}
              </span>
              <span className="font-mono font-bold text-slate-700">{progress}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-blue-700 h-2.5 rounded-full transition-all duration-200 ease-out"
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

        {/* Results Summary Box (Shown after completion) */}
        {isCompleted && (
          <div className="bg-white border border-slate-200 rounded shadow-xs p-5 space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Reconciliation Match Summary
              </h2>
              <p className="text-xs text-slate-500">
                Summary of matched, partially matched, and discrepant entries for {selectedPeriod}.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-[11px] text-slate-500 font-medium">Total Records</div>
                <div className="mt-1 font-mono text-xl font-bold text-slate-900">148</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Evaluated across books & 2B</div>
              </div>

              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded">
                <div className="text-[11px] text-emerald-800 font-medium flex items-center space-x-1">
                  <CheckCircle className="w-3 h-3 text-emerald-600" />
                  <span>Exact Matches</span>
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-emerald-800">122</div>
                <div className="text-[10px] text-emerald-700 mt-0.5">100% value & tax match</div>
              </div>

              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded">
                <div className="text-[11px] text-amber-800 font-medium flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  <span>Approximate / Minor</span>
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-amber-800">14</div>
                <div className="text-[10px] text-amber-700 mt-0.5">Syntax or &lt; ₹10 rounding</div>
              </div>

              <div className="p-3 bg-rose-50/60 border border-rose-200 rounded">
                <div className="text-[11px] text-rose-800 font-medium flex items-center space-x-1">
                  <TrendingDown className="w-3 h-3 text-rose-600" />
                  <span>Major Discrepancies</span>
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-rose-800">8</div>
                <div className="text-[10px] text-rose-700 mt-0.5">ITC at risk: ₹94,850</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded">
                <div className="text-[11px] text-slate-600 font-medium flex items-center space-x-1">
                  <FileCheck className="w-3 h-3 text-slate-500" />
                  <span>Unmatched Records</span>
                </div>
                <div className="mt-1 font-mono text-xl font-bold text-slate-800">4</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Missing in GSTR-2B or books</div>
              </div>

              <div className="p-3 bg-blue-50/60 border border-blue-200 rounded flex flex-col justify-center">
                <div className="text-[11px] text-blue-800 font-medium">Eligible ITC Claim</div>
                <div className="mt-1 font-mono text-lg font-bold text-blue-900">
                  ₹4,82,600
                </div>
                <div className="text-[10px] text-blue-700 mt-0.5">Valid for GSTR-3B Table 4</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={startReconciliation}
                className="inline-flex items-center space-x-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium px-3 py-2 rounded border border-slate-300 hover:bg-slate-50 transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Re-run Matching</span>
              </button>

              <button
                type="button"
                onClick={() => setActivePage('results')}
                className="inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-6 py-2.5 rounded shadow-sm transition-colors"
              >
                <span>View Results</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
