import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { StatusBadge } from '../common/Badge';
import { api } from '../../services/api';
import { 
  Send, 
  Copy, 
  Check, 
  Mail, 
  Info,
  CheckCircle2
} from 'lucide-react';
import type { ReconciliationRecord } from '../../types';

function generateNoticeDraft(
  rec: ReconciliationRecord, 
  template: 'standard' | 'urgent' | 'amendment',
  orgName: string,
  orgGstin: string,
  period: string
): { subject: string; body: string } {
  const diffText = rec.differenceAmount > 0 
    ? `₹${rec.differenceAmount.toLocaleString('en-IN')}` 
    : `₹${rec.totalTax.toLocaleString('en-IN')}`;

  if (template === 'urgent') {
    return {
      subject: `URGENT: Blocked GST ITC – Missing Invoice ${rec.invoiceNumber} – ${period}`,
      body: `ATTN: Accounts & Taxation Department
${rec.supplierName} (GSTIN: ${rec.supplierGstin})

Subject: URGENT: Input Tax Credit Discrepancy for ${period}

Dear Accounts Team,

This is an urgent communication regarding GST compliance for the tax period ${period}. During our monthly GSTR-2B reconciliation, we observed the following critical issue with your invoice:

• Invoice Number: ${rec.invoiceNumber}
• Invoice Date: ${rec.invoiceDate}
• Invoice Value: ₹${rec.totalValue.toLocaleString('en-IN')}
• Tax Discrepancy Amount: ${diffText}
• Issue Identified: ${rec.reason}

Under Section 16(2)(aa) of the CGST Act, our company is strictly prohibited from claiming Input Tax Credit (ITC) unless the invoice is reflected in our auto-drafted GSTR-2B. 

To avoid withholding of pending payments or debit notes for blocked ITC, please ensure this invoice/amendment is uploaded into your GSTR-1 prior to the upcoming monthly deadline (11th).

Please share the filed GSTR-1 acknowledgement or reply with the resolution timeline at your earliest.

Warm regards,
Accounts Department
${orgName}
GSTIN: ${orgGstin}
Email: accounts@omkarengg.in`,
    };
  }

  if (template === 'amendment') {
    return {
      subject: `Request for GSTR-1 Amendment (Table 9) – Invoice ${rec.invoiceNumber}`,
      body: `Dear Accounts Team,
${rec.supplierName},

Subject: Request for Table 9 Amendment in GSTR-1 for Invoice ${rec.invoiceNumber}

During our internal GST verification for ${period}, we noted a difference between the physical invoice issued to us and the values appearing in GSTR-2B:

• Invoice Number: ${rec.invoiceNumber}
• Date: ${rec.invoiceDate}
• Discrepancy: ${rec.reason}
• Tax Impact: ${diffText}
• Action Required: ${rec.recommendedAction}

Kindly report an amendment in Table 9 of your upcoming GSTR-1 filing to correct this mismatch so that we can claim legitimate ITC.

Thank you for your cooperation.

Sincerely,
${orgName}
GSTIN: ${orgGstin}`,
    };
  }

  return {
    subject: `GST Reconciliation Discrepancy – Invoice ${rec.invoiceNumber} – ${period}`,
    body: `Dear Accounts Team,
${rec.supplierName},

Subject: GST Invoice Discrepancy Notice for ${period}

During our periodic reconciliation of our Purchase Register with government portal GSTR-2B, the following discrepancy was identified:

• Supplier GSTIN: ${rec.supplierGstin}
• Invoice Number: ${rec.invoiceNumber}
• Invoice Date: ${rec.invoiceDate}
• Discrepancy Detected: ${rec.reason}
• Tax Amount Affected: ${diffText}

As per GST Rule 36(4), we request you to review your GSTR-1 records and confirm when this entry will be rectified on the GST Portal.

Please reply to this email with confirmation or contact us for clarification.

Best regards,
Accounts Team
${orgName}
GSTIN: ${orgGstin}`,
  };
}

export const VendorCommunicationPage: React.FC = () => {
  const { 
    records, 
    selectedRecordForVendor, 
    setSelectedRecordForVendor, 
    selectedPeriod,
    businessProfile,
    showNotification,
    refreshData 
  } = useApp();

  const orgName = businessProfile?.tradeName || 'Omkar Precision Engineering Pvt Ltd';
  const orgGstin = businessProfile?.gstin || '27AABCO4829K1ZX';

  // Major discrepancy records that require vendor action
  const majorRecords = records.filter(r => r.severity === 'major');

  // Currently active record in composer
  const [activeRecord, setActiveRecord] = useState<ReconciliationRecord | null>(() => {
    return selectedRecordForVendor || majorRecords[0] || null;
  });

  const [templateType, setTemplateType] = useState<'standard' | 'urgent' | 'amendment'>('standard');

  const initialDraft = activeRecord 
    ? generateNoticeDraft(activeRecord, 'standard', orgName, orgGstin, selectedPeriod)
    : { subject: '', body: '' };

  const [toEmail, setToEmail] = useState(() => {
    return activeRecord?.vendorEmail || (activeRecord ? `finance@${activeRecord.supplierName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com` : '');
  });
  const [ccEmail, setCcEmail] = useState('accounts@omkarengg.in');
  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.body);
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSelectRecord = (item: ReconciliationRecord) => {
    setActiveRecord(item);
    setSelectedRecordForVendor(item);
    const draft = generateNoticeDraft(item, templateType, orgName, orgGstin, selectedPeriod);
    setToEmail(item.vendorEmail || `finance@${item.supplierName.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`);
    setSubject(draft.subject);
    setBody(draft.body);
  };

  const handleTemplateChange = (newTemplate: 'standard' | 'urgent' | 'amendment') => {
    setTemplateType(newTemplate);
    if (activeRecord) {
      const draft = generateNoticeDraft(activeRecord, newTemplate, orgName, orgGstin, selectedPeriod);
      setSubject(draft.subject);
      setBody(draft.body);
    }
  };

  const handleSendMessage = async () => {
    if (!activeRecord) return;
    setIsSending(true);
    try {
      await api.sendVendorCommunication(activeRecord.id, {
        subject,
        body,
        recipientEmail: toEmail,
        status: 'sent',
      });
      await refreshData();
      showNotification(`Notice for invoice ${activeRecord.invoiceNumber} sent to ${toEmail}`, 'success');
      setActiveRecord(prev => prev ? { ...prev, vendorCommunicationStatus: 'sent' } : null);
    } catch {
      showNotification('Failed to send vendor communication', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    showNotification('Message copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 3000);
  };

  const formatCurrency = (val?: number) => {
    if (!val) return '₹0.00';
    return '₹' + val.toLocaleString('en-IN');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Vendor Communication"
        subtitle="Manage and send formal GST discrepancy notices to non-compliant suppliers."
      />

      <main className="p-6 space-y-6 max-w-7xl">
        {/* Helper Note */}
        <div className="bg-white border border-slate-200 rounded p-3.5 flex items-start space-x-2.5 text-xs text-slate-700 shadow-xs">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-slate-900">Automated Audit-Ready Notices:</span>
            <p className="text-slate-600">
              Clear vendor communication creates an official audit trail for GST officers, demonstrating reasonable steps taken to recover tax under Section 16(2)(aa).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: List of Vendors / Invoices needing action (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded shadow-xs overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Invoices Requiring Vendor Action
                </h2>
                <span className="text-[11px] text-slate-500">
                  {majorRecords.length} major discrepancies
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
              {majorRecords.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No major discrepancies requiring vendor communication.
                </div>
              ) : (
                majorRecords.map((item) => {
                  const isSelected = activeRecord?.id === item.id;
                  const isSent = item.vendorCommunicationStatus === 'sent';

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectRecord(item)}
                      className={`p-3.5 cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-blue-50/80 border-l-4 border-blue-700' 
                          : 'hover:bg-slate-50 border-l-4 border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {item.supplierName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                            {item.supplierGstin}
                          </div>
                        </div>
                        <StatusBadge 
                          status={item.vendorCommunicationStatus || 'not_contacted'} 
                        />
                      </div>

                      <div className="mt-2 text-xs flex items-center justify-between">
                        <span className="font-mono font-semibold text-slate-800">
                          Inv: {item.invoiceNumber}
                        </span>
                        <span className="font-mono font-bold text-rose-700">
                          Diff: {formatCurrency(item.differenceAmount || item.totalTax)}
                        </span>
                      </div>

                      <div className="mt-1 text-[11px] text-slate-600 line-clamp-2">
                        {item.reason}
                      </div>

                      {isSent && (
                        <div className="mt-2 text-[10px] text-emerald-700 flex items-center space-x-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Notice dispatched • Awaiting supplier amendment</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Email-Style Notice Composer (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-blue-700" />
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Notice Composer
                </h2>
              </div>

              {/* Template selector */}
              <div className="flex items-center space-x-1 text-xs">
                <label htmlFor="notice-template-select" className="text-slate-500 font-medium">Template:</label>
                <select
                  id="notice-template-select"
                  value={templateType}
                  onChange={(e) => handleTemplateChange(e.target.value as typeof templateType)}
                  className="border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="standard">Standard Notice</option>
                  <option value="urgent">Urgent (Before 11th)</option>
                  <option value="amendment">Table 9 Amendment</option>
                </select>
              </div>
            </div>

            {activeRecord ? (
              <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  {/* Recipient Header Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label 
                        htmlFor="vendor-to-email" 
                        className="block text-[11px] font-semibold text-slate-700 mb-1"
                      >
                        To (Supplier Accounts Email)
                      </label>
                      <input
                        id="vendor-to-email"
                        type="email"
                        value={toEmail}
                        onChange={(e) => setToEmail(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>
                    <div>
                      <label 
                        htmlFor="vendor-cc-email" 
                        className="block text-[11px] font-semibold text-slate-700 mb-1"
                      >
                        CC (Internal Accounts)
                      </label>
                      <input
                        id="vendor-cc-email"
                        type="email"
                        value={ccEmail}
                        onChange={(e) => setCcEmail(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label 
                      htmlFor="vendor-subject-line" 
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Subject
                    </label>
                    <input
                      id="vendor-subject-line"
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label 
                      htmlFor="vendor-body-text" 
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Message Body
                    </label>
                    <textarea
                      id="vendor-body-text"
                      rows={12}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="w-full p-3 border border-slate-300 rounded text-xs text-slate-900 font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-600 resize-none"
                    />
                  </div>
                </div>

                {/* Composer Actions */}
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleCopyMessage}
                      className="inline-flex items-center space-x-1.5 text-xs text-slate-700 hover:text-slate-900 font-medium px-3 py-2 rounded border border-slate-300 hover:bg-slate-50 transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                      <span>{copied ? 'Copied' : 'Copy Message'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={isSending}
                    className="inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-5 py-2 rounded shadow-sm transition-colors disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSending ? 'Sending Notice...' : 'Send Notice Email'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-slate-500">
                Select an invoice from the left panel to compose a notice.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
