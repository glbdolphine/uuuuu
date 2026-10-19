import React, { useState, useEffect, useMemo, useRef } from 'react';
import { resolveCategory, detectCategoryFromName, CATEGORY_LABELS } from '../utils/category';
import { LogEntry, FieldSuggestionsMap, Foreman } from '../types';
import { SuggestionInput } from './SuggestionInput';
import { ConfirmDialog } from './ConfirmDialog';
import { findDuplicates, describeLog } from '../utils/duplicates';
import { matchForeman } from '../utils/foremen';
import { addDaysIso } from '../utils/followUps';
import { UPAZILAS, upazilaKey, foremanLogName, foremanServes } from '../utils/upazilas';
import { scanPdfForms, saveBatchLogs, ScannedForm, downloadUpacForm } from '../utils/cloud';
import { splitName, primaryName } from '../utils/names';
import { parseEntryDate, toInputDate, fromInputDate } from '../utils/dates';

import {
  ArrowLeft,
  AlertTriangle,
  MapPin,
  ExternalLink,
  FileText,
  Upload,
  CheckCircle2,
  Loader2,
  Layers,
  Trash2,
  Edit2,
  Check,
  Paperclip,
  Download,
  Eye,
  FileCheck,
} from 'lucide-react';

function formatEntryDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface LogFormProps {
  initialData?: LogEntry | null;
  nextLogNo: number;
  suggestions: FieldSuggestionsMap;
  logs: LogEntry[];
  foremen: Foreman[];
  onSave: (entry: LogEntry, andCreateAnother?: boolean) => void;
  onCancel: () => void;
}

interface ScannedQueueItem extends ScannedForm {
  id: string;
  foremanName: string;
  foremanPhone: string;
}

// Edit-form look: big, readable type (16px inputs, 14px labels) and roomy spacing.
const INPUT =
  'w-full h-12 px-3.5 text-base text-slate-900 bg-white border border-slate-300 rounded-xl transition-colors hover:border-slate-400 focus:outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10 placeholder:text-slate-400';
const LABEL = 'block text-sm font-semibold text-slate-700 mb-1.5';
const CARD = 'bg-white p-5 sm:p-7 rounded-3xl border border-slate-200 shadow-[0_10px_30px_-18px_rgba(30,50,110,0.25)]';
const HEAD = 'flex flex-wrap items-center justify-between gap-2 mb-6 pb-4 border-b border-slate-100';
const GRID3 = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-5';

const SectionTitle: React.FC<{ n: number | string; children: React.ReactNode }> = ({ n, children }) => (
  <h3 className="flex items-center gap-3 text-lg font-bold tracking-tight text-[#1b2a4e]">
    <span className="grid place-items-center w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white text-sm font-bold shadow-sm shadow-brand-600/30">{n}</span>
    {children}
  </h3>
);

export const LogForm: React.FC<LogFormProps> = ({
  initialData,
  nextLogNo,
  suggestions,
  logs,
  foremen,
  onSave,
  onCancel,
}) => {
  const isEditing = Boolean(initialData?.id);

  const [formData, setFormData] = useState<Partial<LogEntry>>({
    logNo: initialData ? initialData.logNo : nextLogNo,
    date: initialData ? initialData.date : formatEntryDate(new Date()),
    foremanName: initialData?.foremanName || '',
    foremanId: initialData?.foremanId || '',
    foremanPhone: initialData?.foremanPhone || '',
    requestType: initialData?.requestType || 'New User ID',
    customerName: initialData?.customerName || '',
    nameBn: initialData?.nameBn || (initialData && !initialData.nameEn ? splitName(initialData.customerName).nameBn : ''),
    nameEn: initialData?.nameEn || (initialData && !initialData.nameBn ? splitName(initialData.customerName).nameEn : ''),
    headTeacherName: initialData?.headTeacherName || '',
    headTeacherPhone: initialData?.headTeacherPhone || '',
    nmsId: initialData?.nmsId || '',
    edcNo: initialData?.edcNo || '',
    emisEiinDghs: initialData?.emisEiinDghs || '',
    routerSerial: initialData?.routerSerial || '',
    mac: initialData?.mac || '',
    lat: initialData?.lat || '',
    long: initialData?.long || '',
    unionName: initialData?.unionName || '',
    upazila: initialData?.upazila || '',
    fiberLength: initialData?.fiberLength || '',
    category: initialData?.category || '',
    issueFound: initialData?.issueFound || '',
    missingWrongDetails: initialData?.missingWrongDetails || '',
    actionTaken: initialData?.actionTaken || '',
    reasonForAction: initialData?.reasonForAction || '',
    foremanInformed: initialData?.foremanInformed || 'Yes - phone',
    followUpNeeded: initialData?.followUpNeeded || 'Yes',
    followUpDate: initialData?.followUpDate || '',
    status: initialData?.status || 'Pending - waiting for foreman',
    supervisorInformed: initialData?.supervisorInformed || 'I informed my superiors',
    remarks: initialData?.remarks || '',
    upacFormName: initialData?.upacFormName || '',
    upacFormData: initialData?.upacFormData || '',
    upacFormType: initialData?.upacFormType || '',
    upacFormSize: initialData?.upacFormSize,
    upacFormUploadedAt: initialData?.upacFormUploadedAt || '',
  });

  // PDF scanner state
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [lastScan, setLastScan] = useState<ScannedForm | null>(null);
  const [showBatchQueue, setShowBatchQueue] = useState(false);
  const [batchQueue, setBatchQueue] = useState<ScannedQueueItem[]>([]);
  const [batchForeman, setBatchForeman] = useState('');
  const [batchForemanPhone, setBatchForemanPhone] = useState('');
  const [isBatchSaving, setIsBatchSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upacFileInputRef = useRef<HTMLInputElement>(null);

  const handleUpacFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setFormData((prev) => ({
        ...prev,
        upacFormName: file.name,
        upacFormData: dataUrl,
        upacFormType: file.type || 'application/pdf',
        upacFormSize: file.size,
        upacFormUploadedAt: new Date().toISOString(),
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemoveUpacForm = () => {
    setFormData((prev) => ({
      ...prev,
      upacFormName: '',
      upacFormData: '',
      upacFormType: '',
      upacFormSize: undefined,
      upacFormUploadedAt: '',
    }));
  };

  // Load the log being edited. (Edits stay local until Save is clicked.)
  useEffect(() => {
    if (initialData) setFormData(initialData);
  }, [initialData]);
  // New log: keep the suggested number current without touching anything typed.
  useEffect(() => {
    if (!initialData) {
      setFormData((prev) => ({ ...prev, logNo: nextLogNo, date: prev.date || formatEntryDate(new Date()) }));
    }
  }, [initialData, nextLogNo]);

  const categoryManual = useRef(false);

  const updateField = (field: keyof LogEntry, value: string | number) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // The name shown in the logs is the Bangla name (falls back to English if there is none).
      if (field === 'nameBn' || field === 'nameEn') {
        next.customerName = primaryName(next.nameBn, next.nameEn);
        // Auto-pick the category from the name, unless it was changed by hand.
        if (!categoryManual.current) {
          const detected = detectCategoryFromName(next.nameBn, next.nameEn);
          if (detected) next.category = detected;
        }
      }
      if (field === 'category') categoryManual.current = true;
      return next;
    });
  };

  const [pendingSave, setPendingSave] = useState<{ entry: LogEntry; another: boolean } | null>(null);

  // Other logs that already use this MAC / router serial / NMS ID
  const dups = useMemo(
    () =>
      findDuplicates(
        {
          id: initialData?.id,
          mac: formData.mac,
          routerSerial: formData.routerSerial,
          nmsId: formData.nmsId,
        },
        logs
      ),
    [initialData?.id, formData.mac, formData.routerSerial, formData.nmsId, logs]
  );

  const activeForemen = useMemo(() => foremen.filter((r) => r.active), [foremen]);
  const currentForeman = useMemo(
    () =>
      matchForeman(
        { foremanId: formData.foremanId, foremanName: formData.foremanName || '' },
        foremen
      ),
    [formData.foremanId, formData.foremanName, foremen]
  );

  // Upazila chosen first; it narrows the foreman list.
  // One Upazila for the whole log: the foreman's upazila (also the customer's). Choosing a foreman
  // sets it; choosing an upazila first narrows the foreman list.
  const upazilaPick = upazilaKey(formData.upazila) || upazilaKey(currentForeman?.area);

  const foremanPool = useMemo(
    () => (upazilaPick ? activeForemen.filter((r) => foremanServes(r, upazilaPick)) : activeForemen),
    [activeForemen, upazilaPick]
  );

  const pickUpazila = (key: string) => {
    // clear the foreman if it belongs to a different upazila
    const clear = key && currentForeman && !foremanServes(currentForeman, key);
    setFormData((p) => ({ ...p, upazila: key, ...(clear ? { foremanId: '', foremanName: '' } : {}) }));
  };

  const pickForeman = (id: string) => {
    if (id === '__keep__') return;
    const r = foremen.find((x) => x.id === id);
    if (!r) {
      setFormData((p) => ({ ...p, foremanId: '', foremanName: '' }));
      return;
    }
    setFormData((p) => ({
      ...p,
      foremanId: r.id,
      foremanName: foremanLogName(r, foremen),
      // the foreman's upazila is the log's upazila, except an "own broadband" foreman keeps the
      // upazila already chosen (the customer's) when he is allowed to supply it
      upazila: r.roam && upazilaKey(p.upazila) && foremanServes(r, p.upazila || '') ? upazilaKey(p.upazila) : upazilaKey(r.area) || p.upazila || '',
      foremanPhone:
        p.foremanPhone?.trim() && p.foremanPhone !== currentForeman?.phone ? p.foremanPhone : r.phone || '',
    }));
  };

  // PDF scanner: sends the PDFs to /api/pdf/scan (rule-based text extraction)
  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const applyScanToForm = (r: ScannedForm) => {
    setFormData((prev) => ({
      ...prev,
      ...(r.customerName
        ? (() => {
            const n = splitName(r.customerName);
            const nameBn = n.nameBn || prev.nameBn || '';
            const nameEn = n.nameEn || prev.nameEn || '';
            return { nameBn, nameEn, customerName: primaryName(nameBn, nameEn, prev.customerName) };
          })()
        : {}),
      edcNo: r.edcNo || prev.edcNo,
      nmsId: r.nmsId || prev.nmsId,
      upazila: prev.upazila?.trim() ? prev.upazila : upazilaKey(r.upazila) || r.upazila || '',
      unionName: r.unionName || prev.unionName,
      lat: r.lat || prev.lat,
      long: r.long || prev.long,
      routerSerial: r.routerSerial || prev.routerSerial,
      mac: r.mac || prev.mac,
      fiberLength: r.fiberLength || prev.fiberLength,
      headTeacherPhone: r.headTeacherPhone || prev.headTeacherPhone,
      date: r.date || prev.date,
    }));
    setLastScan(r);
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsScanning(true);
    setScanError('');
    setLastScan(null);

    try {
      const payloads: { name: string; data: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        payloads.push({ name: files[i].name, data: await readFileAsBase64(files[i]) });
      }

      const response = await scanPdfForms(payloads);
      const results = response.results || [];
      const failed = response.errors || [];

      if (results.length === 0) {
        throw new Error(failed.map((e) => `${e.fileName}: ${e.error}`).join(' | ') || 'Nothing could be read from the PDF.');
      }
      if (failed.length > 0) {
        setScanError(failed.map((e) => `${e.fileName}: ${e.error}`).join(' | '));
      }

      if (results.length === 1 && batchQueue.length === 0) {
        applyScanToForm(results[0]);
        setFormData((prev) => ({
          ...prev,
          upacFormName: payloads[0].name,
          upacFormData: payloads[0].data,
          upacFormType: 'application/pdf',
          upacFormUploadedAt: new Date().toISOString(),
        }));
      } else {
        const items: ScannedQueueItem[] = results.map((r, index) => ({
          ...r,
          id: `${Date.now()}-${index}`,
          foremanName: formData.foremanName || '',
          foremanPhone: formData.foremanPhone || '',
        }));
        setBatchQueue((prev) => [...prev, ...items]);
        setShowBatchQueue(true);
      }
    } catch (err: any) {
      setScanError(err?.message || 'Failed to read the PDF.');
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBatchForemanApply = () => {
    if (!batchForeman) return;
    setBatchQueue((prev) =>
      prev.map((item) => ({
        ...item,
        foremanName: batchForeman,
        foremanPhone: batchForemanPhone || item.foremanPhone,
      }))
    );
  };

  const handleBatchSaveAll = async () => {
    if (batchQueue.length === 0) return;
    setIsBatchSaving(true);
    try {
      let currentNo = nextLogNo;
      const now = new Date().toISOString();
      const entriesToSave: LogEntry[] = batchQueue.map((item) => ({
        id: crypto.randomUUID(),
        logNo: currentNo++,
        date: item.date || formatEntryDate(new Date()),
        foremanName: item.foremanName?.trim() || '',
        foremanPhone: item.foremanPhone?.trim() || '',
        requestType: 'New User ID',
        customerName: item.customerName?.trim() || '',
        ...splitName(item.customerName),
        headTeacherPhone: item.headTeacherPhone?.trim() || '',
        nmsId: item.nmsId?.trim() || '',
        edcNo: item.edcNo?.trim() || '',
        emisEiinDghs: item.emisEiinDghs?.trim() || '',
        routerSerial: item.routerSerial?.trim() || '',
        mac: item.mac?.trim() || '',
        lat: item.lat?.trim() || '',
        long: item.long?.trim() || '',
        unionName: item.unionName?.trim() || '',
        upazila: item.upazila?.trim() || '',
        fiberLength: item.fiberLength?.trim() || '',
        issueFound: '',
        missingWrongDetails: '',
        actionTaken: 'Generated from UPAC PDF',
        reasonForAction: 'Scanned EDC acceptance certificate',
        foremanInformed: 'Yes - phone',
        followUpNeeded: 'No',
        status: 'Resolved',
        supervisorInformed: 'I informed my superiors',
        remarks: `Scanned from UPAC PDF: ${item.fileName}`,
        createdAt: now,
        updatedAt: now,
      }));

      await saveBatchLogs(entriesToSave);
      setBatchQueue([]);
      setShowBatchQueue(false);
      onCancel(); // back to the list with the new logs
    } catch (err: any) {
      alert(`Failed to save batch connections: ${err?.message || err}`);
    } finally {
      setIsBatchSaving(false);
    }
  };

  const handleLoadQueueItemIntoForm = (item: ScannedQueueItem) => {
    applyScanToForm(item);
    setFormData((prev) => ({
      ...prev,
      foremanName: item.foremanName || prev.foremanName,
      foremanPhone: item.foremanPhone || prev.foremanPhone,
    }));
    setShowBatchQueue(false);
  };

  const commit = (entry: LogEntry, andCreateAnother: boolean) => {
    onSave(entry, andCreateAnother);
    if (andCreateAnother) {
      setLastScan(null);
      setFormData((prev) => ({
        logNo: Number(prev.logNo || nextLogNo) + 1,
        date: formatEntryDate(new Date()),
        foremanName: prev.foremanName || '',
        foremanId: prev.foremanId || '',
        foremanPhone: prev.foremanPhone || '',
        requestType: prev.requestType || 'New User ID',
        customerName: '',
        nameBn: '',
        nameEn: '',
        headTeacherName: '',
        headTeacherPhone: '',
        nmsId: '',
        edcNo: '',
        emisEiinDghs: '',
        routerSerial: '',
        mac: '',
        lat: '',
        long: '',
        unionName: '',
        upazila: '',
        fiberLength: '',
        issueFound: '',
        missingWrongDetails: '',
        actionTaken: '',
        reasonForAction: '',
        foremanInformed: prev.foremanInformed || 'Yes - phone',
        followUpNeeded: 'Yes',
        followUpDate: '',
        status: 'Pending - waiting for foreman',
        supervisorInformed: prev.supervisorInformed || 'I informed my superiors',
        remarks: '',
        upacFormName: '',
        upacFormData: '',
        upacFormType: '',
        upacFormSize: undefined,
        upacFormUploadedAt: '',
      }));
    }
  };

  const handleSubmit = (e: React.FormEvent, andCreateAnother = false) => {
    e.preventDefault();

    const finalizedEntry: LogEntry = {
      id: initialData?.id || crypto.randomUUID(),
      logNo: formData.logNo || nextLogNo,
      date: formData.date?.trim() || formatEntryDate(new Date()),
      foremanName: formData.foremanName?.trim() || '',
      foremanId: currentForeman?.id || '',
      foremanPhone: formData.foremanPhone?.trim() || '',
      requestType: formData.requestType?.trim() || 'New User ID',
      customerName: primaryName(formData.nameBn, formData.nameEn, formData.customerName),
      nameBn: formData.nameBn?.trim() || '',
      nameEn: formData.nameEn?.trim() || '',
      headTeacherName: formData.headTeacherName?.trim() || '',
      headTeacherPhone: formData.headTeacherPhone?.trim() || '',
      nmsId: formData.nmsId?.trim() || '',
      edcNo: formData.edcNo?.trim() || '',
      emisEiinDghs: formData.emisEiinDghs?.trim() || '',
      routerSerial: formData.routerSerial?.trim() || '',
      mac: formData.mac?.trim() || '',
      lat: formData.lat?.trim() || '',
      long: formData.long?.trim() || '',
      unionName: formData.unionName?.trim() || '',
      upazila: upazilaPick || formData.upazila?.trim() || '',
      fiberLength: formData.fiberLength?.trim() || '',
      category: formData.category?.trim() || resolveCategory(formData),
      issueFound: formData.issueFound?.trim() || '',
      missingWrongDetails: formData.missingWrongDetails?.trim() || '',
      actionTaken: formData.actionTaken?.trim() || '',
      reasonForAction: formData.reasonForAction?.trim() || '',
      foremanInformed: formData.foremanInformed?.trim() || '',
      followUpNeeded: formData.followUpNeeded?.trim() || '',
      followUpDate: formData.followUpDate || '',
      status: formData.status?.trim() || 'Pending - waiting for foreman',
      supervisorInformed: formData.supervisorInformed?.trim() || '',
      remarks: formData.remarks?.trim() || '',
      upacFormName: formData.upacFormName?.trim() || '',
      upacFormData: formData.upacFormData || '',
      upacFormType: formData.upacFormType || '',
      upacFormSize: formData.upacFormSize,
      upacFormUploadedAt: formData.upacFormUploadedAt || '',
      formReceivedAt: initialData?.formReceivedAt || '',
      createdAt: initialData?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: initialData?.createdBy,
      updatedBy: initialData?.updatedBy,
      history: initialData?.history,
    };

    if (dups.length > 0) {
      setPendingSave({ entry: finalizedEntry, another: andCreateAnother });
      return;
    }
    commit(finalizedEntry, andCreateAnother);
  };

  return (
    <form onSubmit={(e) => handleSubmit(e, false)} className="w-full max-w-[1100px] mx-auto space-y-5">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        onChange={(e) => handleFileUpload(e.target.files)}
        className="hidden"
      />

      {/* Header bar */}
      <div className="sticky top-0 z-30 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-[#eef8f1]/95 backdrop-blur border-b border-brand-100">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-2.5 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-white transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#1b2a4e]">
              {isEditing ? `Edit Connection #${formData.logNo}` : 'New Connection Request'}
            </h1>
            <p className="text-sm text-slate-500">
              {isEditing
                ? 'Update the details for this connection.'
                : 'Fill the record manually or scan UPAC / EDC PDF certificates.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing && batchQueue.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBatchQueue(!showBatchQueue)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-brand-900 bg-brand-100 hover:bg-brand-200 rounded-lg transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Queue ({batchQueue.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="px-5 h-11 text-sm font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>

          {!isEditing && (
            <button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              className="px-5 h-11 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors"
            >
              Save & Next
            </button>
          )}

          <button
            type="submit"
            className="px-6 h-11 text-sm font-bold text-white bg-brand-700 hover:bg-brand-800 rounded-xl shadow-md shadow-brand-600/25 transition-colors"
          >
            {isEditing ? 'Save Changes' : 'Save Connection'}
          </button>
        </div>
      </div>

      {/* UPAC PDF scanner (only for new log entries, not when editing) */}
      {!isEditing && (
        <>
          <div className="bg-gradient-to-br from-brand-900 via-brand-800 to-emerald-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  <FileText className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight">UPAC PDF Scanner</h2>
                  <p className="text-sm text-brand-100/80">
                    Upload one or many UPAC / EDC certificate PDFs. Fills institute name, EDC, NMS ID, coordinates, MAC, serial and fiber length.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isScanning}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold bg-white text-brand-900 hover:bg-brand-50 rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-800" />
                    <span>Reading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Scan PDF Forms (Single / Batch)</span>
                  </>
                )}
              </button>
            </div>

            {lastScan && !isScanning && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-400/40 rounded-xl text-sm space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                    <div className="truncate">
                      Filled from <span className="font-semibold text-white">{lastScan.fileName}</span>
                      {lastScan.customerName ? <> - {lastScan.customerName}</> : null}
                    </div>
                  </div>
                  <span className="text-sm text-emerald-200 shrink-0">
                    {Math.round(lastScan.confidence * 9)}/9 key fields found
                  </span>
                </div>
                {lastScan.warnings.length > 0 && (
                  <ul className="list-disc pl-9 text-[13px] text-amber-200 space-y-0.5">
                    {lastScan.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {scanError && !isScanning && (
              <div className="p-3 bg-rose-500/20 border border-rose-400/40 rounded-xl flex items-center gap-2 text-sm text-rose-200">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-300" />
                <span>{scanError}</span>
              </div>
            )}
          </div>

          {/* Batch Scanned Queue Table (Shown when multi-files are uploaded) */}
          {showBatchQueue && batchQueue.length > 0 && (
            <div className="bg-white rounded-2xl border border-brand-200 shadow-sm p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-brand-700" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Scanned PDF Queue ({batchQueue.length} forms)
                  </h3>
                </div>

                {/* Bulk foreman assign */}
                <div className="flex items-center gap-2">
                  <select
                    value={batchForeman}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBatchForeman(val);
                      const matched = foremen.find((r) => r.name === val);
                      if (matched) setBatchForemanPhone(matched.phone || '');
                    }}
                    className="px-2.5 py-1 text-sm border border-slate-300 rounded-lg bg-slate-50"
                  >
                    <option value="">Select Foreman for all...</option>
                    {activeForemen.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={batchForemanPhone}
                    onChange={(e) => setBatchForemanPhone(e.target.value)}
                    placeholder="Foreman Phone"
                    className="px-2.5 py-1 text-sm border border-slate-300 rounded-lg w-32"
                  />

                  <button
                    type="button"
                    onClick={handleBatchForemanApply}
                    disabled={!batchForeman}
                    className="px-2.5 py-1 text-sm font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-lg disabled:opacity-40"
                  >
                    Apply to All
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-sm divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-[13px] font-semibold text-slate-700">
                    <tr>
                      <th className="px-3 py-2">Institute / Customer</th>
                      <th className="px-3 py-2">EDC / NMS</th>
                      <th className="px-3 py-2">Upazila / Union</th>
                      <th className="px-3 py-2">Router & MAC</th>
                      <th className="px-3 py-2">Fiber (m)</th>
                      <th className="px-3 py-2">Contact Phone</th>
                      <th className="px-3 py-2">Foreman Name</th>
                      <th className="px-3 py-2">Foreman Phone</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {batchQueue.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-900 max-w-[200px] truncate">
                          {item.customerName || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">
                          {item.edcNo ? `EDC: ${item.edcNo}` : ''}
                          {item.nmsId ? ` · NMS: ${item.nmsId}` : ''}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {[item.upazila, item.unionName].filter(Boolean).join(' / ') || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-[13px] text-slate-600">
                          <div>{item.routerSerial || '—'}</div>
                          <div className="text-slate-400">{item.mac || 'No MAC'}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">{item.fiberLength || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{item.headTeacherPhone || '—'}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.foremanName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBatchQueue((prev) =>
                                prev.map((q) => (q.id === item.id ? { ...q, foremanName: val } : q))
                              );
                            }}
                            placeholder="Foreman name"
                            className="px-2 py-0.5 text-sm border border-slate-200 rounded w-28"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.foremanPhone}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBatchQueue((prev) =>
                                prev.map((q) => (q.id === item.id ? { ...q, foremanPhone: val } : q))
                              );
                            }}
                            placeholder="Foreman phone"
                            className="px-2 py-0.5 text-sm border border-slate-200 rounded w-28"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleLoadQueueItemIntoForm(item)}
                              className="p-1 text-slate-600 hover:text-brand-800 rounded"
                              title="Open this item in main form"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setBatchQueue((prev) => prev.filter((q) => q.id !== item.id))
                              }
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              title="Remove from queue"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-slate-500">
                  Total {batchQueue.length} records ready to be logged.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchQueue([])}
                    className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
                  >
                    Clear Queue
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchSaveAll}
                    disabled={isBatchSaving}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-brand-800 hover:bg-brand-900 rounded-lg shadow-xs disabled:opacity-50"
                  >
                    {isBatchSaving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Logging...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Batch Save All ({batchQueue.length}) Records</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Duplicate warning */}
      {dups.length > 0 && (
        <div className="flex gap-2 items-start text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-amber-600" />
          <div className="space-y-1 min-w-0">
            <div className="font-semibold">Already used on another connection</div>
            {dups.map((d) => (
              <div key={d.field} className="break-words">
                {d.label} <span className="font-mono font-semibold">{d.value}</span> is on{' '}
                {d.others.slice(0, 3).map(describeLog).join('; ')}
                {d.others.length > 3 ? ` and ${d.others.length - 3} more` : ''}.
              </div>
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pendingSave}
        title="Duplicate found"
        message={
          dups
            .map((d) => `${d.label} ${d.value} is already on ${describeLog(d.others[0])}.`)
            .join(' ') + ' Save anyway?'
        }
        confirmLabel="Save anyway"
        isDestructive={false}
        onCancel={() => setPendingSave(null)}
        onConfirm={() => {
          if (pendingSave) commit(pendingSave.entry, pendingSave.another);
          setPendingSave(null);
        }}
      />

      {/* Main Form Sections */}
      <div className="space-y-5">
        {/* Section 1: Record & Foreman Details */}
        <section className={CARD}>
          <div className={HEAD}><SectionTitle n={1}>Connection Identification & Foreman</SectionTitle></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-5">
            <div>
              <label className={LABEL}>
                Connection No. <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                value={formData.logNo ?? ''}
                onChange={(e) => updateField('logNo', parseInt(e.target.value, 10) || 1)}
                required
                className={`${INPUT} font-mono`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-slate-700">
                  Date <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => updateField('date', formatEntryDate(new Date()))}
                  className="text-[13px] text-slate-500 hover:text-slate-800"
                >
                  Today
                </button>
              </div>
              <input
                type="date"
                value={toInputDate(parseEntryDate(formData.date))}
                onChange={(e) => {
                  const d = fromInputDate(e.target.value);
                  if (d) updateField('date', formatEntryDate(d));
                }}
                required
                className={`${INPUT}`}
              />
            </div>

            <div>
              <label className={LABEL}>Upazila</label>
              <select
                value={upazilaPick}
                onChange={(e) => pickUpazila(e.target.value)}
                className={`${INPUT}`}
              >
                <option value="">Select upazila…</option>
                {UPAZILAS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.key} · {u.bn}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={LABEL}>
                Foreman Name <span className="text-[11px] font-normal text-slate-400">(optional - can be added later)</span>
              </label>
              {foremen.length > 0 ? (
                <select
                  value={currentForeman?.id || (formData.foremanName ? '__keep__' : '')}
                  onChange={(e) => pickForeman(e.target.value)}
                  className={`${INPUT}`}
                >
                  <option value="">{upazilaPick && foremanPool.length === 0 ? `No foreman in ${upazilaPick} yet` : 'No foreman yet (optional)'}</option>
                  {!currentForeman && formData.foremanName && (
                    <option value="__keep__">{formData.foremanName} (not in list)</option>
                  )}
                  {foremanPool.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {!upazilaPick && upazilaKey(r.area) ? ` · ${upazilaKey(r.area)}` : ''}
                      {r.roam && upazilaPick && upazilaKey(r.area) !== upazilaPick ? ` · Own broadband (${upazilaKey(r.area)})` : r.roam ? ' · Own broadband' : ''}
                    </option>
                  ))}
                  {currentForeman && !currentForeman.active && (
                    <option value={currentForeman.id}>{currentForeman.name} (inactive)</option>
                  )}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.foremanName || ''}
                  onChange={(e) => updateField('foremanName', e.target.value)}
                  placeholder="e.g. Shabul"
                  className={`${INPUT}`}
                />
              )}
            </div>

            {/* Foreman Phone */}
            <SuggestionInput
              name="foremanPhone"
              label="Foreman Phone"
              type="tel"
              value={formData.foremanPhone || ''}
              onChange={(val) => updateField('foremanPhone', val)}
              suggestions={suggestions.foremanPhone}
              placeholder="e.g. +880 1711-234567"
            />

            <SuggestionInput
              name="requestType"
              label="Request Type"
              value={formData.requestType || ''}
              onChange={(val) => updateField('requestType', val)}
              suggestions={suggestions.requestType}
              placeholder="e.g. New User ID"
              required
            />
          </div>
        </section>

        {/* Section 2: Institute / Customer & Contacts */}
        <section className={CARD}>
          <div className={HEAD}><SectionTitle n={2}>Customer / Institute Details & Leadership Contacts</SectionTitle></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-5">
            <div>
              <SuggestionInput
                name="nameBn"
                label="Institute Name – বাংলা (shown in connections)"
                value={formData.nameBn || ''}
                onChange={(val) => updateField('nameBn', val)}
                suggestions={[]}
                placeholder="e.g. কাজী জালাল উদ্দিন বালক সরকারি প্রাথমিক বিদ্যালয়"
                required={!formData.nameEn?.trim()}
              />
            </div>
            <div>
              <SuggestionInput
                name="nameEn"
                label="Institute Name – English (kept for reference)"
                value={formData.nameEn || ''}
                onChange={(val) => updateField('nameEn', val)}
                suggestions={[]}
                placeholder="e.g. Kazi Jalal Uddin Boys Govt. Primary School"
              />
            </div>

            <SuggestionInput
              name="nmsId"
              label="NMS ID / Customer ID"
              value={formData.nmsId || ''}
              onChange={(val) => updateField('nmsId', val)}
              suggestions={suggestions.nmsId}
              placeholder="e.g. 55686"
            />

            <SuggestionInput
              name="category"
              label="Category (auto-detected, editable)"
              value={formData.category || ''}
              onChange={(val) => updateField('category', val)}
              suggestions={[...CATEGORY_LABELS]}
              placeholder="Detected from the institute name"
            />

            {/* NEW: Head Teacher / In-Charge Name */}
            <SuggestionInput
              name="headTeacherName"
              label="Head Teacher / In-Charge Name"
              value={formData.headTeacherName || ''}
              onChange={(val) => updateField('headTeacherName', val)}
              suggestions={[]}
              placeholder="সংযোগ গ্রহণকারী প্রধান কর্মকর্তার নাম"
            />

            {/* NEW: Head Teacher Phone */}
            <SuggestionInput
              name="headTeacherPhone"
              label="Head Teacher / In-Charge Phone"
              type="tel"
              value={formData.headTeacherPhone || ''}
              onChange={(val) => updateField('headTeacherPhone', val)}
              suggestions={[]}
              placeholder="e.g. +880 1711-XXXXXX"
            />

            <SuggestionInput
              name="edcNo"
              label="EDC Book No. / সুত্র নং"
              value={formData.edcNo || ''}
              onChange={(val) => updateField('edcNo', val)}
              suggestions={[]}
              placeholder="e.g. 929"
            />

            <SuggestionInput
              name="emisEiinDghs"
              label="Emis / EIIN / DGHS"
              value={formData.emisEiinDghs || ''}
              onChange={(val) => updateField('emisEiinDghs', val)}
              suggestions={[]}
              placeholder="e.g. 107452"
            />
          </div>
        </section>

        {/* Section 3: Geographic Location */}
        <section className={CARD}>
          <div className={HEAD}>
            <SectionTitle n={3}>Geographic Location (Union, Coordinates)</SectionTitle>
            {formData.lat && formData.long && (
              <a
                href={`https://www.google.com/maps?q=${formData.lat},${formData.long}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[13px] text-brand-700 hover:text-brand-900 font-medium"
              >
                <MapPin className="w-3 h-3" />
                <span>View on Google Maps</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-5">
            {/* Union */}
            <SuggestionInput
              name="unionName"
              label="Union / Ward / Pouroshova"
              value={formData.unionName || ''}
              onChange={(val) => updateField('unionName', val)}
              suggestions={['বালাগঞ্জ সদর', 'বিশ্বনাথ পৌরসভা', 'দেওয়ান বাজার', 'সিলেট সিটি কর্পোরেশন ওয়ার্ড নং-১৭']}
              placeholder="e.g. বালাগঞ্জ সদর / বিশ্বনাথ পৌরসভা"
            />

            {/* NEW: Lat */}
            <div>
              <label className={LABEL}>Latitude (Lat)</label>
              <input
                type="text"
                value={formData.lat || ''}
                onChange={(e) => updateField('lat', e.target.value)}
                placeholder="e.g. 24.8965"
                className={`${INPUT} font-mono`}
              />
            </div>

            {/* NEW: Long */}
            <div>
              <label className={LABEL}>Longitude (Long)</label>
              <input
                type="text"
                value={formData.long || ''}
                onChange={(e) => updateField('long', e.target.value)}
                placeholder="e.g. 91.8791"
                className={`${INPUT} font-mono`}
              />
            </div>
          </div>
        </section>

        {/* Section 4: Technical & Equipment Details */}
        <section className={CARD}>
          <div className={HEAD}><SectionTitle n={4}>Hardware, Fiber & Technical Parameters</SectionTitle></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-5">
            <SuggestionInput
              name="mac"
              label="Wi-Fi Router MAC Address"
              value={formData.mac || ''}
              onChange={(val) => updateField('mac', val)}
              suggestions={suggestions.mac}
              placeholder="e.g. 20:23:51:78:47:A0"
              autoFormatMac
            />

            <SuggestionInput
              name="routerSerial"
              label="Router Serial No."
              value={formData.routerSerial || ''}
              onChange={(val) => updateField('routerSerial', val)}
              suggestions={[]}
              placeholder="e.g. 22640VJ005236"
            />

            {/* NEW: Fiber Length */}
            <div>
              <label className={LABEL}>
                Fiber Length (meters)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.fiberLength || ''}
                  onChange={(e) => updateField('fiberLength', e.target.value)}
                  placeholder="e.g. 200, 1500, 1520"
                  className={`${INPUT} font-mono`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                  mtr.
                </span>
              </div>
            </div>

            <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">
              <SuggestionInput
                name="issueFound"
                label="Issue Found"
                value={formData.issueFound || ''}
                onChange={(val) => updateField('issueFound', val)}
                suggestions={suggestions.issueFound}
                placeholder="e.g. Same router at two institute / Port down"
                isTextarea
                rows={3}
              />

              <SuggestionInput
                name="missingWrongDetails"
                label="Missing / Wrong Details"
                value={formData.missingWrongDetails || ''}
                onChange={(val) => updateField('missingWrongDetails', val)}
                suggestions={suggestions.missingWrongDetails}
                placeholder="e.g. They previously used the same router in Radhakona Govt. Primary School"
                isTextarea
                rows={3}
              />
            </div>
          </div>
        </section>

        {/* Section 5: Action Taken & Resolutions */}
        <section className={CARD}>
          <div className={HEAD}><SectionTitle n={5}>Action Taken, Status & Follow-ups</SectionTitle></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <SuggestionInput
              name="actionTaken"
              label="Action Taken"
              value={formData.actionTaken || ''}
              onChange={(val) => updateField('actionTaken', val)}
              suggestions={suggestions.actionTaken}
              placeholder="e.g. Provided the id/form as requested but kept nms entry on hold"
              isTextarea
              rows={3}
            />

            <SuggestionInput
              name="reasonForAction"
              label="Reason for Action (why I did it)"
              value={formData.reasonForAction || ''}
              onChange={(val) => updateField('reasonForAction', val)}
              suggestions={suggestions.reasonForAction}
              placeholder="e.g. I did not entry this school in nms because nms doesn't allow two school with same router."
              isTextarea
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-5 mt-5">
            <SuggestionInput
              name="foremanInformed"
              label="Foreman Informed?"
              value={formData.foremanInformed || ''}
              onChange={(val) => updateField('foremanInformed', val)}
              suggestions={suggestions.foremanInformed}
              placeholder="e.g. Yes - phone"
            />

            <SuggestionInput
              name="followUpNeeded"
              label="Follow-up Needed?"
              value={formData.followUpNeeded || ''}
              onChange={(val) => updateField('followUpNeeded', val)}
              suggestions={suggestions.followUpNeeded}
              placeholder="e.g. Yes"
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-semibold text-slate-700">Follow-up Date</label>
                {formData.followUpDate && (
                  <button
                    type="button"
                    onClick={() => updateField('followUpDate', '')}
                    className="text-[13px] text-slate-500 hover:text-slate-800"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="date"
                value={formData.followUpDate || ''}
                onChange={(e) => updateField('followUpDate', e.target.value)}
                className={`${INPUT}`}
              />
              <div className="flex gap-1 mt-1.5">
                {([['Tomorrow', 1], ['3 days', 3], ['1 week', 7]] as const).map(
                  ([label, n]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => updateField('followUpDate', addDaysIso(n))}
                      className="px-2 py-0.5 text-[13px] text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full"
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
            </div>

            <SuggestionInput
              name="status"
              label="Status"
              value={formData.status || ''}
              onChange={(val) => updateField('status', val)}
              suggestions={suggestions.status}
              placeholder="e.g. Pending - waiting for foreman"
              required
            />

            <SuggestionInput
              name="supervisorInformed"
              label="Supervisor Informed / Approved By"
              value={formData.supervisorInformed || ''}
              onChange={(val) => updateField('supervisorInformed', val)}
              suggestions={suggestions.supervisorInformed}
              placeholder="e.g. I informed my superiors"
            />

            <div className="sm:col-span-2 lg:col-span-3">
              <SuggestionInput
                name="remarks"
                label="Remarks"
                value={formData.remarks || ''}
                onChange={(val) => updateField('remarks', val)}
                suggestions={suggestions.remarks}
                placeholder="e.g. Foreman said Radhakona Govt. Primary School is not using the network or the router anymore..."
                isTextarea
                rows={3}
              />
            </div>
          </div>
        </section>

        {/* Section 5: UPAC Form Document Attachment */}
        <section className={CARD}>
          <div className={HEAD}>
            <SectionTitle n={6}>UPAC Form Attachment (Database Stored Copy)</SectionTitle>
            <span className="text-[13px] text-emerald-700 font-medium">
              Permanent digital archive
            </span>
          </div>

          <p className="text-sm text-slate-500 mb-3">
            Attach the signed UPAC acceptance form (PDF, scanned image, or document). If you lose the sent hard copy, you can download the original file anytime directly from the database.
          </p>

          <input
            ref={upacFileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,image/*"
            onChange={handleUpacFileChange}
            className="hidden"
          />

          {(formData.upacFormData || formData.upacFormName) ? (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 truncate">
                      {formData.upacFormName || 'UPAC_Form.pdf'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> Attached
                    </span>
                  </div>
                  <div className="text-[13px] text-slate-500 flex items-center gap-2 mt-0.5">
                    {formData.upacFormSize ? (
                      <span>{Math.round(formData.upacFormSize / 1024)} KB</span>
                    ) : null}
                    {formData.upacFormUploadedAt && (
                      <>
                        <span>·</span>
                        <span>Attached {new Date(formData.upacFormUploadedAt).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-emerald-100">
                <button
                  type="button"
                  onClick={() => downloadUpacForm(formData as LogEntry)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-emerald-900 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-xl shadow-xs transition-colors"
                  title="Download attached copy from database"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Download UPAC Form</span>
                </button>
                <button
                  type="button"
                  onClick={() => upacFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
                  title="Replace with another file"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Replace</span>
                </button>
                <button
                  type="button"
                  onClick={handleRemoveUpacForm}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-xl transition-colors"
                  title="Remove attached copy"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => upacFileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-emerald-400 rounded-2xl p-6 text-center cursor-pointer hover:bg-emerald-50/30 transition-all group"
            >
              <div className="inline-flex p-3 rounded-2xl bg-slate-100 group-hover:bg-emerald-100 text-slate-500 group-hover:text-emerald-700 mb-2 transition-colors">
                <Paperclip className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800 group-hover:text-emerald-900">
                Click to attach UPAC form file
              </p>
              <p className="text-[13px] text-slate-400 mt-1">
                Supports PDF, JPG, PNG, and Word DOCX certificates. Saved in the database so you never lose the sent copy.
              </p>
            </div>
          )}
        </section>
      </div>
    </form>
  );
};
