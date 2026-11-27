import { useRecords, apply } from '../lib/records.js';
import { restore, purge } from '../lib/ops.js';

const KIND = { sheet: 'Sheet', app: 'App', ticket: 'Ticket', note: 'Note', flowlink: 'Flow connection' };

/* Everything that was deleted, newest first. Restore puts it back exactly; Purge is the only real delete. */
export default function Removed() {
  const { data } = useRecords(), list = [...data.removed].reverse();
  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold tracking-tight">Removed</h1>
      <p className="mb-4 text-sm text-slate-500">Deleted entries wait here until you purge them. Restoring brings back the entry and its links in the same place.</p>
      {!list.length && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-400">Nothing removed.</p>}
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{KIND[r.kind] || r.kind}</span>
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.label}</div><div className="text-xs text-slate-500">removed {new Date(r.removedAt).toLocaleString()}{r.links?.length ? ` · ${r.links.length} link${r.links.length > 1 ? 's' : ''}` : ''}</div></div>
            <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:border-blue-500" onClick={() => apply((d) => restore(d, r.id))}>Restore</button>
            <button className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50" onClick={() => window.confirm(`Delete "${r.label}" for good? This cannot be undone.`) && apply((d) => purge(d, r.id))}>Purge</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
