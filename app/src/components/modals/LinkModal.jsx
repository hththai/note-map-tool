import { useState } from 'react';
import { useRecords } from '../../lib/records.js';
import * as o from '../../lib/ops.js';
import { sheetOptions } from '../../lib/pick.js';
import { Modal, Label, field, quiet, btn, useCommit } from './Modal.jsx';
import Combo from './Combo.jsx';

const METHODS = ['IMPORTRANGE', 'manual copy'];

/* A link: data flowing from one file to another, and how. New when `id` is missing. */
export default function LinkModal({ id, fromId = '', toId = '', onClose }) {
  const { data: d } = useRecords(), link = id ? d.links.find((x) => x.id === id) : null;
  const [from, setFrom] = useState(link?.fromId || fromId), [to, setTo] = useState(link?.toId || toId), [label, setLabel] = useState(link?.label || '');
  const c = useCommit(onClose), options = sheetOptions(d);
  if (id && !link) return null;
  const submit = () => {
    if (!from || !to) return c.setError('Choose where the data comes from and where it goes.');
    if (from === to) return c.setError('A link needs two different files.');
    c.run((x) => { if (link) o.updateLink(x, id, { fromId: from, toId: to, label: label.trim() }); else o.addLink(x, { fromId: from, toId: to, label: label.trim() }); });
  };
  return (
    <Modal title={link ? 'Link' : 'New link'} onClose={onClose} onSubmit={submit} c={c}
      left={link && <button type="button" disabled={c.busy} className={`${btn} border-red-300 bg-white text-red-700 hover:bg-red-50`} title="You can restore it from Removed" onClick={() => c.run((x) => o.removeLink(x, id))}>Move to Removed</button>}>
      <Label t="From (the data starts here)"><Combo label="From" options={options} value={from} onChange={setFrom} autoFocus={!from} /></Label>
      <Label t="To (the data arrives here)"><Combo label="To" options={options} value={to} onChange={setTo} /></Label>
      <Label t="How does the data move?">
        <input className={field} placeholder="IMPORTRANGE, manual copy…" value={label} onChange={(e) => setLabel(e.target.value)} />
        <span className="mt-1 flex gap-1">{METHODS.map((m) => <button type="button" key={m} className={quiet} onClick={() => setLabel(m)}>{m}</button>)}</span>
      </Label>
    </Modal>
  );
}
