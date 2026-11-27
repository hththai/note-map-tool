import { useState } from 'react';
import { createMap } from '../lib/records.js';
import { slugFromTitle } from '../lib/pick.js';
import { Btn } from './ui.jsx';

/* Start a map from nothing: only a title. The file name is made from it (and numbered if it is taken). */
export default function NewMap({ onCreated, onCancel, taken = [] }) {
  const [title, setTitle] = useState(''), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); e.stopPropagation(); setBusy(true); setErr(null);
    const name = slugFromTitle(title, taken);
    try { await createMap(name, title); onCreated(name); } catch (x) { setErr(x.message); setBusy(false); }
  };
  const f = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500';
  return (
    <form onSubmit={go} onKeyDown={(e) => e.key === 'Escape' && onCancel?.()} className="rounded-xl border border-slate-200 bg-white p-3 text-sm" aria-label="New map">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">Title<input className={f} required autoFocus placeholder="For example: Finance sheets" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      {err && <p role="alert" className="mb-2 text-red-700">{err}</p>}
      <div className="flex gap-2"><Btn primary type="submit" disabled={busy || !title.trim()}>Create map</Btn>{onCancel && <Btn onClick={onCancel}>Cancel</Btn>}</div>
    </form>
  );
}
