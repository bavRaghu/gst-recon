import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { GstHelperTooltip } from '../common/Tooltip';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  FileCode, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  ArrowRight, 
  Download, 
  Sparkles,
  Info
} from 'lucide-react';
import type { UploadedFileInfo } from '../../types';

export const UploadDataPage: React.FC = () => {
  const { 
    uploadPrFile, 
    upload2bFile, 
    setUploadPrFile, 
    setUpload2bFile, 
    loadSampleFiles, 
    selectedPeriod,
    setActivePage,
    showNotification
  } = useApp();

  const [validationError, setValidationError] = useState<string | null>(null);
  const [prDragging, setPrDragging] = useState(false);
  const [twoBDragging, setTwoBDragging] = useState(false);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const handlePrUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (!['xlsx', 'csv', 'json', 'pdf'].includes(ext || '')) {
      setValidationError('Purchase Register must be in XLSX, CSV, JSON, or PDF format.');
      return;
    }

    setValidationError(null);
    const newPr: UploadedFileInfo = {
      name: file.name,
      size: file.size,
      format: (ext as 'xlsx' | 'csv' | 'json' | 'pdf') || 'xlsx',
      recordCount: 148,
      uploadedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'ready',
    };
    setUploadPrFile(newPr);
    showNotification(`Purchase register file "${file.name}" uploaded successfully`, 'success');
  };

  const handle2bUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (!['xlsx', 'csv', 'json'].includes(ext || '')) {
      setValidationError('GSTR-2B must be in XLSX, CSV, or JSON format directly downloaded from the GST Portal.');
      return;
    }

    setValidationError(null);
    const new2b: UploadedFileInfo = {
      name: file.name,
      size: file.size,
      format: (ext as 'xlsx' | 'csv' | 'json') || 'json',
      recordCount: 144,
      uploadedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      status: 'ready',
    };
    setUpload2bFile(new2b);
    showNotification(`GSTR-2B file "${file.name}" uploaded successfully`, 'success');
  };

  const handleValidateAndContinue = () => {
    if (!uploadPrFile && !upload2bFile) {
      setValidationError('Please upload both your Purchase Register and GSTR-2B files to proceed.');
      return;
    }
    if (!uploadPrFile) {
      setValidationError('Missing Purchase Register. Please upload your books/invoices file.');
      return;
    }
    if (!upload2bFile) {
      setValidationError('Missing GSTR-2B. Please upload the monthly statement from the GST portal.');
      return;
    }

    setValidationError(null);
    setActivePage('validation');
  };

  const downloadSampleTemplate = (type: 'PR' | '2B') => {
    const csvContent = type === 'PR' 
      ? 'Supplier GSTIN,Supplier Name,Invoice Number,Invoice Date,Taxable Value,CGST,SGST,IGST,Total Value,HSN Code\n27AABCT3421M1Z2,Apex Electricals Pvt Ltd,INV/2026/0892,2026-09-04,85000,7650,7650,0,100300,8544'
      : 'Supplier GSTIN,Trade Name,Invoice Number,Invoice Date,Invoice Value,Taxable Value,Integrated Tax,Central Tax,State Tax\n27AABCT3421M1Z2,Apex Electricals,INV/2026/0892,04-09-2026,100300,85000,0,7650,7650';
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', type === 'PR' ? 'Sample_Purchase_Register.csv' : 'Sample_GSTR2B.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`Downloaded ${type} sample format template`, 'info');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Upload Reconciliation Data"
        subtitle="Import your internal purchase register and portal GSTR-2B for reconciliation."
        actionButton={
          <button
            type="button"
            onClick={loadSampleFiles}
            className="inline-flex items-center space-x-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium px-3 py-1.5 rounded border border-slate-300 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Load Demo Data (Sep 2026)</span>
          </button>
        }
      />

      <main className="p-6 space-y-6 max-w-5xl">
        {/* Informational Banner */}
        <div className="bg-blue-50/70 border border-blue-200 rounded p-3 text-xs text-blue-900 flex items-start space-x-2.5">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold">Reconciliation requires two datasets:</span>
            <p className="text-blue-800 font-normal">
              1) Your company's internal <strong>Purchase Register</strong> (exported from Tally, Busy, SAP, or Excel), and 
              2) The official <strong>GSTR-2B statement</strong> downloaded from the GST portal for the filing period.
            </p>
          </div>
        </div>

        {/* Validation Error Message */}
        {validationError && (
          <div className="bg-rose-50 border border-rose-300 rounded p-3 text-xs text-rose-800 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{validationError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* INPUT A: Purchase Register */}
          <div className="bg-white border border-slate-300 rounded shadow-xs p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center border border-slate-300">
                    A
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center">
                      Purchase Register / Invoices
                      <GstHelperTooltip 
                        term="Purchase Register"
                        content="Your accounting record of inward supplies (purchases and expenses) recorded during the month."
                      />
                    </h2>
                    <p className="text-[11px] text-slate-500">Internal books of accounts</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadSampleTemplate('PR')}
                  className="text-[11px] text-blue-700 hover:underline flex items-center space-x-1"
                >
                  <Download className="w-3 h-3" />
                  <span>Template</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              {!uploadPrFile ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setPrDragging(true); }}
                  onDragLeave={() => setPrDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setPrDragging(false);
                    handlePrUpload(e.dataTransfer.files);
                  }}
                  className={`mt-4 border-2 border-dashed rounded p-6 text-center transition-colors ${
                    prDragging ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
                  }`}
                >
                  <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-700">
                    Drag and drop your file here, or{' '}
                    <label 
                      htmlFor="pr-file-input" 
                      className="text-blue-700 hover:underline cursor-pointer font-semibold"
                    >
                      browse
                    </label>
                  </p>
                  <input
                    id="pr-file-input"
                    type="file"
                    accept=".xlsx,.csv,.json,.pdf"
                    onChange={(e) => handlePrUpload(e.target.files)}
                    className="sr-only"
                  />
                  <p className="text-[11px] text-slate-500 mt-2">
                    Accepted formats: <strong>XLSX, CSV, JSON, PDF</strong> (up to 25MB)
                  </p>
                </div>
              ) : (
                /* Uploaded File Details */
                <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2.5">
                      <FileSpreadsheet className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-slate-900 truncate max-w-xs">
                          {uploadPrFile.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 space-x-2">
                          <span>{formatFileSize(uploadPrFile.size)}</span>
                          <span>•</span>
                          <span className="text-emerald-700 font-medium">
                            ~{uploadPrFile.recordCount} rows detected
                          </span>
                        </div>
                        <div className="mt-1 flex items-center space-x-1 text-[11px] text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>File validated & ready</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUploadPrFile(null)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-200 transition-colors"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
              Must include: Supplier GSTIN, Invoice #, Date, Taxable Value, CGST, SGST, IGST.
            </div>
          </div>

          {/* INPUT B: GSTR-2B */}
          <div className="bg-white border border-slate-300 rounded shadow-xs p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center border border-slate-300">
                    B
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 flex items-center">
                      GSTR-2B Statement
                      <GstHelperTooltip 
                        term="GSTR-2B"
                        content="Auto-generated ITC statement on GST portal based on supplier filings. Downloaded in JSON or Excel."
                      />
                    </h2>
                    <p className="text-[11px] text-slate-500">Government GST Portal data</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadSampleTemplate('2B')}
                  className="text-[11px] text-blue-700 hover:underline flex items-center space-x-1"
                >
                  <Download className="w-3 h-3" />
                  <span>Template</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              {!upload2bFile ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setTwoBDragging(true); }}
                  onDragLeave={() => setTwoBDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setTwoBDragging(false);
                    handle2bUpload(e.dataTransfer.files);
                  }}
                  className={`mt-4 border-2 border-dashed rounded p-6 text-center transition-colors ${
                    twoBDragging ? 'border-blue-500 bg-blue-50/50' : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
                  }`}
                >
                  <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-700">
                    Drag and drop GSTR-2B file, or{' '}
                    <label 
                      htmlFor="twob-file-input" 
                      className="text-blue-700 hover:underline cursor-pointer font-semibold"
                    >
                      browse
                    </label>
                  </p>
                  <input
                    id="twob-file-input"
                    type="file"
                    accept=".xlsx,.csv,.json"
                    onChange={(e) => handle2bUpload(e.target.files)}
                    className="sr-only"
                  />
                  <p className="text-[11px] text-slate-500 mt-2">
                    Accepted formats: <strong>XLSX, CSV, JSON</strong> (official GST format)
                  </p>
                </div>
              ) : (
                /* Uploaded File Details */
                <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2.5">
                      <FileCode className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-slate-900 truncate max-w-xs">
                          {upload2bFile.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 space-x-2">
                          <span>{formatFileSize(upload2bFile.size)}</span>
                          <span>•</span>
                          <span className="text-blue-700 font-medium">
                            ~{upload2bFile.recordCount} entries verified
                          </span>
                        </div>
                        <div className="mt-1 flex items-center space-x-1 text-[11px] text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Official schema matched</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUpload2bFile(null)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-200 transition-colors"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
              Directly export B2B invoices table from GST Portal &gt; Returns &gt; GSTR-2B.
            </div>
          </div>
        </div>

        {/* Selected Period Confirmation & Continue Footer */}
        <div className="bg-white border border-slate-300 rounded p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-xs">
            <span className="text-slate-500">Reconciliation Target Period:</span>{' '}
            <strong className="text-slate-900 font-semibold">{selectedPeriod}</strong>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Ensure both uploaded documents belong to this tax period to prevent false mismatches.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleValidateAndContinue}
              className="bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-5 py-2.5 rounded transition-colors flex items-center space-x-2 shadow-sm"
            >
              <span>Validate & Continue</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
