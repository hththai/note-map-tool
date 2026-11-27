import { useMemo, useState } from 'react';
import { useRecords } from '../lib/records.js';
import { buildMap } from '../graph.js';
import { flows } from '../data.js';
import { Canvas, Select } from '../components/ui.jsx';
import { useModals } from '../components/modals/ModalHost.jsx';

const bar = 'rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm hover:border-blue-500';

/* The map is where you work: click a department, function, file or arrow to edit it, use + to add, drag from a card's edge to link.
 * Layers: tickets on files, a business flow drawn over the files it uses. */
export default function Overview({ setSel }) {
  const { data: d } = useRecords(), { open } = useModals(), [flowIdx, setFlowIdx] = useState(-1), [showTix, setShowTix] = useState(true);
  const graph = useMemo(() => buildMap(d, { flow: flowIdx >= 0 ? flows[flowIdx] : null, showTix }), [d, flowIdx, showTix]);
  const click = (n) => {
    if (!n) return setSel(null);
    if (n.type === 'sheet') { setSel(n.data.n.key); open('file', { id: n.data.sheetId }); }
    else if (n.type === 'dept' && n.data.depId) open('department', { id: n.data.depId });
    else if (n.type === 'section') open('function', { depId: n.data.depId, id: n.data.secId });
  };
  return (
    <div className="relative h-full">
      {d.departments.length || d.sheets.length ? (
        <Canvas graph={graph} fitKey={`map:${d.departments.length}:${d.sheets.length}`} onNode={click} onEdge={(e) => e.data?.linkId && open('link', { id: e.data.linkId })} onConnect={(c) => open('link', { fromId: c.source, toId: c.target })} />
      ) : (
        <div className="grid h-full place-items-center p-8 text-center"><div><h2 className="mb-1 text-lg font-semibold">This map is empty</h2><p className="mb-3 text-sm text-slate-600">Start with a department, then add its functions and files.</p><button type="button" className="rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" onClick={() => open('department')}>+ Add department</button></div></div>
      )}
      <div className="absolute right-4 top-4 z-10 flex gap-2">
        <button type="button" className={bar} onClick={() => open('department')}>+ Department</button>
        <button type="button" className={bar} onClick={() => open('file')}>+ File</button>
        <button type="button" className={bar} onClick={() => open('file', { kind: 'app' })}>+ App</button>
        <button type="button" className={bar} onClick={() => open('link')}>+ Link</button>
      </div>
      <div className="absolute left-4 top-4 z-10 flex items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-1 text-sm shadow-sm">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={showTix} onChange={(e) => setShowTix(e.target.checked)} />Tickets on files</label>
        <label className="flex items-center gap-1.5">Workflow<Select value={flowIdx} onChange={(v) => setFlowIdx(+v)}><option value={-1}>None</option>{flows.map((f, i) => <option key={i} value={i}>{f.title}</option>)}</Select></label>
      </div>
    </div>
  );
}
