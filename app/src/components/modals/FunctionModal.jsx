import { useState } from 'react';
import { useRecords } from '../../lib/records.js';
import * as o from '../../lib/ops.js';
import { Modal, Label, field, btn, useCommit } from './Modal.jsx';

/* A function (a process of a department): its title and what it does. New when `id` is missing, then `depId` says where. */
export default function FunctionModal({ depId, id, onClose }) {
  const { data: d } = useRecords();
  const dep = d.departments.find((x) => x.id === (id ? d.departments.find((y) => y.sections.some((s) => s.id === id))?.id : depId)), sec = id ? dep?.sections.find((s) => s.id === id) : null;
  const [title, setTitle] = useState(sec?.title || ''), [note, setNote] = useState(sec?.note || '');
  const c = useCommit(onClose);
  if (!dep) return null;
  const files = sec ? d.sheets.filter((s) => s.sectionId === id).length : 0;
  const submit = () => c.run((x) => { const k = sec ? id : o.addSection(x, dep.id, title); o.updateSection(x, k, { title: title.trim() || null, note }); });
  return (
    <Modal title={sec ? `Function · ${sec.title || '(untitled)'}` : `New function in ${dep.name}`} onClose={onClose} onSubmit={submit} c={c}
      left={sec && <button type="button" disabled={!!files || c.busy} title={files ? `Move or delete its ${files} ${files === 1 ? 'file' : 'files'} first` : ''} className={`${btn} border-red-300 bg-white text-red-700 hover:bg-red-50`} onClick={() => c.run((x) => o.removeSection(x, id))}>Delete function</button>}>
      <p className="mb-3 text-sm text-slate-500">Department: <b>{dep.name}</b></p>
      <Label t="Title"><input autoFocus className={field} placeholder="For example: Weekly stock count" value={title} onChange={(e) => setTitle(e.target.value)} /></Label>
      <Label t="What it does"><textarea className={`${field} min-h-24`} placeholder="What this function does, and how (optional)" value={note} onChange={(e) => setNote(e.target.value)} /></Label>
    </Modal>
  );
}
