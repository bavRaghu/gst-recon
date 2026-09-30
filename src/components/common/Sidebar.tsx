import React from 'react';
import { useApp } from '../../context/AppContext';
import { 
  LayoutDashboard, 
  UploadCloud, 
  RefreshCw, 
  AlertTriangle, 
  FileText, 
  Mail, 
  Settings, 
  LogOut,
  ShieldCheck,
  Building
} from 'lucide-react';
import type { ActivePage } from '../../types';

export const Sidebar: React.FC = () => {
  const { 
    activePage, 
    setActivePage, 
    records, 
    user, 
    logout, 
    businessProfile 
  } = useApp();

  // Calculate badge counts
  const majorDiscrepanciesCount = records.filter(r => r.severity === 'major').length;
  const pendingVendorCount = records.filter(
    r => r.severity === 'major' && (!r.vendorCommunicationStatus || r.vendorCommunicationStatus === 'not_contacted' || r.vendorCommunicationStatus === 'draft')
  ).length;

  const navItems: { id: ActivePage; label: string; icon: React.FC<{ className?: string }>; badge?: number; badgeColor?: string }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'upload',
      label: 'Upload Data',
      icon: UploadCloud,
    },
    {
      id: 'reconciliation',
      label: 'Reconciliation',
      icon: RefreshCw,
    },
    {
      id: 'results',
      label: 'Reconciliation Results',
      icon: FileText,
      badge: records.length,
      badgeColor: 'bg-slate-200 text-slate-700',
    },
    {
      id: 'discrepancies',
      label: 'Discrepancies',
      icon: AlertTriangle,
      badge: majorDiscrepanciesCount > 0 ? majorDiscrepanciesCount : undefined,
      badgeColor: 'bg-rose-100 text-rose-800 font-semibold',
    },
    {
      id: 'vendor',
      label: 'Vendor Communication',
      icon: Mail,
      badge: pendingVendorCount > 0 ? pendingVendorCount : undefined,
      badgeColor: 'bg-amber-100 text-amber-800 font-semibold',
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: FileText,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 h-screen sticky top-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>GSTRecon</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-blue-900/80 text-blue-300 border border-blue-700 rounded">
                MSME
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Reconciliation & Compliance</p>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Reconciliation Workflow
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-700 text-white font-semibold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User / Organization Profile & Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60">
        <div className="px-2 py-2 mb-2 rounded bg-slate-900 border border-slate-800">
          <div className="flex items-center space-x-2">
            <Building className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <div className="truncate text-xs font-medium text-slate-200">
              {businessProfile?.tradeName || 'Omkar Engineering'}
            </div>
          </div>
          <div className="font-mono text-[10px] text-slate-400 mt-0.5 pl-5.5 truncate">
            {businessProfile?.gstin || '27AABCO4829K1ZX'}
          </div>
        </div>

        <div className="flex items-center justify-between px-2 pt-1 text-xs">
          <div className="truncate pr-2">
            <div className="font-medium text-slate-200 truncate">{user.name}</div>
            <div className="text-[11px] text-slate-400 truncate">{user.role}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
