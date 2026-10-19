import React, { useEffect, useMemo, useState } from 'react';
import { X, ListChecks, ArrowLeft, ArrowRight, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { LogEntry, Foreman } from '../types';
import { displayName } from '../utils/names';
import { upazilaKey } from '../utils/upazilas';
import { ScrollLock } from './ScrollLock';
import {
  FILL_FIELDS, FillKey, MATCH_LABEL, MatchBy, RowState, buildFillPlan, fillFieldOf,
} from '../utils/bulkFill';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  logs: LogEntry[];
  onApply: (field: FillKey, items: { id: string; value: string }[]) => Promise<{ updated: number; unchanged: number; missing: number }>;
  foremen?: Foreman[];
  onApplyForeman?: (ids: string[], foremanId: string) => Promise<{ updated: number; unchanged: number; missing: number }>;
}

type Step = 'ids' | 'field' | 'values' | 'done';

const BADGE: Record<RowState, { label: string; cls: string }> = {
  change: { label: 'Will fill', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  same: { label: 'Same', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  has_value: { label: 'Has value', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  not_found: { label: 'Not found', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  ambiguous: { label: 'Shared ID', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  invalid: { label: 'Invalid', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  repeated: { label: 'Repeated', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  no_value: { label: 'No value', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const SHOWN = 300;

export const FieldFillModal: React.FC<Props> = ({ isOpen, onClose, logs, onApply, foremen = [], onApplyForeman }) => {
  const [step, setStep] = useState<Step>('ids');
  const [matchBy, setMatchBy] = useState<MatchBy>('nms');
  const [idsText, setIdsText] = useState('');
  const [pickedField, setField] = useState<FillKey | 'foreman'>('mac');
  const [foremanId, setForemanId] = useState('');
  const [valuesText, setValuesText] = useState('');
  const [overwrite, setOverwrite] = useState(true);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ updated: number; unchanged: number; missing: number } | null>(null);

  // start clean every time the window is opened
  useEffect(() => {
    if (isOpen) {
      setStep('ids'); setMatchBy('nms'); setIdsText(''); setValuesText(''); setField('mac'); setForemanId('');
      setOverwrite(true); setProblemsOnly(false); setError(''); setResult(null); setBusy(false);
    }
  }, [isOpen]);

  const isForeman = pickedField === 'foreman';
  // text fields use `field`; the foreman option has no pasted values so it falls back to a harmless def
  const field: FillKey = isForeman ? 'mac' : pickedField;
  const def = isForeman ? { ...fillFieldOf('mac'), label: 'Foreman', hint: 'Every selected connection moves to the foreman you choose next. His upazila and phone follow.', example: '' } : fillFieldOf(field);
  const idName = MATCH_LABEL[matchBy];

  // How many pasted IDs match a log (step 1 feedback)
  const idPlan = useMemo(() => buildFillPlan(idsText, '', 'mac', logs, true, matchBy), [idsText, logs, matchBy]);
  const idTotal = idPlan.idCount;
  const idFound = idPlan.rows.filter((r) => r.log).length;
  const idMissing = idPlan.rows.filter((r) => r.state === 'not_found').length;
  const matchedLogs = useMemo(() => idPlan.rows.filter((r) => r.log).map((r) => r.log!), [idPlan]);
  const foremanChoices = useMemo(
    () => foremen.filter((f) => f.active && !f.deletedAt).sort((a, b) => a.name.localeCompare(b.name)),
    [foremen],
  );
  const targetForeman = foremen.find((f) => f.id === foremanId);
  const foremanToChange = matchedLogs.filter((l) => l.foremanId !== foremanId).length;

  const plan = useMemo(
    () => (step === 'values' || step === 'done' ? buildFillPlan(idsText, valuesText, field, logs, overwrite, matchBy) : null),
    [step, idsText, valuesText, field, logs, overwrite, matchBy],
  );

  if (!isOpen) return null;

  const goField = () => {
    if (!idTotal) { setError(`Paste at least one ${idName.short} first.`); return; }
    if (!idFound) { setError(`None of these ${idName.long} match a connection.`); return; }
    setError(''); setStep('field');
  };

  const applyForeman = async () => {
    if (!onApplyForeman || !foremanId || !matchedLogs.length) return;
    setBusy(true); setError('');
    try {
      const r = await onApplyForeman(matchedLogs.map((l) => l.id), foremanId);
      setResult(r); setStep('done');
    } catch (e: any) {
      setError(e?.message || 'Could not save. Nothing was changed - try again.');
    } finally { setBusy(false); }
  };

  const apply = async () => {
    if (!plan || !plan.changes.length) return;
    setBusy(true); setError('');
    try {
      const r = await onApply(field, plan.changes.map((c) => ({ id: c.log!.id, value: c.value })));
      setResult(r); setStep('done');
    } catch (e: any) {
      setError(e?.message || 'Could not save. Nothing was lost - try again.');
    } finally { setBusy(false); }
  };

  const rows = plan ? (problemsOnly ? plan.rows.filter((r) => r.state !== 'change' && r.state !== 'same') : plan.rows) : [];
  const countMismatch = plan && plan.idCount !== plan.valueCount;
  const taClass = 'w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600';

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs">
      <ScrollLock />
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-brand-50">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5"><ListChecks className="w-4 h-4" />Fill a field from a list</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {step === 'ids' && `Step 1 of 3 · Paste the ${idName.long}`}
              {step === 'field' && 'Step 2 of 3 · Choose what to fill'}
              {step === 'values' && (isForeman ? 'Step 3 of 3 · Choose the foreman' : `Step 3 of 3 · Paste the ${def.label.toLowerCase()} values`)}
              {step === 'done' && 'Done'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-white" title="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 overflow-y-auto space-y-3 text-xs">
          {step === 'ids' && (
            <>
              <div>
                <p className="mb-1.5 font-semibold text-slate-700">Find the connections by</p>
                <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-1" role="group" aria-label="Find connections by">
                  {(['nms', 'edc'] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={matchBy === m}
                      onClick={() => { setMatchBy(m); setError(''); if (m === 'edc' && field === 'edcNo') setField('mac'); }}
                      className={`h-8 px-4 rounded-lg text-xs font-semibold transition-colors ${matchBy === m ? 'bg-white text-brand-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
                      {MATCH_LABEL[m].short}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  {matchBy === 'edc'
                    ? 'Only the EDC book no. column is searched. 1, 01 and ০১ are the same number; NMS IDs, EIIN and other codes are never matched.'
                    : 'Only the NMS ID column is searched.'}
                </p>
              </div>
              <p className="text-slate-600">Paste the {idName.long}, <b>one per line</b>. Then press <b>Select</b> (or Ctrl + Enter).</p>
              <textarea autoFocus value={idsText} rows={12} placeholder={matchBy === 'edc' ? '1\n12\n930' : '55001\n55002\n55003'} className={taClass}
                onChange={(e) => { setIdsText(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); goField(); } }} />
              {idTotal > 0 && (
                <p className="text-slate-600">
                  <b>{idTotal}</b> {idTotal === 1 ? idName.short : idName.long} · <b className="text-emerald-700">{idFound}</b> match a connection
                  {idMissing > 0 && <> · <b className="text-rose-700">{idMissing}</b> not found</>}
                </p>
              )}
            </>
          )}

          {step === 'field' && (
            <>
              <p className="text-slate-600"><b>{idFound}</b> connections selected. What do you want to fill?</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {FILL_FIELDS.map((f) => (
                  <button key={f.key} type="button" onClick={() => setField(f.key)}
                    disabled={matchBy === 'edc' && f.key === 'edcNo'}
                    title={matchBy === 'edc' && f.key === 'edcNo' ? 'You are finding connections by EDC no., so it cannot be the field to fill' : undefined}
                    className={`px-3 py-2 text-left rounded-xl border text-xs font-semibold disabled:opacity-35 disabled:cursor-not-allowed ${pickedField === f.key ? 'bg-brand-800 text-white border-brand-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-brand-50'}`}>
                    {f.label}
                  </button>
                ))}
                {onApplyForeman && (
                  <button type="button" onClick={() => setField('foreman')}
                    className={`px-3 py-2 text-left rounded-xl border text-xs font-semibold ${isForeman ? 'bg-brand-800 text-white border-brand-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-brand-50'}`}>
                    Foreman
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500">{def.hint}</p>
            </>
          )}

          {step === 'values' && isForeman && (
            <>
              <p className="text-slate-600">Move all <b>{matchedLogs.length}</b> selected connection{matchedLogs.length === 1 ? '' : 's'} to:</p>
              <select autoFocus value={foremanId} onChange={(e) => { setForemanId(e.target.value); setError(''); }} aria-label="New foreman"
                className="w-full max-w-sm h-9 px-3 text-xs font-medium text-[#1b2a4e] bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-brand-600">
                <option value="">Choose a foreman…</option>
                {foremanChoices.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}{upazilaKey(f.area) ? ` (${upazilaKey(f.area)})` : ''}</option>
                ))}
              </select>
              {targetForeman && (
                <p className="text-slate-600">
                  <b className="text-emerald-700">{foremanToChange}</b> will change{matchedLogs.length - foremanToChange > 0 && <> · <span className="text-slate-500">{matchedLogs.length - foremanToChange} already with {targetForeman.name}</span></>}.
                  Each connection's upazila and foreman phone follow the new foreman.
                </p>
              )}
              <div className="border border-slate-200 rounded-lg overflow-auto max-h-72">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr><th className="px-2 py-1.5 text-left">#</th><th className="px-2 py-1.5 text-left">{idName.short}</th><th className="px-2 py-1.5 text-left">Connection</th><th className="px-2 py-1.5 text-left">Now</th><th className="px-2 py-1.5 text-left">New</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matchedLogs.slice(0, SHOWN).map((l, i) => (
                      <tr key={l.id}>
                        <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                        <td className="px-2 py-1 font-mono">{matchBy === 'edc' ? l.edcNo : l.nmsId}</td>
                        <td className="px-2 py-1 max-w-[12rem] truncate" title={displayName(l)}>{`#${l.logNo} · ${displayName(l)}`}</td>
                        <td className="px-2 py-1 text-slate-500">{l.foremanName || '-'}</td>
                        <td className="px-2 py-1 font-semibold">{targetForeman ? targetForeman.name : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {matchedLogs.length > SHOWN && <p className="px-2 py-1.5 text-center text-slate-400">Showing the first {SHOWN} of {matchedLogs.length} rows (all will be processed).</p>}
              </div>
            </>
          )}

          {step === 'values' && !isForeman && plan && (
            <>
              <p className="text-slate-600">
                Paste the <b>{def.label}</b> values, <b>one per line, in the same order</b> as the {idName.long} (line 1 → first one, and so on).
              </p>
              <textarea autoFocus value={valuesText} rows={7} placeholder={def.example} className={taClass}
                onChange={(e) => { setValuesText(e.target.value); setError(''); }} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className={countMismatch ? 'text-rose-700 font-semibold' : 'text-slate-600'}>
                  {plan.idCount} {idName.long} · {plan.valueCount} values{countMismatch ? ' - the counts differ, check the order before filling' : ''}
                </span>
                <label className="inline-flex items-center gap-1.5 text-slate-600">
                  <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                  Replace values that are already filled (recommended)
                </label>
              </div>
              {plan.extraValues.length > 0 && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-800">
                  {plan.extraValues.length} extra value{plan.extraValues.length === 1 ? '' : 's'} at the end have no {idName.short} and will be ignored.
                </p>
              )}

              {plan.valueCount > 0 && (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="font-semibold text-emerald-700">{plan.counts.change} will be filled{plan.changes.some((c) => c.current.trim()) ? ` (${plan.changes.filter((c) => c.current.trim()).length} replacing an existing value)` : ''}</span>
                    {plan.counts.same > 0 && <span className="text-slate-500">· {plan.counts.same} already same</span>}
                    {plan.counts.has_value > 0 && <span className="text-amber-700">· {plan.counts.has_value} skipped (already filled)</span>}
                    {plan.counts.invalid > 0 && <span className="text-rose-700">· {plan.counts.invalid} invalid</span>}
                    {plan.counts.not_found > 0 && <span className="text-rose-700">· {plan.counts.not_found} not found</span>}
                    {plan.counts.ambiguous > 0 && <span className="text-rose-700">· {plan.counts.ambiguous} shared {idName.short}</span>}
                    {plan.counts.repeated > 0 && <span className="text-slate-500">· {plan.counts.repeated} repeated</span>}
                    {plan.counts.no_value > 0 && <span className="text-rose-700">· {plan.counts.no_value} without value</span>}
                    {plan.warnings > 0 && <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{plan.warnings} to double-check</span>}
                    <label className="ml-auto inline-flex items-center gap-1.5 text-slate-600">
                      <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />Problems only
                    </label>
                  </div>
                  <div className="border border-slate-200 rounded-lg overflow-auto max-h-72">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 text-slate-500 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left">#</th><th className="px-2 py-1.5 text-left">{idName.short}</th>
                          <th className="px-2 py-1.5 text-left">Connection</th><th className="px-2 py-1.5 text-left">Now</th>
                          <th className="px-2 py-1.5 text-left">New</th><th className="px-2 py-1.5 text-left">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.slice(0, SHOWN).map((r) => (
                          <tr key={r.n} className={r.state === 'change' ? '' : 'bg-slate-50/60'}>
                            <td className="px-2 py-1 text-slate-400">{r.n}</td>
                            <td className="px-2 py-1 font-mono">{r.nmsId}</td>
                            <td className="px-2 py-1 max-w-[12rem] truncate" title={r.log ? displayName(r.log) : ''}>{r.log ? `#${r.log.logNo} · ${displayName(r.log)}` : '-'}</td>
                            <td className="px-2 py-1 font-mono text-slate-500">{r.current || '-'}</td>
                            <td className="px-2 py-1 font-mono">{r.value || (r.raw ?? '-')}</td>
                            <td className="px-2 py-1">
                              <span className={`inline-block px-1.5 py-0.5 rounded-full border text-[10px] font-semibold ${BADGE[r.state].cls}`}>{r.state === 'change' && r.current.trim() ? 'Will replace' : BADGE[r.state].label}</span>
                              {(r.note || r.warn) && <span className={`ml-1.5 ${r.warn && !r.note ? 'text-amber-700' : 'text-slate-500'}`}>{r.note || r.warn}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > SHOWN && <p className="px-2 py-1.5 text-center text-slate-400">Showing the first {SHOWN} of {rows.length} rows (all will be processed).</p>}
                  </div>
                </>
              )}
            </>
          )}

          {step === 'done' && result && (
            <div className="py-6 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">{result.updated} connection{result.updated === 1 ? '' : 's'} updated</p>
              <p className="text-slate-500">{isForeman && targetForeman ? `Foreman → ${targetForeman.name}` : def.label}{result.unchanged ? ` · ${result.unchanged} already had it` : ''}{result.missing ? ` · ${result.missing} no longer exist` : ''}</p>
              <p className="text-[11px] text-slate-400">Every change is recorded in each connection's history and in Activity.</p>
            </div>
          )}

          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-800">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
          {step === 'ids' && (<><span /><button type="button" onClick={goField} className="inline-flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white bg-brand-800 rounded-lg hover:bg-brand-900">Select {idFound > 0 ? idFound : ''}<ArrowRight className="w-3.5 h-3.5" /></button></>)}
          {step === 'field' && (<>
            <button type="button" onClick={() => setStep('ids')} className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"><ArrowLeft className="w-3.5 h-3.5" />Back</button>
            <button type="button" onClick={() => { setValuesText(''); setStep('values'); }} className="inline-flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white bg-brand-800 rounded-lg hover:bg-brand-900">Next<ArrowRight className="w-3.5 h-3.5" /></button>
          </>)}
          {step === 'values' && (<>
            <button type="button" onClick={() => setStep('field')} className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"><ArrowLeft className="w-3.5 h-3.5" />Back</button>
            {isForeman ? (
              <button type="button" onClick={applyForeman} disabled={busy || !foremanId || foremanToChange === 0}
                className="inline-flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-40">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Move {foremanId ? foremanToChange : 0} connection{foremanToChange === 1 ? '' : 's'}
              </button>
            ) : (
              <button type="button" onClick={apply} disabled={busy || !plan || plan.changes.length === 0}
                className="inline-flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 disabled:opacity-40">
                {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Fill {plan?.changes.length || 0} connection{plan?.changes.length === 1 ? '' : 's'}
              </button>
            )}
          </>)}
          {step === 'done' && (<>
            <button type="button" onClick={() => { setValuesText(''); setForemanId(''); setResult(null); setStep('field'); }} className="h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Fill another field for the same list</button>
            <button type="button" onClick={onClose} className="h-8 px-4 text-xs font-semibold text-white bg-brand-800 rounded-lg hover:bg-brand-900">Close</button>
          </>)}
        </div>
      </div>
    </div>
  );
};
