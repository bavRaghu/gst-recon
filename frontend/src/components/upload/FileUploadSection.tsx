import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  FileText, 
  CheckCircle2, 
  X, 
  AlertCircle, 
  AlertTriangle, 
  ArrowRight, 
  Download, 
  Database, 
  Check, 
  Loader2 
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import type { BackendValidationError, BackendUploadSummary } from '../../types';

interface FileUploadSectionProps {
  onUploadSuccess?: (jobId: string, summary: BackendUploadSummary) => void;
}

export const FileUploadSection: React.FC<FileUploadSectionProps> = ({ 
  onUploadSuccess
}) => {
  const { 
    selectedPeriod, 
    setActivePage, 
    setActiveJobId, 
    setBackendUploadSummary, 
    showNotification 
  } = useApp();

  // Selected files
  const [prFile, setPrFile] = useState<File | null>(null);
  const [twobFile, setTwobFile] = useState<File | null>(null);

  // Drag states
  const [prDragging, setPrDragging] = useState(false);
  const [twobDragging, setTwobDragging] = useState(false);

  // Validation & upload states
  const [clientErrors, setClientErrors] = useState<{ pr?: string; twob?: string }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [backendErrors, setBackendErrors] = useState<BackendValidationError[]>([]);
  const [uploadSuccessData, setUploadSuccessData] = useState<{
    jobId: string;
    summary: BackendUploadSummary;
  } | null>(null);

  // Hidden file inputs
  const prInputRef = useRef<HTMLInputElement>(null);
  const twobInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const validateFile = async (file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv' && ext !== 'xlsx') {
      return `Unsupported file format ".${ext || 'unknown'}". Only .csv and .xlsx files are supported.`;
    }

    if (file.size === 0) {
      return 'The selected file is empty (0 bytes). Please upload a file containing data.';
    }

    const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
    if (file.size > MAX_SIZE) {
      return `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 25 MB limit.`;
    }

    try {
      const slice = file.slice(0, 512);
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);

      if (ext === 'xlsx') {
        // Verify ZIP magic bytes [0x50, 0x4B, 0x03, 0x04]
        if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
          return 'The file does not appear to be a valid Excel (.xlsx) file.';
        }
      } else if (ext === 'csv') {
        // Check for binary NUL bytes
        for (let i = 0; i < bytes.length; i++) {
          if (bytes[i] === 0) {
            return 'The file contains binary data and is not a valid text CSV file.';
          }
        }
      }
    } catch {
      return 'Could not read file. The file may be locked or inaccessible.';
    }

    return null;
  };

  const handlePrSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const error = await validateFile(file);

    if (error) {
      setClientErrors(prev => ({ ...prev, pr: error }));
      setPrFile(null);
    } else {
      setClientErrors(prev => ({ ...prev, pr: undefined }));
      setPrFile(file);
      setServerError(null);
      setBackendErrors([]);
      setUploadSuccessData(null);
    }
  };

  const handleTwobSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const error = await validateFile(file);

    if (error) {
      setClientErrors(prev => ({ ...prev, twob: error }));
      setTwobFile(null);
    } else {
      setClientErrors(prev => ({ ...prev, twob: undefined }));
      setTwobFile(file);
      setServerError(null);
      setBackendErrors([]);
      setUploadSuccessData(null);
    }
  };

  const handleRemovePr = () => {
    setPrFile(null);
    setClientErrors(prev => ({ ...prev, pr: undefined }));
    if (prInputRef.current) prInputRef.current.value = '';
    setUploadSuccessData(null);
  };

  const handleRemoveTwob = () => {
    setTwobFile(null);
    setClientErrors(prev => ({ ...prev, twob: undefined }));
    if (twobInputRef.current) twobInputRef.current.value = '';
    setUploadSuccessData(null);
  };

  const handleUploadSubmit = async () => {
    if (!prFile || !twobFile) {
      setServerError('Both Purchase Register and GSTR-2B files are required before uploading.');
      return;
    }

    setIsUploading(true);
    setServerError(null);
    setBackendErrors([]);

    try {
      const response = await api.uploadReconciliationFiles(prFile, twobFile);

      if (!response.success) {
        setServerError(response.message || 'File processing failed.');
        setBackendErrors(response.errors || []);
        showNotification(response.message || 'Validation failed for uploaded files', 'error');
      } else if (response.job_id && response.summary) {
        const jobId = response.job_id;
        const summary = response.summary;
        
        setActiveJobId(jobId);
        setBackendUploadSummary(summary);
        setUploadSuccessData({ jobId, summary });

        showNotification(
          `Successfully saved ${summary.total_records} records to database (Job: ${jobId.slice(0, 8)}...)`,
          'success'
        );

        if (onUploadSuccess) {
          onUploadSuccess(jobId, summary);
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'An unexpected error occurred during upload.';
      setServerError(errorMsg);
      showNotification(errorMsg, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const downloadSampleTemplate = (type: 'PR' | '2B') => {
    const headers = 'Supplier GSTIN,Invoice Number,Invoice Date,Taxable Value,CGST,SGST,IGST\n';
    const rows = type === 'PR'
      ? '27AABCT3421M1Z2,INV-2026-001,2026-09-04,85000.00,7650.00,7650.00,0.00\n29AAACH7892P1ZV,TC-009481,2026-09-08,45000.00,0.00,0.00,8100.00\n27AAACB2844K1ZS,DL-99120,2026-09-12,120000.00,10800.00,10800.00,0.00'
      : '27AABCT3421M1Z2,INV-2026-001,04/09/2026,85000.00,7650.00,7650.00,0.00\n29AAACH7892P1ZV,TC-009481,08-09-2026,45000.00,0.00,0.00,8100.00\n27AAACB2844K1ZS,DL-99120,12/09/2026,120000.00,10800.00,10800.00,0.00';

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', type === 'PR' ? 'Sample_Purchase_Register.csv' : 'Sample_GSTR2B.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification(`Downloaded sample ${type} CSV template`, 'info');
  };

  const isSubmitDisabled = !prFile || !twobFile || isUploading;

  return (
    <div className="bg-white border border-slate-200 rounded shadow-xs overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-slate-50/50">
        <div>
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-blue-700" />
            <h2 className="text-sm font-bold text-slate-900">
              Upload Reconciliation Data Files
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Select your monthly Purchase Register and GSTR-2B files (.csv or .xlsx) to parse, normalize, and store in the database.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-500">GST Period:</span>
          <span className="font-semibold text-slate-800 bg-slate-200/70 px-2 py-0.5 rounded font-mono">
            {selectedPeriod}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Success Alert Banner */}
        {uploadSuccessData && (
          <div className="bg-emerald-50 border border-emerald-300 rounded p-4 text-xs text-emerald-900">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <div className="p-1.5 bg-emerald-100 rounded text-emerald-700 mt-0.5">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-emerald-950 text-sm">
                    Files Successfully Uploaded & Saved to Database
                  </h3>
                  <p className="text-emerald-800 mt-0.5">
                    Data normalization and atomic database storage completed successfully. All records are stored and ready for reconciliation.
                  </p>
                  
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/80 p-2.5 rounded border border-emerald-200 font-mono">
                    <div>
                      <span className="text-slate-500 text-[11px] block font-sans">Database Job ID</span>
                      <span className="font-bold text-slate-800 text-xs truncate block" title={uploadSuccessData.jobId}>
                        {uploadSuccessData.jobId.slice(0, 12)}...
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block font-sans">Purchase Records</span>
                      <span className="font-bold text-emerald-800 text-xs">
                        {uploadSuccessData.summary.purchase_register_count}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block font-sans">GSTR-2B Records</span>
                      <span className="font-bold text-emerald-800 text-xs">
                        {uploadSuccessData.summary.gstr2b_count}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block font-sans">Total Invoices</span>
                      <span className="font-bold text-slate-900 text-xs">
                        {uploadSuccessData.summary.total_records}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setUploadSuccessData(null);
                    setPrFile(null);
                    setTwobFile(null);
                  }}
                  className="bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-medium px-2.5 py-1.5 rounded transition-colors text-xs"
                >
                  Upload New Files
                </button>
                <button
                  type="button"
                  onClick={() => setActivePage('reconciliation')}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium px-3 py-1.5 rounded transition-colors text-xs flex items-center space-x-1"
                >
                  <span>Reconcile Now</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {serverError && (
          <div className="bg-rose-50 border border-rose-300 rounded p-3.5 text-xs text-rose-900">
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-bold text-rose-950">Upload & Validation Error</div>
                <div className="text-rose-800 mt-0.5 leading-relaxed">{serverError}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setServerError(null);
                  setBackendErrors([]);
                }}
                className="text-rose-500 hover:text-rose-700 p-0.5 rounded"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Detailed Backend Validation Errors Table */}
            {backendErrors.length > 0 && (
              <div className="mt-3 border border-rose-200 rounded overflow-hidden bg-white">
                <div className="bg-rose-100/60 px-3 py-1.5 font-bold text-rose-900 text-[11px] border-b border-rose-200 flex justify-between">
                  <span>Record-Level Validation Details ({backendErrors.length} issues detected)</span>
                  <span className="font-normal text-rose-800">Database transaction rolled back</span>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
                        <th className="py-1.5 px-3">File Source</th>
                        <th className="py-1.5 px-3">Location</th>
                        <th className="py-1.5 px-3">Field</th>
                        <th className="py-1.5 px-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100 text-slate-800 font-mono text-[11px]">
                      {backendErrors.map((err, idx) => (
                        <tr key={idx} className="hover:bg-rose-50/50">
                          <td className="py-1.5 px-3 font-semibold text-rose-900 font-sans">
                            {err.file_type}
                          </td>
                          <td className="py-1.5 px-3 text-slate-600">
                            {err.row !== null && err.row !== undefined ? `Row ${err.row}` : 'File Structure'}
                          </td>
                          <td className="py-1.5 px-3 text-slate-700">
                            {err.field || '—'}
                          </td>
                          <td className="py-1.5 px-3 text-rose-800 font-sans">
                            {err.reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Two-Column Upload Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* FILE 1: Purchase Register */}
          <div className="border border-slate-300 rounded bg-slate-50/30 p-4 flex flex-col justify-between hover:border-slate-400 transition-colors">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">
                    1
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Purchase Register
                    </h3>
                    <p className="text-[11px] text-slate-500">Internal Books / ERP / Tally export</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => downloadSampleTemplate('PR')}
                  className="text-[11px] text-blue-700 hover:text-blue-900 font-medium flex items-center space-x-1"
                  title="Download sample CSV format"
                >
                  <Download className="w-3 h-3" />
                  <span>Sample CSV</span>
                </button>
              </div>

              {/* Dropzone / Selected view */}
              {!prFile ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setPrDragging(true); }}
                  onDragLeave={() => setPrDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setPrDragging(false);
                    handlePrSelect(e.dataTransfer.files);
                  }}
                  className={`mt-3 border-2 border-dashed rounded p-4 text-center cursor-pointer transition-colors ${
                    prDragging 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-slate-300 hover:border-slate-400 bg-white'
                  }`}
                  onClick={() => prInputRef.current?.click()}
                >
                  <UploadCloud className="w-7 h-7 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-xs font-medium text-slate-700">
                    Drop Purchase Register here, or <span className="text-blue-700 underline font-semibold">browse</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Accepts <strong>.csv</strong> or <strong>.xlsx</strong> (up to 25 MB)
                  </p>
                  <input
                    ref={prInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => handlePrSelect(e.target.files)}
                    className="hidden"
                    disabled={isUploading}
                  />
                </div>
              ) : (
                <div className="mt-3 p-3 bg-white border border-slate-200 rounded">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2.5">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-slate-900 break-all">
                          {prFile.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 space-x-1.5">
                          <span>{formatFileSize(prFile.size)}</span>
                          <span>•</span>
                          <span className="uppercase font-semibold text-slate-700">
                            {prFile.name.split('.').pop()}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center space-x-1 text-[11px] text-emerald-700 font-medium">
                          <Check className="w-3.5 h-3.5" />
                          <span>Ready for upload</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => prInputRef.current?.click()}
                        disabled={isUploading}
                        className="text-[11px] text-blue-700 hover:text-blue-900 font-medium px-2 py-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-50"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={handleRemovePr}
                        disabled={isUploading}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-50"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <input
                    ref={prInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => handlePrSelect(e.target.files)}
                    className="hidden"
                    disabled={isUploading}
                  />
                </div>
              )}

              {/* Client error */}
              {clientErrors.pr && (
                <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded flex items-start space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{clientErrors.pr}</span>
                </div>
              )}
            </div>

            <div className="mt-3 text-[11px] text-slate-500 border-t border-slate-200 pt-2 font-mono">
              Required: supplier_gstin, invoice_number, invoice_date, taxable_value, cgst, sgst, igst
            </div>
          </div>

          {/* FILE 2: GSTR-2B */}
          <div className="border border-slate-300 rounded bg-slate-50/30 p-4 flex flex-col justify-between hover:border-slate-400 transition-colors">
            <div>
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                    2
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      GSTR-2B Statement
                    </h3>
                    <p className="text-[11px] text-slate-500">Official GST Portal statement</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => downloadSampleTemplate('2B')}
                  className="text-[11px] text-blue-700 hover:text-blue-900 font-medium flex items-center space-x-1"
                  title="Download sample CSV format"
                >
                  <Download className="w-3 h-3" />
                  <span>Sample CSV</span>
                </button>
              </div>

              {/* Dropzone / Selected view */}
              {!twobFile ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setTwobDragging(true); }}
                  onDragLeave={() => setTwobDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setTwobDragging(false);
                    handleTwobSelect(e.dataTransfer.files);
                  }}
                  className={`mt-3 border-2 border-dashed rounded p-4 text-center cursor-pointer transition-colors ${
                    twobDragging 
                      ? 'border-emerald-500 bg-emerald-50' 
                      : 'border-slate-300 hover:border-slate-400 bg-white'
                  }`}
                  onClick={() => twobInputRef.current?.click()}
                >
                  <UploadCloud className="w-7 h-7 text-slate-400 mx-auto mb-1.5" />
                  <p className="text-xs font-medium text-slate-700">
                    Drop GSTR-2B file here, or <span className="text-blue-700 underline font-semibold">browse</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Accepts <strong>.csv</strong> or <strong>.xlsx</strong> (up to 25 MB)
                  </p>
                  <input
                    ref={twobInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => handleTwobSelect(e.target.files)}
                    className="hidden"
                    disabled={isUploading}
                  />
                </div>
              ) : (
                <div className="mt-3 p-3 bg-white border border-slate-200 rounded">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-2.5">
                      <FileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-slate-900 break-all">
                          {twobFile.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 space-x-1.5">
                          <span>{formatFileSize(twobFile.size)}</span>
                          <span>•</span>
                          <span className="uppercase font-semibold text-slate-700">
                            {twobFile.name.split('.').pop()}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center space-x-1 text-[11px] text-emerald-700 font-medium">
                          <Check className="w-3.5 h-3.5" />
                          <span>Ready for upload</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => twobInputRef.current?.click()}
                        disabled={isUploading}
                        className="text-[11px] text-blue-700 hover:text-blue-900 font-medium px-2 py-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-50"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveTwob}
                        disabled={isUploading}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 transition-colors disabled:opacity-50"
                        title="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <input
                    ref={twobInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    onChange={(e) => handleTwobSelect(e.target.files)}
                    className="hidden"
                    disabled={isUploading}
                  />
                </div>
              )}

              {/* Client error */}
              {clientErrors.twob && (
                <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded flex items-start space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{clientErrors.twob}</span>
                </div>
              )}
            </div>

            <div className="mt-3 text-[11px] text-slate-500 border-t border-slate-200 pt-2 font-mono">
              Required: supplier_gstin, invoice_number, invoice_date, taxable_value, cgst, sgst, igst
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-slate-200 gap-3">
          <div className="text-xs text-slate-500">
            {(!prFile || !twobFile) ? (
              <span className="flex items-center space-x-1.5 text-amber-700 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Select both Purchase Register and GSTR-2B files to enable upload.</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1.5 text-slate-700">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Both files selected and ready for database import.</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              disabled={isSubmitDisabled}
              onClick={handleUploadSubmit}
              className={`inline-flex items-center space-x-2 text-xs font-semibold px-4 py-2 rounded transition-colors shadow-xs ${
                isSubmitDisabled 
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300' 
                  : 'bg-blue-700 hover:bg-blue-800 text-white cursor-pointer'
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Uploading, Validating & Storing...</span>
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5" />
                  <span>Upload & Store Records</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
