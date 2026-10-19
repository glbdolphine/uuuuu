import React, { useState, useRef } from 'react';
import { LogEntry, Foreman } from '../types';
import { analyzeCsvForImport, CsvImportAnalysis, cleanCategoryLabel } from '../utils/csvImporter';
import { ScrollLock } from './ScrollLock';
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertTriangle,
  Info,
  Loader2,
  Filter,
  Check,
  ChevronRight,
  Database,
  Building2,
  MapPin,
  Phone,
  Layers,
} from 'lucide-react';

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingLogs: LogEntry[];
  foremen: Foreman[];
  nextLogNo: number;
  onImportBatch: (entries: LogEntry[]) => Promise<void>;
  needsApproval?: boolean;
}

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  existingLogs,
  foremen,
  nextLogNo,
  onImportBatch,
  needsApproval = false,
}) => {
  const [tab, setTab] = useState<'upload' | 'paste'>('upload');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<CsvImportAnalysis | null>(null);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'ready' | 'skipped'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setErrorMsg('');
    setSuccessCount(null);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content);
      try {
        const result = analyzeCsvForImport(content, existingLogs, foremen, nextLogNo);
        setAnalysis(result);
      } catch (err: any) {
        setErrorMsg(err?.message || 'Failed to parse CSV file');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read file');
      setIsProcessing(false);
    };
    reader.readAsText(file);
  };

  const handleParsePastedText = () => {
    if (!csvText.trim()) {
      setErrorMsg('Please paste CSV text first');
      return;
    }
    setErrorMsg('');
    setSuccessCount(null);
    setIsProcessing(true);
    try {
      const result = analyzeCsvForImport(csvText, existingLogs, foremen, nextLogNo);
      setAnalysis(result);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse CSV content');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!analysis || analysis.readyToImport.length === 0) return;
    setIsSaving(true);
    setErrorMsg('');
    try {
      await onImportBatch(analysis.readyToImport);
      setSuccessCount(analysis.readyToImport.length);
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to import batch to database');
    } finally {
      setIsSaving(false);
    }
  };

  const resetState = () => {
    setAnalysis(null);
    setCsvText('');
    setFileName('');
    setErrorMsg('');
    setSuccessCount(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Filter preview entries
  const displayedEntries = analysis
    ? analysis.readyToImport.filter((item) => {
        if (categoryFilter !== 'all' && cleanCategoryLabel(item.category) !== categoryFilter) {
          return false;
        }
        if (searchFilter) {
          const q = searchFilter.toLowerCase();
          return (
            item.nmsId.toLowerCase().includes(q) ||
            item.customerName.toLowerCase().includes(q) ||
            item.foremanName.toLowerCase().includes(q) ||
            (item.upazila || '').toLowerCase().includes(q)
          );
        }
        return true;
      })
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <ScrollLock />
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Bulk Import Connections from CSV</h3>
              <p className="text-xs text-slate-500">
                Automatic foreman & upazila matching · Skips existing NMS IDs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successCount !== null ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Check className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-slate-800">{needsApproval ? 'Sent for admin approval' : 'Import Completed Successfully!'}</h4>
              <p className="text-sm text-slate-600">
                {needsApproval ? (
                  <><strong className="text-emerald-700">{successCount}</strong> connections are waiting for an admin to approve them. Nothing is added until then.</>
                ) : (
                  <>Added <strong className="text-emerald-700">{successCount}</strong> new connections to the database.</>
                )}
              </p>
              <p className="text-xs text-slate-400">Closing window...</p>
            </div>
          ) : !analysis ? (
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-medium w-fit">
                <button
                  type="button"
                  onClick={() => setTab('upload')}
                  className={`px-4 py-1.5 rounded-lg transition-colors ${
                    tab === 'upload' ? 'bg-white text-brand-900 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Upload CSV File
                </button>
                <button
                  type="button"
                  onClick={() => setTab('paste')}
                  className={`px-4 py-1.5 rounded-lg transition-colors ${
                    tab === 'paste' ? 'bg-white text-brand-900 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Paste CSV Text
                </button>
              </div>

              {tab === 'upload' ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-brand-200 hover:border-brand-500 bg-brand-50/40 hover:bg-brand-50/70 transition-all rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="w-12 h-12 rounded-2xl bg-white text-brand-700 shadow-sm flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    {isProcessing ? <Loader2 className="w-6 h-6 animate-spin text-brand-600" /> : <Upload className="w-6 h-6" />}
                  </div>
                  <h4 className="font-semibold text-slate-800 text-sm mb-1">
                    {fileName ? fileName : 'Click to select or drop your CSV file here'}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-md">
                    Accepts the connection records CSV with Cust ID, Name, Area, Thana, POP, Mobile, and Created date.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Paste raw CSV rows (including the header row):</span>
                    {csvText && (
                      <button
                        type="button"
                        onClick={() => setCsvText('')}
                        className="text-slate-400 hover:text-slate-700 underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={8}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder={'"SN","Cust ID","Username","Name","Package","Balance","Exp Date","Last Logout","Mobile","Created","Status","Flat/Level","House","Road","Area","IP","POP","Group","Net Bill","VLAN/Box","NID","Email","Discount","Bill Cycle","Remarks","DoB","Used Months","District","Thana"\n"1","55001","55001@paceit","Kollogram Gov. Primary School",...'}
                    className="w-full font-mono text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all placeholder:text-slate-400"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleParsePastedText}
                      disabled={isProcessing || !csvText.trim()}
                      className="px-4 py-2 bg-brand-800 hover:bg-brand-900 text-white font-medium text-xs rounded-xl shadow-xs disabled:opacity-50 flex items-center gap-2"
                    >
                      {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Parse & Analyze Content
                    </button>
                  </div>
                </div>
              )}

              {/* Informational Guidance */}
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs text-slate-600 space-y-1.5">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-brand-700" />
                  Import Behavior & Automatic Matching
                </div>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500">
                  <li>
                    <strong>Duplicate Skipping:</strong> Entries with an NMS ID (Cust ID) already present in the database will be <em>skipped</em> automatically without modifying existing records.
                  </li>
                  <li>
                    <strong>Automatic Foreman & Upazila:</strong> Matches the Area (e.g. <code>36.EDC-Sylhet-Sadar-Liton</code>) and Thana against the 45 database foremen (e.g. Foreman: <em>Liton</em>, Upazila: <em>Sylhet Sadar</em>).
                  </li>
                  <li>
                    <strong>MAC Address:</strong> Left blank for quick manual entry after import.
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            /* Analysis & Pre-Import Review */
            <div className="space-y-4">
              {/* Summary Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total Rows in CSV</div>
                  <div className="text-xl font-bold text-slate-900">{analysis.totalRows}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Ready to Add</div>
                  <div className="text-xl font-bold text-emerald-800">{analysis.readyToImport.length}</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Existing Skipped</div>
                  <div className="text-xl font-bold text-amber-800">{analysis.skippedDuplicates.length}</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-700">Categories</div>
                  <div className="text-xl font-bold text-purple-800">{Object.keys(analysis.categoryCounts).length}</div>
                </div>
              </div>

              {/* Category Breakdown Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Categories:</span>
                <button
                  type="button"
                  onClick={() => setCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    categoryFilter === 'all'
                      ? 'bg-brand-800 text-white border-brand-800'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All ({analysis.readyToImport.length})
                </button>
                {Object.entries(analysis.categoryCounts).map(([cat, count]) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      categoryFilter === cat
                        ? 'bg-brand-800 text-white border-brand-800'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                ))}
              </div>

              {/* View Switcher: Ready vs Skipped */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('ready')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg ${
                      previewFilter === 'ready' || previewFilter === 'all'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    New Entries ({analysis.readyToImport.length})
                  </button>
                  {analysis.skippedDuplicates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('skipped')}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg ${
                        previewFilter === 'skipped'
                          ? 'bg-amber-100 text-amber-800'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Skipped Duplicates ({analysis.skippedDuplicates.length})
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Filter preview..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 w-44 focus:outline-none focus:border-brand-500"
                />
              </div>

              {/* Data Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto text-xs">
                {previewFilter === 'skipped' ? (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 sticky top-0 text-[11px] font-bold text-slate-700">
                      <tr>
                        <th className="py-2 px-3">NMS ID</th>
                        <th className="py-2 px-3">Institute Name</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {analysis.skippedDuplicates.map((item, idx) => (
                        <tr key={idx} className="hover:bg-amber-50/50">
                          <td className="py-2 px-3 font-semibold text-amber-800">{item.nmsId}</td>
                          <td className="py-2 px-3 font-sans text-slate-800">{item.customerName}</td>
                          <td className="py-2 px-3 font-sans text-slate-500">{cleanCategoryLabel(item.category)}</td>
                          <td className="py-2 px-3 font-sans text-amber-700">{item.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-100 sticky top-0 text-[11px] font-bold text-slate-700">
                      <tr>
                        <th className="py-2 px-2.5">Connection #</th>
                        <th className="py-2 px-2.5">NMS ID</th>
                        <th className="py-2 px-2.5">Institute Name</th>
                        <th className="py-2 px-2.5">Category</th>
                        <th className="py-2 px-2.5">Foreman (Matched)</th>
                        <th className="py-2 px-2.5">Upazila</th>
                        <th className="py-2 px-2.5">Date</th>
                        <th className="py-2 px-2.5">Contact</th>
                        <th className="py-2 px-2.5 text-center">MAC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans text-[11px]">
                      {displayedEntries.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-6 text-center text-slate-400">
                            No records matching current filters
                          </td>
                        </tr>
                      ) : (
                        displayedEntries.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2.5 font-mono text-slate-500 font-semibold">#{log.logNo}</td>
                            <td className="py-2 px-2.5 font-mono font-bold text-brand-800">{log.nmsId}</td>
                            <td className="py-2 px-2.5 font-medium text-slate-900 max-w-[180px] truncate" title={log.customerName}>
                              {log.customerName}
                            </td>
                            <td className="py-2 px-2.5">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                                {cleanCategoryLabel(log.category)}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 font-medium text-slate-800">
                              <span className="text-emerald-700 font-semibold">{log.foremanName}</span>
                            </td>
                            <td className="py-2 px-2.5 text-slate-600">{log.upazila || '—'}</td>
                            <td className="py-2 px-2.5 text-slate-500 whitespace-nowrap">{log.date}</td>
                            <td className="py-2 px-2.5 font-mono text-slate-600">{log.headTeacherPhone || '—'}</td>
                            <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-[10px]">
                              <em>Manual</em>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div>
            {analysis && successCount === null && (
              <button
                type="button"
                onClick={resetState}
                className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
              >
                Upload another file
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            {analysis && successCount === null && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isSaving || analysis.readyToImport.length === 0}
                className="px-5 py-2 bg-brand-800 hover:bg-brand-900 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs flex items-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving {analysis.readyToImport.length} Records...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {needsApproval ? 'Send' : 'Confirm & Import'} {analysis.readyToImport.length} Entries{needsApproval ? ' for Approval' : ''}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
