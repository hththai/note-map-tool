import { useRecords } from '../lib/records.js';
import { useMemo, useState } from 'react';
import { allNodes, whereIs, feedsOf, fedByOf, flowsOf, openFor, toneOf, deptOf, low, model, CRIT } from '../data.js';
import DocTiles, { Chip } from '../components/Docs.jsx';

/* Concept C: the map as a catalog. Think Linear / Notion database: dense, searchable, expands in place. */
const COLS = 'grid grid-cols-[minmax(190px,1.3fr)_80px_84px_minmax(150px,1.5fr)_minmax(150px,1.5fr)_64px_64px] items-center gap-3';
const FILTERS = [['all', 'All'], ['high', 'High criticality'], ['tix', 'Has open tickets'], ['manual', 'Manual copies']];

export default function Catalog({ sel: open, setSel: setOpen, onDetail }) {
  const { rev } = useRecords(), [q, setQ] = useState(''), [f, setF] = useState('all');
  const rows = useMemo(() => allNodes().map((n) => ({ n, dept: deptOf(n.key), feeds: feedsOf(n.key), fedBy: fedByOf(n.key), tx: openFor(n.key), fl: flowsOf(n.name) })), [rev]);
  const keep = (r) => (!q || low(r.n.name + ' ' + r.dept + ' ' + (r.n.parts?.[0] || '')).includes(low(q)))
    && (f === 'all' || (f === 'high' && r.n.crit === 'high') || (f === 'tix' && r.tx.length) || (f === 'manual' && [...r.feeds, ...r.fedBy].some((l) => l.manual)));
  const groups = [...model.depts.map((d) => d.name), 'Connected apps'].map((d) => [d, rows.filter((r) => r.dept === d && keep(r))]).filter((g) => g[1].length);
  const pick = (key) => setOpen(key);
  const chips = (list) => (list.length ? <div className="flex flex-wrap gap-1">{list.map((l) => <Chip key={l.key} l={l} onPick={(k) => { setOpen(k); document.getElementById('row-' + k)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }} />)}</div> : <span className="text-slate-300">—</span>);
  return (
    <div className="mx-auto h-full max-w-[1280px] overflow-auto px-6 pb-24 pt-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold tracking-tight">{model.title}</h1><p className="text-sm text-slate-500">{rows.length} sheets and apps · {model.links.length} links · {model.depts.length} departments</p></div>
        <div className="flex items-center gap-2">
          {FILTERS.map(([k, label]) => <button key={k} onClick={() => setF(k)} className={`rounded-full border px-3 py-1 text-sm ${f === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400'}`}>{label}</button>)}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sheets, owners, departments" aria-label="Search" className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500" />
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className={`${COLS} border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500`}>
          <span>Sheet</span><span>Owner</span><span>Criticality</span><span>Feeds</span><span>Fed by</span><span>Tickets</span><span>Flows</span>
        </div>
        {groups.map(([dept, list]) => {
          const t = toneOf(dept);
          return (
            <section key={dept}>
              <h2 className={`sticky top-0 z-10 flex items-center gap-2 border-b border-slate-100 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider ${t.soft} ${t.text}`}><i className={`h-2 w-2 rounded-full ${t.dot}`} />{dept}<span className="font-normal opacity-60">{list.length}</span></h2>
              {list.map((r) => {
                const isOpen = open === r.n.key;
                return (
                  <div key={r.n.key} id={'row-' + r.n.key} className="border-b border-slate-100 last:border-0">
                    <div role="button" tabIndex={0} onClick={() => setOpen(isOpen ? null : r.n.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : r.n.key); } }} className={`${COLS} w-full cursor-pointer px-4 py-2.5 text-left hover:bg-slate-50 ${isOpen ? 'bg-slate-50' : ''}`} aria-expanded={isOpen}>
                      <span className="flex items-center gap-2 truncate font-medium"><span className="text-slate-300">{isOpen ? '▾' : '▸'}</span>{r.n.name}</span>
                      <span className="truncate text-sm text-slate-600">{r.n.parts?.[0] || '—'}</span>
                      <span>{r.n.crit ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${CRIT[r.n.crit]}`}>{r.n.crit}</span> : <span className="text-slate-300">—</span>}</span>
                      <span onClick={(e) => e.stopPropagation()}>{chips(r.feeds)}</span>
                      <span onClick={(e) => e.stopPropagation()}>{chips(r.fedBy)}</span>
                      <span>{r.tx.length ? <span className={`rounded-full px-2 py-0.5 text-xs ${r.tx.some((x) => x.status === 'blocked') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>{r.tx.length} open</span> : <span className="text-slate-300">—</span>}</span>
                      <span className="text-sm text-slate-600">{r.fl.length || <span className="text-slate-300">—</span>}</span>
                    </div>
                    {isOpen && (
                      <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                        {onDetail && <div className="flex justify-end"><button onClick={onDetail} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">Open in Detail →</button></div>}
                        <DocTiles n={r.n} onPick={pick} />
                        {(r.tx.length > 0 || r.fl.length > 0) && (
                          <div className="grid gap-3 md:grid-cols-2">
                            {r.tx.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-sm"><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Open work</div>{r.tx.map((x) => <div key={x.id} className="flex justify-between gap-2 py-0.5"><span><code className="text-xs text-slate-400">{x.id}</code> {x.title}</span><span className={x.status === 'blocked' ? 'text-red-700' : 'text-slate-500'}>{x.status}</span></div>)}</div>}
                            {r.fl.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-sm"><div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Used in flows</div>{r.fl.map((x, i) => <div key={i} className="py-0.5"><b>{x.f.title}</b> › {x.s.title} <span className="text-xs text-slate-500">({x.s.team})</span></div>)}</div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
        {!groups.length && <p className="p-8 text-center text-slate-400">Nothing matches.</p>}
      </div>
    </div>
  );
}
