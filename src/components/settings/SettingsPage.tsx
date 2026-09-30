import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Header } from '../common/Header';
import { GstHelperTooltip } from '../common/Tooltip';
import { api } from '../../services/api';
import { 
  Building2, 
  Sliders, 
  Bell, 
  User, 
  Save, 
  RotateCcw
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { 
    businessProfile, 
    updateBusinessProfile, 
    settings, 
    updateSettings,
    user,
    showNotification,
    refreshData
  } = useApp();

  const [activeTab, setActiveTab] = useState<'business' | 'reconciliation' | 'account' | 'notifications'>('business');

  // Business state
  const [legalName, setLegalName] = useState(businessProfile?.legalName || '');
  const [tradeName, setTradeName] = useState(businessProfile?.tradeName || '');
  const [gstin, setGstin] = useState(businessProfile?.gstin || '');
  const [pan, setPan] = useState(businessProfile?.pan || '');
  const [state, setState] = useState(businessProfile?.state || '');
  const [filingFrequency, setFilingFrequency] = useState<'Monthly' | 'Quarterly (QRMP)'>(
    businessProfile?.filingFrequency || 'Monthly'
  );

  // Settings state
  const [tolerance, setTolerance] = useState(settings?.taxToleranceAmount || 1.0);
  const [fuzzyMatching, setFuzzyMatching] = useState(settings?.fuzzyInvoiceMatching ?? true);
  const [dateTolerance, setDateTolerance] = useState(settings?.dateToleranceDays || 3);
  const [emailAlerts, setEmailAlerts] = useState(settings?.emailAlertOnMajorDiscrepancy ?? true);
  const [weeklyDigest, setWeeklyDigest] = useState(settings?.weeklySummaryDigest ?? false);

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateBusinessProfile({
      legalName,
      tradeName,
      gstin,
      pan,
      state,
      filingFrequency,
    });
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      taxToleranceAmount: Number(tolerance),
      fuzzyInvoiceMatching: fuzzyMatching,
      dateToleranceDays: Number(dateTolerance),
      emailAlertOnMajorDiscrepancy: emailAlerts,
      weeklySummaryDigest: weeklyDigest,
    });
  };

  const handleResetDemoData = () => {
    if (window.confirm('Reset all reconciliation data to original demo state?')) {
      api.resetSampleData();
      refreshData();
      showNotification('Reset all records to initial demo state', 'info');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50 min-h-screen">
      <Header
        title="Settings & Preferences"
        subtitle="Manage business GSTIN identity, reconciliation tolerance limits, and alert options."
      />

      <main className="p-6 space-y-6 max-w-4xl">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 space-x-6 text-xs font-semibold">
          {[
            { id: 'business', label: 'GST & Business Profile', icon: Building2 },
            { id: 'reconciliation', label: 'Reconciliation Rules', icon: Sliders },
            { id: 'account', label: 'User Account', icon: User },
            { id: 'notifications', label: 'Notifications', icon: Bell },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`pb-3 flex items-center space-x-2 border-b-2 transition-colors ${
                  isActive 
                    ? 'border-blue-700 text-blue-800' 
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* TAB 1: Business / GST Profile */}
        {activeTab === 'business' && (
          <form onSubmit={handleSaveBusiness} className="bg-white border border-slate-200 rounded p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Registered GST Information
              </h2>
              <p className="text-xs text-slate-500">
                Your registered entity details as shown on the GST Common Portal.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label 
                  htmlFor="legal-entity-name" 
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Legal Entity Name
                </label>
                <input
                  id="legal-entity-name"
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label 
                  htmlFor="trade-business-name" 
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Trade Name
                </label>
                <input
                  id="trade-business-name"
                  type="text"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label 
                  htmlFor="company-gstin" 
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Company GSTIN
                </label>
                <input
                  id="company-gstin"
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label 
                  htmlFor="company-pan" 
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Permanent Account Number (PAN)
                </label>
                <input
                  id="company-pan"
                  type="text"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs font-mono text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label 
                  htmlFor="registered-state" 
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Registered State
                </label>
                <input
                  id="registered-state"
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label 
                  htmlFor="filing-frequency" 
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  GSTR-1 / 3B Filing Frequency
                </label>
                <select
                  id="filing-frequency"
                  value={filingFrequency}
                  onChange={(e) => setFilingFrequency(e.target.value as 'Monthly' | 'Quarterly (QRMP)')}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="Monthly">Monthly Return (Turnover &gt; ₹5 Cr or opted)</option>
                  <option value="Quarterly (QRMP)">Quarterly (QRMP Scheme)</option>
                </select>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center space-x-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-4 py-2 rounded transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Business Profile</span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: Reconciliation Rules & Tolerance */}
        {activeTab === 'reconciliation' && (
          <form onSubmit={handleSavePreferences} className="bg-white border border-slate-200 rounded p-6 shadow-xs space-y-5">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Matching Tolerance & Algorithms
              </h2>
              <p className="text-xs text-slate-500">
                Configure acceptable threshold variations to eliminate trivial discrepancies.
              </p>
            </div>

            <div className="space-y-4">
              {/* Tolerance Amount */}
              <div className="border border-slate-200 rounded p-4 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <label 
                      htmlFor="tolerance-limit" 
                      className="text-xs font-bold text-slate-800 flex items-center"
                    >
                      Tax Amount Tolerance (Rounding limit)
                      <GstHelperTooltip 
                        term="Rounding Tolerance"
                        content="GST law allows rounding off fractions of a rupee under Section 170. Small differences within this threshold will be marked as matched or minor."
                      />
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Differences below this value are auto-classified as minor or accepted.
                    </p>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-mono font-semibold text-slate-700">₹</span>
                    <input
                      id="tolerance-limit"
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={tolerance}
                      onChange={(e) => setTolerance(parseFloat(e.target.value) || 0)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>

              {/* Fuzzy Invoice Number Matching */}
              <div className="border border-slate-200 rounded p-4 bg-slate-50/50">
                <div className="flex items-start justify-between">
                  <div className="pr-4">
                    <label 
                      htmlFor="fuzzy-toggle" 
                      className="text-xs font-bold text-slate-800 flex items-center cursor-pointer"
                    >
                      Fuzzy Invoice Number Matching
                      <GstHelperTooltip 
                        term="Fuzzy Matching"
                        content="Accounts software often strips special characters (e.g. 'INV/2026/01' vs 'INV-2026-01' or 'INV01'). Fuzzy matching normalizes these."
                      />
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Automatically ignore differences in leading zeroes, slashes (/), hyphens (-), and spaces in invoice numbers.
                    </p>
                  </div>
                  <input
                    id="fuzzy-toggle"
                    type="checkbox"
                    checked={fuzzyMatching}
                    onChange={(e) => setFuzzyMatching(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 mt-1 cursor-pointer"
                  />
                </div>
              </div>

              {/* Date Variation Tolerance */}
              <div className="border border-slate-200 rounded p-4 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <div>
                    <label 
                      htmlFor="date-tolerance" 
                      className="text-xs font-bold text-slate-800"
                    >
                      Invoice Date Tolerance (Days)
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Allow small date differences (e.g. goods transit / invoice receipt date).
                    </p>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <input
                      id="date-tolerance"
                      type="number"
                      min="0"
                      max="15"
                      value={dateTolerance}
                      onChange={(e) => setDateTolerance(parseInt(e.target.value) || 0)}
                      className="w-20 px-2 py-1 border border-slate-300 rounded text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-600"
                    />
                    <span className="text-xs text-slate-600">days</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center space-x-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-4 py-2 rounded transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Reconciliation Rules</span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: User Account */}
        {activeTab === 'account' && (
          <div className="bg-white border border-slate-200 rounded p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                User Profile
              </h2>
              <p className="text-xs text-slate-500">
                Account information of the logged-in accounting personnel.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  disabled
                  value={user.name}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-700 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">Email Address</label>
                <input
                  type="email"
                  disabled
                  value={user.email}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-700 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">Role / Designation</label>
                <input
                  type="text"
                  disabled
                  value={user.role}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-slate-700 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">Security Access</label>
                <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 font-medium">
                  Verified Internal Finance Access
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Notifications */}
        {activeTab === 'notifications' && (
          <form onSubmit={handleSavePreferences} className="bg-white border border-slate-200 rounded p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Notification Preferences
              </h2>
              <p className="text-xs text-slate-500">
                Control reminders and discrepancy alerts for GST compliance.
              </p>
            </div>

            <div className="space-y-3">
              <label 
                htmlFor="email-alerts-toggle" 
                className="flex items-start space-x-3 p-3 bg-slate-50 rounded border border-slate-200 cursor-pointer"
              >
                <input
                  id="email-alerts-toggle"
                  type="checkbox"
                  checked={emailAlerts}
                  onChange={(e) => setEmailAlerts(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 mt-0.5"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    High Priority Discrepancy Alerts
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Send immediate email if major discrepancies exceed ₹10,000 in ITC risk before GSTR-3B due date.
                  </div>
                </div>
              </label>

              <label 
                htmlFor="weekly-digest-toggle" 
                className="flex items-start space-x-3 p-3 bg-slate-50 rounded border border-slate-200 cursor-pointer"
              >
                <input
                  id="weekly-digest-toggle"
                  type="checkbox"
                  checked={weeklyDigest}
                  onChange={(e) => setWeeklyDigest(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 mt-0.5"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Weekly Compliance Digest
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Receive a summary of pending vendor responses every Monday morning.
                  </div>
                </div>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center space-x-1.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-4 py-2 rounded transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Notification Settings</span>
              </button>
            </div>
          </form>
        )}

        {/* Reset Demo Data Card */}
        <div className="border border-slate-200 bg-white rounded p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-800">
              Reset Demo Records
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Restore initial September 2026 test records, vendor notices, and sample runs.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetDemoData}
            className="inline-flex items-center space-x-1.5 text-xs text-rose-700 hover:text-rose-900 border border-rose-300 hover:bg-rose-50 px-3 py-1.5 rounded transition-colors font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Data</span>
          </button>
        </div>
      </main>
    </div>
  );
};
