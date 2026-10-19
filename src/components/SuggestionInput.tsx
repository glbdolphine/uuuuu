import React, { useState, useRef, useEffect } from 'react';

interface SuggestionInputProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  placeholder?: string;
  required?: boolean;
  type?: string;
  isTextarea?: boolean;
  rows?: number;
  autoFormatMac?: boolean;
}

export const SuggestionInput: React.FC<SuggestionInputProps> = ({
  label,
  value,
  onChange,
  suggestions = [],
  placeholder = '',
  required = false,
  type = 'text',
  isTextarea = false,
  rows = 3,
  autoFormatMac = false,
}) => {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on value
  const filtered = (suggestions || []).filter(
    (s) => s && s.toLowerCase().includes((value || '').toLowerCase()) && s !== value
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMacFormat = (input: string) => {
    // Keep only valid hex chars
    const cleaned = input.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
    // Insert colons every 2 chars
    const parts = cleaned.match(/.{1,2}/g) || [];
    return parts.join(':');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let val = e.target.value;
    if (autoFormatMac) {
      val = handleMacFormat(val);
    }
    onChange(val);
    setOpen(true);
    setHighlightIdx(-1);
  };

  const handleSelect = (selected: string) => {
    onChange(selected);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault();
      handleSelect(filtered[highlightIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const inputClass =
    'w-full text-base text-slate-900 bg-white border border-slate-300 rounded-xl transition-colors hover:border-slate-400 focus:outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10 placeholder:text-slate-400';

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>

      {isTextarea ? (
        <textarea
          value={value}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          required={required}
          rows={rows}
          className={`${inputClass} px-3.5 py-3 leading-relaxed resize-y`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          className={`${inputClass} h-12 px-3.5 ${autoFormatMac ? 'font-mono' : ''}`}
        />
      )}

      {open && filtered.length > 0 && (
        <div className="absolute z-40 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg py-1">
          {filtered.slice(0, 8).map((sugg, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelect(sugg)}
              className={`w-full text-left px-4 py-2.5 text-base text-slate-800 transition-colors ${
                idx === highlightIdx ? 'bg-brand-50 text-brand-900 font-medium' : 'hover:bg-slate-50'
              }`}
            >
              {sugg}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
