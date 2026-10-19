import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, SlidersHorizontal, Search } from 'lucide-react';
import { FieldSuggestionsMap } from '../types';
import { ScrollLock } from './ScrollLock';

interface SuggestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: FieldSuggestionsMap;
  onUpdateSuggestions: (updated: FieldSuggestionsMap) => void;
}

const LABELS: Record<string, string> = {
  foremanName: 'Foreman name',
  foremanPhone: 'Foreman phone',
  requestType: 'Request type',
  customerName: 'Institute name',
  nmsId: 'NMS ID',
  issueFound: 'Issue found',
  missingWrongDetails: 'Missing or wrong details',
  actionTaken: 'Action taken',
  reasonForAction: 'Reason for action',
  foremanInformed: 'Foreman informed',
  followUpNeeded: 'Follow-up needed',
  status: 'Status',
  supervisorInformed: 'Supervisor informed',
  remarks: 'Remarks',
  mac: 'MAC address',
};

const labelOf = (key: string) =>
  LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export const SuggestionsModal: React.FC<SuggestionsModalProps> = ({
  isOpen,
  onClose,
  suggestions,
  onUpdateSuggestions,
}) => {
  const [localMap, setLocalMap] = useState<FieldSuggestionsMap>({ ...suggestions });
  const [activeTab, setActiveTab] = useState<string>(Object.keys(suggestions)[0] || 'foremanName');
  const [newVal, setNewVal] = useState('');
  const [query, setQuery] = useState('');

  // Start from the latest saved lists every time the window opens.
  useEffect(() => {
    if (!isOpen) return;
    setLocalMap({ ...suggestions });
    setActiveTab((cur) => (cur in suggestions ? cur : Object.keys(suggestions)[0] || 'foremanName'));
    setNewVal('');
    setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const keys = Object.keys(localMap);
  const currentList = localMap[activeTab] || [];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? currentList.filter((x) => x.toLowerCase().includes(q)) : currentList;
  }, [currentList, query]);

  if (!isOpen) return null;

  const commit = (nextList: string[]) => {
    const nextMap = { ...localMap, [activeTab]: nextList };
    setLocalMap(nextMap);
    onUpdateSuggestions(nextMap);
  };

  const handleAdd = () => {
    const trimmed = newVal.trim();
    if (!trimmed || currentList.includes(trimmed)) return;
    commit([...currentList, trimmed]);
    setNewVal('');
  };

  const handleRemove = (item: string) => commit(currentList.filter((x) => x !== item));

  const pick = (key: string) => { setActiveTab(key); setNewVal(''); setQuery(''); };
  const duplicate = Boolean(newVal.trim()) && currentList.includes(newVal.trim());

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/45 backdrop-blur-xs">
      <ScrollLock />
      <div
        role="dialog" aria-modal="true" aria-label="Saved suggestions"
        className="bg-white rounded-3xl border border-slate-100 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[min(40rem,88vh)]"
      >
        {/* Header */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-100 flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-brand-50 text-brand-700"><SlidersHorizontal className="w-4 h-4" /></span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold text-[#1b2a4e]">Saved suggestions</h2>
            <p className="text-xs text-slate-500">The choices people see when they fill in a connection.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="ml-auto grid place-items-center w-9 h-9 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Field picker: a list on wide screens, a dropdown on phones */}
          <nav className="hidden md:block w-60 shrink-0 border-r border-slate-100 bg-slate-50/60 overflow-y-auto p-3" aria-label="Fields">
            {keys.map((key) => {
              const active = activeTab === key;
              return (
                <button key={key} onClick={() => pick(key)} aria-current={active ? 'true' : undefined}
                  className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl text-[13px] transition-colors ${active ? 'bg-brand-700 text-white font-semibold shadow-sm' : 'text-slate-600 hover:bg-white'}`}>
                  <span className="flex-1 min-w-0 truncate">{labelOf(key)}</span>
                  <span className={`shrink-0 text-[11px] tabular-nums px-1.5 rounded-full ${active ? 'bg-white/20 text-white' : 'text-slate-400'}`}>{localMap[key]?.length || 0}</span>
                </button>
              );
            })}
          </nav>
          <div className="md:hidden shrink-0 px-4 pt-3">
            <select value={activeTab} onChange={(e) => pick(e.target.value)} aria-label="Field"
              className="w-full h-10 px-3 text-sm text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-600">
              {keys.map((key) => <option key={key} value={key}>{labelOf(key)} ({localMap[key]?.length || 0})</option>)}
            </select>
          </div>

          {/* Editor */}
          <section className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="shrink-0 px-5 pt-5 pb-3 space-y-3">
              <div className="flex items-baseline gap-2">
                <h3 className="text-base font-bold text-[#1b2a4e]">{labelOf(activeTab)}</h3>
                <span className="text-xs text-slate-400 tabular-nums">{currentList.length} saved</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text" value={newVal} onChange={(e) => setNewVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                  placeholder={`Add a ${labelOf(activeTab).toLowerCase()} suggestion`}
                  className="flex-1 min-w-0 h-10 px-3.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                />
                <button onClick={handleAdd} disabled={!newVal.trim() || duplicate}
                  className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 text-sm font-semibold text-white bg-brand-700 hover:bg-brand-800 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <Plus className="w-4 h-4" />Add
                </button>
              </div>
              {duplicate && <p className="text-xs text-amber-600">That suggestion is already in the list.</p>}
              {currentList.length > 6 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this list"
                    className="w-full h-9 pl-9 pr-3 text-[13px] bg-slate-50 border border-transparent rounded-xl focus:outline-none focus:bg-white focus:border-slate-200" />
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
              {currentList.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-10 text-xs text-slate-400 text-center">Nothing saved for this field yet. Add the first suggestion above.</p>
              ) : shown.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-10 text-xs text-slate-400 text-center">No suggestion matches "{query}".</p>
              ) : (
                <ul className="space-y-1.5">
                  {shown.map((item) => (
                    <li key={item} className="group flex items-start gap-3 pl-4 pr-2 py-2.5 bg-white border border-slate-100 rounded-xl text-[13px] text-slate-700 hover:border-slate-200 hover:bg-slate-50/70 transition-colors">
                      <span className="flex-1 min-w-0 break-words leading-snug py-0.5">{item}</span>
                      <button onClick={() => handleRemove(item)} title="Delete suggestion" aria-label={`Delete ${item}`}
                        className="shrink-0 grid place-items-center w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">Changes save as you make them.</p>
          <button onClick={onClose} className="h-9 px-5 text-sm font-semibold text-white bg-brand-800 hover:bg-brand-900 rounded-xl transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
};
