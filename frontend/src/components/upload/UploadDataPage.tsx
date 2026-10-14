import React from 'react';
import { Header } from '../common/Header';
import { FileUploadSection } from './FileUploadSection';
import { Info, HelpCircle } from 'lucide-react';

export const UploadDataPage: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Upload Reconciliation Data"
        subtitle="Import your internal purchase register and portal GSTR-2B for reconciliation."
      />

      <main className="p-6 space-y-6 max-w-5xl">
        {/* Informational Guidance Banner */}
        <div className="bg-blue-50/70 border border-blue-200 rounded p-4 text-xs text-blue-900 flex items-start space-x-3">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-blue-950">
              Two Datasets Required for Section 16(2)(aa) Compliance:
            </span>
            <p className="text-blue-800 leading-relaxed font-normal">
              1) <strong>Purchase Register:</strong> Invoices recorded in your internal books of accounts (exported from Tally, Busy, Marg, SAP, or Excel).<br />
              2) <strong>GSTR-2B Statement:</strong> Official monthly auto-drafted ITC statement downloaded from the GST Portal.
            </p>
          </div>
        </div>

        {/* Real File Upload & Storage Module */}
        <FileUploadSection />

        {/* Guidelines for Smooth Ingestion */}
        <div className="bg-white border border-slate-200 rounded p-4 text-xs text-slate-700 shadow-xs">
          <div className="flex items-center space-x-2 font-bold text-slate-900 mb-2">
            <HelpCircle className="w-4 h-4 text-slate-500" />
            <span>Supported Headers & Field Specifications</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-600 mt-2">
            <div className="space-y-1.5 bg-slate-50 p-3 rounded border border-slate-200">
              <span className="font-semibold text-slate-800 block">Accepted Column Headers</span>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600 font-mono">
                <li>GSTIN / Supplier GSTIN / Vendor GSTIN</li>
                <li>Invoice No / Invoice Number / Inv No</li>
                <li>Invoice Date / Inv Date / Date</li>
                <li>Taxable Value / Taxable Amount</li>
                <li>CGST / SGST / IGST Amount</li>
              </ul>
            </div>

            <div className="space-y-1.5 bg-slate-50 p-3 rounded border border-slate-200">
              <span className="font-semibold text-slate-800 block">Validation & Normalization Rules</span>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600">
                <li>GSTINs are normalized to uppercase and validated (15 chars).</li>
                <li>Leading zeros, slashes, and dashes in invoice numbers are preserved.</li>
                <li>Dates supported in YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY formats.</li>
                <li>All tax calculations use fixed-precision decimal arithmetic.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
