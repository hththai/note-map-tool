import { useEffect, useMemo, useState } from 'react';
import { Canvas, Btn } from './ui.jsx';
import { FlowUi } from './nodes.jsx';
import { drawCopy } from './flow-preview.js';
import { apply, useRecords } from '../lib/records.js';
import { validate } from '../lib/schema.js';
import { applyEdit, flowForAi } from '../lib/ai-flow.js';
import { aiStatus, aiGenerate, aiNotice, noticeSeen, markNoticeSeen, MAX_TEXT_CHARS } from '../lib/ai.js';

const READ_ONLY = { readOnly: true }, RF = { nodesDraggable: false, nodesConnectable: false, elementsSelectable: false };
const FIELD = { team: 'lane', title: 'text', kind: 'shape', day: 'day', note: 'note', sheet: 'sheet' };

/* What the change would do, drawn on a copy of the data with the steps marked (new, changed, to be removed), and the same facts as a list. */
function preview(data, flowId, edit) {
  try {
    const copy = structuredClone(data), diff = applyEdit(copy, flowId, edit, { keepRemoved: true });
    const bad = validate(copy); if (bad.length) return { error: 'The result would break the data file (' + bad[0] + '), so nothing was changed.' };
    const marks = {}; diff.added.forEach((id) => (marks[id] = 'new')); diff.changed.forEach((c) => (marks[c.id] = 'changed')); diff.removed.forEach((id) => (marks[id] = 'removed'));
    const steps = copy.flows.find((x) => x.id === flowId).steps, name = (id) => steps.find((s) => s.id === id)?.title || '';
    const lines = [...diff.added.map((id) => `Add: ${name(id)}`), ...diff.changed.map((c) => `Change: ${name(c.id)} (${c.changes.map((x) => `${FIELD[x.field]}: “${x.from || '—'}” → “${x.to || '—'}”`).join('; ')})`), ...diff.removed.map((id) => `Remove: ${name(id)} (goes to Removed; you can restore it)`)];
    if (diff.arrowsAdded || diff.arrowsRemoved) lines.push(`Arrows: ${diff.arrowsAdded} added, ${diff.arrowsRemoved} removed`);
    if (edit.notes?.length) lines.push(`Notes: ${edit.notes.length} new`);
    return { graph: drawCopy(copy, flowId, marks), lines, none: !lines.length };
  } catch (e) { return { error: e.message }; }
}

/* "Ask AI" on a flow that has steps: type a change, see exactly what would happen, then Accept or Discard. */
export default function AskAi({ flow, mapName }) {
  const { data } = useRecords(), [st, setSt] = useState(null), [text, setText] = useState(''), [phase, setPhase] = useState(null), [out, setOut] = useState(null);
  useEffect(() => { aiStatus().then(setSt); }, []);
  const why = !st ? 'Checking AI…' : !st.on ? 'AI is off. Press AI at the top to set it up.' : !text.trim() ? 'Type the change you want.' : '';
  const run = async () => { setPhase('loading'); setOut(await aiGenerate({ mapId: mapName, title: flow.title, brief: flow.brief || '', instruction: text, flow: flowForAi(flow, data.sheets) })); setPhase('done'); };
  const start = () => (noticeSeen(st.provider) ? run() : setPhase('notice'));
  const close = () => { setPhase(null); setOut(null); };
  const pv = useMemo(() => (phase === 'done' && out?.ok ? preview(data, flow.id, out.flow) : null), [phase, out]);
  const accept = () => { if (apply((d) => applyEdit(d, flow.id, out.flow))) { close(); setText(''); } };
  if (!flow.steps.length) return null; // after every hook, so the order of hooks never changes when a flow gets its first steps
  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5" role="group" aria-label="Ask AI">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ask AI to change this flow</div>
      <textarea aria-label="Ask AI instruction" maxLength={MAX_TEXT_CHARS} className="min-h-14 w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500" placeholder="e.g. add a QA check before Finance" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-1 flex items-center gap-2"><Btn primary disabled={!!why} onClick={start} aria-label="Ask AI">Ask AI{st?.on ? ` (${st.label})` : ''}</Btn>{why && <span className="text-[11px] text-slate-500" aria-label="Ask AI hint">{why}</span>}</div>
      {phase && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-slate-900/40 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Ask AI" className="my-auto w-full max-w-4xl rounded-2xl bg-white p-5 shadow-2xl" onKeyDown={(e) => { if (e.key === 'Escape' && phase !== 'loading') close(); }}>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Ask AI{st?.label ? ` · ${st.label}` : ''}</h2>{phase !== 'loading' && <button type="button" aria-label="Close" className="text-xl text-slate-400 hover:text-slate-700" onClick={close}>×</button>}</div>
            <p className="mb-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700" aria-label="Your request">“{text}”</p>
            {phase === 'notice' && (<>
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-700" aria-label="AI notice">{aiNotice(st.label)}</p>
              <div className="mt-4 flex justify-end gap-2"><Btn onClick={close}>Cancel</Btn><Btn primary onClick={() => { markNoticeSeen(st.provider); run(); }}>Send to {st.label}</Btn></div>
            </>)}
            {phase === 'loading' && <p className="py-8 text-center text-sm text-slate-600" role="status">Asking {st.label}… this can take up to a minute.</p>}
            {phase === 'done' && out && !out.ok && (<>
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{out.error}</p><p className="mt-2 text-sm text-slate-600">Nothing was changed.</p>
              <div className="mt-4 flex justify-end gap-2"><Btn onClick={close}>Close</Btn><Btn primary onClick={run}>Try again</Btn></div>
            </>)}
            {phase === 'done' && out?.ok && pv?.error && (<><p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{pv.error}</p><div className="mt-4 flex justify-end"><Btn onClick={close}>Close</Btn></div></>)}
            {phase === 'done' && out?.ok && pv?.graph && (<>
              {out.flow.summary && <p className="mb-1 text-sm" aria-label="AI summary"><b>AI says:</b> {out.flow.summary}</p>}
              {pv.none
                ? <p className="mb-2 text-sm text-slate-600" aria-label="No changes">The AI suggested no changes to the steps.</p>
                : <ul className="mb-2 list-disc pl-5 text-sm text-slate-700" aria-label="Changes">{pv.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
              {out.flow.unknownSheets.length > 0 && <p role="note" className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900" aria-label="Unknown sheets">Not on the map (kept as plain text, no sheet was created): {out.flow.unknownSheets.join(', ')}</p>}
              <div className="h-[44vh] overflow-hidden rounded-lg border border-slate-200" aria-label="Preview"><FlowUi.Provider value={READ_ONLY}><Canvas graph={pv.graph} fitKey="ask-preview" rf={RF} minimap={false} /></FlowUi.Provider></div>
              <p className="mt-1 text-xs text-slate-500">Green = new, amber = changed, red and struck through = removed. Nothing is changed until you press Accept, and one Undo takes it all back.</p>
              <div className="mt-3 flex justify-end gap-2"><Btn onClick={close}>Discard</Btn><Btn primary onClick={accept} disabled={pv.none && !out.flow.notes.length}>Accept</Btn></div>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
