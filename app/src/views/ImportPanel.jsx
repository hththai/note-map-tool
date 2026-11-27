import { useEffect, useState } from 'react';
import { previewImport, createFromLegacy } from '../lib/records.js';

/* A map that still only exists as old files: show what would be imported and that nothing is lost, then create the Data file. */
export default function ImportPanel({ name }) {
  const [p, setP] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { setP(null); setErr(null); previewImport(name).then(setP).catch((e) => setErr(e.message)); }, [name]);
  if (err) return <div className="p-8 text-red-700">{err}</div>;
  if (!p) return <div className="p-8 text-slate-500">Checking the old files…</div>;
  const c = p.report.counts, ok = !p.problems.length;
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Import “{name}” into the new format</h1>
      <p className="mb-4 text-sm text-slate-600">This map only exists as the old files. The import reads them, checks that nothing is lost, and creates one new data file. The old files are not touched.</p>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        {c.departments} departments · {c.sheets} sheets and apps · {c.links} links · {c.flows} flows ({c.steps} steps) · {c.tickets} tickets
        <div className={`mt-2 font-medium ${ok ? 'text-emerald-700' : 'text-red-700'}`}>{ok ? '✓ Checked: nothing is lost' : '✗ ' + p.problems.join('; ')}</div>
        {p.report.unresolved.length > 0 && <div className="mt-2 text-slate-600">Kept by name, because they point at something not on the map:<ul className="ml-5 list-disc">{p.report.unresolved.map((u) => <li key={u}>{u}</li>)}</ul></div>}
      </div>
      <button disabled={!ok || busy} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-40" onClick={() => { setBusy(true); createFromLegacy(name, p.data).catch((e) => { setErr(e.message); setBusy(false); }); }}>{busy ? 'Creating…' : 'Create the data file'}</button>
    </div>
  );
}
