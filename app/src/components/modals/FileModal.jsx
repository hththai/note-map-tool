import { useState } from 'react';
import { useRecords } from '../../lib/records.js';
import * as o from '../../lib/ops.js';
import { FILE_TYPE_LABEL } from '../../lib/schema.js';
import { functionOptions } from '../../lib/pick.js';
import { membersOf, openTicketsForSheet } from '../../lib/rollup.js';
import { Modal, Label, Section, field, quiet, btn, useCommit } from './Modal.jsx';
import Combo from './Combo.jsx';

const recentFn = () => { try { return localStorage.getItem('lastFunction'); } catch { return null; } };
const STATUS = { todo: 'To do', doing: 'In progress', blocked: 'Blocked', done: 'Done' };

/* A file (sheet, doc...) or an app: everything about it, editable in one place. New when `id` is missing. */
export default function FileModal({ id, sectionId = '', kind: kindIn = 'sheet', onClose, open }) {
  const { data: d } = useRecords(), sheet = id ? d.sheets.find((x) => x.id === id) : null, kind = sheet?.kind || kindIn, isApp = kind === 'app';
  const [v, setV] = useState(() => ({ name: sheet?.name || '', owner: sheet?.owner || '', crit: sheet?.crit || '', type: sheet?.type || 'sheet', url: sheet?.url || '', note: sheet?.note || '', sectionId: sheet?.sectionId || sectionId || '' }));
  const [docs, setDocs] = useState(() => (sheet?.docs || []).map((x) => ({ ...x })));
  const c = useCommit(onClose);
  if (id && !sheet) return null;
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const dep = d.departments.find((x) => x.sections.some((s) => s.id === v.sectionId));
  const submit = () => {
    if (!v.name.trim()) return c.setError(`${isApp ? 'An app' : 'A file'} needs a name.`);
    if (!isApp && !dep) return c.setError('Choose the function this file belongs to.');
    const patch = { name: v.name.trim(), owner: v.owner.trim(), crit: v.crit || null, url: v.url.trim() || null, note: v.note, ...(isApp ? {} : { type: v.type }) };
    c.run((x) => {
      const k = sheet ? id : o.addSheet(x, { kind, name: v.name, departmentId: dep?.id ?? null, sectionId: isApp ? null : v.sectionId });
      o.updateSheet(x, k, patch); o.setDocs(x, k, docs);
      if (sheet && !isApp && v.sectionId !== sheet.sectionId) o.moveSheet(x, k, v.sectionId);
    }).then((ok) => { if (ok && !isApp) try { localStorage.setItem('lastFunction', v.sectionId); } catch { /* not remembered */ } });
  };
  const nameOf = (x) => d.sheets.find((s) => s.id === x)?.name ?? '?';
  const feeds = sheet ? d.links.filter((l) => l.fromId === id) : [], fedBy = sheet ? d.links.filter((l) => l.toId === id) : [], tix = sheet ? openTicketsForSheet(d, id) : [];
  const flows = sheet ? d.flows.flatMap((f) => f.steps.filter((s) => s.sheetId === id).map((s) => ({ f, s }))) : [];
  const setDoc = (i, patch) => setDocs(docs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const noun = isApp ? 'app' : 'file';
  return (
    <Modal title={sheet ? `${isApp ? 'App' : 'File'} · ${sheet.name}` : `New ${noun}`} onClose={onClose} onSubmit={submit} c={c} wide
      left={sheet && <button type="button" disabled={c.busy} className={`${btn} border-red-300 bg-white text-red-700 hover:bg-red-50`} title="You can restore it from Removed" onClick={() => c.run((x) => o.removeSheet(x, id))}>Move to Removed</button>}>
      <Label t="Name"><input autoFocus className={field} value={v.name} onChange={set('name')} /></Label>
      {!isApp && (
        <Label t="Function">
          <Combo label="Function" options={functionOptions(d)} value={v.sectionId} onChange={(x) => setV({ ...v, sectionId: x })} recent={recentFn()} placeholder="Type a department or function…" />
          {sheet && v.sectionId === sheet.sectionId && (
            <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">Order in its function:
              <button type="button" aria-label="Move up in its function" className="px-1 disabled:opacity-30" disabled={c.busy} onClick={() => c.act((x) => o.shiftSheet(x, id, -1))}>↑</button>
              <button type="button" aria-label="Move down in its function" className="px-1 disabled:opacity-30" disabled={c.busy} onClick={() => c.act((x) => o.shiftSheet(x, id, 1))}>↓</button> (saves at once)</span>
          )}
        </Label>
      )}
      <div className="grid grid-cols-2 gap-x-3">
        <Label t="Owner"><input className={field} list="file-owners" value={v.owner} onChange={set('owner')} /><datalist id="file-owners">{(dep ? membersOf(d, dep.id) : []).map((m) => <option key={m.id} value={m.name}>{m.role}</option>)}</datalist></Label>
        <Label t="Criticality"><select className={field} value={v.crit} onChange={set('crit')}><option value="">None</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Label>
        {!isApp && <Label t="File type"><select className={field} value={v.type} onChange={set('type')}>{Object.entries(FILE_TYPE_LABEL).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select></Label>}
        <Label t="Link (URL)"><input type="url" className={field} placeholder="https://" value={v.url} onChange={set('url')} /></Label>
      </div>
      <Label t="Note"><textarea className={`${field} min-h-16`} value={v.note} onChange={set('note')} /></Label>
      <Section t="Documentation links">
        {docs.map((x, i) => (
          <div key={i} className="mb-1 flex gap-1">
            <input aria-label="Documentation label" className={`${field} !w-32`} placeholder="Label" value={x.label} onChange={(e) => setDoc(i, { label: e.target.value })} />
            <input aria-label="Documentation address" type="url" className={field} placeholder="https://" value={x.url} onChange={(e) => setDoc(i, { url: e.target.value })} />
            <button type="button" aria-label={`Remove documentation link ${i + 1}`} className="px-1 text-slate-400 hover:text-red-700" onClick={() => setDocs(docs.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button type="button" className={quiet} onClick={() => setDocs([...docs, { label: '', url: '' }])}>+ Add link</button>
      </Section>
      {sheet && (
        <>
          <Section t="Connected">
            {fedBy.length || feeds.length ? <div className="flex flex-wrap gap-1 text-xs">
              {fedBy.map((l) => <button type="button" key={l.id} className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 hover:bg-emerald-100" onClick={() => open('link', { id: l.id })}>{l.fromId ? nameOf(l.fromId) : l.fromName} → this{l.label ? ` · ${l.label}` : ''}</button>)}
              {feeds.map((l) => <button type="button" key={l.id} className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 hover:bg-emerald-100" onClick={() => open('link', { id: l.id })}>this → {l.toId ? nameOf(l.toId) : l.toName}{l.label ? ` · ${l.label}` : ''}</button>)}
            </div> : <span className="text-sm text-slate-400">Nothing connected yet. Drag from the edge of this card to another on the map, or use + Link.</span>}
          </Section>
          <Section t={`Open tickets (${tix.length})`}>
            {tix.map((t) => <button type="button" key={t.id} className="mb-1 flex w-full justify-between gap-2 rounded border border-slate-200 px-2 py-1 text-left text-sm hover:border-blue-500" onClick={() => open('ticket', { id: t.id })}><span><code className="text-xs text-slate-500">{t.id}</code> {t.title}</span><span className={`shrink-0 text-xs ${t.status === 'blocked' ? 'text-red-700' : 'text-slate-500'}`}>{STATUS[t.status]}</span></button>)}
            <button type="button" className={quiet} onClick={() => open('ticket', { preset: { targetId: id } })}>+ New ticket</button>
          </Section>
          {flows.length > 0 && <Section t={`In flows (${flows.length})`}>{flows.map((x, i) => <div key={i} className="text-sm"><b>{x.f.title}</b> › {x.s.title} <span className="text-xs text-slate-500">({x.s.team})</span></div>)}</Section>}
        </>
      )}
    </Modal>
  );
}
