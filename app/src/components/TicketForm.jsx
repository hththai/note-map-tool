import { useState } from 'react';
import { useRecords, apply } from '../lib/records.js';
import * as o from '../lib/ops.js';
import { Btn } from './ui.jsx';
import { useCommit } from './modals/Modal.jsx';
import { memberNamesFor } from '../lib/rollup.js';

const L = ({ t, children }) => <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">{t}<div className="mt-0.5 text-sm font-normal normal-case tracking-normal text-slate-900">{children}</div></label>;
const f = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500';
const TYPES = [['ticket', 'Ticket'], ['project', 'Project'], ['change', 'Change request'], ['feature', 'Feature']];
const STATUS = [['todo', 'To do'], ['doing', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']];
const PRIORITY = [['urgent', 'Urgent'], ['high', 'High'], ['normal', 'Normal'], ['low', 'Low']];
const DECISION = [['proposed', 'Proposed'], ['approved', 'Approved'], ['rejected', 'Rejected']];

/* New or existing ticket, project, change request or feature. Fields are applied together with Save (or Create);
 * the time log is applied as you add and remove entries. */
export default function TicketForm({ id, onClose, onOpen, preset = {} }) {
  const { data } = useRecords(), t = id ? data.tickets.items.find((x) => x.id === id) : null;
  const [v, setV] = useState(() => t ? { ...t, priority: t.priority || 'normal' } : { type: 'ticket', status: 'todo', priority: 'normal', title: '', ...preset });
  const [hours, setHours] = useState(''), [logNote, setLogNote] = useState(''), [sure, setSure] = useState(false);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const projects = data.tickets.items.filter((x) => x.type === 'project' && x.id !== id), live = t || null;
  /* a saved project lists what belongs to it; anything that is not a project and not yet in one can be linked */
  const kids = live?.type === 'project' ? data.tickets.items.filter((x) => x.project === id) : null, loose = kids ? data.tickets.items.filter((x) => x.type !== 'project' && !x.project) : [];
  const link = (tid, project) => apply((d) => o.updateTicket(d, tid, { project }));
  const clean = () => {
    const change = v.type === 'change';
    return {
      title: v.title, description: v.description || undefined, type: v.type, status: v.status, owner: v.owner || '', url: v.url || undefined, notes: v.notes || undefined,
      priority: v.priority === 'normal' ? undefined : v.priority, blocked: v.status === 'blocked' ? v.blocked || '' : undefined,
      project: v.type === 'project' ? undefined : v.project || undefined,
      requestedBy: change ? v.requestedBy || undefined : undefined, requested: change ? v.requested || undefined : undefined, impact: change ? v.impact || undefined : undefined, decision: change ? v.decision || 'proposed' : undefined,
      targetId: v.targetId || undefined, targetRaw: v.targetId ? undefined : v.targetRaw,
    };
  };
  const c = useCommit(onClose);
  /* the id letter follows the type: say what the id will become, and stop a project that still has items from changing type */
  const retyped = !!(live && v.type !== live.type), nextId = retyped ? o.idForType(data, live, v.type) : null;
  const stuck = retyped && live.type === 'project' ? data.tickets.items.filter((x) => x.project === id).length : 0;
  const submit = () => { if (!stuck) c.run((d) => (id ? o.updateTicket(d, id, clean()) : o.addTicket(d, clean()))); };
  const total = (live?.log || []).reduce((a, e) => a + (+e.hours || 0), 0);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <form className="h-full w-[420px] overflow-auto bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); submit(); }} aria-label="Ticket">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{id ? `${id} · Edit` : 'New ' + (TYPES.find((x) => x[0] === v.type)?.[1] || 'ticket').toLowerCase()}</h2><button type="button" aria-label="Close" className="text-xl text-slate-400 hover:text-slate-700" onClick={onClose}>×</button></div>
        {live?.formerIds?.length > 0 && <p className="-mt-2 mb-2 text-[11px] text-slate-400">formerly {live.formerIds.join(', ')}</p>}
        <L t="Title"><input className={f} required autoFocus value={v.title} onChange={set('title')} /></L>
        <L t="Description"><textarea className={`${f} min-h-20`} placeholder="What is the request? Who is asking?" value={v.description || ''} onChange={set('description')} /></L>
        <div className="grid grid-cols-2 gap-3">
          <L t="Type"><select className={f} value={v.type} onChange={set('type')}>{TYPES.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></L>
          <L t="Priority"><select className={f} value={v.priority} onChange={set('priority')}>{PRIORITY.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></L>
          <L t="Status"><select className={f} value={v.status} onChange={set('status')}>{STATUS.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></L>
          <L t="Owner"><input className={f} list="ticket-owners" value={v.owner || ''} onChange={set('owner')} /><datalist id="ticket-owners">{memberNamesFor(data, v.targetId).map((n) => <option key={n} value={n} />)}</datalist></L>
        </div>
        {stuck > 0 && <p role="alert" className="mb-2 rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-800">Move its {stuck} {stuck === 1 ? 'item' : 'items'} out of this project first, then change the type.</p>}
        {retyped && !stuck && nextId !== id && <p role="status" className="mb-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-sm text-blue-900">ID will become <b>{nextId}</b> (now {id}).</p>}
        {kids && onOpen && (
          <section aria-label="Items in this project" className="mb-3 rounded-lg border border-slate-200 p-2.5">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Items in this project ({kids.length})</h3>
            {kids.length ? <ul className="mb-2 space-y-1 text-sm">{kids.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate"><span className="mr-1 text-[10px] font-semibold uppercase text-slate-500">{x.type}</span><button type="button" className="text-left text-blue-700 hover:underline" onClick={() => onOpen(x.id)}>{x.title}</button></span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">{STATUS.find((s) => s[0] === x.status)?.[1]}<button type="button" aria-label={`Take ${x.id} out of this project`} className="text-red-700" onClick={() => link(x.id, undefined)}>×</button></span>
              </li>))}</ul> : <p className="mb-2 text-sm text-slate-400">Nothing yet.</p>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100" onClick={() => onOpen(null, { type: 'feature', project: id })}>+ Feature</button>
              <button type="button" className="rounded-lg border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100" onClick={() => onOpen(null, { type: 'change', project: id })}>+ Change request</button>
              <select aria-label="Link an existing item" className={`${f} !w-auto max-w-56 !py-0.5 text-xs`} value="" onChange={(e) => e.target.value && link(e.target.value, id)}><option value="">Link existing…</option>{loose.map((x) => <option key={x.id} value={x.id}>{x.type} · {x.title}</option>)}</select>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">Opening an item closes this form, so save any changes to the project first.</p>
          </section>
        )}
        {v.status === 'blocked' && <L t="Blocked because"><input className={f} placeholder="What is it waiting on?" value={v.blocked || ''} onChange={set('blocked')} /></L>}
        {v.type !== 'project' && <L t="Part of project"><select className={f} value={v.project || ''} onChange={set('project')}><option value="">None</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></L>}
        {v.type === 'change' && (
          <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
            <div className="grid grid-cols-2 gap-3"><L t="Requested by"><input className={f} value={v.requestedBy || ''} onChange={set('requestedBy')} /></L><L t="Requested on"><input type="date" className={f} value={v.requested || ''} onChange={set('requested')} /></L></div>
            <L t="Impact"><input className={f} placeholder="e.g. adds about 6 h, delays go-live" value={v.impact || ''} onChange={set('impact')} /></L>
            <L t="Decision"><select className={f} value={v.decision || 'proposed'} onChange={set('decision')}>{DECISION.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></L>
          </div>
        )}
        <L t="About (sheet, app or department)">
          <select className={f} value={v.targetId || ''} onChange={set('targetId')}>
            <option value="">Not linked{v.targetRaw ? ` (was “${v.targetRaw}”)` : ''}</option>
            <optgroup label="Sheets and apps">{data.sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
            <optgroup label="Departments">{data.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
          </select>
        </L>
        <L t="Link (URL)"><input type="url" className={f} placeholder="https://" value={v.url || ''} onChange={set('url')} /></L>
        <L t="Notes"><textarea className={`${f} min-h-16`} value={v.notes || ''} onChange={set('notes')} /></L>
        {live && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
            <div className="mb-1 flex justify-between text-sm"><b>Time spent</b><b>{Math.round(total * 100) / 100} h</b></div>
            <ul className="mb-2 text-sm">{(live.log || []).map((e, i) => <li key={i} className="flex items-center justify-between gap-2 py-0.5"><span>{e.date} · {e.hours} h{e.note ? ' · ' + e.note : ''}</span><button type="button" aria-label="Remove time entry" className="text-red-700" onClick={() => apply((d) => o.removeLog(d, id, i))}>×</button></li>)}</ul>
            <div className="flex gap-1.5"><input aria-label="Hours worked" type="number" min="0.25" max="24" step="0.25" placeholder="Hours" className={`${f} !w-20`} value={hours} onChange={(e) => setHours(e.target.value)} /><input aria-label="What did you do" className={f} placeholder="What did you do? (optional)" value={logNote} onChange={(e) => setLogNote(e.target.value)} /><Btn disabled={!(+hours > 0)} onClick={() => { if (apply((d) => o.addLog(d, id, { hours, note: logNote }))) { setHours(''); setLogNote(''); } }}>Log</Btn></div>
          </div>
        )}
        {c.error && <p role="alert" className="mb-2 rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-800">{c.error}</p>}
        {c.conflict && <div role="alert" className="mb-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm"><b>This map changed on disk</b> since you opened it.<div className="mt-1 flex gap-2"><Btn onClick={() => c.resolve('reload')}>Reload (discard my edits)</Btn><Btn onClick={() => c.resolve('overwrite')}>Overwrite (keep my edits)</Btn></div></div>}
        <div className="flex items-center gap-2"><Btn primary type="submit" disabled={!!stuck}>{id ? 'Save' : 'Create'}</Btn><Btn onClick={onClose}>Cancel</Btn>
          {id && (!sure ? <Btn danger className="ml-auto" onClick={() => setSure(true)}>Delete…</Btn> : <Btn danger className="ml-auto" onClick={() => c.run((d) => o.removeTicket(d, id))}>Move to Removed</Btn>)}</div>
      </form>
    </div>
  );
}
