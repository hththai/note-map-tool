import { useRecords } from '../lib/records.js';
import { useMemo } from 'react';
import { Handle, Position, MarkerType } from '@xyflow/react';
import { allNodes, model, low, deptOf, toneOf, CRIT, openFor } from '../data.js';
import { Canvas } from '../components/ui.jsx';
import Inspector from '../components/Inspector.jsx';

/* Concept D: "data journey". Columns come from the links, not from departments:
 * inputs -> working sheets -> outputs. Department is a colour, not a box. */
function JNode({ data }) {
  const { n, dept, t, dim, sel } = data, open = openFor(n.key);
  return (
    <div className={`w-[220px] rounded-xl border bg-white px-3 py-2 shadow-sm transition-opacity ${sel ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-200'} ${dim ? 'opacity-25' : ''}`}>
      <Handle type="target" position={Position.Left} /><Handle type="source" position={Position.Right} />
      <div className="flex items-center gap-2"><i className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.dot}`} /><b className="truncate text-sm">{n.name}</b>{open.length > 0 && <span className="ml-auto rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{open.length}</span>}</div>
      <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500"><span className="truncate">{dept}{n.parts?.[0] ? ' · ' + n.parts[0] : ''}</span>{n.crit === 'high' && <span className={`rounded-full px-1.5 font-semibold uppercase ${CRIT.high}`}>high</span>}</div>
    </div>
  );
}
const ColHead = ({ data }) => <div className="w-[220px] text-xs font-semibold uppercase tracking-widest text-slate-400">{data.label}<div className="mt-1 h-px bg-slate-300" /></div>;
const types = { jnode: JNode, colhead: ColHead };

function build(sel) {
  const nodes = allNodes(), keys = new Set(nodes.map((n) => n.key));
  const links = model.links.filter((l) => keys.has(low(l.from)) && keys.has(low(l.to)));
  /* Columns = longest path from an input. A loop (A -> B -> A) would push its sheets right forever, so the
   * link that closes a loop is left out of the ranking (still drawn, as an arrow back to an earlier column). */
  const next = {}, back = new Set(), seen = {};
  links.forEach((l, i) => (next[low(l.from)] ||= []).push([low(l.to), i]));
  const walk = (k) => { seen[k] = 1; (next[k] || []).forEach(([to, i]) => { if (seen[to] === 1) back.add(i); else if (!seen[to]) walk(to); }); seen[k] = 2; };
  nodes.forEach((n) => { if (!seen[n.key]) walk(n.key); });
  const rank = Object.fromEntries(nodes.map((n) => [n.key, 0])), fwd = links.filter((_, i) => !back.has(i));
  for (let i = 0; i < nodes.length; i++) fwd.forEach((l) => { rank[low(l.to)] = Math.max(rank[low(l.to)], rank[low(l.from)] + 1); });
  const linked = new Set(links.flatMap((l) => [low(l.from), low(l.to)])), max = Math.max(...Object.values(rank));
  const nb = new Set(sel ? [sel] : []);
  if (sel) links.forEach((l) => { if (low(l.from) === sel) nb.add(low(l.to)); if (low(l.to) === sel) nb.add(low(l.from)); });
  const cols = {}, order = (n) => model.depts.findIndex((d) => d.name === deptOf(n.key)) + 1 || 99;
  nodes.forEach((n) => { const c = linked.has(n.key) ? rank[n.key] : max + 1; (cols[c] ||= []).push(n); });
  const out = [], label = (c) => (c === 0 ? 'Inputs' : c === max ? 'Outputs' : c === max + 1 ? 'Not linked yet' : 'Stage ' + c);
  Object.entries(cols).forEach(([c, list]) => {
    out.push({ id: 'h' + c, type: 'colhead', position: { x: c * 320, y: 0 }, data: { label: label(+c) }, draggable: false, selectable: false });
    list.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name)).forEach((n, i) => {
      const dept = deptOf(n.key);
      out.push({ id: n.key, type: 'jnode', position: { x: c * 320, y: 40 + i * 78 }, draggable: false, data: { n, dept, t: toneOf(dept), sel: sel === n.key, dim: !!sel && !nb.has(n.key) } });
    });
  });
  const edges = links.map((l, i) => {
    const on = !sel || low(l.from) === sel || low(l.to) === sel, manual = /manual/i.test(l.label), hex = toneOf(deptOf(low(l.from))).hex;
    return { id: 'e' + i, source: low(l.from), target: low(l.to), label: l.label, type: 'default', markerEnd: { type: MarkerType.ArrowClosed, color: hex }, style: { stroke: hex, strokeWidth: sel && on ? 3 : 2, strokeDasharray: manual ? '6 4' : undefined, opacity: on ? 1 : 0.12 }, labelStyle: { fontSize: 10 }, animated: !manual && on };
  });
  return { nodes: out, edges };
}

export default function Journey({ sel, setSel, onDetail }) {
  const { rev } = useRecords();
  const graph = useMemo(() => build(sel), [sel, rev]);
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-slate-200 bg-white px-5 py-3">
        <div><h1 className="text-lg font-semibold tracking-tight">{model.title}</h1><p className="text-xs text-slate-500">How data travels, left to right. Click a sheet to trace it.</p></div>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-600">
          {[...model.depts.map((d) => d.name), 'Connected apps'].map((d) => <span key={d} className="inline-flex items-center gap-1.5"><i className={`h-2 w-2 rounded-full ${toneOf(d).dot}`} />{d}</span>)}
          <span className="inline-flex items-center gap-1.5"><i className="inline-block w-5 border-t-2 border-dashed border-slate-500" />manual copy</span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1"><Canvas graph={graph} types={types} fitKey="journey" minimap={false} onNode={(n) => setSel(n?.type === 'jnode' ? n.id : null)} /></div>
        {sel && <aside className="w-[340px] shrink-0 overflow-auto border-l border-slate-200 bg-white p-4">{onDetail && <button onClick={onDetail} className="mb-3 w-full rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700">Open in Detail →</button>}<Inspector id={sel} onPick={setSel} onClose={() => setSel(null)} /></aside>}
      </div>
    </div>
  );
}
