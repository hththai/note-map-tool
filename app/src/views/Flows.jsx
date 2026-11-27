import { useEffect, useMemo, useRef, useState } from 'react';
import { buildFlow, LANE, NOTE } from '../graph.js';
import { flows } from '../data.js';
import { Canvas, Select, Btn } from '../components/ui.jsx';
import { FlowUi } from '../components/nodes.jsx';
import { useRecords, apply } from '../lib/records.js';
import * as o from '../lib/ops.js';
import { connect, removeArrow, branchLabel } from '../lib/flow-edit.js';
import FlowEdit from '../components/FlowEdit.jsx';
import AiPanel from '../components/AiPanel.jsx';
import FreeCanvas from '../components/FreeCanvas.jsx';
import SwitchLayout from '../components/SwitchLayout.jsx';
import { swimlanePositions, buildFree } from '../free-graph.js';
import { SKINS, SKIN_IDS, loadSkin, saveSkin } from '../lib/skins.js';
import { flowToSvg, svgToPng, download, fileSlug } from '../lib/export-image.js';
import { flowDoc, flowsDoc } from '../lib/flow-mermaid.js';

/* Business flows as swimlanes (one lane per team; blue arrows are hand-offs, dashed red arrows send work back). The diagram is the editor:
 * double-click a step to retype it, drag it into another lane to hand it to that team, drag from its right edge to another step to draw an arrow,
 * double-click an empty lane to add a step (Enter adds the next), Delete removes what is selected. Every change goes through apply(), so it undoes. */
export default function Flows({ idx, setIdx }) {
  const { data, rev, name: name_ } = useRecords(), [editing, setEditing] = useState(true), [name, setName] = useState(''), [laneName, setLaneName] = useState('');
  const [typing, setTyping] = useState(null), [editingNote, setEditingNote] = useState(null), [noteDraft, setNoteDraft] = useState(null), [draft, setDraft] = useState(null), [hot, setHot] = useState(null), [tick, setTick] = useState(0), [selIdx, setSelIdx] = useState(null), [selArrow, setSelArrow] = useState(null), [aiOpen, setAiOpen] = useState(false), [switching, setSwitching] = useState(false), [skin, setSkinState] = useState(loadSkin), [exportErr, setExportErr] = useState(null);
  const inst = useRef(null), box = useRef(null), addRef = useRef(null);
  const f = flows[idx], meta = data.flows[idx];
  const stepAt = (id) => (id ? meta.steps.findIndex((x) => x.id === id) : null);
  const isFree = meta?.layout === 'free';
  const graph = useMemo(() => (f && !isFree ? buildFlow(f, {
    draft: draft && { team: draft.team, key: draft.key, from: draft.fromId ? stepAt(draft.fromId) : null },
    notes: (meta.notes || []).map((n) => ({ id: n.id, text: n.text, x: n.x, y: n.y, pinned: !!n.stepId, at: stepAt(n.stepId) })),
    kinds: meta.steps.map((x) => x.kind || null), skin,
    noteDraft: noteDraft && { x: noteDraft.x, y: noteDraft.y, key: noteDraft.key, at: stepAt(noteDraft.stepId) },
  }) : { nodes: [], edges: [] }), [f, rev, tick, draft, noteDraft, isFree, skin]);
  useEffect(() => { setTyping(null); setDraft(null); setSelIdx(null); setHot(null); setEditingNote(null); setNoteDraft(null); setSelArrow(null); }, [idx]);
  const create = () => { if (!name.trim()) return; const n = data.flows.length; if (apply((d) => o.addFlow(d, { title: name }))) { setName(''); setIdx(n); setEditing(true); } };

  const setSkin = (s) => { setSkinState(s); saveSkin(s); };
  /* Export the diagram as it is shown (same graph, same skin). The SVG is drawn from the graph, so it does not depend on what is scrolled into view. */
  const exportAs = async (type) => {
    setExportErr(null);
    try {
      const name = fileSlug(meta.title), svg = type === 'png' || type === 'svg' ? flowToSvg(isFree ? buildFree(meta, { sheets: data.sheets, skin }) : graph, skin) : null;
      if (type === 'md') download(new Blob([flowDoc(meta)], { type: 'text/markdown' }), name + '.md'); else if (type === 'all') download(new Blob([flowsDoc(data, 'Business flows · ' + name_)], { type: 'text/markdown' }), fileSlug('business-flows-' + name_) + '.md'); else if (type === 'svg') download(new Blob([svg.svg], { type: 'image/svg+xml' }), name + '.svg'); else download(await svgToPng(svg), name + '.png');
    } catch (e) { setExportErr(e.message); }
  };
  const FID = meta?.id, sid = (i) => meta?.steps[i]?.id;
  /* the lane under a dragged step's middle (lanes can be taller than one row when branches are stacked) */
  const laneOf = (n) => { const lanes = graph.nodes.filter((x) => x.type === 'lane'), from = lanes.find((x) => x.id === n.parentId), y = (from?.position.y ?? 0) + n.position.y + LANE.STEP_H / 2, k = lanes.findIndex((l) => y < l.position.y + l.height + LANE.GAP / 2); return k < 0 ? Math.max(0, lanes.length - 1) : k; };
  const ui = useMemo(() => !meta ? {} : ({
    editing: typing, hot, editingNote,
    edit: setTyping, stopEdit: () => setTyping(null),
    commitTitle: (i, v) => { setTyping(null); const t = v.trim(); if (t && t !== meta.steps[i]?.title) apply((d) => o.updateStep(d, FID, sid(i), { title: t })); },
    next: (i) => setDraft({ team: meta.steps[i].team, fromId: sid(i), key: Date.now() }),
    del: (i) => { const id = sid(i); setSelIdx(null); apply((d) => o.removeStep(d, FID, id)); },
    draftCancel: () => setDraft(null),
    /* Enter on one line adds it and opens the next after it; several pasted lines add one step each, linked in a row */
    draftCommit: (text, chain) => {
      const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '').trim()).filter(Boolean), team = draft.team;
      if (!lines.length) return setDraft(null);
      let lastId = null;
      const ok = apply((d) => {
        let prev = draft.fromId || null;
        const fl = d.flows.find((x) => x.id === FID);
        for (const title of lines) prev = o.addStep(d, FID, { team, title, afterStepId: prev, ...(prev ? { triggers: [{ stepId: prev, msg: branchLabel(fl, fl.steps.find((x) => x.id === prev)) }] } : { standalone: true }) });
        lastId = prev;
      });
      if (!ok) return setDraft(null);
      setDraft(chain && lines.length === 1 && lastId ? { team, fromId: lastId, key: Date.now() } : null);
    },
    noteOn: (i) => setNoteDraft({ stepId: sid(i), x: 20, y: 86, key: Date.now() }),
    noteEdit: setEditingNote, noteStop: () => setEditingNote(null),
    noteCommit: (id, text) => { setEditingNote(null); const n = (meta.notes || []).find((x) => x.id === id); if (!n) return; if (!text.trim()) apply((d) => o.removeNote(d, FID, id)); else if (text !== n.text) apply((d) => o.updateNote(d, FID, id, { text })); },
    noteDel: (id) => apply((d) => o.removeNote(d, FID, id)),
    noteDraftCancel: () => setNoteDraft(null),
    noteDraftCommit: (text) => { const nd = noteDraft; setNoteDraft(null); if (nd && text.trim()) apply((d) => o.addNote(d, FID, { text, x: nd.x, y: nd.y, ...(nd.stepId ? { stepId: nd.stepId } : {}) })); },
    renameLane: (from, to) => apply((d) => o.renameTeam(d, FID, from, to)),
    moveLane: (team, dir) => apply((d) => o.moveTeam(d, FID, team, dir)),
    removeLane: (team) => apply((d) => o.removeTeam(d, FID, team)),
  }), [meta, rev, typing, hot, draft, editingNote, noteDraft]);

  const rf = f && {
    zoomOnDoubleClick: false, onInit: (i) => { inst.current = i; }, deleteKeyCode: ['Backspace', 'Delete'],
    onNodeDoubleClick: (_, n) => { if (n.type === 'note') setEditingNote(n.data.id); else if (n.type === 'step') setTyping(n.data.idx); else if (n.type === 'lane') setDraft({ team: n.data.team, fromId: null, key: Date.now() }); },
    onNodeDrag: (_, n) => { if (n.type === 'step') { const li = laneOf(n); if (li !== hot) setHot(li); } },
    onNodeDragStop: (_, n) => {
      if (n.type === 'note') { moveNote(n); return; }
      if (n.type !== 'step') return;
      const team = f.teams[laneOf(n)]; setHot(null);
      if (team && team.toLowerCase() !== f.steps[n.data.idx].team.toLowerCase()) apply((d) => o.updateStep(d, FID, sid(n.data.idx), { team }));
      setTick((t) => t + 1); /* snap back into place (a move to another lane redraws anyway) */
    },
    /* Delete: the steps and arrows that are selected. Arrows of a deleted step go with it, the others are taken out one by one, last first so places stay right. */
    onDelete: ({ nodes, edges }) => {
      const gone = nodes.filter((n) => n.type === 'step').map((n) => n.data.idx), ids = gone.map((i) => sid(i)), noteIds = nodes.filter((n) => n.type === 'note').map((n) => n.data.id);
      const arrows = edges.filter((e) => e.data && !gone.includes(e.data.from) && !gone.includes(e.data.to)).map((e) => e.data).sort((a, b) => (b.tIdx ?? b.k) - (a.tIdx ?? a.k));
      if (!ids.length && !arrows.length && !noteIds.length) return;
      setSelIdx(null);
      apply((d) => { arrows.forEach((a) => removeArrow(d, FID, a)); noteIds.forEach((id) => o.removeNote(d, FID, id)); ids.forEach((id) => o.removeStep(d, FID, id)); });
    },
  };
  /* a dragged note is saved where it was dropped: on the canvas, or as an offset from its step when it is pinned to one */
  const moveNote = (n) => {
    const note = (meta.notes || []).find((x) => x.id === n.data.id); if (!note) return;
    let { x, y } = n.position; const at = stepAt(note.stepId);
    if (at != null && at >= 0) { const st = graph.nodes.find((q) => q.id === 's' + at), ln = graph.nodes.find((q) => q.id === st.parentId); x -= ln.position.x + st.position.x; y -= ln.position.y + st.position.y; }
    if (Math.abs(x - note.x) < 2 && Math.abs(y - note.y) < 2) return;
    apply((d) => o.updateNote(d, FID, note.id, { x: Math.round(x), y: Math.round(y) }));
  };
  /* a note typed where you double-click on empty canvas, or in the middle of what you can see */
  const newNote = (e) => {
    if (!inst.current) return;
    const r = box.current?.getBoundingClientRect(), at = e ? { x: e.clientX, y: e.clientY } : { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const p = inst.current.screenToFlowPosition(at); setNoteDraft({ stepId: null, x: p.x - NOTE.W / 2, y: p.y - NOTE.H / 2, key: Date.now() });
  };
  const onConnect = (c) => {
    if (!/^s\d+$/.test(c.source || '') || !/^s\d+$/.test(c.target || '')) return;
    const a = +c.source.slice(1), b = +c.target.slice(1); if (a === b) return;
    apply((d) => connect(d, FID, a, b, c.sourceHandle === 'bs' || b < a));
  };
  const addLane = () => { if (laneName.trim() && apply((d) => o.addTeam(d, FID, laneName))) setLaneName(''); };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        {f && <Select value={idx} onChange={(v) => setIdx(+v)}>{flows.map((x, i) => <option key={i} value={i}>{x.title}</option>)}</Select>}
        {f && <span className="text-sm text-slate-500">{[f.every && 'Runs: ' + f.every, !isFree && f.teams.length + ' lanes', f.steps.length + (isFree ? ' boxes' : ' steps')].filter(Boolean).join(' · ')}</span>}
        {f && !isFree && <Btn onClick={() => newNote()} title="Add a sticky note">+ Note</Btn>}
        {isFree && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600" aria-label="Layout">Free canvas</span>}
        {isFree && [['rect', 'Rectangle', 'Add a rectangle'], ['rounded', 'Rounded box', 'Add a rounded box'], ['pill', 'Pill', 'Add a pill (start, end or any step)'], ['diamond', 'Diamond', 'Add a diamond: a yes/no question'], ['entity', 'Entity', 'Add an entity box: a name with description lines'], ['note', 'Note', 'Add a sticky note']].map(([k, label, tip]) => <Btn key={k} onClick={() => addRef.current?.(k)} title={tip}>+ {label}</Btn>)}
        {f && !isFree && <span className="flex items-center gap-1.5"><input aria-label="New lane name" className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" placeholder="New lane" value={laneName} onChange={(e) => setLaneName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLane()} /><Btn onClick={addLane} disabled={!laneName.trim()}>Add lane</Btn></span>}
        {f && !isFree && <Btn onClick={() => setSwitching(true)} title="Place boxes anywhere, like a slide">Switch to free canvas</Btn>}
        {f && <span className="flex items-center gap-1.5"><select aria-label="Skin" className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={skin} onChange={(e) => setSkin(e.target.value)} title="How the diagram looks (not saved in the file)">{SKIN_IDS.map((k) => <option key={k} value={k}>{SKINS[k].label}</option>)}</select><Btn onClick={() => exportAs('png')} title="Save the diagram as a PNG image">Export PNG</Btn><Btn onClick={() => exportAs('svg')} title="Save the diagram as an SVG image">Export SVG</Btn><Btn onClick={() => exportAs('md')} title="Save this flow as a Markdown document with a Mermaid diagram (renders on GitHub)">Export Mermaid</Btn><Btn onClick={() => exportAs('all')} title="Save every flow of this map as one Markdown document">All flows (.md)</Btn></span>}
        {exportErr && <span role="alert" className="text-sm text-red-700">{exportErr}</span>}
        <span className="ml-auto flex items-center gap-2"><input aria-label="New flow name" className="w-44 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" placeholder="New flow name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} /><Btn onClick={create} disabled={!name.trim()}>New flow</Btn>{f && <Btn onClick={() => setEditing(!editing)}>{editing ? 'Hide details' : 'Show details'}</Btn>}<Btn onClick={() => setAiOpen(true)} title="AI settings">AI</Btn></span>
      </div>
      {aiOpen && <AiPanel onClose={() => setAiOpen(false)} />}
      {switching && f && <SwitchLayout name={meta.title} onCancel={() => setSwitching(false)} onSwitch={() => { setSwitching(false); apply((d) => o.switchToFree(d, FID, swimlanePositions(graph, meta))); }} />}
      {!f && <p className="p-8 text-slate-500">No business flows yet for this map. Name one above to start.</p>}
      {f && (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {meta?.note && <div className="whitespace-pre-wrap border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-sm text-slate-700" aria-label="Flow note">{meta.note}</div>}
            {isFree && meta && <FreeCanvas skin={skin} meta={meta} rev={rev} onSelect={setSelIdx} onArrow={setSelArrow} addRef={addRef} />}
            {!isFree && <div ref={box} className="min-h-0 flex-1" onDoubleClick={(e) => { if (e.target.classList?.contains('react-flow__pane')) newNote(e); }}>
            {graph.nodes.length
              ? <FlowUi.Provider value={ui}><Canvas skin={skin} graph={graph} fitKey={'flow' + idx} rf={rf} onConnect={onConnect} onNode={(n) => { setSelIdx(n?.type === 'step' ? n.data.idx : null); setSelArrow(null); }} onEdge={(e) => { if (e.data) { setSelArrow(e.data); setSelIdx(null); } }} /></FlowUi.Provider>
              : <p className="p-8 text-slate-500">This flow has no lanes yet. Add a lane above (a team, like Finance), then double-click it to add the first step.</p>}
            </div>}
          </div>
          {editing && meta && <aside className="w-[360px] shrink-0 overflow-auto border-l border-slate-200 bg-white p-4"><FlowEdit key={meta.id} mapName={name_} flowId={meta.id} stepId={selIdx != null ? sid(selIdx) : null} arrow={selArrow} onArrowGone={() => setSelArrow(null)} onDeleted={() => setIdx(0)} /></aside>}
        </div>
      )}
    </div>
  );
}
