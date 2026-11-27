import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionMode } from '@xyflow/react';
import { buildFree } from '../free-graph.js';
import { Canvas } from './ui.jsx';
import { FlowUi } from './nodes.jsx';
import { apply, useRecords } from '../lib/records.js';
import * as o from '../lib/ops.js';
import { connectFree, removeArrow } from '../lib/flow-edit.js';

/* The free canvas: boxes you place by hand, like a slide. Double-click empty space to add a box, drag to move, drag the handles of a selected box to resize,
 * drag from a dot on a box's edge to another box to draw an arrow, double-click a box to retype it, Delete removes what is selected.
 * Every change goes through apply(), so it undoes; a deleted box or arrow goes to Removed. Drawn straight from the Data file. */
export default function FreeCanvas({ meta, rev, onSelect, onArrow, addRef, skin = 'paper' }) {
  const { data } = useRecords(), [typing, setTyping] = useState(null), [typingBody, setTypingBody] = useState(null), [editingNote, setEditingNote] = useState(null), [noteDraft, setNoteDraft] = useState(null), inst = useRef(null), box = useRef(null), FID = meta.id, sid = (i) => meta.steps[i]?.id;
  const graph = useMemo(() => buildFree(meta, { sheets: data.sheets, noteDraft: noteDraft && { x: noteDraft.x, y: noteDraft.y, key: noteDraft.key, stepId: noteDraft.stepId }, skin }), [meta, rev, noteDraft, skin]);
  useEffect(() => { setTyping(null); setTypingBody(null); setEditingNote(null); setNoteDraft(null); }, [FID]);
  const ui = useMemo(() => ({
    editing: typing, edit: setTyping, stopEdit: () => setTyping(null), editingBody: typingBody, editBody: setTypingBody, stopBody: () => setTypingBody(null), editingNote,
    commitBody: (i, v) => { setTypingBody(null); if (v !== (meta.steps[i]?.note || '')) apply((d) => o.updateStep(d, FID, sid(i), { note: v })); },
    noteOn: (i) => setNoteDraft({ stepId: sid(i), x: 20, y: (meta.steps[i]?.h || o.BOX.H) + 12, key: Date.now() }),
    noteEdit: setEditingNote, noteStop: () => setEditingNote(null),
    noteCommit: (id, text) => { setEditingNote(null); const n = (meta.notes || []).find((x) => x.id === id); if (!n) return; if (!text.trim()) apply((d) => o.removeNote(d, FID, id)); else if (text !== n.text) apply((d) => o.updateNote(d, FID, id, { text })); },
    noteDel: (id) => apply((d) => o.removeNote(d, FID, id)),
    noteDraftCancel: () => setNoteDraft(null),
    noteDraftCommit: (text) => { const nd = noteDraft; setNoteDraft(null); if (nd && text.trim()) apply((d) => o.addNote(d, FID, { text, x: nd.x, y: nd.y, ...(nd.stepId ? { stepId: nd.stepId } : {}) })); },
    commitTitle: (i, v) => { setTyping(null); const t = v.trim(); if (t && t !== meta.steps[i]?.title) apply((d) => o.updateStep(d, FID, sid(i), { title: t })); },
    del: (i) => { const id = sid(i); onSelect(null); apply((d) => o.removeStep(d, FID, id)); },
    resize: (i, p) => apply((d) => o.placeShape(d, FID, sid(i), { x: p.x, y: p.y, w: p.width, h: p.height })),
  }), [meta, rev, typing, typingBody, editingNote, noteDraft]);

  /* a new box (or a sticky note) where the pointer is (a double-click), or in the middle of what you can see; a box opens for typing at once */
  const add = (shape, e) => {
    if (!inst.current) return;
    /* from a button the box goes to the middle of the view, a little further along each time so new boxes do not sit on top of each other */
    const r = box.current?.getBoundingClientRect(), nudge = (meta.steps.length % 6) * 30, at = e ? { x: e.clientX, y: e.clientY } : { x: r.x + r.width / 2 + nudge - 75, y: r.y + r.height / 2 + nudge - 75 };
    const p = inst.current.screenToFlowPosition(at), n = meta.steps.length;
    if (shape === 'note') { setNoteDraft({ stepId: null, x: p.x - 90, y: p.y - 48, key: Date.now() }); return; }
    const w = shape === 'entity' ? o.BOX.ENTITY_W : o.BOX.W, h = shape === 'entity' ? o.BOX.ENTITY_H : o.BOX.H;
    if (apply((d) => o.addShape(d, FID, { x: p.x - w / 2, y: p.y - h / 2, shape }))) { onSelect(n); setTyping(n); }
  };
  useEffect(() => { if (addRef) addRef.current = add; });

  /* a dragged note is saved where it was dropped: on the canvas, or as an offset from its box when it is pinned to one */
  const moveNote = (n) => {
    const note = (meta.notes || []).find((x) => x.id === n.data.id); if (!note) return;
    let { x, y } = n.position; const st = note.stepId ? meta.steps.find((q) => q.id === note.stepId) : null;
    if (st) { x -= st.x; y -= st.y; }
    if (Math.abs(x - note.x) < 2 && Math.abs(y - note.y) < 2) return;
    apply((d) => o.updateNote(d, FID, note.id, { x: Math.round(x), y: Math.round(y) }));
  };
  const rf = {
    zoomOnDoubleClick: false, onInit: (i) => { inst.current = i; }, deleteKeyCode: ['Backspace', 'Delete'], connectionMode: ConnectionMode.Loose, minZoom: 0.1,
    onNodeDoubleClick: (_, n) => { if (n.type === 'free') setTyping(n.data.idx); else if (n.type === 'note') setEditingNote(n.data.id); },
    onNodeDragStop: (_, n) => { if (n.type === 'note') { moveNote(n); return; } if (n.type !== 'free') return; const s = meta.steps[n.data.idx]; if (Math.abs(n.position.x - s.x) >= 1 || Math.abs(n.position.y - s.y) >= 1) apply((d) => o.placeShape(d, FID, sid(n.data.idx), { x: n.position.x, y: n.position.y })); },
    onDelete: ({ nodes, edges }) => {
      const gone = nodes.filter((n) => n.type === 'free').map((n) => n.data.idx), ids = gone.map(sid), noteIds = nodes.filter((n) => n.type === 'note').map((n) => n.data.id);
      const arrows = edges.filter((e) => e.data && !gone.includes(e.data.from) && !gone.includes(e.data.to)).map((e) => e.data).sort((a, b) => (b.tIdx ?? b.k) - (a.tIdx ?? a.k));
      if (!ids.length && !arrows.length && !noteIds.length) return;
      onSelect(null); apply((d) => { arrows.forEach((a) => removeArrow(d, FID, a)); noteIds.forEach((id) => o.removeNote(d, FID, id)); ids.forEach((id) => o.removeStep(d, FID, id)); });
    },
  };
  const onConnect = (c) => {
    if (!/^s\d+$/.test(c.source || '') || !/^s\d+$/.test(c.target || '')) return;
    apply((d) => connectFree(d, FID, +c.source.slice(1), +c.target.slice(1)));
  };
  return (
    <div ref={box} className="min-h-0 flex-1" onDoubleClick={(e) => { if (e.target.classList?.contains('react-flow__pane')) add('rounded', e); }}>
      <FlowUi.Provider value={ui}><Canvas skin={skin} graph={graph} fitKey={'free' + FID} rf={rf} onConnect={onConnect} onNode={(n) => { onSelect(n?.type === 'free' ? n.data.idx : null); if (n) onArrow(null); }} onEdge={(e) => { if (e.data) { onArrow(e.data); onSelect(null); } }} /></FlowUi.Provider>
    </div>
  );
}
