import { useEffect, useMemo, useState } from 'react';
import { drawCopy } from './flow-preview.js';
import { Canvas, Btn } from './ui.jsx';
import { FlowUi } from './nodes.jsx';
import { apply, useRecords } from '../lib/records.js';
import { validate } from '../lib/schema.js';
import { applyGeneratedAs } from '../lib/ai-flow.js';
import { CHART_TYPES } from '../lib/auto-layout.js';
import { aiStatus, aiGenerate, aiNotice, noticeSeen, markNoticeSeen } from '../lib/ai.js';

/* what the user may pick: process answers can be drawn three ways, an entity answer only as entities; a free canvas has no lanes, so no swimlane there */
const chartOptions = (gen, free) => (gen.chart === 'entity' ? ['entity'] : ['swimlane', 'flowchart', 'waterfall'].filter((c) => !(free && c === 'swimlane')));
const READ_ONLY = { readOnly: true };
const RF = { nodesDraggable: false, nodesConnectable: false, elementsSelectable: false };

/* What the generated flow would look like, drawn exactly as the real canvas draws it, on a copy of the data. Returns { graph } or { error }. */
function preview(data, flowId, gen, chart) {
  try {
    const copy = structuredClone(data); applyGeneratedAs(copy, flowId, gen, chart);
    const bad = validate(copy); if (bad.length) return { error: 'The result would break the data file (' + bad[0] + '), so nothing was changed.' };
    return { graph: drawCopy(copy, flowId) };
  } catch (e) { return { error: e.message }; }
}

/* "Generate flow" for an empty flow: send the brief, show what comes back, and only change the file when the user presses Accept. */
export default function GenerateFlow({ flow, mapName }) {
  const { data } = useRecords(), [st, setSt] = useState(null), [phase, setPhase] = useState(null), [out, setOut] = useState(null), [pick, setPick] = useState(null);
  useEffect(() => { aiStatus().then(setSt); }, []);
  const has = !!(flow.brief || '').trim() || !!(flow.draft || '').trim(), empty = flow.steps.length === 0;
  const why = !st ? 'Checking AI…' : !st.on ? 'AI is off. Press AI at the top to set it up.' : !empty ? 'Generate fills an empty flow.' : !has ? 'Write a brief or a rough draft first.' : '';
  const free = flow.layout === 'free', options = out?.ok ? chartOptions(out.flow, free) : [], chart = out?.ok ? (pick && options.includes(pick) ? pick : options.includes(out.flow.chart) ? out.flow.chart : options[0]) : null;
  const run = async () => { setPhase('loading'); setPick(null); setOut(await aiGenerate({ mapId: mapName, title: flow.title, brief: flow.brief || '', draft: flow.draft || '' })); setPhase('done'); };
  const start = () => (noticeSeen(st.provider) ? run() : setPhase('notice'));
  const close = () => { setPhase(null); setOut(null); };
  const pv = useMemo(() => (phase === 'done' && out?.ok ? preview(data, flow.id, out.flow, chart) : null), [phase, out, chart]);
  const accept = () => { if (apply((d) => applyGeneratedAs(d, flow.id, out.flow, chart))) close(); };
  return (
    <div className="mt-1">
      <div className="flex items-center gap-2"><Btn primary disabled={!!why} onClick={start} aria-label="Generate flow">Generate flow{st?.on ? ` with ${st.label}` : ''}</Btn>{why && <span className="text-[11px] text-slate-500" aria-label="Generate hint">{why}</span>}</div>
      {phase && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-slate-900/40 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Generate flow" className="my-auto w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl" onKeyDown={(e) => { if (e.key === 'Escape' && phase !== 'loading') close(); }}>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Generate flow{st?.label ? ` · ${st.label}` : ''}</h2>{phase !== 'loading' && <button type="button" aria-label="Close" className="text-xl text-slate-400 hover:text-slate-700" onClick={close}>×</button>}</div>
            {phase === 'notice' && (<>
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-700" aria-label="AI notice">{aiNotice(st.label)}</p>
              <div className="mt-4 flex justify-end gap-2"><Btn onClick={close}>Cancel</Btn><Btn primary onClick={() => { markNoticeSeen(st.provider); run(); }}>Send to {st.label}</Btn></div>
            </>)}
            {phase === 'loading' && <p className="py-8 text-center text-sm text-slate-600" role="status">Asking {st.label}… this can take up to a minute.</p>}
            {phase === 'done' && out && !out.ok && (<>
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{out.error}</p>
              <p className="mt-2 text-sm text-slate-600">Nothing was changed.</p>
              <div className="mt-4 flex justify-end gap-2"><Btn onClick={close}>Close</Btn><Btn primary onClick={run}>Try again</Btn></div>
            </>)}
            {phase === 'done' && out?.ok && pv?.error && (<>
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{pv.error}</p>
              <div className="mt-4 flex justify-end"><Btn onClick={close}>Close</Btn></div>
            </>)}
            {phase === 'done' && out?.ok && pv?.graph && (<>
              <p className="mb-1 text-sm" aria-label="Chart reason"><b>AI suggests:</b> {CHART_TYPES[out.flow.chart] || out.flow.chart}{out.flow.reason ? ` · ${out.flow.reason}` : ''}</p>
              <label className="mb-2 flex flex-wrap items-center gap-2 text-sm"><b>Chart type</b><select aria-label="Chart type" className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={chart} onChange={(e) => setPick(e.target.value)}>{options.map((c) => <option key={c} value={c}>{CHART_TYPES[c]}</option>)}</select><span className="text-xs text-slate-500">Changing it redraws at once; the AI is not asked again.</span></label>
              {chart !== 'swimlane' && !free && <p role="note" className="mb-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-700" aria-label="Free canvas notice">This chart is drawn on a <b>free canvas</b>: boxes you can move and resize, no lanes. The flow cannot be turned back into lanes.</p>}
              <p className="mb-2 text-sm text-slate-600">{out.flow.steps.length} steps in {out.flow.teams.length} lanes{out.flow.notes.length ? `, ${out.flow.notes.length} notes with what the AI assumed or could not tell` : ''}. This is a preview: nothing is changed until you press Accept.</p>
              {out.flow.unknownSheets.length > 0 && <p role="note" className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900" aria-label="Unknown sheets">Not on the map (kept as plain text, no sheet was created): {out.flow.unknownSheets.join(', ')}</p>}
              <div className="h-[48vh] overflow-hidden rounded-lg border border-slate-200" aria-label="Preview"><FlowUi.Provider value={READ_ONLY}><Canvas graph={pv.graph} fitKey={"gen-preview-" + chart} rf={RF} minimap={false} /></FlowUi.Provider></div>
              <div className="mt-4 flex justify-end gap-2"><Btn onClick={close}>Discard</Btn><Btn primary onClick={accept}>Accept</Btn></div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
