import React, { useState } from 'react';
import { displayCategory } from '../utils/category';
import { LogEntry, Foreman } from '../types';
import { logUpazila } from '../utils/upazilas';
import { FileText, FileSpreadsheet, Printer, Edit3, Copy, Trash2, Check, Download, X, MapPin, ExternalLink } from 'lucide-react';
import { exportSingleLogPdf } from '../utils/exportPdf';
import { exportSingleLogExcel } from '../utils/exportExcel';
import { downloadUpacForm } from '../utils/cloud';
import { formatStamp } from '../utils/activity';
import { ConfirmDialog } from './ConfirmDialog';
import { PendingIndex } from '../utils/approvals';
import { fromIso, showDate } from '../utils/dates';
import { NameLang, nameFor } from '../utils/names';

interface LogSheetViewProps {
  log: LogEntry;
  onEdit?: (log: LogEntry) => void;
  onDuplicate?: (log: LogEntry) => void;
  onDelete?: (id: string) => void;
  onToggleForm?: (log: LogEntry) => void;
  onToggleBill?: (log: LogEntry) => void;
  pending?: PendingIndex;
  foremen?: Foreman[];
  nameLang?: NameLang;
  onClose?: () => void;
  columnsClass?: string;
  compact?: boolean;
}

type SheetField = {
  label: string;
  value: string;
  wide?: boolean;
  mono?: boolean;
  strong?: boolean;
  block?: boolean;
  copy?: boolean;
  link?: string;
};
type Section = { title: string; fields: SheetField[] };

const statusTone = (status: string): string => {
  const s = status.toLowerCase();
  if (/(resolv|done|complete|closed|active|success)/.test(s)) return 'bg-emerald-100 text-emerald-800 ring-emerald-300';
  if (/(pend|wait|progress|follow|open)/.test(s)) return 'bg-amber-100 text-amber-800 ring-amber-300';
  if (/(reject|fail|cancel|problem|issue)/.test(s)) return 'bg-rose-100 text-rose-800 ring-rose-300';
  return 'bg-white/90 text-slate-700 ring-white/60';
};

export const LogSheetView: React.FC<LogSheetViewProps> = ({
  log,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleForm: _onToggleForm,
  onToggleBill: _onToggleBill,
  pending: _pending,
  foremen = [],
  nameLang = 'bn',
  onClose,
  columnsClass = 'columns-1 md:columns-2 xl:columns-3',
  compact = false,
}) => {
  const instituteName = nameFor(log, nameLang).text;
  const [copiedMac, setCopiedMac] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const handleCopyMac = () => {
    if (log.mac) {
      navigator.clipboard.writeText(log.mac);
      setCopiedMac(true);
      setTimeout(() => setCopiedMac(false), 2000);
    }
  };

  // Print only this log. The sheet is copied into its own #print-root at the top of <body>, and the
  // stylesheet hides everything else while printing. That works the same from the list modal and the
  // split view (whose wrappers are overflow-clipped / marked no-print) and never prints the page behind.
  const handlePrint = () => {
    const src = document.getElementById(`log-${log.id}`);
    if (!src) return;
    const clone = src.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('.no-print').forEach((n) => n.remove());

    const root = document.createElement('div');
    root.id = 'print-root';
    root.appendChild(clone);
    document.body.appendChild(root);
    document.body.classList.add('print-single');

    const cleanup = () => {
      window.removeEventListener('afterprint', cleanup);
      root.remove();
      document.body.classList.remove('print-single');
    };
    window.addEventListener('afterprint', cleanup);
    // Let the browser lay the copy out before the print dialog opens
    window.setTimeout(() => window.print(), 50);
  };

  // One upazila for the log: the foreman's upazila (same one used by the upazila filter),
  // else whatever was saved on the log itself.
  const upazila = logUpazila(log, foremen) || log.upazila || '';

  const followUpDate = log.followUpDate ? (fromIso(log.followUpDate) ? showDate(fromIso(log.followUpDate)) : log.followUpDate) : '';
  const coords = [log.lat, log.long].filter(Boolean).join(', ');
  const mapUrl = log.lat && log.long ? `https://www.google.com/maps?q=${encodeURIComponent(`${log.lat},${log.long}`)}` : '';
  const category = displayCategory(log);

  const sections: Section[] = [
    {
      title: 'Institute',
      fields: [
        { label: nameLang === 'en' ? 'Institute name (English)' : 'Institute name', value: instituteName, wide: true, strong: true },
        { label: 'Category / POP', value: category },
        { label: 'Emis / EIIN / DGHS', value: log.emisEiinDghs || '', mono: true },
        { label: 'Head teacher / In-charge', value: log.headTeacherName || '' },
        { label: 'Head teacher phone', value: log.headTeacherPhone || '', mono: true },
      ],
    },
    {
      title: 'Location',
      fields: [
        { label: 'Upazila', value: upazila },
        { label: 'Union / Ward / Pouroshova', value: log.unionName || '' },
        { label: 'Coordinates (Lat, Long)', value: coords, mono: true, link: mapUrl, wide: true },
      ],
    },
    {
      title: 'Connection & Equipment',
      fields: [
        { label: 'NMS ID / Customer ID', value: log.nmsId, mono: true },
        { label: 'EDC book no.', value: log.edcNo || '', mono: true },
        { label: 'Wi-Fi router serial no.', value: log.routerSerial || '', mono: true },
        { label: 'MAC address', value: log.mac, mono: true, copy: true },
        { label: 'Optical fiber length', value: log.fiberLength ? `${log.fiberLength} meters` : '' },
      ],
    },
    {
      title: 'Foreman & Request',
      fields: [
        { label: 'Foreman name', value: log.foremanName },
        { label: 'Foreman phone', value: log.foremanPhone || '', mono: true },
        { label: 'Request type', value: log.requestType },
        { label: 'Date', value: log.date },
      ],
    },
    {
      title: 'Issue & Action',
      fields: [
        { label: 'Issue found', value: log.issueFound, wide: true, block: true },
        { label: 'Missing / wrong details', value: log.missingWrongDetails, wide: true, block: true },
        { label: 'Action taken', value: log.actionTaken, wide: true, block: true },
        { label: 'Reason for action (why I did it)', value: log.reasonForAction, wide: true, block: true },
      ],
    },
    {
      title: 'Follow-up & Approval',
      fields: [
        { label: 'Foreman informed?', value: log.foremanInformed },
        { label: 'Follow-up needed?', value: log.followUpNeeded },
        { label: 'Follow-up date', value: followUpDate },
        { label: 'Supervisor informed / Approved by', value: log.supervisorInformed },
        { label: 'Remarks', value: log.remarks, wide: true, block: true },
      ],
    },
  ];

  return (
    <>
      <div id={`log-${log.id}`} className="sheet-wrap w-full scroll-mt-24">
        {/* Actions Toolbar */}
        <div className="no-print flex flex-wrap items-center justify-between gap-2 mb-2 bg-white px-2 py-1.5 rounded-xl border border-brand-100">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono font-semibold text-slate-800">
              Connection #{log.logNo}
            </span>
            <span className={`text-slate-300 ${compact ? "hidden" : ""}`}>/</span>
            <span className={`text-slate-600 truncate max-w-xs ${compact ? "hidden" : ""}`}>
              {instituteName || 'Connection Sheet'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {onEdit && (
              <button
                onClick={() => onEdit(log)}
                title="Edit"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[13px] text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className={compact ? "sr-only" : undefined}>Edit</span>
              </button>
            )}

            {onDuplicate && (
              <button
                onClick={() => onDuplicate(log)}
                title="Duplicate"
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[13px] text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className={compact ? "sr-only" : undefined}>Duplicate</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              title="Print"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[13px] text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className={compact ? "sr-only" : undefined}>Print</span>
            </button>

            <button
              onClick={() => exportSingleLogExcel(log)}
              title="Export to Excel"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[13px] text-slate-700 border border-slate-200 hover:bg-slate-50 rounded transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span className={compact ? "sr-only" : undefined}>Excel</span>
            </button>

            <button
              onClick={() => exportSingleLogPdf(log, nameLang)}
              className="inline-flex items-center gap-1 px-3 py-1 text-[13px] font-medium text-white bg-brand-800 hover:bg-brand-900 rounded transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>

            {(log.upacFormName || log.upacFormData) && (
              <button
                type="button"
                onClick={() => downloadUpacForm(log)}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-[13px] font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded transition-colors shadow-xs"
                title={`Download stored UPAC form: ${log.upacFormName || 'UPAC Form'}`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>UPAC Form</span>
              </button>
            )}

            {onDelete && (
              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[13px] text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded transition-colors"
                title="Delete this connection"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className={compact ? "sr-only" : undefined}>Delete</span>
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="ml-1 inline-flex items-center gap-1 px-3 py-1 text-[13px] font-semibold text-slate-700 bg-white border border-slate-200 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            )}
          </div>
        </div>

        {/* The log sheet: wide, sections side by side, so it fits on one screen */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:border-slate-400 print:rounded-none">
          {/* Header band: one slim row */}
          <div className="bg-linear-to-br from-brand-800 to-brand-600 text-white px-4 sm:px-5 py-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 print:bg-none print:bg-brand-800">
            <div className="min-w-0">
              <p className={`${compact ? "hidden" : ""} text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-100/90`}>
                Connection Request &middot; New User ID &amp; Forms
              </p>
              <h2 className="text-xl sm:text-2xl font-bold leading-snug break-words">
                {instituteName || 'Untitled connection'}
              </h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="text-sm text-brand-100/90 hidden md:inline">
                {[upazila, log.unionName].filter(Boolean).join(' · ') || 'Location not set'}
              </span>
              <span className="font-mono text-base font-semibold bg-white/15 rounded-lg px-2.5 py-0.5">
                Connection No. {log.logNo}
              </span>
              {log.status && (
                <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ring-1 ${statusTone(log.status)}`}>
                  {log.status}
                </span>
              )}
            </div>
          </div>

          {/* Sections flow into 1, 2 or 3 balanced columns depending on the width */}
          <div className={`p-2.5 ${columnsClass} gap-2.5 print:columns-2`}>
            {sections.map((section) => (
              <section key={section.title} className="break-inside-avoid mb-2.5 last:mb-0 rounded-xl border border-slate-200 overflow-hidden bg-white">
                <h3 className={`flex items-center gap-2 px-3 ${compact ? 'py-0.5' : 'py-1'} text-[13px] font-bold uppercase tracking-wider text-brand-800 bg-brand-50/70 border-b border-slate-200`}>
                  <span className="w-1 h-3 rounded-full bg-brand-600" />
                  {section.title}
                </h3>
                <dl className="divide-y divide-slate-100">
                  {section.fields.map((f) => {
                    // Long text fields stack under their label only when they actually have text;
                    // empty ones collapse to a single compact row.
                    const stacked = !!f.block && !!f.value;
                    return (
                    <div
                      key={f.label}
                      className={`px-3 ${compact ? 'py-[3px]' : 'py-1'} min-w-0 ${stacked ? '' : 'flex items-baseline gap-3'}`}
                    >
                      <dt className={`text-[14px] leading-snug text-slate-500 ${stacked ? '' : `${compact ? 'w-[42%]' : 'w-[38%]'} shrink-0`}`}>{f.label}</dt>
                      <dd
                        className={`text-[15.5px] break-words min-w-0 ${stacked ? 'mt-0.5 whitespace-pre-wrap leading-snug' : 'flex-1'} ${f.mono ? 'font-mono' : ''} ${f.strong ? 'font-semibold text-slate-900' : 'text-slate-800'}`}
                      >
                        {f.value ? (
                          <span className="inline-flex items-center gap-1.5 max-w-full">
                            <span className="break-words">{f.value}</span>
                            {f.copy && (
                              <button
                                type="button"
                                onClick={handleCopyMac}
                                className="no-print text-slate-400 hover:text-slate-700 p-0.5"
                                title="Copy MAC"
                              >
                                {copiedMac ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            {f.link && (
                              <a
                                href={f.link}
                                target="_blank"
                                rel="noreferrer"
                                className="no-print inline-flex items-center gap-1 text-xs font-sans font-medium text-brand-700 hover:text-brand-900"
                                title="Open in Google Maps"
                              >
                                <MapPin className="w-3 h-3" />
                                Map
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </dd>
                    </div>
                    );
                  })}
                </dl>
              </section>
            ))}
          </div>
        </div>

        {/* Who created / last changed this log (not printed) */}
        <div className="no-print mt-1.5 text-[13px] text-slate-500 px-1">
          <p>
            Created by <span className="font-medium text-slate-700">{log.createdBy || 'unknown'}</span>
            {log.createdAt && <> on {formatStamp(log.createdAt)}</>}
            {log.updatedBy && log.history && log.history.some((h) => h.action === 'edited') && (
              <>
                {' '}
                &middot; Last edited by <span className="font-medium text-slate-700">{log.updatedBy}</span>
                {' '}on {formatStamp(log.updatedAt)}
              </>
            )}
          </p>

          {log.history && log.history.length > 0 && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-brand-700 hover:text-brand-800 select-none">
                History ({log.history.length})
              </summary>
              <ul className="mt-2 space-y-2 bg-white border border-slate-200 rounded-lg p-3">
                {[...log.history].reverse().map((h, i) => (
                  <li key={i} className="text-[11px]">
                    <p className="text-slate-700">
                      <span className="font-semibold">{h.by}</span> {h.action}{' '}
                      <span className="text-slate-400">{formatStamp(h.at)}</span>
                    </p>
                    {h.changes && h.changes.length > 0 && (
                      <ul className="mt-1 ml-3 space-y-0.5 text-slate-500">
                        {h.changes.map((c, j) => (
                          <li key={j} className="break-words">
                            <span className="text-slate-700">{c.field}:</span>{' '}
                            <span className="line-through">{c.from || 'empty'}</span> →{' '}
                            <span className="text-slate-800">{c.to || 'empty'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title="Delete Connection?"
        message={`Delete Connection #${log.logNo}? It moves to the admin bin. Only the admin can restore it or remove it for good.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setIsDeleteConfirmOpen(false);
          if (onDelete) onDelete(log.id);
        }}
        onCancel={() => setIsDeleteConfirmOpen(false)}
      />
    </>
  );
};
