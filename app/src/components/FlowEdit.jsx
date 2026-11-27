import { useRecords, apply } from '../lib/records.js';
import { arrowMessage, setArrowMessage, removeArrow } from '../lib/flow-edit.js';
import * as o from '../lib/ops.js';
import { FLOW_DAYS } from '../lib/flows-parser.js';
import { CommitInput, Btn } from './ui.jsx';
import { MAX_TEXT_CHARS } from '../lib/ai.js';
import { useState } from 'react';
import GenerateFlow from './GenerateFlow.jsx';
import AskAi from './AskAi.jsx';

const sel = 'rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm';
const L = ({ t, children }) => <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t}<div className="mt-0.5 text-sm font-normal normal-case tracking-normal text-slate-900">{children}</div></label>;

/* Edit one flow: its name and rhythm, and its steps (team, title, day, sheet, who it waits on, where it sends work back). */
export default function FlowEdit({ mapName, flowId, stepId = null, arrow = null, onArrowGone, onDeleted }) {
  const { data } = useRecords(), flow = data.flows.find((x) => x.id === flowId), [team, setTeam] = useState(''), [title, setTitle] = useState('');
  if (!flow) return null;
  const free = flow.layout === 'free';
  const ed = (fn, key) => apply(fn, key ? { key } : {});
  const addStep = () => { if (!team.trim() || !title.trim()) return; if (apply((d) => o.addStep(d, flow.id, { team, title }))) { setTitle(''); } };
  return (
    <div>
      <L t="Flow name"><CommitInput aria-label="Flow name" value={flow.title} onCommit={(v) => v.trim() && ed((d) => o.updateFlow(d, flow.id, { title: v.trim() }))} /></L>
      <L t="Runs (free text)"><CommitInput aria-label="Runs" placeholder="e.g. every Friday" value={flow.every} onCommit={(v) => ed((d) => o.updateFlow(d, flow.id, { every: v }))} /></L>
      <L t="Flow note"><CommitInput multiline aria-label="Flow note" placeholder="Anything about the whole flow" value={flow.note || ''} onCommit={(v) => ed((d) => o.updateFlow(d, flow.id, { note: v.trim() ? v : undefined }))} /></L>
      <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5" role="group" aria-label="Describe your case">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Describe your case</div>
        <L t="Brief"><CommitInput multiline aria-label="Brief" maxLength={MAX_TEXT_CHARS} placeholder="What is this process for, who is involved, what goes wrong today?" value={flow.brief || ''} onCommit={(v) => ed((d) => o.updateFlow(d, flow.id, { brief: v.trim() ? v : undefined }))} /></L>
        <L t="Rough draft of the steps (optional)"><CommitInput multiline aria-label="Draft" maxLength={MAX_TEXT_CHARS} placeholder={'Bullets or sentences are fine, e.g.\n- Sales sends the quote\n- Finance checks the price'} value={flow.draft || ''} onCommit={(v) => ed((d) => o.updateFlow(d, flow.id, { draft: v.trim() ? v : undefined }))} /></L>
        <div className="text-[11px] text-slate-500">Saved with the flow. Up to {MAX_TEXT_CHARS} characters each.</div>
        <GenerateFlow flow={flow} mapName={mapName} />
      </div>
      <AskAi flow={flow} mapName={mapName} />
      {!free && <div className="mb-3 text-xs text-slate-500">Lanes: {flow.teams.join(', ') || 'none yet'}</div>}
      {arrow && !stepId && (() => {
        const from = arrow.kind === 'trigger' ? arrow.from : arrow.from, to = arrow.to, name = (i) => `${i + 1}. ${flow.steps[i]?.title ?? ''}`, back = arrow.kind === 'back';
        return (
          <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-2.5" role="group" aria-label="Arrow">
            <div className="mb-1.5 text-sm font-semibold">{back ? 'Sent back' : 'Arrow'}: {name(from)} → {name(to)}</div>
            <L t={flow.steps[from]?.kind === 'decision' ? 'Branch label (Yes, No, …)' : 'Message'}><CommitInput aria-label="Arrow message" placeholder="what is handed over" value={arrowMessage(data, flow.id, arrow)} onCommit={(v) => ed((d) => setArrowMessage(d, flow.id, arrow, v))} /></L>
            <div className="text-right"><Btn danger onClick={() => { ed((d) => removeArrow(d, flow.id, arrow)); onArrowGone?.(); }}>Delete arrow</Btn></div>
          </div>
        );
      })()}
      {!stepId && !arrow && free && <p className="mb-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">Click a box to edit its details here. Double-click empty space to add a box, double-click a box to retype it, drag its handles to resize it, and drag from a dot on its edge to another box to draw an arrow.</p>}
      {!stepId && !arrow && !free && <p className="mb-3 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">Click a step on the diagram to edit its details here. Double-click a step to retype it, drag it into another lane to hand it to that team, and drag from its right edge to another step to draw an arrow.</p>}
      {flow.steps.map((st, i) => {
        if (st.id !== stepId) return null;
        const others = flow.steps.filter((x) => x.id !== st.id), earlier = flow.steps.slice(0, i), label = (x) => `${flow.steps.indexOf(x) + 1}. ${x.team}: ${x.title}`;
        const setSt = (patch, key) => ed((d) => o.updateStep(d, flow.id, st.id, patch), key && `step:${st.id}:${key}`);
        return (
          <div key={st.id} className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5" role="group" aria-label={`Step ${i + 1}`}>
            <div className="mb-1.5 flex items-center gap-1.5"><span className="grid h-5 w-5 place-items-center rounded-full bg-blue-600 text-[11px] text-white">{i + 1}</span>
              <CommitInput aria-label="Step title" value={st.title} onCommit={(v) => v.trim() && setSt({ title: v.trim() })} />
              {!free && <Btn aria-label="Move step up" disabled={i === 0} onClick={() => ed((d) => o.shiftStep(d, flow.id, st.id, -1))}>↑</Btn>}
              {!free && <Btn aria-label="Move step down" disabled={i === flow.steps.length - 1} onClick={() => ed((d) => o.shiftStep(d, flow.id, st.id, 1))}>↓</Btn>}</div>
            <div className="grid grid-cols-2 gap-2">
              {!free && <L t="Team"><CommitInput aria-label="Step team" list={`teams-${flow.id}`} value={st.team} onCommit={(v) => v.trim() && setSt({ team: v.trim() })} /></L>}
              {free && <L t="Box shape"><select aria-label="Box shape" className={`${sel} w-full`} value={st.shape || 'rounded'} onChange={(e) => setSt({ shape: e.target.value })}><option value="rounded">Rounded box</option><option value="rect">Rectangle</option><option value="pill">Pill</option><option value="diamond">Diamond</option><option value="entity">Entity box</option></select></L>}
              <L t="Shape"><select aria-label="Step shape" className={`${sel} w-full`} value={st.kind || ''} onChange={(e) => setSt({ kind: e.target.value || undefined })}><option value="">Step</option><option value="start">Start marker</option><option value="end">End marker</option><option value="decision">Decision (yes / no)</option></select></L>
              <L t="Day"><select aria-label="Step day" className={`${sel} w-full`} value={st.day || ''} onChange={(e) => setSt({ day: e.target.value || null })}><option value="">Any</option>{FLOW_DAYS.map((x) => <option key={x}>{x}</option>)}</select></L>
              <L t="Sheet or app"><select aria-label="Step sheet" className={`${sel} w-full`} value={st.sheetId || ''} onChange={(e) => setSt({ sheetId: e.target.value || undefined, sheetName: undefined })}><option value="">None{st.sheetName ? ` (was “${st.sheetName}”, not on the map)` : ''}</option>{data.sheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></L>
              <L t="Ticket id"><CommitInput aria-label="Step ticket" placeholder="T2026…" value={st.ticket || ''} onCommit={(v) => setSt({ ticket: v.trim() || null })} /></L>
            </div>
            <L t={st.shape === 'entity' ? 'Description lines (one per line)' : 'Note'}><CommitInput multiline aria-label="Step note" value={st.note} onCommit={(v) => setSt({ note: v })} /></L>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Waits on</div>
            {st.triggers.map((t, k) => (
              <div key={k} className="mb-1 flex items-center gap-1.5">
                {t.stepId ? <select aria-label="Waits on step" className={`${sel} min-w-0 flex-1`} value={t.stepId} onChange={(e) => setSt({ triggers: st.triggers.map((x, j) => (j === k ? { ...x, stepId: e.target.value } : x)) })}>{!earlier.some((x) => x.id === t.stepId) && <option value={t.stepId}>(a step in Removed)</option>}{earlier.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</select>
                  : <span className="min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1 text-sm">team: {t.team}</span>}
                <CommitInput aria-label="Message" placeholder="message" className="!w-32" value={t.msg} onCommit={(v) => setSt({ triggers: st.triggers.map((x, j) => (j === k ? { ...x, msg: v } : x)) })} />
                <button type="button" aria-label="Remove arrow" className="text-red-700" onClick={() => setSt({ triggers: st.triggers.filter((_, j) => j !== k) })}>×</button>
              </div>
            ))}
            <div className="mb-2 flex items-center gap-2">
              <select aria-label="Add waits on" className={sel} value="" onChange={(e) => e.target.value && setSt({ triggers: [...st.triggers, { stepId: e.target.value, msg: '' }], standalone: undefined })}><option value="">+ waits on step…</option>{earlier.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</select>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!st.standalone} onChange={(e) => setSt({ standalone: e.target.checked || undefined })} />Starts on its own</label>
            </div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Sends back to</div>
            {st.backs.map((b, k) => (
              <div key={k} className="mb-1 flex items-center gap-1.5">
                <select aria-label="Sends back to step" className={`${sel} min-w-0 flex-1`} value={b.stepId} onChange={(e) => setSt({ backs: st.backs.map((x, j) => (j === k ? { ...x, stepId: e.target.value } : x)) })}>{!others.some((x) => x.id === b.stepId) && <option value={b.stepId}>(a step in Removed)</option>}{others.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</select>
                <CommitInput aria-label="Message" placeholder="message" className="!w-32" value={b.msg} onCommit={(v) => setSt({ backs: st.backs.map((x, j) => (j === k ? { ...x, msg: v } : x)) })} />
                <button type="button" aria-label="Remove arrow" className="text-red-700" onClick={() => setSt({ backs: st.backs.filter((_, j) => j !== k) })}>×</button>
              </div>
            ))}
            <select aria-label="Add sends back to" className={sel} value="" onChange={(e) => e.target.value && setSt({ backs: [...st.backs, { stepId: e.target.value, msg: '' }] })}><option value="">+ sends back to step…</option>{others.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</select>
            <div className="mt-2 text-right"><Btn danger onClick={() => ed((d) => o.removeStep(d, flow.id, st.id))}>Delete step</Btn></div>
          </div>
        );
      })}
      <datalist id={`teams-${flow.id}`}>{flow.teams.map((t) => <option key={t} value={t} />)}</datalist>
      {!free && <div className="rounded-xl border border-dashed border-slate-300 p-2.5">
        <div className="mb-1.5 text-sm font-semibold">Add a step</div>
        <div className="flex gap-1.5"><input aria-label="New step team" list={`teams-${flow.id}`} className={`${sel} w-28`} placeholder="Team" value={team} onChange={(e) => setTeam(e.target.value)} /><input aria-label="New step title" className={`${sel} min-w-0 flex-1`} placeholder="What happens" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStep()} /><Btn disabled={!team.trim() || !title.trim()} onClick={addStep}>Add step</Btn></div>
      </div>}
      <div className="mt-4"><Btn danger onClick={() => { if (window.confirm(`Move the flow "${flow.title}" to Removed? You can restore it.`)) { ed((d) => o.removeFlow(d, flow.id)); onDeleted?.(); } }}>Delete flow</Btn></div>
    </div>
  );
}
