import { useEffect, useState } from 'react';
import { commit, resolveConflict, getState, useRecords } from '../../lib/records.js';

export const field = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500';
export const Label = ({ t, children }) => <label className="mb-3 block text-xs font-semibold uppercase tracking-wider text-slate-500">{t}<div className="mt-0.5 text-sm font-normal normal-case tracking-normal text-slate-900">{children}</div></label>;
export const Section = ({ t, children }) => <div className="mb-3 border-t border-slate-200 pt-2"><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t}</div>{children}</div>;
export const btn = 'rounded-lg border px-3 py-1 text-sm disabled:opacity-40';
export const quiet = `${btn} border-slate-300 bg-white hover:border-blue-500`;

/* What every modal does when you press Save: apply the change and write the file at once, then close. A refusal or a failed write stays in the
 * modal. If the file changed on disk, the modal offers Reload or Overwrite. `act` is the same for a row action that should not close the modal. */
export function useCommit(onClose) {
  const rec = useRecords(), [busy, setBusy] = useState(false), [error, setError] = useState(null), [conflict, setConflict] = useState(false);
  useEffect(() => { if (conflict && !rec.conflict) { setConflict(false); if (rec.status === 'saved') onClose(); } }, [rec.conflict, rec.status]);
  const go = async (fn, close) => {
    setBusy(true); setError(null);
    const r = await commit(fn); setBusy(false);
    if (r.ok) { if (close) onClose(); } else if (r.conflict) setConflict(true); else setError(r.error);
    return r.ok;
  };
  const resolve = async (choice) => {
    await resolveConflict(choice); const st = getState();
    if (choice === 'reload' || st.status === 'saved') onClose(); else setError(st.error || 'Could not save.');
  };
  return { busy, error, conflict, setError, run: (fn) => go(fn, true), act: (fn) => go(fn, false), resolve };
}

/* The shell of every modal. Enter saves, Escape closes without saving, the fields are a draft until Save. */
export function Modal({ title, onClose, onSubmit, children, c, submitLabel = 'Save', left, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-slate-900/40 p-4" role="presentation">
      <form role="dialog" aria-modal="true" aria-label={title} className={`my-auto w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-2xl bg-white p-5 shadow-2xl`}
        onSubmit={(e) => { e.preventDefault(); if (!c.busy) onSubmit(); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><button type="button" aria-label="Close" className="text-xl text-slate-400 hover:text-slate-700" onClick={onClose}>×</button></div>
        <div className="max-h-[68vh] overflow-auto pr-1">{children}</div>
        {c.error && <p role="alert" className="mt-2 rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-800">{c.error}</p>}
        {c.conflict && (
          <div role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm">
            <b>This map changed on disk</b> since you opened it. Nothing was overwritten.
            <div className="mt-1 flex gap-2"><button type="button" className={quiet} onClick={() => c.resolve('reload')}>Reload (discard my edits)</button><button type="button" className={quiet} onClick={() => c.resolve('overwrite')}>Overwrite (keep my edits)</button></div>
          </div>
        )}
        <div className="mt-4 flex items-center gap-2">{left}<span className="ml-auto" /><button type="button" className={`${btn} border-slate-300 bg-white`} onClick={onClose}>Cancel</button><button type="submit" disabled={c.busy} className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}>{c.busy ? 'Saving…' : submitLabel}</button></div>
      </form>
    </div>
  );
}
