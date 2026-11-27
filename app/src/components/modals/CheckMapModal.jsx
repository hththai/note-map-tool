import { useState } from 'react';
import { useRecords, apply } from '../../lib/records.js';
import { validate } from '../../lib/schema.js';
import * as o from '../../lib/ops.js';
import { btn, quiet } from './Modal.jsx';

/* What is wrong with the open map: ticket ids whose letter does not match their type, and anything validate() reports. */
const mapProblems = (d) => ({ ids: o.planIdRepairs(d), invalid: validate(d) });

/* Check map: lists each problem. Ticket id mismatches have a checkbox (all ticked); "Repair selected" is one edit that you can Undo, and it is only
 * written to the file when you press Save, like any other change. Unticked rows stay as they are and keep being listed. */
export default function CheckMapModal({ onClose }) {
  const { data } = useRecords(), { ids, invalid } = mapProblems(data);
  const [off, setOff] = useState(() => new Set()), [done, setDone] = useState(null);
  const picked = ids.filter((r) => !off.has(r.from));
  const toggle = (from) => setOff((s) => { const n = new Set(s); n.has(from) ? n.delete(from) : n.add(from); return n; });
  const repair = () => { let fixed = []; if (apply((d) => { fixed = o.repairTicketIds(d, new Set(picked.map((r) => r.from))); })) { setDone(fixed.length); setOff(new Set()); } };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-slate-900/40 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Check map" className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Check map</h2><button type="button" aria-label="Close" className="text-xl text-slate-400 hover:text-slate-700" onClick={onClose}>×</button></div>
        <div className="max-h-[68vh] overflow-auto pr-1">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Ticket IDs that do not match their type ({ids.length})</h3>
          {ids.length ? (<>
            <p className="mb-2 text-sm text-slate-600">The type is taken as correct, so the ID changes to match it. The date stays. The old ID is kept on the ticket as “formerly …”. Untick a row to leave it as it is (fix its type in the ticket first if the type is the mistake).</p>
            <ul className="mb-2 space-y-1.5" aria-label="IDs to repair">{ids.map((r) => (
              <li key={r.from} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={!off.has(r.from)} onChange={() => toggle(r.from)} aria-label={`Repair ${r.from}`} />
                  <span className="min-w-0"><code className="text-xs text-slate-500">{r.from}</code> → <code className="text-xs font-semibold">{r.to}</code> <span className="text-xs text-slate-500">({r.type}{r.removed ? ', in Removed' : ''})</span>
                    <span className="block truncate text-slate-700">{r.title}</span>
                    {(r.kids > 0 || r.steps > 0) && <span className="block text-xs text-slate-500">Also updates {[r.kids && `${r.kids} ${r.kids === 1 ? 'item' : 'items'} in this project`, r.steps && `${r.steps} flow ${r.steps === 1 ? 'step' : 'steps'}`].filter(Boolean).join(' and ')}.</span>}</span></label>
              </li>))}</ul>
            <div className="mb-3 flex items-center gap-2"><button type="button" className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`} disabled={!picked.length} onClick={repair}>Repair selected ({picked.length})</button>
              <span className="text-xs text-slate-500">One change you can Undo. It is written to the file when you press Save.</span></div>
          </>) : <p className="mb-3 text-sm text-green-700" role="status">{done ? `Repaired ${done} ${done === 1 ? 'ID' : 'IDs'}. Press Save to keep ${done === 1 ? 'it' : 'them'} (or Undo).` : 'All ticket IDs match their type.'}</p>}
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Other problems ({invalid.length})</h3>
          {invalid.length ? <ul className="list-disc pl-5 text-sm text-red-800">{invalid.map((p, i) => <li key={i}>{p}</li>)}</ul> : <p className="text-sm text-slate-500">None found.</p>}
        </div>
        <div className="mt-4 flex justify-end"><button type="button" className={quiet} onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
