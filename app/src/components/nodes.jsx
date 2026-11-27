import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeResizer, useConnection } from '@xyflow/react';
import { useModals } from './modals/ModalHost.jsx';
import { sk } from '../lib/skins.js';

const CRIT = { high: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-slate-200 text-slate-700' };

const mini = 'nodrag nopan shrink-0 rounded border border-slate-300 bg-white px-1.5 text-[10px] font-medium text-slate-600 hover:border-blue-500 hover:text-blue-700';

export function DeptNode({ data }) {
  const { open } = useModals();
  return (
    <div className="h-full w-full rounded-xl border border-slate-300 bg-white/80">
      <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-700">{data.name}</span>
        {data.depId && <button type="button" className={mini} onClick={(e) => { e.stopPropagation(); open('function', { depId: data.depId }); }}>+ Function</button>}
      </div>
    </div>
  );
}

export function SectionNode({ data }) {
  const { open } = useModals();
  return (
    <div className="flex w-[230px] items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs" title={data.note}>
      <span className={`truncate ${data.title ? '' : 'italic text-amber-800'}`}>{data.title || '(untitled function)'}</span>
      <button type="button" className={mini} onClick={(e) => { e.stopPropagation(); open('file', { sectionId: data.secId }); }}>+ File</button>
    </div>
  );
}

export function SheetNode({ data, selected }) {
  const { n, open = [], dim, showTix } = data;
  const blocked = showTix && open.some((t) => t.status === 'blocked');
  return (
    <div
      className={`h-[62px] w-[230px] overflow-hidden rounded-lg border px-3 py-1.5 text-sm shadow-sm transition-opacity ${
        n.kind === 'app' ? 'border-violet-300 bg-violet-100' : 'border-emerald-300 bg-emerald-100'
      } ${selected ? 'ring-2 ring-blue-600' : ''} ${blocked ? 'ring-2 ring-red-500' : ''} ${dim ? 'opacity-30' : ''}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-between gap-2">
        <b className="truncate">{n.name}</b>
        <span className="flex items-center gap-1">
          {!showTix && open.length > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-blue-600 px-1 text-[10px] text-white">{open.length}</span>}
          {n.crit && <span className={`rounded-full px-1.5 text-[10px] font-semibold uppercase ${CRIT[n.crit]}`}>{n.crit}</span>}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
        <span className="truncate">{n.details || ' '}</span>
        {showTix && (
          <span className="flex gap-1">
            {open.map((t) => (
              <span key={t.id} title={t.title} className={`rounded px-1 text-[10px] ${t.status === 'blocked' ? 'bg-red-200 text-red-900' : 'bg-blue-100 text-blue-900'}`}>
                {t.id[0]}{t.id.slice(-3)}
              </span>
            ))}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/* What the flow canvas can do, handed to its boxes without redrawing the diagram (so a drag is never interrupted). Set by views/Flows.jsx. */
export const FlowUi = createContext({});
/* A text box that takes focus as soon as its box is shown. A box is hidden until the canvas has measured it, and a hidden box cannot take focus, so keep trying for a moment. */
function AutoInput({ multiline, ...props }) {
  const ref = useRef(null);
  useEffect(() => { let n = 0, raf; const tick = () => { ref.current?.focus(); if (ref.current && document.activeElement !== ref.current && n++ < 60) raf = requestAnimationFrame(tick); }; tick(); return () => cancelAnimationFrame(raf); }, []);
  return multiline ? <textarea ref={ref} {...props} /> : <input ref={ref} {...props} />;
}
const tb = 'rounded-full px-1.5 hover:bg-blue-50 hover:text-blue-700';
const mini2 = 'nodrag nopan grid h-4 w-4 place-items-center rounded border border-slate-300 bg-white text-[10px] leading-none text-slate-600 hover:border-blue-500 disabled:opacity-30';

export function LaneNode({ data }) {
  const ui = useContext(FlowUi), [renaming, setRenaming] = useState(false), hot = ui.hot === data.i;
  const done = (v) => { setRenaming(false); if (v.trim() && v.trim() !== data.team) ui.renameLane?.(data.team, v); };
  return (
    <div className={`flex h-full w-full rounded-lg border ${hot ? 'border-dashed border-blue-500 bg-blue-50' : ''}`} style={hot ? undefined : { background: sk('laneBg'), borderColor: sk('laneBorder') }} title="Double-click an empty spot to add a step here">
      <div className="nodrag nopan flex w-[110px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-l-lg border-r px-1" style={{ background: sk('laneLabelBg'), borderColor: sk('laneBorder'), color: sk('laneLabelText') }} onDoubleClick={(e) => { e.stopPropagation(); setRenaming(true); }}>
        {renaming
          ? <AutoInput aria-label="Lane name" className="nodrag w-full rounded border border-blue-500 bg-white px-1 text-center text-sm" defaultValue={data.team} onFocus={(e) => e.target.select()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') done(e.currentTarget.value); else if (e.key === 'Escape') setRenaming(false); }} onBlur={(e) => done(e.currentTarget.value)} />
          : <span className="text-center text-sm font-semibold" title="Double-click to rename">{data.team}</span>}
        {!ui.readOnly && <span className="flex gap-1">
          <button type="button" aria-label={`Move lane ${data.team} up`} disabled={data.i === 0} className={mini2} onClick={(e) => { e.stopPropagation(); ui.moveLane?.(data.team, -1); }}>↑</button>
          <button type="button" aria-label={`Move lane ${data.team} down`} disabled={data.i === data.n - 1} className={mini2} onClick={(e) => { e.stopPropagation(); ui.moveLane?.(data.team, 1); }}>↓</button>
          {data.empty && <button type="button" aria-label={`Remove lane ${data.team}`} className={mini2} onClick={(e) => { e.stopPropagation(); ui.removeLane?.(data.team); }}>×</button>}
        </span>}
      </div>
    </div>
  );
}

/* A step. Its shape says what it is: a plain box, a start or end pill, or a decision diamond (the shape lives in the Data file). */
/* In an "Ask AI" preview a step is marked: new, changed (its words differ), or about to be removed (struck through). */
const DIFF = { new: { label: 'NEW', tag: 'bg-emerald-600', box: 'rounded-xl outline outline-4 outline-emerald-400' }, changed: { label: 'CHANGED', tag: 'bg-amber-600', box: 'rounded-xl outline outline-4 outline-amber-400' }, removed: { label: 'REMOVED', tag: 'bg-red-600', box: 'rounded-xl opacity-60 outline-dashed outline-4 outline-red-400 [&_b]:line-through' } };
export function StepNode({ data, selected }) {
  const { st, idx, kind, diff } = data, ui = useContext(FlowUi), editing = ui.editing === idx, connecting = useConnection().inProgress;
  const title = editing
    ? <AutoInput aria-label="Step text" className="nodrag nopan min-w-0 flex-1 rounded border border-blue-500 bg-white px-1 text-sm font-semibold" defaultValue={st.title} onFocus={(e) => e.target.select()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') ui.commitTitle?.(idx, e.currentTarget.value); else if (e.key === 'Escape') ui.stopEdit?.(); }} onBlur={(e) => ui.commitTitle?.(idx, e.currentTarget.value)} />
    : <b className="leading-tight">{st.title}</b>;
  const ring = selected ? 'ring-2 ring-blue-600' : '';
  return (
    <div className={`relative h-[74px] w-[180px] ${DIFF[diff]?.box || ''}`} data-kind={kind || 'step'} data-diff={diff || undefined}>
      {diff && <span className={`absolute -top-2 right-0 z-10 rounded-full px-1.5 text-[10px] font-bold text-white ${DIFF[diff].tag}`}>{DIFF[diff].label}</span>}
      {selected && !editing && (
        <div className="nodrag nopan absolute -top-7 left-0 z-10 flex gap-0.5 rounded-full border border-slate-300 bg-white px-1 py-0.5 text-[11px] shadow" role="toolbar" aria-label="Step actions">
          <button type="button" className={tb} onClick={() => ui.edit?.(idx)}>Edit text</button>
          <button type="button" className={tb} onClick={() => ui.next?.(idx)}>+ Next</button>
          <button type="button" className={tb} onClick={() => ui.noteOn?.(idx)}>+ Note</button>
          <button type="button" className={`${tb} text-red-700`} onClick={() => ui.del?.(idx)}>Delete</button>
        </div>
      )}
      {/* while an arrow is being dragged, the whole step is where it can land */}
      <Handle type="target" position={Position.Left} style={{ top: 0, left: 0, width: '100%', height: '100%', transform: 'none', borderRadius: 8, opacity: 0, pointerEvents: connecting ? 'all' : 'none' }} />
      <Handle type="source" position={Position.Right} />
      <Handle id="bs" type="source" position={Position.Bottom} />
      <Handle id="bt" type="target" position={Position.Bottom} />
      {kind === 'start' || kind === 'end'
        ? <div className="flex h-full items-center" title={st.note}>
            <div className={`flex h-11 w-full items-center justify-center gap-1.5 rounded-full border-2 px-3 text-sm shadow-sm ${ring}`} style={{ background: sk(kind === 'start' ? 'startFill' : 'endFill'), borderColor: sk(kind === 'start' ? 'startStroke' : 'endStroke'), color: sk('boxText'), borderWidth: sk('stroke'), fontFamily: sk('font') }}>{title}</div>
          </div>
        : kind === 'decision'
          ? <div className="relative h-full w-full" title={st.note}>
              <svg className="absolute inset-0" width="180" height="74" viewBox="0 0 180 74" aria-hidden="true"><polygon points="90,2 178,37 90,72 2,37" fill={sk('decisionFill')} stroke={selected ? '#2563eb' : sk('decisionStroke')} strokeWidth={selected ? 3 : 2} /></svg>
              <div className="absolute inset-y-0 left-[38px] right-[38px] flex items-center justify-center text-center text-xs">{title}</div>
            </div>
          : <div className={`h-full w-full overflow-hidden border px-2.5 py-1.5 text-sm shadow-sm ${ring}`} style={{ background: sk('boxFill'), borderColor: sk('boxStroke'), color: sk('boxText'), borderRadius: sk('radius'), borderWidth: sk('thin'), fontFamily: sk('font') }} title={st.note}>
              <div className="flex items-start gap-1.5"><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-blue-600 text-[10px] text-white">{idx + 1}</span>{title}</div>
              <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                {st.day && <span className="rounded bg-slate-200 px-1">{st.day}</span>}
                {st.sheet && <span className="rounded bg-emerald-200 px-1">{st.sheet}</span>}
                {st.ticket && <span className="rounded bg-blue-200 px-1">{st.ticket}</span>}
              </div>
            </div>}
    </div>
  );
}

/* A step that is still being typed. Enter adds it and opens the next one after it; Esc drops it; pasting several lines adds one step per line. */
export function DraftNode() {
  const ui = useContext(FlowUi), finished = useRef(false);
  const end = (fn) => { if (finished.current) return; finished.current = true; fn(); };
  return (
    <div className="h-[74px] w-[180px] rounded-lg border-2 border-dashed border-blue-500 bg-blue-50/60 px-2.5 py-2 text-sm">
      <AutoInput aria-label="New step text" placeholder="Type a step, Enter for the next" className="nodrag nopan w-full rounded border border-blue-500 bg-white px-1 py-1 text-sm"
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value; end(() => ui.draftCommit?.(v, true)); } else if (e.key === 'Escape') end(() => ui.draftCancel?.()); }}
        onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/\r?\n/.test(t.trim())) { e.preventDefault(); end(() => ui.draftCommit?.(t, false)); } }}
        onBlur={(e) => { const v = e.currentTarget.value; end(() => (v.trim() ? ui.draftCommit?.(v, false) : ui.draftCancel?.())); }} />
      <div className="mt-1 text-[10px] text-slate-500">Enter: next step · Esc: stop</div>
    </div>
  );
}

/* A sticky note: free text on the diagram. Double-click to edit; Ctrl/Cmd+Enter or leaving the box saves, Esc drops the change. */
const sticky = 'h-full w-full overflow-auto rounded-sm border px-2.5 py-2 text-sm shadow-md', stickyStyle = { background: sk('noteFill'), borderColor: sk('noteStroke'), color: sk('noteText'), fontFamily: sk('font') };
export function NoteNode({ data, selected }) {
  const ui = useContext(FlowUi), editing = ui.editingNote === data.id;
  return (
    <div className="relative h-full w-full">
      {selected && !editing && (
        <div className="nodrag nopan absolute -top-7 left-0 z-10 flex gap-0.5 rounded-full border border-slate-300 bg-white px-1 py-0.5 text-[11px] shadow" role="toolbar" aria-label="Note actions">
          <button type="button" className={tb} onClick={() => ui.noteEdit?.(data.id)}>Edit text</button>
          <button type="button" className={`${tb} text-red-700`} onClick={() => ui.noteDel?.(data.id)}>Delete</button>
        </div>
      )}
      <Handle type="target" position={Position.Top} isConnectable={false} style={{ opacity: 0 }} />
      {editing
        ? <AutoInput multiline aria-label="Note text" style={stickyStyle} className={`${sticky} nodrag nopan resize-none outline-none ring-2 ring-blue-600`} defaultValue={data.text} onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') ui.noteStop?.(); else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ui.noteCommit?.(data.id, e.currentTarget.value); }}
            onBlur={(e) => ui.noteCommit?.(data.id, e.currentTarget.value)} />
        : <div style={stickyStyle} className={`${sticky} whitespace-pre-wrap break-words ${selected ? 'ring-2 ring-blue-600' : ''} ${data.orphan ? 'border-dashed opacity-70' : ''}`} title={data.orphan ? 'The step this note was pinned to is in Removed' : undefined}>{data.text}</div>}
    </div>
  );
}

/* A box on the free canvas. Its shape says what it is (rectangle, rounded box, pill, diamond, or an entity box with a name and description lines); its size is its
 * own and is changed by dragging the handles shown when it is selected. Arrows start from any of the four dots (shown on hover) and end anywhere on a box
 * while one is being drawn. A start or end marker is drawn as a coloured pill, and a decision (or diamond) as a diamond, as on a swimlane. */
export function FreeNode({ data, selected }) {
  const { st, idx, kind, shape, sheetName } = data, ui = useContext(FlowUi), editing = ui.editing === idx, editingBody = ui.editingBody === idx, connecting = useConnection().inProgress;
  const entity = shape === 'entity', diamond = kind === 'decision' || shape === 'diamond';
  const title = editing
    ? <AutoInput aria-label="Step text" className="nodrag nopan w-full min-w-0 rounded border border-blue-500 bg-white px-1 text-sm font-semibold" defaultValue={st.title} onFocus={(e) => e.target.select()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') ui.commitTitle?.(idx, e.currentTarget.value); else if (e.key === 'Escape') ui.stopEdit?.(); }} onBlur={(e) => ui.commitTitle?.(idx, e.currentTarget.value)} />
    : <b className="break-words leading-tight">{st.title}</b>;
  const dot = `z-10 !h-2.5 !w-2.5 !border-blue-600 !bg-white transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`, ring = selected ? 'ring-2 ring-blue-600' : '';
  const look = kind === 'start' || kind === 'end' || shape === 'pill' ? 'rounded-full border-2' : shape === 'rect' ? 'rounded-none border-2' : 'border-2';
  const fill = kind === 'start' ? ['startFill', 'startStroke'] : kind === 'end' ? ['endFill', 'endStroke'] : ['boxFill', 'boxStroke'];
  const boxStyle = { background: sk(fill[0]), borderColor: sk(fill[1]), color: sk('boxText'), borderWidth: sk('stroke'), fontFamily: sk('font'), ...(look === 'border-2' ? { borderRadius: sk('radius') } : {}) };
  const lines = String(st.note || '').split(/\r?\n/).filter((l) => l.trim());
  return (
    <div className={`group relative h-full w-full ${DIFF[data.diff]?.box || ''}`} data-kind={kind || 'step'} data-shape={shape} data-diff={data.diff || undefined}>
      {data.diff && <span className={`absolute -top-2 right-0 z-10 rounded-full px-1.5 text-[10px] font-bold text-white ${DIFF[data.diff].tag}`}>{DIFF[data.diff].label}</span>}
      <NodeResizer isVisible={selected && !editing && !editingBody} minWidth={60} minHeight={40} lineClassName="!border-blue-600" handleClassName="!h-2 !w-2 !rounded-sm !border-blue-600 !bg-white" onResizeEnd={(_, p) => ui.resize?.(idx, p)} />
      {selected && !editing && !editingBody && (
        <div className="nodrag nopan absolute -top-7 left-0 z-10 flex gap-0.5 rounded-full border border-slate-300 bg-white px-1 py-0.5 text-[11px] shadow" role="toolbar" aria-label="Box actions">
          <button type="button" className={tb} onClick={() => ui.edit?.(idx)}>Edit text</button>
          <button type="button" className={tb} onClick={() => ui.noteOn?.(idx)}>+ Note</button>
          <button type="button" className={`${tb} text-red-700`} onClick={() => ui.del?.(idx)}>Delete</button>
        </div>
      )}
      <Handle id="t" type="source" position={Position.Top} className={dot} /><Handle id="r" type="source" position={Position.Right} className={dot} />
      <Handle id="b" type="source" position={Position.Bottom} className={dot} /><Handle id="l" type="source" position={Position.Left} className={dot} />
      {/* while an arrow is being dragged, the whole box is where it can land */}
      <Handle type="target" position={Position.Left} style={{ top: 0, left: 0, width: '100%', height: '100%', transform: 'none', borderRadius: 8, opacity: 0, pointerEvents: connecting ? 'all' : 'none' }} />
      {entity
        ? <div className={`flex h-full w-full flex-col overflow-hidden rounded-md border-2 text-left shadow-sm ${ring}`} style={{ background: sk('entityBody'), borderColor: sk('entityStroke'), color: sk('boxText'), borderWidth: sk('stroke'), fontFamily: sk('font') }}>
            <div className="shrink-0 border-b-2 px-2 py-1 text-sm" style={{ background: sk('entityHead'), borderColor: sk('entityStroke') }} aria-label="Entity name">{title}</div>
            <div className="min-h-0 flex-1 overflow-hidden px-2 py-1 text-xs" aria-label="Entity lines" onDoubleClick={(e) => { e.stopPropagation(); ui.editBody?.(idx); }} title="Double-click to edit the lines">
              {editingBody
                ? <AutoInput multiline aria-label="Entity lines text" className="nodrag nopan h-full w-full resize-none rounded border border-blue-500 bg-white px-1 text-xs outline-none" defaultValue={st.note || ''} onFocus={(e) => e.target.select()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') ui.stopBody?.(); else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ui.commitBody?.(idx, e.currentTarget.value); }} onBlur={(e) => ui.commitBody?.(idx, e.currentTarget.value)} />
                : lines.length ? lines.map((l, i) => <div key={i} className="truncate">{l}</div>) : <span className="text-slate-400">Double-click to describe</span>}
            </div>
            {sheetName && <div className="shrink-0 truncate border-t px-2 py-0.5 text-[10px]" style={{ background: sk('entityHead'), borderColor: sk('entityStroke') }} aria-label="Entity sheet">▦ {sheetName}</div>}
          </div>
        : diamond
          ? <div className="relative h-full w-full" title={st.note}>
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="50,2 98,50 50,98 2,50" fill={sk('decisionFill')} stroke={selected ? '#2563eb' : sk('decisionStroke')} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>
              <div className="absolute inset-y-0 left-[22%] right-[22%] flex items-center justify-center text-center text-xs">{title}</div>
            </div>
          : <div className={`flex h-full w-full items-center justify-center overflow-hidden px-2.5 py-1.5 text-center text-sm shadow-sm ${look} ${ring}`} style={boxStyle} title={st.note}>{title}</div>}
    </div>
  );
}

/* A note that is still being typed: it exists once it has text. */
export function NoteDraftNode() {
  const ui = useContext(FlowUi), finished = useRef(false);
  const end = (fn) => { if (finished.current) return; finished.current = true; fn(); };
  return (
    <AutoInput multiline aria-label="New note text" placeholder="Type a note. Ctrl/Cmd+Enter to save, Esc to drop it." style={stickyStyle} className={`${sticky} nodrag nopan resize-none outline-none ring-2 ring-blue-600`}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') end(() => ui.noteDraftCancel?.()); else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { const v = e.currentTarget.value; end(() => ui.noteDraftCommit?.(v)); } }}
      onBlur={(e) => { const v = e.currentTarget.value; end(() => (v.trim() ? ui.noteDraftCommit?.(v) : ui.noteDraftCancel?.())); }} />
  );
}

/* A flow on the Flow map: its name, how big it is, and a colour bar for the Department of its first team (grey when that team is not a Department). Drag from its right dot to another flow to connect them. */
export function FlowBox({ data, selected }) {
  const { flow, dept, tone } = data, boxes = flow.steps.length, free = flow.layout === 'free', connecting = useConnection().inProgress;
  return (
    <div className={`relative h-full w-full rounded-xl border bg-white shadow-sm ${selected ? 'ring-2 ring-blue-600' : ''} ${tone.ring}`} data-dept={dept || 'none'}>
      <div className={`h-1.5 w-full rounded-t-[10px] ${tone.dot}`} />
      <div className="px-3 py-1.5">
        <b className="block truncate text-sm" title={flow.title}>{flow.title}</b>
        <div className="mt-0.5 truncate text-xs text-slate-500">{boxes} {free ? (boxes === 1 ? 'box' : 'boxes') : (boxes === 1 ? 'step' : 'steps')} · {free ? 'free canvas' : `${flow.teams.length} ${flow.teams.length === 1 ? 'lane' : 'lanes'}`}</div>
        <div className={`mt-1 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[10px] ${dept ? `${tone.soft} ${tone.text}` : 'bg-slate-100 text-slate-500'}`}>{dept || 'No department'}</div>
      </div>
      {/* while an arrow is being dragged, the whole flow is where it can land */}
      <Handle type="target" position={Position.Left} style={{ top: 0, left: 0, width: '100%', height: '100%', transform: 'none', borderRadius: 12, opacity: 0, pointerEvents: connecting ? 'all' : 'none' }} /><Handle type="source" position={Position.Right} />
    </div>
  );
}

export const nodeTypes = { flowbox: FlowBox, dept: DeptNode, section: SectionNode, sheet: SheetNode, lane: LaneNode, step: StepNode, free: FreeNode, draft: DraftNode, note: NoteNode, notedraft: NoteDraftNode };
