import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface TooltipProps {
  content: string;
  term?: string;
  children?: React.ReactNode;
}

export const GstHelperTooltip: React.FC<TooltipProps> = ({ content, term, children }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span 
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children ? (
        children
      ) : (
        <button
          type="button"
          aria-label={term ? `GST Help: ${term}` : 'GST Help'}
          className="text-slate-400 hover:text-slate-600 ml-1 inline-flex p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-slate-400"
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      )}

      {isVisible && (
        <div 
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 w-64 p-2.5 bg-slate-900 text-slate-100 text-xs rounded shadow-lg border border-slate-700 pointer-events-none transition-opacity duration-150"
        >
          {term && (
            <div className="font-semibold text-slate-200 border-b border-slate-700 pb-1 mb-1">
              {term}
            </div>
          )}
          <p className="leading-relaxed text-slate-300 font-normal">{content}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </span>
  );
};
