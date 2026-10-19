import React from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { ScrollLock } from './ScrollLock';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  isDestructive = true,
  onConfirm,
  onCancel,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <ScrollLock />
      <div role="alertdialog" aria-modal="true" aria-label={title} className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4">
        <div className="flex items-start gap-3.5">
          <span className={`grid place-items-center w-10 h-10 rounded-2xl text-white shadow-lg shrink-0 bg-gradient-to-br ${isDestructive ? 'from-orange-400 to-rose-600 shadow-rose-600/30' : 'from-brand-400 to-brand-700 shadow-brand-600/30'}`}>
            {isDestructive ? <AlertTriangle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#1b2a4e]">{title}</h3>
            <p className="text-[13px] text-slate-500 mt-1">{message}</p>
          </div>
        </div>
        {children}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-10 px-5 text-xs font-semibold text-white rounded-xl shadow-md transition-all hover:-translate-y-px active:translate-y-0 ${
              isDestructive
                ? 'bg-gradient-to-br from-orange-500 to-rose-600 hover:from-orange-600 hover:to-rose-700 shadow-rose-600/30'
                : 'bg-gradient-to-br from-brand-500 to-brand-700 hover:from-brand-600 hover:to-brand-800 shadow-brand-600/30'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
