import { useState } from 'react';
import { allNodes, model, deptOf, toneOf, feedsOf, fedByOf, flowsOf, openFor, low, CRIT, STATUS } from '../data.js';
import DocTiles from '../components/Docs.jsx';

/* Concept E: spotlight. One sheet at a time, shown with what comes in and what goes out.
 * Navigate by clicking neighbours, like a wiki. Left rail is just a finder. */
function Neighbour({ l, dir, onPick }) {
  const t = toneOf(deptOf(l.key));
  return (
    <button onClick={() => onPick(l.key)} className={`group w-full rounded-xl border bg-white p-3 text-left shadow-sm hover:border-blue-500 ${l.manual ? 'border-dashed border-slate-400' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2 font-medium"><i className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />{l.name}</div>
      <div className="mt-0.5 text-xs text-slate-500">{deptOf(l.key)} · {l.label || (dir === 'in' ? 'feeds this' : 'fed by this')}{l.manual ? ' ✋' : ''}</div>
    </button>
  );
}

export default function Detail({ sel, setSel: setKey }) {
  const [q, setQ] = useState('');
  const key = sel || allNodes()[0]?.key;
  const n = allNodes().find((x) => x.key === key) || allNodes()[0], dept = deptOf(n.key), t = toneOf(dept);
  const feeds = feedsOf(n.key), fedBy = fedByOf(n.key), tx = openFor(n.key), fl = flowsOf(n.name);
  const groups = [...model.depts.map((d) => d.name), 'Connected apps'];
  return (
    <div className="flex h-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="p-3"><div className="mb-2 px-1 text-sm font-semibold">{model.title}</div><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find…" aria-label="Find a sheet" className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500" /></div>
        <nav className="min-h-0 flex-1 overflow-auto px-2 pb-24">
          {groups.map((d) => {
            const list = allNodes().filter((x) => deptOf(x.key) === d && low(x.name).includes(low(q)));
            return list.length ? (
              <div key={d} className="mb-2"><div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400"><i className={`h-1.5 w-1.5 rounded-full ${toneOf(d).dot}`} />{d}</div>
                {list.map((x) => <button key={x.key} onClick={() => setKey(x.key)} className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm ${x.key === n.key ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{x.name}</button>)}</div>
            ) : null;
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto px-8 pb-28 pt-7">
        <div className="mx-auto max-w-[1100px]">
          <div className="grid items-center gap-4 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]">
            <div className="space-y-2"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Fed by</div>{fedBy.length ? fedBy.map((l) => <Neighbour key={l.key} l={l} dir="in" onPick={setKey} />) : <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-400">Nothing feeds this</p>}</div>
            <span className="hidden text-2xl text-slate-300 md:block">→</span>
            <div className={`rounded-2xl border-2 p-5 text-center shadow-md ${t.soft} ${t.ring}`}>
              <div className={`mb-1 text-xs font-semibold uppercase tracking-wider ${t.text}`}>{dept}</div>
              <h1 className="text-3xl font-semibold tracking-tight">{n.name}</h1>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-600">{n.parts?.[0] && <span>Owner {n.parts[0]}</span>}{n.crit && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${CRIT[n.crit]}`}>{n.crit}</span>}{n.url && /^https?:/.test(n.url) && <a className="text-blue-600 underline" href={n.url} target="_blank" rel="noreferrer">Open ↗</a>}</div>
            </div>
            <span className="hidden text-2xl text-slate-300 md:block">→</span>
            <div className="space-y-2"><div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Feeds</div>{feeds.length ? feeds.map((l) => <Neighbour key={l.key} l={l} dir="out" onPick={setKey} />) : <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-400">Nothing downstream</p>}</div>
          </div>
          <section className="mt-8"><h2 className="mb-2 text-sm font-semibold text-slate-500">Documentation</h2><DocTiles n={n} onPick={setKey} /></section>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <section><h2 className="mb-2 text-sm font-semibold text-slate-500">Work on this ({tx.length} open)</h2>
              {tx.length ? tx.map((x) => <div key={x.id} className={`mb-2 rounded-xl border bg-white p-3 text-sm ${x.status === 'blocked' ? 'border-red-300' : 'border-slate-200'}`}><div className="flex justify-between text-xs text-slate-500"><code>{x.id}</code><span>{STATUS[x.status]}</span></div><div className="font-medium">{x.title}</div>{x.blocked && <div className="mt-1 text-xs text-red-700">{x.blocked}</div>}</div>) : <p className="text-sm text-slate-400">No open tickets or projects.</p>}
            </section>
            <section><h2 className="mb-2 text-sm font-semibold text-slate-500">Business flows ({fl.length})</h2>
              {fl.length ? fl.map((x, k) => (
                <div key={k} className="mb-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"><div className="mb-1.5 font-medium">{x.f.title} <span className="font-normal text-slate-400">· {x.f.every}</span></div>
                  <div className="flex flex-wrap items-center gap-1 text-xs">{x.f.steps.map((s, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <span className="text-slate-300">›</span>}<span className={`rounded-md px-1.5 py-0.5 ${i === x.i ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{s.team}: {s.title}</span></span>)}</div></div>
              )) : <p className="text-sm text-slate-400">Not used in any flow yet.</p>}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
