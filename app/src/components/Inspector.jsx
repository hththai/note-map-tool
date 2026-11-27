import { model, flows, tickets, low, allNodes, whereIs, STATUS } from '../data.js';
import SheetEdit from './SheetEdit.jsx';

const Field = ({ label, children, stub }) => (
  <div className={`border-t border-slate-200 py-2 ${stub ? 'mt-1 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2.5' : ''}`}>
    <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}{stub ? ' (stub)' : ''}</div>
    <div className="whitespace-pre-wrap text-sm">{children}</div>
  </div>
);

/* One sheet/app seen as Docs + Tickets + Flows. Read-only. */
export default function Inspector({ id, onPick, onClose }) {
  const n = id && allNodes().find((x) => x.key === id);
  if (!n) return <p className="text-sm text-slate-500">Select a sheet or app on the canvas.</p>;
  const w = whereIs()[n.key] || {};
  const feeds = model.links.filter((l) => low(l.from) === n.key), fedBy = model.links.filter((l) => low(l.to) === n.key);
  const tx = tickets.filter((t) => t.target === n.key);
  const fl = flows.flatMap((f) => f.steps.filter((s) => s.sheet && low(s.sheet) === n.key).map((s) => ({ f, s })));
  const teams = [...new Set(fl.map((x) => x.s.team))];
  const chip = (l, dir) => (
    <button key={l.from + l.to} onClick={() => onPick(low(dir === 'out' ? l.to : l.from))} className="mr-1.5 mb-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs hover:bg-emerald-200">
      {dir === 'out' ? l.to : l.from}{l.label ? ' · ' + l.label : ''}
    </button>
  );
  return (
    <div>
      <div className="flex items-start justify-between"><h3 className="text-xl font-semibold leading-tight">{n.name}</h3>{onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">×</button>}</div>
      <p className="mb-2 text-sm text-slate-500">{(w.dept || 'Connected app') + (w.sec?.title ? ' › ' + w.sec.title : '')}</p>
      <Field label="What it is">{n.note || n.details || 'No description yet.'}</Field>
      <Field label="Who uses it">{[n.parts?.[0], w.dept && w.dept + ' team'].filter(Boolean).join(' · ') || 'Not recorded'}</Field>
      <Field label="Who needs it (feeds)">
        {feeds.length ? feeds.map((l) => chip(l, 'out')) : <span className="text-slate-400">None recorded</span>}
        {teams.length > 0 && <div className="mt-1 text-xs text-slate-500">Used in flows by: {teams.join(', ')}</div>}
      </Field>
      <Field label="Fed by">{fedBy.length ? fedBy.map((l) => chip(l, 'in')) : <span className="text-slate-400">None recorded</span>}</Field>
      <Field label="What it is for" stub>New field: the one-line purpose, in business words.</Field>
      {w.sec?.note && <Field label={'Procedure: ' + (w.sec.title || '')}>{w.sec.note}</Field>}
      <Field label={`Tickets (${tx.length})`}>
        {tx.length ? tx.map((t) => <div key={t.id} className="mb-1 flex justify-between gap-2 rounded border border-slate-200 px-2 py-1"><span><code className="text-xs text-slate-500">{t.id}</code> {t.title}</span><span className={`shrink-0 text-xs ${t.status === 'blocked' ? 'text-red-700' : 'text-slate-500'}`}>{STATUS[t.status]}</span></div>) : <span className="text-slate-400">None</span>}
      </Field>
      <Field label={`In flows (${fl.length})`}>
        {fl.length ? fl.map((x, i) => <div key={i} className="mb-1 rounded border border-slate-200 px-2 py-1"><b>{x.f.title}</b> › {x.s.title} <span className="text-xs text-slate-500">({x.s.team}{x.s.day ? ' · ' + x.s.day : ''})</span></div>) : <span className="text-slate-400">None</span>}
      </Field>
      <SheetEdit k={n.key} onSel={onPick} />
    </div>
  );
}
