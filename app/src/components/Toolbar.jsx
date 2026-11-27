import { useEffect } from 'react';
import { useRecords, isDirty, save, undo, redo, resolveConflict } from '../lib/records.js';

const inField = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

/* Save, undo and redo for the open map, the unsaved dot, and the "file changed on disk" prompt. */
export default function Toolbar() {
  const r = useRecords(), dirty = isDirty(r);
  useEffect(() => {
    const key = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
      else if (mod && e.key.toLowerCase() === 'z' && !inField()) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    };
    const leave = (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('keydown', key); window.addEventListener('beforeunload', leave);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', leave); };
  }, []);
  const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-blue-500 disabled:opacity-40 disabled:hover:border-slate-300';
  return (
    <>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-1.5">
        <span className={`mr-auto text-sm ${dirty ? 'font-medium text-amber-700' : 'text-slate-500'}`} role="status">
          {dirty ? '● Unsaved changes' : r.status === 'saved' ? `✓ Saved ${r.savedAt.toLocaleTimeString()}` : '✓ Nothing to save'}
        </span>
        <button className={btn} disabled={!r.undo.length} onClick={undo} title="Undo (⌘Z)">Undo</button>
        <button className={btn} disabled={!r.redo.length} onClick={redo} title="Redo (⇧⌘Z)">Redo</button>
        <button className={`${btn} !border-blue-600 !bg-blue-600 text-white hover:!bg-blue-700`} disabled={!dirty || r.status === 'saving'} onClick={() => save()} title="Save (⌘S)">{r.status === 'saving' ? 'Saving…' : 'Save'}</button>
      </div>
      {r.conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm">
          <span className="mr-auto"><b>This map changed on disk</b> since you opened it (another tab, or an edit outside the app). Nothing was overwritten.</span>
          <button className={btn} onClick={() => resolveConflict('reload')}>Reload (discard my edits)</button>
          <button className={btn} onClick={() => resolveConflict('overwrite')}>Overwrite (keep my edits)</button>
        </div>
      )}
      {r.notice && <div role="status" className="border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">{r.notice}</div>}
      {r.error && <div role="alert" className="border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">{r.error}</div>}
    </>
  );
}
