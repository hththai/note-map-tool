import { useState } from 'react';
import { useRecords } from '../../lib/records.js';
import * as o from '../../lib/ops.js';
import { openTicketsForDepartment, openTicketsForSection } from '../../lib/rollup.js';
import { Modal, Label, Section, field, quiet, btn, useCommit } from './Modal.jsx';

const lines = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean);

/* A department: its name, what it does, its members, and its functions. New when `id` is missing. */
export default function DepartmentModal({ id, onClose, open }) {
  const { data: d } = useRecords(), dep = id ? d.departments.find((x) => x.id === id) : null;
  const [name, setName] = useState(dep?.name || ''), [text, setText] = useState((dep?.text || []).join('\n')), [members, setMembers] = useState(() => (dep?.members || []).map((m) => ({ ...m, email: m.email || '' }))), [newFn, setNewFn] = useState('');
  const c = useCommit(onClose);
  const files = dep ? d.sheets.filter((s) => s.departmentId === id).length : 0, tix = dep ? openTicketsForDepartment(d, id).length : 0;
  const blocker = !dep ? null : files ? `Move or delete its ${files} ${files === 1 ? 'file' : 'files'} first` : d.tickets.items.some((t) => t.targetId === id) ? 'Tickets are still about it' : dep.members?.length ? 'Remove its members first (then Save)' : null;
  const setM = (i, patch) => setMembers(members.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const submit = () => {
    if (!name.trim()) return c.setError('A department needs a name.');
    c.run((x) => { const k = dep ? id : o.addDepartment(x, name); o.updateDepartment(x, k, { name: name.trim(), text: lines(text) }); o.setMembers(x, k, members); });
  };
  return (
    <Modal title={dep ? `Department · ${dep.name}` : 'New department'} onClose={onClose} onSubmit={submit} c={c} wide
      left={dep && <button type="button" disabled={!!blocker || c.busy} title={blocker || ''} className={`${btn} border-red-300 bg-white text-red-700 hover:bg-red-50`} onClick={() => c.run((x) => o.removeDepartment(x, id))}>Delete department</button>}>
      <Label t="Name"><input autoFocus className={field} value={name} onChange={(e) => setName(e.target.value)} /></Label>
      <Label t="What they do"><textarea className={`${field} min-h-16`} placeholder="One line each" value={text} onChange={(e) => setText(e.target.value)} /></Label>
      <Section t={`Members (${members.length})`}>
        {members.map((m, i) => (
          <div key={m.id || i} className="mb-1 flex items-center gap-1">
            <input aria-label="Member name" className={field} placeholder="Name" value={m.name} onChange={(e) => setM(i, { name: e.target.value })} />
            <input aria-label="Member role" className={field} placeholder="Role" value={m.role} onChange={(e) => setM(i, { role: e.target.value })} />
            <input aria-label="Member email" className={field} placeholder="Email (optional)" value={m.email} onChange={(e) => setM(i, { email: e.target.value })} />
            <button type="button" aria-label={`Remove ${m.name || 'member'}`} className="px-1 text-slate-400 hover:text-red-700" onClick={() => setMembers(members.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className={quiet} onClick={() => setMembers([...members, { name: '', role: '', email: '' }])}>+ Add member</button>
      </Section>
      {dep && (
        <Section t={`Functions (${dep.sections.length}) · ${tix} open ${tix === 1 ? 'ticket' : 'tickets'}`}>
          {dep.sections.map((sec, i) => { const n = d.sheets.filter((s) => s.sectionId === sec.id).length, t = openTicketsForSection(d, sec.id).length; return (
            <div key={sec.id} className="mb-1 flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-sm">
              <button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:text-blue-700" onClick={() => open('function', { depId: id, id: sec.id })}>{sec.title || '(untitled)'}</button>
              <span className="shrink-0 text-xs text-slate-500">{n} {n === 1 ? 'file' : 'files'}{t ? ` · ${t} open` : ''}</span>
              <button type="button" aria-label={`Move ${sec.title || 'function'} up`} disabled={i === 0 || c.busy} className="px-1 text-slate-500 disabled:opacity-30" onClick={() => c.act((x) => o.shiftSection(x, sec.id, -1))}>↑</button>
              <button type="button" aria-label={`Move ${sec.title || 'function'} down`} disabled={i === dep.sections.length - 1 || c.busy} className="px-1 text-slate-500 disabled:opacity-30" onClick={() => c.act((x) => o.shiftSection(x, sec.id, 1))}>↓</button>
            </div>); })}
          <div className="mt-1 flex gap-1"><input aria-label="New function title" className={field} placeholder="New function (process) title" value={newFn} onChange={(e) => setNewFn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newFn.trim()) c.act((x) => o.addSection(x, id, newFn)).then((ok) => ok && setNewFn('')); } }} />
            <button type="button" className={quiet} disabled={!newFn.trim() || c.busy} onClick={() => c.act((x) => o.addSection(x, id, newFn)).then((ok) => ok && setNewFn(''))}>Add function</button></div>
          <p className="mt-1 text-xs text-slate-400">Moving or adding a function saves at once.</p>
        </Section>
      )}
    </Modal>
  );
}
