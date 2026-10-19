import React, { useEffect, useRef, useState } from 'react';
import { Search, FileDown, Loader2, ExternalLink, FileSpreadsheet, ListChecks, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { LogEntry } from '../types';
import { upazilaKey } from '../utils/upazilas';
import { findDuplicates, describeLog } from '../utils/duplicates';

type Fields = Record<string, string>;
interface Meta { key: string; label: string; default: string }
interface Match { sheet: string; data: Fields }

interface FormMakerProps {
  logs: LogEntry[];
  onLog: (fields: Partial<LogEntry>, existingId?: string) => Promise<LogEntry>;
  onOpenLog: (id: string) => void;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Same format the log form uses, e.g. "05 Oct 2026"
const logDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { ...(init.headers || {}) },
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch { /* not json */ }
    throw new Error(msg);
  }
  return res;
}

const INK = 'text-[#1b2a4e]';
const SURFACE = 'bg-white rounded-3xl border border-slate-100 shadow-[0_12px_32px_-18px_rgba(30,50,110,0.25)]';
const inputCls = `w-full h-11 px-3.5 text-[16px] ${INK} bg-slate-50 border border-slate-200 rounded-xl hover:bg-white hover:border-slate-300 focus:outline-none focus:bg-white focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors placeholder:text-slate-400`;
const labelCls = 'block text-[14px] font-semibold text-slate-600';
const primaryBtn = 'inline-flex items-center justify-center gap-2 h-11 px-5 text-[14px] font-semibold text-white bg-gradient-to-br from-brand-500 to-brand-700 hover:from-brand-600 hover:to-brand-800 rounded-xl shadow-md shadow-brand-600/30 hover:-translate-y-px active:translate-y-0 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';
const ghostBtn = 'inline-flex items-center justify-center gap-2 h-11 px-4 text-[14px] font-semibold text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-xl transition-colors';

export const FormMaker: React.FC<FormMakerProps> = ({ logs, onLog, onOpenLog }) => {
  const [meta, setMeta] = useState<Meta[]>([]);
  const [edc, setEdc] = useState('');
  const [date, setDate] = useState(todayIso());
  const [matches, setMatches] = useState<Match[]>([]);
  const [fields, setFields] = useState<Fields>({});
  const [busy, setBusy] = useState<'search' | 'download' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  // Re-downloading the same form in one session updates its log instead of creating a duplicate.
  const logged = useRef<Record<string, string>>({});
  const [ackDup, setAckDup] = useState('');

  // Same NMS ID / router serial / MAC already on another log? (the log this form already created doesn't count)
  const dupKey = fields.connection_nms || fields.source_no || fields.name;
  const dups = findDuplicates(
    { id: logged.current[dupKey], nmsId: fields.connection_nms, routerSerial: fields.router_serial, mac: fields.router_mac },
    logs,
  );
  const dupSig = dups.map((d) => `${d.field}:${d.value}`).join('|');

  useEffect(() => {
    fetch('/api/meta').then(r => r.json()).then(j => {
      const m: Meta[] = j.fields || [];
      setMeta(m);
      setFields(Object.fromEntries(m.map(f => [f.key, f.default])));
    }).catch(() => setNotice({ kind: 'err', text: 'Could not reach the Form Maker service.' }));
  }, []);

  const defaults = () => Object.fromEntries(meta.map(f => [f.key, f.default]));
  const apply = (m: Match) => { setFields({ ...defaults(), ...m.data }); setMatches([]); setNotice(null); };

  const search = async () => {
    if (!edc.trim()) return;
    setBusy('search'); setNotice(null); setLastLogId(null);
    try {
      const res = await api(`/api/lookup?edc=${encodeURIComponent(edc.trim())}`);
      const found: Match[] = (await res.json()).matches || [];
      if (found.length === 0) {
        setFields({ ...defaults(), source_no: edc.trim() });
        setMatches([]);
        setNotice({ kind: 'info', text: `EDC ${edc.trim()} was not found in the workbook (data/toscrape.xlsx). Fill the fields manually.` });
      } else if (found.length === 1) apply(found[0]);
      else { setMatches(found); setNotice({ kind: 'info', text: `${found.length} matches. Pick the right one.` }); }
    } catch (e: any) { setNotice({ kind: 'err', text: e.message }); }
    setBusy(null);
  };

  const download = async () => {
    if (dups.length > 0 && ackDup !== dupSig) {
      setAckDup(dupSig);
      setNotice({ kind: 'err', text: 'Duplicate found (see the warning above). Click "Download anyway" to continue, or fix the field first.' });
      return;
    }
    setBusy('download'); setNotice(null);
    let blobName = 'form.docx';
    let mac = fields.router_mac || '';
    try {
      const res = await api('/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: fields, date }),
      });
      const blob = await res.blob();
      blobName = decodeURIComponent(res.headers.get('X-Filename') || blobName);
      mac = res.headers.get('X-Mac') || mac;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = blobName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) {
      setNotice({ kind: 'err', text: `Download failed, no connection was created. ${e.message}` });
      setBusy(null);
      return;
    }
    // Only reached after a successful download.
    try {
      const key = fields.connection_nms || fields.source_no || fields.name;
      // Everything the form knows goes straight into the log (empty values are skipped so a
      // re-download never wipes something typed into the log later).
      const ll = (fields.lat_long || '').match(/(-?\d+(?:\.\d+)?)\s*[,;\/\s]\s*(-?\d+(?:\.\d+)?)/);
      const KEEP_EMPTY: (keyof LogEntry)[] = ['customerName', 'nmsId', 'mac', 'edcNo', 'routerSerial'];
      const auto: Partial<LogEntry> = {
        date: logDate(date), requestType: 'New User ID',
        customerName: fields.name || '', nmsId: fields.connection_nms || '', mac,
        edcNo: fields.source_no || '', emisEiinDghs: fields.institution_code || '', routerSerial: fields.router_serial || '',
        headTeacherPhone: fields.mobile || '',          // the form's mobile number is the head teacher's
        upazila: upazilaKey(fields.upazila) || fields.upazila || '',
        unionName: fields.union || '',
        lat: ll ? ll[1] : '', long: ll ? ll[2] : '',
        fiberLength: fields.cable_qty || '',
      };
      for (const k of Object.keys(auto) as (keyof LogEntry)[]) {
        if ((auto[k] === '' || auto[k] === undefined) && !KEEP_EMPTY.includes(k)) delete auto[k];
      }
      const saved = await onLog(auto, logged.current[key]);
      logged.current[key] = saved.id;
      setLastLogId(saved.id);
      setNotice({ kind: 'ok', text: `${blobName} downloaded. Connection #${saved.logNo} saved.` });
    } catch (e: any) {
      setNotice({ kind: 'err', text: `${blobName} downloaded, but the connection could not be saved: ${e.message}` });
    }
    setBusy(null);
  };

  const canDownload = !busy && Boolean(fields.name || fields.source_no || fields.connection_nms);
  const noticeCls: Record<string, string> = { ok: 'bg-emerald-50 text-emerald-800', err: 'bg-rose-50 text-rose-700', info: 'bg-sky-50 text-sky-800' };
  const NoticeIcon = notice?.kind === 'ok' ? CheckCircle2 : notice?.kind === 'err' ? XCircle : Info;
  const filled = meta.filter((f) => (fields[f.key] || '').trim()).length;

  const pct = meta.length ? Math.round((filled / meta.length) * 100) : 0;

  return (
    <div className="w-full space-y-3 pb-3">
      <header className="flex items-center gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-md shadow-brand-600/25"><FileSpreadsheet className="w-[18px] h-[18px]" /></span>
        <div className="min-w-0">
          <h1 className={`text-xl font-extrabold tracking-tight leading-tight ${INK}`}>Form Maker</h1>
          <p className="text-[13px] text-slate-500 truncate">Look up an EDC number, review the fields, then download the form. A connection is added automatically.</p>
        </div>
      </header>

      <section className={`${SURFACE} overflow-hidden`}>
        {/* Look up bar */}
        <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-end gap-x-3 gap-y-2">
          <label className={`${labelCls} text-[13px] w-full sm:w-56`}>EDC number
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input className={`${inputCls} h-10 pl-9 text-[15px] font-semibold`} value={edc} onChange={e => setEdc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()} placeholder="e.g. 1042" inputMode="numeric" />
            </div>
          </label>
          <button onClick={search} disabled={busy !== null || !edc.trim()} className={`${primaryBtn} h-10 px-4`}>
            {busy === 'search' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Look up
          </button>
          <label className={`${labelCls} text-[13px] w-full sm:w-44 sm:ml-auto`}>Form date
            <input type="date" className={`${inputCls} h-10 mt-1 text-[15px]`} value={date} onChange={e => setDate(e.target.value)} />
          </label>
        </div>

        {matches.length > 1 && (
          <div className="px-4 py-3 border-b border-slate-100 bg-sky-50/50">
            <p className="text-[12px] font-semibold text-slate-500 mb-2">{matches.length} matches - pick the right one</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {matches.map((m, i) => (
                <button key={i} onClick={() => apply(m)}
                  className="text-left px-3 py-2 bg-white border border-slate-200 rounded-xl hover:bg-brand-50 hover:border-brand-300 transition-colors">
                  <span className={`block text-[14px] font-semibold leading-snug ${INK}`}>{m.data.name || '(no name)'}</span>
                  <span className="block text-[12px] text-slate-500">{m.sheet} · {m.data.union}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form details */}
        <div className="px-4 pt-3 pb-1 flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-brand-700" />
          <h2 className={`text-[15px] font-bold ${INK}`}>Form details</h2>
          <span className="text-[12px] text-slate-500 hidden sm:inline">Review and edit before downloading</span>
          {meta.length > 0 && <span className="ml-auto px-2.5 py-0.5 rounded-full bg-brand-50 text-[12px] font-semibold text-brand-700 tabular-nums">{filled} of {meta.length} filled</span>}
        </div>
        <div className="mx-4 h-0.5 rounded bg-slate-100"><div className="h-full rounded bg-gradient-to-r from-sky-400 to-teal-500 transition-all" style={{ width: `${pct}%` }} /></div>

        <div className="px-4 py-3 space-y-3">
          {dups.length > 0 && (
            <div className="flex gap-3 text-[13px] text-amber-900 bg-amber-50 rounded-xl px-3.5 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5 min-w-0">
                <div className="font-bold">Already used on another connection</div>
                {dups.map((d) => (
                  <div key={d.field} className="break-words">
                    {d.label} <span className="font-mono font-semibold">{d.value}</span> is on {d.others.slice(0, 3).map(describeLog).join('; ')}
                    {d.others.length > 3 ? ` and ${d.others.length - 3} more` : ''}.
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-3">
            {meta.map(f => (
              <label key={f.key} className={`min-w-0 text-[13px] font-semibold text-slate-600`}>
                <span className="block truncate leading-snug" title={f.label}>{f.label}</span>
                <input className={`${inputCls} h-10 mt-1 text-[15px]`} value={fields[f.key] || ''}
                  onChange={e => setFields(p => ({ ...p, [f.key]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-3">
          <button onClick={download} disabled={!canDownload} className={`${primaryBtn} h-10`}>
            {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} {dups.length > 0 && ackDup === dupSig ? 'Download anyway' : 'Download form & save connection'}
          </button>
          {lastLogId && (
            <button onClick={() => onOpenLog(lastLogId)} className={`${ghostBtn} h-10`}>
              <ExternalLink className="w-4 h-4 text-brand-700" /> Open connection to add details
            </button>
          )}
          {notice ? (
            <div className={`flex-1 min-w-[14rem] flex items-start gap-2 text-[13px] font-medium px-3 py-2 rounded-xl ${noticeCls[notice.kind]}`}>
              <NoticeIcon className="w-4 h-4 shrink-0 mt-px" />
              <span className="min-w-0 break-words">{notice.text}</span>
            </div>
          ) : (
            <p className="text-[12px] text-slate-500">Not in the workbook? Just fill the fields by hand.</p>
          )}
        </div>
      </section>
    </div>
  );
};
