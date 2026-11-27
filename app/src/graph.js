import { MarkerType } from '@xyflow/react';
import { low } from './data.js';
import { openTicketsForSheet } from './lib/rollup.js';
import { SKINS } from './lib/skins.js';

const W = 230, H = 62, GAP = 10, PAD = 14;
const arrow = (color) => ({ type: MarkerType.ArrowClosed, color });

/* sheets map, drawn straight from the Data file so every node knows its real id:
 * departments are parent nodes, a header per function, then its files; apps sit in a band below. */
export function buildMap(d, { flow, showTix } = {}) {
  const nodes = [], edges = [], onMap = new Set(), idOf = new Map();
  d.sheets.forEach((s) => { const k = low(s.name); if (!idOf.has(k)) idOf.set(k, s.id); });
  const flowSheets = flow ? new Set(flow.steps.filter((s) => s.sheet).map((s) => idOf.get(low(s.sheet))).filter(Boolean)) : null;
  const sheetNode = (s, parentId, x, y) => ({
    id: s.id, type: 'sheet', parentId, extent: 'parent', position: { x, y }, draggable: false,
    data: { sheetId: s.id, n: { key: low(s.name), name: s.name, kind: s.kind, crit: s.crit, details: [s.owner, ...(s.details || [])].filter(Boolean).join(' · ') }, open: openTicketsForSheet(d, s.id), showTix, dim: !!flowSheets && !flowSheets.has(s.id) },
  });
  let maxH = 0;
  d.departments.forEach((dep, di) => {
    const id = 'dept:' + dep.id, box = { id, type: 'dept', position: { x: di * (W + PAD * 2 + 50), y: 0 }, data: { name: dep.name, depId: dep.id }, draggable: false, selectable: true, style: { width: W + PAD * 2 } };
    nodes.push(box);
    let y = 44;
    dep.sections.forEach((sc) => {
      nodes.push({ id: 'sec:' + sc.id, type: 'section', parentId: id, extent: 'parent', position: { x: PAD, y }, data: { title: sc.title, note: sc.note, secId: sc.id, depId: dep.id }, draggable: false, selectable: true });
      y += 44;
      d.sheets.filter((s) => s.sectionId === sc.id).forEach((s) => { onMap.add(s.id); nodes.push(sheetNode(s, id, PAD, y)); y += H + GAP; });
      y += 6;
    });
    box.style.height = y + 8; maxH = Math.max(maxH, y + 8);
  });
  const apps = d.sheets.filter((s) => s.kind === 'app'), appsY = maxH + 90;
  nodes.push({ id: 'apps', type: 'dept', position: { x: 0, y: appsY }, data: { name: 'Connected apps' }, draggable: false, selectable: false, style: { width: Math.max(1, apps.length) * (W + PAD) + PAD, height: 44 + H + 16 } });
  apps.forEach((s, i) => { onMap.add(s.id); nodes.push(sheetNode(s, 'apps', PAD + i * (W + PAD), 44)); });

  d.links.forEach((l) => {
    if (!onMap.has(l.fromId) || !onMap.has(l.toId)) return;
    const manual = /manual/i.test(l.label || '');
    edges.push({ id: 'l:' + l.id, source: l.fromId, target: l.toId, label: l.label, data: { linkId: l.id }, type: 'default', markerEnd: arrow('#7a8798'), style: { stroke: '#7a8798', strokeDasharray: manual ? '6 4' : undefined, cursor: 'pointer' }, labelStyle: { fontSize: 10 }, animated: !manual, interactionWidth: 24 });
  });
  /* flow overlay: the chosen business flow drawn on top of the files it touches */
  if (flow) {
    flow.edges.forEach((e, i) => {
      const a = flow.steps[e.from], b = flow.steps[e.to], from = a.sheet && idOf.get(low(a.sheet)), to = b.sheet && idOf.get(low(b.sheet));
      if (!from || !to || from === to || !onMap.has(from) || !onMap.has(to)) return;
      edges.push({ id: 'f' + i, source: from, target: to, label: `${a.team} → ${b.team}: ${b.title}`, markerEnd: arrow('#0b6bcb'), style: { stroke: '#0b6bcb', strokeWidth: 3 }, labelStyle: { fontSize: 11, fontWeight: 600 }, zIndex: 10 });
    });
  }
  return { nodes, edges };
}

/* swimlane flow: lanes are parent nodes, steps are children placed by dependency depth.
 * `draft` ({ team, from }) adds a box for a step that is still being typed, after step number `from` (an index) if there is one. */
export const LANE = { H: 130, GAP: 14, STEP_H: 74 };
export const NOTE = { W: 180, H: 96 };
export function buildFlow(flow, { draft = null, notes = [], noteDraft = null, kinds = [], skin = 'paper' } = {}) {
  const T = SKINS[skin] || SKINS.paper, { H: LH, GAP } = LANE, LX = 126, CW = 220;
  const lane = Object.fromEntries(flow.teams.map((t, i) => [low(t), i]));
  const col = flow.steps.map(() => 0), row = flow.steps.map(() => 0), cell = new Map(), inc = flow.steps.map(() => []);
  flow.edges.forEach((e) => inc[e.to].push(e.from));
  /* A step goes in the column after the furthest step it waits on. If another step of the same lane already has that place, the two are either branches
   * of the same step (a decision's Yes and No, both landing in one lane): stack them in the lane, so the arrows to each stay clear of the other box; or
   * unrelated: put the newcomer one column along. */
  flow.steps.forEach((s, i) => {
    let c = inc[i].length ? Math.max(...inc[i].map((f) => col[f] + 1)) : 0;
    for (;;) {
      const k = lane[low(s.team)] + ':' + c, occ = cell.get(k) || [];
      if (!occ.length) { cell.set(k, [i]); break; }
      if (occ.some((j) => inc[i].some((p) => inc[j].includes(p)))) { row[i] = occ.length; occ.push(i); break; }
      c++;
    }
    col[i] = c;
  });
  const ROW = LANE.STEP_H + 18, laneRows = flow.teams.map((t, li) => Math.max(1, ...flow.steps.filter((s) => lane[low(s.team)] === li).map((s) => row[flow.steps.indexOf(s)] + 1)));
  const laneH = laneRows.map((n) => Math.max(LH, 28 + n * ROW + 10)), laneY = laneH.map((_, li) => laneH.slice(0, li).reduce((a, h) => a + h + GAP, 0));
  const last = flow.steps.length ? Math.max(...col) : -1, dcol = last + 1, width = LX + (last + 1 + (draft ? 1 : 0) || 1) * CW + 20, nodes = [], edges = [];
  const empty = (t) => !flow.steps.some((s) => low(s.team) === low(t));
  flow.teams.forEach((t, i) => nodes.push({ id: 'lane' + i, type: 'lane', position: { x: 0, y: laneY[i] }, data: { team: t, i, empty: empty(t), n: flow.teams.length }, draggable: false, selectable: false, deletable: false, zIndex: -1, width, height: laneH[i] }));
  flow.steps.forEach((st, i) => nodes.push({ id: 's' + i, type: 'step', parentId: 'lane' + lane[low(st.team)], position: { x: LX + col[i] * CW, y: 28 + row[i] * ROW }, width: 180, height: LANE.STEP_H, data: { st, idx: i, kind: kinds[i] || null } }));
  if (draft && lane[low(draft.team)] != null) {
    nodes.push({ id: 'draft' + draft.key, type: 'draft', parentId: 'lane' + lane[low(draft.team)], position: { x: LX + dcol * CW, y: 28 }, data: { key: draft.key }, width: 180, height: 74, draggable: false, selectable: false, deletable: false });
    if (draft.from != null) edges.push({ id: 'draft-e', source: 's' + draft.from, target: 'draft' + draft.key, type: 'smoothstep', selectable: false, deletable: false, markerEnd: arrow('#0b6bcb'), style: { stroke: '#0b6bcb', strokeDasharray: '5 4' } });
  }
  flow.edges.forEach((e, k) => {
    const hand = low(flow.steps[e.from].team) !== low(flow.steps[e.to].team);
    edges.push({ id: 'e' + k, source: 's' + e.from, target: 's' + e.to, type: 'smoothstep', label: e.msg, data: { kind: 'trigger', from: e.from, to: e.to, tIdx: e.tIdx }, markerEnd: arrow(hand ? T.handoff : T.edge), style: { stroke: hand ? T.handoff : T.edge, strokeWidth: hand ? 2 : 1.5 }, labelStyle: kinds[e.from] === 'decision' ? { fontSize: 11, fontWeight: 700 } : { fontSize: 10 } });
  });
  flow.steps.forEach((st, i) => st.backs.forEach((b, k) => {
    const j = flow.steps.indexOf(b.ref);
    if (j >= 0) edges.push({ id: `b${i}_${k}`, source: 's' + i, sourceHandle: 'bs', target: 's' + j, targetHandle: 'bt', type: 'smoothstep', label: b.msg || 'sent back', data: { kind: 'back', from: i, to: j, k }, markerEnd: arrow(T.back), style: { stroke: T.back, strokeDasharray: '6 4' }, labelStyle: { fontSize: 10, fill: T.back } });
  }));
  /* where step i sits on the canvas (its lane's place plus its own) */
  const where = (i) => ({ x: LX + col[i] * CW, y: laneY[lane[low(flow.steps[i].team)]] + 28 + row[i] * ROW });
  const spot = (n) => { const w = n.at != null && n.at >= 0 ? where(n.at) : { x: 0, y: 0 }; return { x: w.x + n.x, y: w.y + n.y }; };
  notes.forEach((n) => {
    nodes.push({ id: 'note' + n.id, type: 'note', position: spot(n), width: NOTE.W, height: NOTE.H, zIndex: 10, data: { id: n.id, text: n.text, orphan: !!n.pinned && n.at < 0 } });
    if (n.pinned && n.at >= 0) edges.push({ id: 'nl' + n.id, source: 's' + n.at, sourceHandle: 'bs', target: 'note' + n.id, type: 'straight', selectable: false, focusable: false, deletable: false, style: { stroke: T.edge, strokeDasharray: '3 3' } });
  });
  if (noteDraft) nodes.push({ id: 'notedraft' + noteDraft.key, type: 'notedraft', position: spot(noteDraft), width: NOTE.W, height: NOTE.H, zIndex: 10, selectable: false, deletable: false, draggable: false, data: {} });
  return { nodes, edges };
}
