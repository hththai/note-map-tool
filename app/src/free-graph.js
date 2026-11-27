/* The free canvas, drawn straight from the Data file (the old Markdown view has no place for positions or sizes).
 * Every box is a step: node `s<i>` is the i-th step of the flow, so an arrow's `data` ({ kind, from, to, tIdx | k }) means the same as on the swimlane
 * and the same edit functions (removeArrow, the details panel) work on both. Sticky notes are drawn where they sit (pinned ones relative to their box). */
import { MarkerType } from '@xyflow/react';
import { BOX } from './lib/ops.js';
import { SKINS } from './lib/skins.js';

const arrow = (color) => ({ type: MarkerType.ArrowClosed, color });
const NOTE = { W: 180, H: 96 };

/* which side of a box an arrow leaves from, and which side it arrives at: the sides that face each other */
function sides(a, b) {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2), horizontal = Math.abs(dx) * (a.h + b.h) > Math.abs(dy) * (a.w + b.w);
  return horizontal ? (dx > 0 ? ['r', 'l'] : ['l', 'r']) : (dy > 0 ? ['b', 't'] : ['t', 'b']);
}

export function buildFree(meta, { sheets = [], noteDraft = null, skin = 'paper' } = {}) {
  const T = SKINS[skin] || SKINS.paper;
  const box = (s) => ({ x: s.x ?? 0, y: s.y ?? 0, w: s.w ?? BOX.W, h: s.h ?? BOX.H }), steps = meta.steps, at = new Map(steps.map((s, i) => [s.id, i]));
  const nodes = steps.map((s, i) => { const b = box(s); return { id: 's' + i, type: 'free', position: { x: b.x, y: b.y }, width: b.w, height: b.h, data: { st: s, idx: i, kind: s.kind || null, shape: s.shape || 'rounded', sheetName: (s.sheetId ? sheets.find((x) => x.id === s.sheetId)?.name : s.sheetName) || null } }; });
  const edges = [];
  steps.forEach((s, i) => {
    let n = -1;
    s.triggers.forEach((t) => {
      const from = at.get(t.stepId); if (from == null) return;           // a trigger that is not a live step (in Removed, or a team name) draws nothing
      n++; const [sh, th] = sides(box(steps[from]), box(s)), decision = steps[from].kind === 'decision';
      edges.push({ id: `e${i}_${n}`, source: 's' + from, sourceHandle: sh, target: 's' + i, targetHandle: th, type: 'smoothstep', label: t.msg, data: { kind: 'trigger', from, to: i, tIdx: n }, markerEnd: arrow(T.edge), style: { stroke: T.edge, strokeWidth: 2 }, labelStyle: decision ? { fontSize: 11, fontWeight: 700 } : { fontSize: 10 } });
    });
    let k = -1;
    s.backs.forEach((b) => {
      const to = at.get(b.stepId); if (to == null) return;
      k++; const [sh, th] = sides(box(s), box(steps[to]));
      edges.push({ id: `b${i}_${k}`, source: 's' + i, sourceHandle: sh, target: 's' + to, targetHandle: th, type: 'smoothstep', label: b.msg || 'sent back', data: { kind: 'back', from: i, to, k }, markerEnd: arrow(T.back), style: { stroke: T.back, strokeDasharray: '6 4' }, labelStyle: { fontSize: 10, fill: T.back } });
    });
  });
  /* a pinned note sits at an offset from its box; a free one at its own place on the canvas */
  const spot = (n) => { const p = n.stepId != null && at.has(n.stepId) ? box(steps[at.get(n.stepId)]) : { x: 0, y: 0 }; return { x: p.x + n.x, y: p.y + n.y }; };
  (meta.notes || []).forEach((n) => {
    nodes.push({ id: 'note' + n.id, type: 'note', position: spot(n), width: NOTE.W, height: NOTE.H, zIndex: 10, data: { id: n.id, text: n.text, orphan: !!n.stepId && !at.has(n.stepId) } });
    if (n.stepId != null && at.has(n.stepId)) edges.push({ id: 'nl' + n.id, source: 's' + at.get(n.stepId), sourceHandle: 'b', target: 'note' + n.id, type: 'straight', selectable: false, focusable: false, deletable: false, style: { stroke: T.edge, strokeDasharray: '3 3' } });
  });
  if (noteDraft) nodes.push({ id: 'notedraft' + noteDraft.key, type: 'notedraft', position: spot(noteDraft), width: NOTE.W, height: NOTE.H, zIndex: 10, selectable: false, deletable: false, draggable: false, data: {} });
  return { nodes, edges };
}

/* Where every step of a swimlane flow sits on screen right now (its lane's place plus its own), as { stepId: { x, y, w, h } }, for switching to a free canvas. */
export function swimlanePositions(graph, meta) {
  const by = new Map(graph.nodes.map((n) => [n.id, n])), out = {};
  meta.steps.forEach((s, i) => { const n = by.get('s' + i); if (!n) return; const lane = by.get(n.parentId); out[s.id] = { x: (lane?.position.x || 0) + n.position.x, y: (lane?.position.y || 0) + n.position.y, w: n.width || BOX.W, h: n.height || BOX.H }; });
  return out;
}
