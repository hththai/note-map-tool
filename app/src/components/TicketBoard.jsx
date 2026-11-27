import { useEffect, useRef, useState } from 'react';
import { STATUS_LIST, priorityOf, hoursOf, fmtH, initials, summary, projectStats, statsLine, targetOf, groupByDepartment } from '../lib/board.js';
import { memberNamesFor } from '../lib/rollup.js';
import { CommitInput } from './ui.jsx';

const sel = 'rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm';
const PRIORITIES = [['urgent', 'Urgent'], ['high', 'High'], ['normal', 'Normal'], ['low', 'Low']];
const PRI = { urgent: 'bg-red-600 text-white', high: 'bg-orange-100 text-orange-800', low: 'bg-slate-100 text-slate-600' };
const DOT = { todo: 'bg-slate-400', doing: 'bg-blue-500', blocked: 'bg-red-500', done: 'bg-emerald-500' };
const CHIP = { sheet: 'bg-emerald-100', app: 'bg-violet-100', dept: 'bg-amber-100', orphan: 'bg-red-100 text-red-800' };
const DECISION = { proposed: 'bg-amber-100 text-amber-800', approved: 'bg-emerald-100 text-emerald-800', rejected: 'bg-red-100 text-red-800' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const prettyDate = (iso) => { const d = new Date(iso + 'T00:00:00'); return Number.isNaN(+d) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`; };

/* status bar, counts, and one red line per blocked ticket */
export function Summary({ items, onOpen }) {
  const s = summary(items);
  if (!s.total) return null;
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3" aria-label="Summary">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">{STATUS_LIST.map(([k, label]) => s.counts[k] ? <i key={k} className={DOT[k]} style={{ flex: s.counts[k] }} title={`${s.counts[k]} ${label.toLowerCase()}`} /> : null)}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 text-sm text-slate-600">
        {STATUS_LIST.map(([k, label]) => <span key={k}><b className="text-slate-900">{s.counts[k]}</b> {label.toLowerCase()}</span>)}
        <span className="ml-auto"><b className="text-slate-900">{s.open}</b> of {s.total} open</span>
      </div>
      {s.blocked.map((t) => <button key={t.id} type="button" className="mt-2 block w-full rounded-lg border border-red-300 bg-red-50 px-2 py-1 text-left text-sm text-red-800 hover:bg-red-100" onClick={() => onOpen(t.id)}><b>Blocked</b> {t.id} {t.title}{t.blocked ? ` · ${t.blocked}` : ''}</button>)}
    </div>
  );
}

/* the title is plain text until you click it; then it is a field. Enter or leaving keeps the change, Escape drops it. */
function Title({ t, quick, className = '', onEditing }) {
  const [edit, setEdit] = useState(false), [v, setV] = useState(t.title), ref = useRef(null);
  useEffect(() => setV(t.title), [t.title]);
  useEffect(() => { onEditing?.(edit); if (edit) ref.current?.select(); }, [edit]);
  const done = (keep) => { setEdit(false); const x = v.trim(); if (keep && x && x !== t.title) quick(t, { title: x }, 'title'); else setV(t.title); };
  return edit
    ? <input ref={ref} autoFocus aria-label={`Title of ${t.id}`} className={`${sel} w-full font-semibold`} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => done(true)} onKeyDown={(e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }} />
    : <button type="button" title="Click to rename" className={`text-left font-semibold hover:text-blue-700 ${className}`} onClick={() => setEdit(true)}>{t.title}</button>;
}
const StatusSelect = ({ t, onMove }) => <select aria-label="Status" className={`${sel} !py-0.5 text-xs`} value={t.status} onChange={(e) => onMove(t, e.target.value)}>{STATUS_LIST.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
const PrioritySelect = ({ t, quick }) => <select aria-label="Priority" className={`${sel} !py-0.5 text-xs`} value={priorityOf(t)} onChange={(e) => quick(t, { priority: e.target.value === 'normal' ? undefined : e.target.value }, 'priority')}>{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
const OwnerInput = ({ d, t, quick, className = '' }) => (
  <><CommitInput aria-label="Owner" list={`owners-${t.id}`} placeholder="Owner" className={`!py-0.5 text-xs ${className}`} value={t.owner || ''} onCommit={(v) => quick(t, { owner: v.trim() }, 'owner')} />
    <datalist id={`owners-${t.id}`}>{memberNamesFor(d, t.targetId).map((n) => <option key={n} value={n} />)}</datalist></>
);
function Chip({ d, t }) { const tg = targetOf(d, t); return tg ? <span className={`rounded px-1.5 text-xs ${CHIP[tg.kind === 'dept' || tg.kind === 'app' || tg.kind === 'orphan' ? tg.kind : 'sheet']}`}>{tg.name}</span> : <span />; }

function Card({ d, t, quick, onMove, onOpen }) {
  const [editing, setEditing] = useState(false), [showKids, setShowKids] = useState(false), items = d.tickets.items, project = t.project && items.find((x) => x.id === t.project), ps = t.type === 'project' ? projectStats(items, t) : null, h = hoursOf(t);
  const open = (e) => { if (!e.target.closest('input,select,textarea,a,button:not([data-open])')) onOpen(t.id); };
  return (
    <article draggable={!editing} onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }} onClick={open} data-ticket={t.id}
      className={`cursor-grab rounded-lg border bg-white p-2.5 text-sm shadow-sm ${t.status === 'blocked' ? 'border-red-400' : 'border-slate-200'} ${t.status === 'done' ? 'opacity-70' : ''}`}>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <button type="button" data-open aria-label={`Open ${t.id}`} className="font-mono hover:text-blue-700" onClick={() => onOpen(t.id)}>{t.id}</button>
        <span className="flex items-center gap-1">{t.priority && t.priority !== 'normal' && <span className={`rounded px-1 font-semibold uppercase ${PRI[t.priority]}`}>{t.priority}</span>}{t.type === 'change' && t.decision && <span className={`rounded px-1 font-semibold ${DECISION[t.decision]}`}>{t.decision}</span>}<span className="uppercase">{t.type}</span></span>
      </div>
      <div className="mt-0.5 flex items-start gap-1"><Title t={t} quick={quick} onEditing={setEditing} className="min-w-0 flex-1" />{/^https?:\/\//i.test(t.url || '') && <a href={t.url} target="_blank" rel="noreferrer" aria-label="Open link" className="text-blue-600">↗</a>}</div>
      {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{t.description}</p>}
      {ps && (ps.total || ps.hours) ? <div className="mt-1 text-xs text-slate-600">{statsLine(ps)}{ps.total ? <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><i className="block h-full bg-emerald-500" style={{ width: `${Math.round(ps.done / ps.total * 100)}%` }} /></div> : null}</div> : null}
      {ps && ps.total > 0 && <div className="mt-1 text-xs"><button type="button" aria-expanded={showKids} className={linkBtn} onClick={() => setShowKids(!showKids)}>{showKids ? 'Hide items' : `Show ${ps.total} ${ps.total === 1 ? 'item' : 'items'}`}</button>
        {showKids && <ul className="mt-1 space-y-0.5 text-slate-600">{items.filter((x) => x.project === t.id && x.decision !== 'rejected').map((x) => <li key={x.id} className="flex justify-between gap-2"><button type="button" className="min-w-0 truncate text-left hover:text-blue-700" onClick={() => onOpen(x.id)}>{x.title}</button><span className="shrink-0 text-slate-400">{STATUS_LIST.find((s) => s[0] === x.status)?.[1]}</span></li>)}</ul>}</div>}
      {project && <div className="mt-1 text-xs text-slate-500">↳ {project.id} {project.title}</div>}
      {t.status === 'blocked' && <CommitInput aria-label="Blocked reason" placeholder="Why is it blocked?" className="mt-1 !border-red-300 !bg-red-50 !py-0.5 text-xs text-red-800" value={t.blocked || ''} onCommit={(v) => quick(t, { blocked: v.trim() }, 'blocked')} />}
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs"><Chip d={d} t={t} />{h ? <span className="text-slate-500">⏱ {fmtH(h)}</span> : null}{t.owner ? <span title={t.owner} className="grid h-5 w-5 place-items-center rounded-full bg-slate-200 text-[10px] font-semibold">{initials(t.owner)}</span> : null}</div>
      <div className="mt-2 grid grid-cols-3 gap-1"><StatusSelect t={t} onMove={onMove} /><PrioritySelect t={t} quick={quick} /><OwnerInput d={d} t={t} quick={quick} /></div>
    </article>
  );
}

function QuickAdd({ label, onAdd }) {
  const [v, setV] = useState('');
  return <input aria-label={`Add to ${label}`} className={`${sel} mt-2 w-full border-dashed text-xs`} placeholder="+ Add (type a title, press Enter)" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) { onAdd(v.trim()); setV(''); } }} />;
}

/* four columns; drop a card on a column to change its status */
const DONE_LIMIT = 5;
const newestFirst = (a, b) => String(b.updated || '').localeCompare(String(a.updated || ''));
const linkBtn = 'text-xs text-blue-700 underline underline-offset-2 hover:text-blue-900';

export function Board({ d, list, quick, onMove, onOpen, onAdd }) {
  const [over, setOver] = useState(null), [allDone, setAllDone] = useState(false);
  return (
    <div className="grid grid-cols-4 items-start gap-4">
      {STATUS_LIST.map(([k, label]) => {
        /* Done piles up: newest first, only the latest few until "Show all" (collapses again when the view is left) */
        const full = list.filter((t) => t.status === k), col = k === 'done' ? [...full].sort(newestFirst) : full;
        const shown = k === 'done' && !allDone ? col.slice(0, DONE_LIMIT) : col;
        return (
          <section key={k} aria-label={label} data-status={k} onDragOver={(e) => { e.preventDefault(); setOver(k); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'), t = d.tickets.items.find((x) => x.id === id); if (t && t.status !== k) onMove(t, k); }}
            className={`rounded-xl border p-3 ${over === k ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
            <h3 className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wider text-slate-500"><span className="flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${DOT[k]}`} />{label}</span><span>{col.length}</span></h3>
            <div className="space-y-2">{col.length ? shown.map((t) => <Card key={t.id} d={d} t={t} quick={quick} onMove={onMove} onOpen={onOpen} />) : <p className="py-3 text-center text-xs text-slate-400">Nothing here</p>}</div>
            {k === 'done' && col.length > DONE_LIMIT && <button type="button" className={`${linkBtn} mt-2`} onClick={() => setAllDone(!allDone)}>{allDone ? 'Show fewer' : `Show all ${col.length}`}</button>}
            <QuickAdd label={label} onAdd={(title) => onAdd(title, k)} />
          </section>
        );
      })}
    </div>
  );
}

/* the same tickets as rows, grouped by department; every cell that can change is editable in place */
export function Table({ d, list, quick, onMove, onOpen }) {
  const groups = groupByDepartment(d, list);
  if (!groups.length) return <p className="text-sm text-slate-400">No tickets match.</p>;
  return (
    <div className="space-y-4">{groups.map((g) => <Group key={g.id} g={g} d={d} quick={quick} onMove={onMove} onOpen={onOpen} />)}</div>
  );
}

/* one department's rows; done rows stay hidden until "Show N done" */
function Group({ g, d, quick, onMove, onOpen }) {
  const [showDone, setShowDone] = useState(false);
  const nDone = g.items.filter((t) => t.status === 'done').length, rows = showDone ? g.items : g.items.filter((t) => t.status !== 'done');
  return (
    <section aria-label={g.name} className="rounded-xl border border-slate-200 bg-white">
          <h3 className="border-b border-slate-200 px-3 py-2 text-sm font-semibold">{g.name} <span className="font-normal text-slate-500">· {g.items.length - nDone} open, {nDone} done</span>{nDone > 0 && <button type="button" className={`${linkBtn} ml-2 font-normal`} onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide done' : `Show ${nDone} done`}</button>}</h3>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-1">ID</th><th>Title</th><th>Type</th><th>Status</th><th>Priority</th><th>Owner</th><th>About</th><th>Hours</th><th className="pr-3">Updated</th></tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 align-middle">
                <td className="px-3 py-1"><button type="button" aria-label={`Open ${t.id}`} className="font-mono text-xs text-slate-500 hover:text-blue-700" onClick={() => onOpen(t.id)}>{t.id}</button></td>
                <td className="min-w-48"><Title t={t} quick={quick} /></td>
                <td className="text-xs uppercase text-slate-500">{t.type}</td>
                <td><StatusSelect t={t} onMove={onMove} /></td><td><PrioritySelect t={t} quick={quick} /></td>
                <td><OwnerInput d={d} t={t} quick={quick} className="!w-28" /></td>
                <td><Chip d={d} t={t} /></td>
                <td className="text-xs text-slate-500">{hoursOf(t) ? fmtH(hoursOf(t)) : ''}</td>
                <td className="pr-3 text-xs text-slate-500">{prettyDate(t.updated)}</td>
              </tr>))}</tbody>
          </table>
    </section>
  );
}

/* asks why before a ticket becomes Blocked. Enter blocks it, Escape or Cancel leaves it where it was. */
export function BlockedAsk({ ticket, onDone }) {
  const [v, setV] = useState('');
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30" onClick={() => onDone(null)} role="presentation">
      <form role="dialog" aria-label="Why is it blocked?" className="w-96 rounded-xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onDone(v); }} onKeyDown={(e) => e.key === 'Escape' && onDone(null)}>
        <h2 className="mb-1 font-semibold">Why is it blocked?</h2><p className="mb-2 text-xs text-slate-500">{ticket.id} {ticket.title}</p>
        <input autoFocus aria-label="Blocked because" className={`${sel} mb-3 w-full`} placeholder="What is it waiting on? (optional)" value={v} onChange={(e) => setV(e.target.value)} />
        <div className="flex gap-2"><button type="submit" className="rounded-lg border border-red-600 bg-red-600 px-3 py-1 text-sm text-white">Block it</button><button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-sm" onClick={() => onDone(null)}>Cancel</button></div>
      </form>
    </div>
  );
}
