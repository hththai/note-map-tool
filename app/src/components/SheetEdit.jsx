import { useEffect, useId, useState } from 'react';
import { useRecords, apply } from '../lib/records.js';
import { updateSheet, removeSheet, addDoc, updateDoc, removeDoc } from '../lib/ops.js';
import { membersOf, ownerStatus } from '../lib/rollup.js';
import { CommitInput, Btn } from './ui.jsx';

import { FILE_TYPE_LABEL } from '../lib/schema.js';

const Field = ({ label, children }) => <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}<div className="mt-0.5 text-sm font-normal normal-case tracking-normal text-slate-900">{children}</div></label>;
const input = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500';

/* Edit one sheet or app. Typing is one undo step per field; the name is applied when you leave the field. */
export default function SheetEdit({ k, onSel }) {
  const { data } = useRecords(), sheet = data.sheets.find((x) => x.name.toLowerCase() === k);
  const [name, setName] = useState(sheet?.name ?? ''), [sure, setSure] = useState(false), [docUrl, setDocUrl] = useState(''), [docLabel, setDocLabel] = useState(''), listId = useId();
  useEffect(() => { setName(sheet?.name ?? ''); setSure(false); }, [sheet?.id, sheet?.name]);
  if (!sheet) return null;
  const set = (patch, field) => apply((d) => updateSheet(d, sheet.id, patch), { key: `sheet:${sheet.id}:${field}` });
  const commitName = () => { const v = name.trim(); if (!v) return setName(sheet.name); if (v !== sheet.name && set({ name: v }, 'name') !== false) onSel(v.toLowerCase()); };
  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3" open>
      <summary className="cursor-pointer text-sm font-semibold">Edit this {sheet.kind}</summary>
      <div className="mt-3">
        <Field label="Name"><input className={input} value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} /></Field>
        <Field label="Owner">
          <input className={input} list={listId} value={sheet.owner} onChange={(e) => set({ owner: e.target.value }, 'owner')} />
          <datalist id={listId}>{membersOf(data, sheet.departmentId).map((m) => <option key={m.id} value={m.name}>{m.role}</option>)}</datalist>
          {ownerStatus(data, sheet) === 'other' && membersOf(data, sheet.departmentId).length > 0 && <span className="mt-0.5 block text-xs text-slate-500">Not a member of this department (kept as typed).</span>}
        </Field>
        {sheet.kind === 'sheet' && <Field label="File type"><select className={input} value={sheet.type || 'sheet'} onChange={(e) => set({ type: e.target.value }, 'type')}>{Object.entries(FILE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
        <Field label="Criticality">
          <select className={input} value={sheet.crit || ''} onChange={(e) => set({ crit: e.target.value || null }, 'crit')}><option value="">None</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
        </Field>
        <Field label="Link (URL)"><input className={input} type="url" placeholder="https://" value={sheet.url || ''} onChange={(e) => set({ url: e.target.value || null }, 'url')} /></Field>
        <div className="mb-2" role="group" aria-label="Documentation links">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Documentation links</div>
          {(sheet.docs || []).map((x, i) => (
            <div key={i} className="mt-1 flex items-center gap-1">
              <CommitInput aria-label="Documentation label" className="!w-24" placeholder="Label" value={x.label} onCommit={(v) => apply((d) => updateDoc(d, sheet.id, i, { label: v.trim() }))} />
              <CommitInput aria-label="Documentation address" placeholder="https://" value={x.url} onCommit={(v) => v.trim() && apply((d) => updateDoc(d, sheet.id, i, { url: v.trim() }))} />
              <Btn danger aria-label={`Remove documentation link ${i + 1}`} onClick={() => apply((d) => removeDoc(d, sheet.id, i))}>×</Btn>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-1">
            <input aria-label="New documentation label" className={`${input} !w-24`} placeholder="Label" value={docLabel} onChange={(e) => setDocLabel(e.target.value)} />
            <input aria-label="New documentation address" className={input} type="url" placeholder="https://" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} />
            <Btn disabled={!docUrl.trim()} onClick={() => { if (apply((d) => addDoc(d, sheet.id, { label: docLabel, url: docUrl }))) { setDocUrl(''); setDocLabel(''); } }}>Add</Btn>
          </div>
        </div>
        <Field label="Note"><textarea className={`${input} min-h-20`} value={sheet.note} onChange={(e) => set({ note: e.target.value }, 'note')} /></Field>
        {!sure ? <button className="rounded-lg border border-red-300 bg-white px-3 py-1 text-sm text-red-700 hover:bg-red-50" onClick={() => setSure(true)}>Delete…</button> : (
          <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm">
            <p className="mb-2">Move <b>{sheet.name}</b> to Removed? Its links go with it. You can restore it any time.</p>
            <button className="mr-2 rounded-lg bg-red-600 px-3 py-1 text-white hover:bg-red-700" onClick={() => { apply((d) => removeSheet(d, sheet.id)); onSel(null); }}>Move to Removed</button>
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1" onClick={() => setSure(false)}>Cancel</button>
          </div>
        )}
      </div>
    </details>
  );
}
