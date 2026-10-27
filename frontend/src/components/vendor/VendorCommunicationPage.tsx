import React, { useState, useEffect, useCallback } from 'react';
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
  CheckCircle2,
  Save,
  AlertCircle,
  Clock,
  Loader2,
  ArrowRight
} from 'lucide-react';
import type { BackendVendorActionItem, SmtpConfigStatus } from '../../types';

function generateNoticeDraft(
  rec: BackendVendorActionItem, 
  template: 'standard' | 'urgent' | 'amendment',
  orgName: string,
  orgGstin: string,
  period: string
): { subject: string; body: string } {
  const diffText = rec.difference_amount > 0 
    ? `₹${rec.difference_amount.toLocaleString('en-IN')}` 
    : `₹${rec.total_tax.toLocaleString('en-IN')}`;

  if (template === 'urgent') {
    return {
      subject: `URGENT: Blocked GST ITC – Missing Invoice ${rec.invoice_number} – ${period}`,
      body: `ATTN: Accounts & Taxation Department
${rec.supplier_name} (GSTIN: ${rec.supplier_gstin})

Subject: URGENT: Input Tax Credit Discrepancy for ${period}

Dear Accounts Team,

This is an urgent communication regarding GST compliance for the tax period ${period}. During our monthly GSTR-2B reconciliation, we observed the following critical issue with your invoice:

• Invoice Number: ${rec.invoice_number}
• Invoice Date: ${rec.invoice_date}
• Invoice Value: ₹${rec.total_value.toLocaleString('en-IN')}
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
      subject: `Request for GSTR-1 Amendment (Table 9) – Invoice ${rec.invoice_number}`,
      body: `Dear Accounts Team,
${rec.supplier_name},

Subject: Request for Table 9 Amendment in GSTR-1 for Invoice ${rec.invoice_number}

During our internal GST verification for ${period}, we noted a difference between the physical invoice issued to us and the values appearing in GSTR-2B:

• Invoice Number: ${rec.invoice_number}
• Date: ${rec.invoice_date}
• Discrepancy: ${rec.reason}
• Tax Impact: ${diffText}
• Action Required: ${rec.recommended_action}

Kindly report an amendment in Table 9 of your upcoming GSTR-1 filing to correct this mismatch so that we can claim legitimate ITC.

Thank you for your cooperation.

Sincerely,
${orgName}
GSTIN: ${orgGstin}`,
    };
  }

  return {
    subject: `GST Reconciliation Discrepancy – Invoice ${rec.invoice_number} – ${period}`,
    body: `Dear Accounts Team,
${rec.supplier_name},

Subject: GST Invoice Discrepancy Notice for ${period}

During our periodic reconciliation of our Purchase Register with government portal GSTR-2B, the following discrepancy was identified:

• Supplier GSTIN: ${rec.supplier_gstin}
• Invoice Number: ${rec.invoice_number}
• Invoice Date: ${rec.invoice_date}
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
    activeJobId,
    selectedPeriod,
    businessProfile,
    showNotification,
    selectedRecordForVendor,
    setActivePage
  } = useApp();

  const orgName = businessProfile?.tradeName || 'Omkar Precision Engineering Pvt Ltd';
  const orgGstin = businessProfile?.gstin || '27AABCO4829K1ZX';

  // Dynamic state loaded from real backend
  const [vendorItems, setVendorItems] = useState<BackendVendorActionItem[]>([]);
  const [activeRecord, setActiveRecord] = useState<BackendVendorActionItem | null>(null);
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfigStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Composer fields
  const [templateType, setTemplateType] = useState<'standard' | 'urgent' | 'amendment'>('standard');
  const [toEmail, setToEmail] = useState<string>('');
  const [ccEmail, setCcEmail] = useState<string>('accounts@omkarengg.in');
  const [subject, setSubject] = useState<string>('');
  const [body, setBody] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isBodyDirty, setIsBodyDirty] = useState<boolean>(false);

  // Helper to populate composer based on selected item
  const populateComposer = useCallback((item: BackendVendorActionItem, chosenTemplate?: 'standard' | 'urgent' | 'amendment') => {
    // If item has a saved draft, load the saved draft content
    if (item.latest_communication && item.latest_communication.status === 'DRAFT') {
      const draft = item.latest_communication;
      const t = (draft.template_type as 'standard' | 'urgent' | 'amendment') || 'standard';
      setTemplateType(t);
      setToEmail(draft.recipient_email || item.vendor_email || '');
      setCcEmail(draft.cc_email || 'accounts@omkarengg.in');
      setSubject(draft.subject);
      setBody(draft.body);
      setIsBodyDirty(false);
      return;
    }

    // Determine default template based on discrepancy nature
    let initialT = chosenTemplate;
    if (!initialT) {
      if (item.discrepancy_status === 'MISSING_IN_GSTR2B') {
        initialT = 'urgent';
      } else if (item.discrepancy_status === 'MISMATCH') {
        initialT = 'amendment';
      } else {
        initialT = 'standard';
      }
    }

    setTemplateType(initialT);
    setToEmail(item.vendor_email || '');
    setCcEmail('accounts@omkarengg.in');

    const draft = generateNoticeDraft(item, initialT, orgName, orgGstin, selectedPeriod);
    setSubject(draft.subject);
    setBody(draft.body);
    setIsBodyDirty(false);
  }, [orgName, orgGstin, selectedPeriod]);

  // Load real records whenever active job changes
  useEffect(() => {
    let isMounted = true;
    async function loadCommunications() {
      setIsLoading(true);
      try {
        const [items, cfg] = await Promise.all([
          api.getVendorCommunications(activeJobId || undefined),
          api.getSmtpConfig().catch(() => null),
        ]);
        if (!isMounted) return;

        setSmtpConfig(cfg);
        setVendorItems(items);

        // Determine initially selected record
        let initialRecord: BackendVendorActionItem | null = null;
        if (selectedRecordForVendor) {
          initialRecord = items.find(
            i => i.id === selectedRecordForVendor.id || i.invoice_number === selectedRecordForVendor.invoiceNumber
          ) || null;
        }
        if (!initialRecord && items.length > 0) {
          initialRecord = items[0];
        }

        setActiveRecord(initialRecord);
        if (initialRecord) {
          populateComposer(initialRecord);
        } else {
          setSubject('');
          setBody('');
          setToEmail('');
        }
      } catch (err) {
        console.error('Failed to load vendor communication records:', err);
        showNotification('Failed to load discrepancy records for vendor communication', 'error');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadCommunications();
    return () => { isMounted = false; };
  }, [activeJobId, selectedRecordForVendor, populateComposer, showNotification]);

  const handleSelectRecord = (item: BackendVendorActionItem) => {
    if (activeRecord?.id === item.id) return;

    if (isBodyDirty) {
      const confirmSwitch = window.confirm(
        'You have unsaved changes in the notice composer. Discard changes and select this invoice?'
      );
      if (!confirmSwitch) return;
    }

    setActiveRecord(item);
    populateComposer(item);
  };

  const handleTemplateChange = (newTemplate: 'standard' | 'urgent' | 'amendment') => {
    if (activeRecord && isBodyDirty) {
      const confirmSwitch = window.confirm(
        'Switching templates will overwrite your custom edits in the message body. Do you want to continue?'
      );
      if (!confirmSwitch) return;
    }

    setTemplateType(newTemplate);
    if (activeRecord) {
      const draft = generateNoticeDraft(activeRecord, newTemplate, orgName, orgGstin, selectedPeriod);
      setSubject(draft.subject);
      setBody(draft.body);
      setIsBodyDirty(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!activeRecord) return;
    setIsSavingDraft(true);
    try {
      const draft = await api.saveVendorCommunicationDraft(activeRecord.id, {
        recipient_email: toEmail,
        cc_email: ccEmail,
        subject,
        body,
        template_type: templateType,
        supplier_name: activeRecord.supplier_name,
      });

      // Update active record and list status
      const updatedItem: BackendVendorActionItem = {
        ...activeRecord,
        vendor_communication_status: 'draft',
        vendor_email: toEmail,
        latest_communication: draft,
      };

      setActiveRecord(updatedItem);
      setVendorItems(prev => prev.map(item => item.id === activeRecord.id ? updatedItem : item));
      setIsBodyDirty(false);
      showNotification(`Draft notice for invoice ${activeRecord.invoice_number} saved.`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save notice draft';
      showNotification(msg, 'error');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSendMessage = async () => {
    if (!activeRecord) return;

    if (!toEmail.trim()) {
      showNotification('Please enter a supplier recipient email address before dispatching', 'warning');
      return;
    }

    setIsSending(true);
    try {
      const resp = await api.sendVendorNotice(activeRecord.id, {
        recipient_email: toEmail,
        cc_email: ccEmail,
        subject,
        body,
        template_type: templateType,
        supplier_name: activeRecord.supplier_name,
      });

      // Update item state to 'sent'
      const updatedItem: BackendVendorActionItem = {
        ...activeRecord,
        vendor_communication_status: 'sent',
        vendor_email: toEmail,
        latest_communication: resp.communication,
      };

      setActiveRecord(updatedItem);
      setVendorItems(prev => prev.map(item => item.id === activeRecord.id ? updatedItem : item));
      setIsBodyDirty(false);
      showNotification(
        `Notice for invoice ${activeRecord.invoice_number} successfully dispatched to ${toEmail}.`,
        'success'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send vendor communication';
      showNotification(msg, 'error');

      // Update state to failed if delivery rejected
      const failedItem: BackendVendorActionItem = {
        ...activeRecord,
        vendor_communication_status: 'failed',
      };
      setActiveRecord(failedItem);
      setVendorItems(prev => prev.map(item => item.id === activeRecord.id ? failedItem : item));
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
        {/* Helper Note & Test Mode Alert */}
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded p-3.5 flex items-start space-x-2.5 text-xs text-slate-700 shadow-xs">
            <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-slate-900">Automated Audit-Ready Notices:</span>
              <p className="text-slate-600">
                Clear vendor communication creates an official audit trail for GST officers, demonstrating reasonable steps taken to recover tax under Section 16(2)(aa).
              </p>
            </div>
          </div>

          {smtpConfig?.test_mode && (
            <div className="bg-amber-50/80 border border-amber-200 rounded p-2.5 px-3.5 flex items-center justify-between text-xs text-amber-900 shadow-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold uppercase tracking-wider text-[10px] bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded font-mono border border-amber-300">
                  Test Mode Active
                </span>
                <span className="text-[11px] text-amber-800">
                  Notice dispatch is restricted to approved test recipient (<strong className="font-mono">{smtpConfig.test_recipient}</strong>). Sending to real supplier emails from uploaded files is safely blocked.
                </span>
              </div>
            </div>
          )}
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
                  {isLoading ? 'Loading records...' : `${vendorItems.length} discrepancies found`}
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center justify-center space-y-2">
                  <Loader2 className="w-5 h-5 text-blue-700 animate-spin" />
                  <span>Loading dynamic reconciliation discrepancies...</span>
                </div>
              ) : vendorItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 space-y-2">
                  <p className="font-semibold text-slate-700">No verified discrepancies requiring vendor action.</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    Under statutory compliance policy, only discrepancies classified as MAJOR and verified by a reviewer appear here.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActivePage('discrepancies')}
                    className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer pt-2"
                  >
                    <span>Open Human Verification</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                vendorItems.map((item) => {
                  const isSelected = activeRecord?.id === item.id;
                  const isSent = item.vendor_communication_status === 'sent';
                  const isFailed = item.vendor_communication_status === 'failed';
                  const isDraft = item.vendor_communication_status === 'draft';

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
                            {item.supplier_name}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                            {item.supplier_gstin}
                          </div>
                        </div>
                        <StatusBadge 
                          status={item.vendor_communication_status || 'not_contacted'} 
                        />
                      </div>

                      <div className="mt-2 text-xs flex items-center justify-between">
                        <span className="font-mono font-semibold text-slate-800">
                          Inv: {item.invoice_number}
                        </span>
                        <span className="font-mono font-bold text-rose-700">
                          Diff: {formatCurrency(item.difference_amount || item.total_tax)}
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
                      {isDraft && (
                        <div className="mt-2 text-[10px] text-slate-600 flex items-center space-x-1 font-medium">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>Draft notice saved</span>
                        </div>
                      )}
                      {isFailed && (
                        <div className="mt-2 text-[10px] text-rose-700 flex items-center space-x-1 font-medium">
                          <AlertCircle className="w-3 h-3 text-rose-600" />
                          <span>Dispatch failed • Action required</span>
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
                  className="border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 cursor-pointer"
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
                        placeholder="e.g. accounts@supplier.com"
                        value={toEmail}
                        onChange={(e) => {
                          setToEmail(e.target.value);
                          setIsBodyDirty(true);
                        }}
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
                        onChange={(e) => {
                          setCcEmail(e.target.value);
                          setIsBodyDirty(true);
                        }}
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
                      onChange={(e) => {
                        setSubject(e.target.value);
                        setIsBodyDirty(true);
                      }}
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
                      onChange={(e) => {
                        setBody(e.target.value);
                        setIsBodyDirty(true);
                      }}
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
                      className="inline-flex items-center space-x-1.5 text-xs text-slate-700 hover:text-slate-900 font-medium px-3 py-2 rounded border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                      <span>{copied ? 'Copied' : 'Copy Message'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={isSavingDraft || isSending}
                      className="inline-flex items-center space-x-1.5 text-xs text-slate-700 hover:text-slate-900 font-medium px-3.5 py-2 rounded border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isSavingDraft ? <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" /> : <Save className="w-3.5 h-3.5 text-slate-500" />}
                      <span>{isSavingDraft ? 'Saving Draft...' : 'Save Draft'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={isSending || isSavingDraft}
                    className="inline-flex items-center space-x-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-5 py-2 rounded shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
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
