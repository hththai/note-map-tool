import { useMemo, useState } from 'react';
import { MarkerType } from '@xyflow/react';
import { Canvas, Btn, CommitInput } from '../components/ui.jsx';
import { useRecords, apply } from '../lib/records.js';
import * as o from '../lib/ops.js';
import { mapLayout } from '../lib/flow-map.js';
import { toneOf } from '../data.js';

const NEUTRAL = { dot: 'bg-slate-400', soft: 'bg-slate-50', text: 'text-slate-600', ring: 'border-slate-200' };
const W = 250, H = 96, sel = 'rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm';

/* How the flows of this map connect, like an organisation map: each box is a flow (coloured by the Department of its first team), each arrow says one flow
 * leads to another. Drag from a flow's right dot to another flow to connect them, click an arrow to label it, Delete removes it (to Removed). */
export default function FlowMap({ onOpen }) {
  const { data } = useRecords(), [pick, setPick] = useState(null), flows = data.flows, links = data.flowLinks || [];
  const flow = (id) => flows.find((f) => f.id === id), idx = (id) => flows.findIndex((f) => f.id === id);
  const dept = (f) => data.departments.find((d) => f.teams[0] && d.name.toLowerCase() === f.teams[0].toLowerCase())?.name || null;
  const graph = useMemo(() => {
    const at = mapLayout(flows, links, { w: W, h: H });
    const nodes = flows.map((f) => { const d = dept(f); return { id: 'fm' + f.id, type: 'flowbox', position: at[f.id], width: W, height: H, deletable: false, data: { flow: f, dept: d, tone: d ? toneOf(d) : NEUTRAL } }; });
    const edges = links.map((l) => ({ id: 'fl' + l.id, source: 'fm' + l.fromFlowId, target: 'fm' + l.toFlowId, type: 'smoothstep', label: l.label || undefined, data: { linkId: l.id }, markerEnd: { type: MarkerType.ArrowClosed, color: '#475569' }, style: { stroke: '#475569', strokeWidth: 2 }, labelStyle: { fontSize: 11 } }));
    return { nodes, edges };
  }, [data]);
  const link = pick?.kind === 'link' ? links.find((l) => l.id === pick.id) : null, one = pick?.kind === 'flow' ? flow(pick.id) : null;
  const rf = {
    deleteKeyCode: ['Backspace', 'Delete'], zoomOnDoubleClick: false,
    onNodeDoubleClick: (_, n) => onOpen(idx(n.data.flow.id)),
    onDelete: ({ edges }) => { const ids = edges.map((e) => e.data?.linkId).filter(Boolean); if (ids.length) { setPick(null); apply((d) => ids.forEach((id) => o.removeFlowLink(d, id))); } },
  };
  const onConnect = (c) => { const a = (c.source || '').replace(/^fm/, ''), b = (c.target || '').replace(/^fm/, ''); if (a && b && a !== b && apply((d) => o.addFlowLink(d, { fromFlowId: a, toFlowId: b }))) setPick({ kind: 'link', id: null, pending: true }); };
  /* after drawing, open the new connection's details: it is the last one in the list */
  const current = link || (pick?.pending ? links.at(-1) : null);
  const name = (id) => flow(id)?.title || '?';
  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">
        {flows.length
          ? <Canvas graph={graph} fitKey={'flowmap' + flows.length + ':' + links.length} rf={rf} minimap={false} onConnect={onConnect} onNode={(n) => setPick(n ? { kind: 'flow', id: n.data.flow.id } : null)} onEdge={(e) => e.data && setPick({ kind: 'link', id: e.data.linkId })} />
          : <p className="p-8 text-slate-500">No business flows yet for this map. Make some on <b>Business flows</b>, then connect them here.</p>}
      </div>
      <aside className="w-[320px] shrink-0 overflow-auto border-l border-slate-200 bg-white p-4" aria-label="Flow map details">
        <h2 className="mb-1 text-base font-semibold">Flow map</h2>
        <p className="mb-3 text-xs text-slate-500">{flows.length} flows · {links.length} connections. Drag from a flow's right dot to another flow to say it leads there. Double-click a flow to open it.</p>
        {current && (
          <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-2.5" role="group" aria-label="Connection">
            <div className="mb-1.5 text-sm font-semibold">{name(current.fromFlowId)} → {name(current.toFlowId)}</div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Label<div className="mt-0.5 text-sm font-normal normal-case tracking-normal"><CommitInput aria-label="Connection label" placeholder="e.g. monthly close feeds budget review" value={current.label} onCommit={(v) => apply((d) => o.updateFlowLink(d, current.id, { label: v }))} /></div></label>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Starts from step (optional)<div className="mt-0.5"><select aria-label="Starting step" className={`${sel} w-full`} value={current.fromStepId || ''} onChange={(e) => apply((d) => o.updateFlowLink(d, current.id, { fromStepId: e.target.value || null }))}><option value="">The flow as a whole</option>{flow(current.fromFlowId).steps.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.title}</option>)}</select></div></label>
            <div className="text-right"><Btn danger onClick={() => { setPick(null); apply((d) => o.removeFlowLink(d, current.id)); }}>Delete connection</Btn></div>
          </div>
        )}
        {one && (
          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5" role="group" aria-label="Flow">
            <div className="mb-1 text-sm font-semibold">{one.title}</div>
            <div className="mb-2 text-xs text-slate-600">{dept(one) ? `Department: ${dept(one)}` : 'Its first team is not a Department'}</div>
            {(() => { const out = links.filter((l) => l.fromFlowId === one.id), inn = links.filter((l) => l.toFlowId === one.id); return (<>
              {!out.length && !inn.length && <p className="mb-2 text-xs text-slate-500">Not connected to any flow yet.</p>}
              {inn.map((l) => <div key={l.id} className="text-xs text-slate-700">← from {name(l.fromFlowId)}{l.label ? `: ${l.label}` : ''}</div>)}
              {out.map((l) => <div key={l.id} className="text-xs text-slate-700">→ to {name(l.toFlowId)}{l.label ? `: ${l.label}` : ''}</div>)}
            </>); })()}
            <div className="mt-2"><Btn primary onClick={() => onOpen(idx(one.id))}>Open this flow</Btn></div>
          </div>
        )}
        {!current && !one && <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">Click a flow or an arrow to see its details here.</p>}
      </aside>
    </div>
  );
}
