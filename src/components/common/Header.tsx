import React from 'react';
import { useApp } from '../../context/AppContext';
import { Calendar, Building2, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actionButton?: React.ReactNode;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, actionButton }) => {
  const { 
    selectedPeriod, 
    setSelectedPeriod, 
    businessProfile,
    notification,
    showNotification 
  } = useApp();

  const periods = [
    'September 2026',
    'August 2026',
    'July 2026',
    'June 2026',
    'May 2026',
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      {/* Toast notification banner */}
      {notification && (
        <div 
          className={`px-6 py-2 flex items-center justify-between text-xs font-medium border-b ${
            notification.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : notification.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : notification.type === 'warning'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-blue-50 text-blue-800 border-blue-200'
          }`}
        >
          <div className="flex items-center space-x-2">
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {notification.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            {notification.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />}
            {notification.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
            <span>{notification.message}</span>
          </div>
          <button 
            type="button" 
            onClick={() => showNotification('', 'info')}
            className="hover:opacity-75"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main header row */}
      <div className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center flex-wrap gap-3">
          {/* Business GSTIN identity pill */}
          {businessProfile && (
            <div className="hidden lg:flex items-center space-x-2 text-xs text-slate-600 bg-slate-100 px-2.5 py-1.5 rounded border border-slate-200">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-medium text-slate-700">{businessProfile.tradeName}</span>
              <span className="text-slate-400">|</span>
              <span className="font-mono text-slate-600">{businessProfile.gstin}</span>
            </div>
          )}

          {/* GST Period Selector */}
          <div className="flex items-center space-x-1.5 bg-white border border-slate-300 rounded px-2.5 py-1 shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <label htmlFor="period-selector" className="text-xs text-slate-600 font-medium">
              Period:
            </label>
            <select
              id="period-selector"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="text-xs font-semibold text-slate-800 bg-transparent border-0 focus:ring-0 focus:outline-none cursor-pointer pr-2"
            >
              {periods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {actionButton}
        </div>
      </div>
    </header>
  );
};
