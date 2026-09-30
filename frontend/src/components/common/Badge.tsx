import React from 'react';
import type { MatchStatus, DiscrepancySeverity } from '../../types';

interface BadgeProps {
  status?: MatchStatus | string;
  severity?: DiscrepancySeverity;
  label?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<BadgeProps> = ({ status, severity, label, size = 'sm' }) => {
  let displayLabel = label;
  let styleClasses = 'bg-slate-100 text-slate-700 border-slate-200';

  if (severity) {
    switch (severity) {
      case 'exact':
        displayLabel = label || 'Matched';
        styleClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        break;
      case 'minor':
        displayLabel = label || 'Minor Discrepancy';
        styleClasses = 'bg-amber-50 text-amber-800 border-amber-200';
        break;
      case 'major':
        displayLabel = label || 'Major Discrepancy';
        styleClasses = 'bg-rose-50 text-rose-800 border-rose-200';
        break;
    }
  } else if (status) {
    switch (status) {
      case 'matched':
        displayLabel = label || 'Matched';
        styleClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        break;
      case 'minor_discrepancy':
        displayLabel = label || 'Minor';
        styleClasses = 'bg-amber-50 text-amber-800 border-amber-200';
        break;
      case 'major_discrepancy':
        displayLabel = label || 'Major';
        styleClasses = 'bg-rose-50 text-rose-800 border-rose-200';
        break;
      case 'unmatched_in_2b':
        displayLabel = label || 'Missing in 2B';
        styleClasses = 'bg-rose-50 text-rose-800 border-rose-200';
        break;
      case 'unmatched_in_pr':
        displayLabel = label || 'Missing in Books';
        styleClasses = 'bg-indigo-50 text-indigo-800 border-indigo-200';
        break;
      case 'Completed':
        displayLabel = label || 'Completed';
        styleClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        break;
      case 'Action Needed':
        displayLabel = label || 'Action Needed';
        styleClasses = 'bg-rose-50 text-rose-800 border-rose-200';
        break;
      case 'In Progress':
        displayLabel = label || 'In Progress';
        styleClasses = 'bg-blue-50 text-blue-800 border-blue-200';
        break;
      case 'ready':
        displayLabel = label || 'Ready';
        styleClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        break;
      case 'sent':
        displayLabel = label || 'Notice Sent';
        styleClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200';
        break;
      case 'draft':
        displayLabel = label || 'Draft Notice';
        styleClasses = 'bg-slate-100 text-slate-700 border-slate-200';
        break;
      case 'not_contacted':
        displayLabel = label || 'Pending Notice';
        styleClasses = 'bg-amber-50 text-amber-800 border-amber-200';
        break;
      default:
        displayLabel = label || status;
        styleClasses = 'bg-slate-100 text-slate-700 border-slate-200';
    }
  }

  const sizeClasses = size === 'sm' 
    ? 'px-2 py-0.5 text-xs font-medium' 
    : 'px-2.5 py-1 text-xs font-semibold';

  return (
    <span 
      className={`inline-flex items-center rounded border tracking-wide uppercase font-mono ${sizeClasses} ${styleClasses}`}
    >
      {displayLabel}
    </span>
  );
};
