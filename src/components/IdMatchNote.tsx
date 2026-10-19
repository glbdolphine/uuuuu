import React, { useState } from 'react';
import { IdMatchResult } from '../utils/markIds';

export const IdMatchNote: React.FC<{ result: IdMatchResult; noun: string }> = ({ result, noun }) => {
  const [copied, setCopied] = useState(false);
  const { pasted, found, already, target, duplicates, missing } = result;
  const copy = async () => {
    try { await navigator.clipboard.writeText(missing.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div className="text-[11px] text-slate-600 space-y-1.5">
      <p>
        <span className="font-semibold">{pasted}</span> pasted · <span className="font-semibold text-emerald-700">{found.length}</span> matched
        {already.length > 0 && <> ({already.length} already {noun})</>}
        {target.length > 0 && <> · <span className="font-semibold">{target.length}</span> sent</>}
        {duplicates.length > 0 && <> · {duplicates.length} repeated ID{duplicates.length === 1 ? '' : 's'} ignored</>}
      </p>
      {missing.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-rose-700">{missing.length} not found (no connection yet)</span>
            <button type="button" onClick={copy} className="px-2 py-0.5 text-[10px] font-semibold text-rose-700 bg-white border border-rose-200 rounded-full hover:bg-rose-100">
              {copied ? 'Copied' : 'Copy list'}
            </button>
          </div>
          <p className="mt-1 font-mono text-rose-800 break-words max-h-28 overflow-y-auto select-text">{missing.join(', ')}</p>
        </div>
      )}
      {duplicates.length > 0 && (
        <p className="text-slate-500 break-words">Repeated: <span className="font-mono">{duplicates.slice(0, 20).join(', ')}{duplicates.length > 20 ? '…' : ''}</span></p>
      )}
    </div>
  );
};
