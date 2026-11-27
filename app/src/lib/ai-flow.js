/* Turn what the AI answered (checked on the server by ai_flow.py) into edits of the Data file. Pure: no DOM, no network.
 * Everything happens inside one apply(), so one Undo takes the whole generated flow back. */
import * as o from './ops.js';
import { effectiveWaits, effectiveWaitsFree } from './flow-edit.js';
import { layoutSteps, bottomOf, sizeOf, freeSpot } from './auto-layout.js';

const NOTE_AT = { x: 20, y: 86 };   // a note pinned to a step starts just below it (the same offset a hand-added note gets)
const LANE_H = 144, NOTE_W = 200;   // lane height with its gap, and the room one free note takes: free notes go in a row under the lanes

/* Fill an empty flow with the generated steps, arrows and notes. Returns the new step ids. */
export function applyGenerated(d, flowId, gen) {
  const f = d.flows.find((x) => x.id === flowId);
  if (!f) throw new Error('That flow no longer exists.');
  if (f.steps.length) throw new Error('Generate only fills an empty flow.');
  if (!gen?.steps?.length) throw new Error('The AI made no steps.');
  const sheetId = (name) => d.sheets.find((s) => s.name.toLowerCase() === String(name || '').toLowerCase())?.id;
  gen.teams.forEach((t) => { if (!f.teams.some((x) => x.toLowerCase() === t.toLowerCase())) f.teams.push(t); });
  const ids = gen.steps.map((st) => {
    const rest = { note: st.note || '' };
    if (st.kind) rest.kind = st.kind;
    if (st.day) rest.day = st.day;
    const sid = st.sheet && sheetId(st.sheet);
    if (sid) rest.sheetId = sid; else if (st.sheetName || st.sheet) rest.sheetName = st.sheetName || st.sheet;
    return o.addStep(d, flowId, { team: st.team, title: st.title, ...rest });
  });
  gen.steps.forEach((st, i) => {
    const s = f.steps.find((x) => x.id === ids[i]);
    s.triggers = st.waits.filter((w) => w.on < i).map((w) => ({ stepId: ids[w.on], msg: w.msg || '' }));
    /* no "waits on" arrow means "follows the step before" - except for a second start, which begins on its own */
    if (!s.triggers.length && st.kind === 'start' && i > 0) s.standalone = true;
  });
  let free = 0;
  gen.notes.forEach((n) => {
    if (n.step != null && ids[n.step]) o.addNote(d, flowId, { text: n.text, x: NOTE_AT.x, y: NOTE_AT.y, stepId: ids[n.step] });
    else o.addNote(d, flowId, { text: n.text, x: 20 + (free++) * NOTE_W, y: f.teams.length * LANE_H + 20 });
  });
  return ids;
}

/* Make the generated diagram in the chart type chosen (the AI's suggestion, or the user's override). A swimlane fills the swimlane flow as it always did.
 * Any other chart turns the (empty) flow into a free canvas and places the boxes with the app's own layout for that chart type. */
export function applyGeneratedAs(d, flowId, gen, chart) {
  if (chart === 'swimlane') {
    if (d.flows.find((x) => x.id === flowId)?.layout === 'free') throw new Error('A free canvas has no lanes, so a swimlane cannot be made here.');
    return applyGenerated(d, flowId, gen);
  }
  const f = d.flows.find((x) => x.id === flowId);
  if (!f) throw new Error('That flow no longer exists.');
  if (f.steps.length) throw new Error('Generate only fills an empty flow.');
  if (!gen?.steps?.length) throw new Error('The AI made no steps.');
  const sheetId = (name) => d.sheets.find((s) => s.name.toLowerCase() === String(name || '').toLowerCase())?.id, entity = chart === 'entity';
  if (f.layout !== 'free') o.switchToFree(d, flowId, {});      // nothing to keep yet: the flow is empty, so this only changes how it is drawn
  const L = layoutSteps(gen.steps, chart);
  const ids = gen.steps.map((st, i) => {
    const id = o.addShape(d, flowId, { x: L[i].x, y: L[i].y, w: L[i].w, h: L[i].h, shape: L[i].shape, title: st.title }), patch = { note: st.note || '' };
    if (!entity) { patch.team = st.team; if (st.kind) patch.kind = st.kind; if (st.day) patch.day = st.day; }
    const sid = st.sheet && sheetId(st.sheet); if (sid) patch.sheetId = sid; else if (st.sheetName || st.sheet) patch.sheetName = st.sheetName || st.sheet;
    o.updateStep(d, flowId, id, patch); return id;
  });
  gen.steps.forEach((st, i) => {
    const s = f.steps.find((x) => x.id === ids[i]); s.triggers = st.waits.filter((w) => w.on < i).map((w) => ({ stepId: ids[w.on], msg: w.msg || '' }));
    if (s.triggers.length) delete s.standalone;
  });
  let free = 0;
  gen.notes.forEach((n) => {
    if (n.step != null && ids[n.step]) o.addNote(d, flowId, { text: n.text, x: NOTE_AT.x, y: L[n.step].h + 12, stepId: ids[n.step] });
    else o.addNote(d, flowId, { text: n.text, x: 20 + (free++) * NOTE_W, y: bottomOf(L) + 40 });
  });
  return ids;
}

/* ---------- Ask AI: change a flow that already has steps ---------- */

/* The flow as the AI is told about it: only the words on it (never ticket ids), with the arrows spelled out. */
export function flowForAi(flow, sheets = []) {
  const sheet = (s) => (s.sheetId ? sheets.find((x) => x.id === s.sheetId)?.name : s.sheetName) || null, free = flow.layout === 'free';
  return { ...(free ? { layout: 'free' } : {}), steps: flow.steps.map((s, i) => ({ team: free ? '' : s.team, title: s.title, kind: s.kind || 'step', day: s.day || null, sheet: sheet(s), note: s.note || '', waits: free ? effectiveWaitsFree(flow, i) : effectiveWaits(flow, i) })) };
}

/* The server strips emails and ticket ids before the AI sees a text, and the AI may hand that stripped text back. A text that is just the stripped
 * copy of the real one is "not changed", so the real words (and the real email) are never overwritten by "[email removed]". */
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, TICKET = /\b[A-Z]{1,2}\d{8}\.\d{2,4}\b/g;
const stripped = (t) => String(t ?? '').replace(EMAIL, '[email removed]').replace(TICKET, '[ticket]');
const same = (want, was) => want === was || (typeof was === 'string' && want === stripped(was));

const key = (ws) => ws.map((w) => `${w.on ?? w.stepId}|${w.msg || ''}`).sort().join(',');
const sheetLabel = (d, s) => (s.sheetId ? d.sheets.find((x) => x.id === s.sheetId)?.name : s.sheetName) || '';

/* Make the changes the AI described. Steps it keeps (by `was`) keep their id, arrows and position, and only the words it changed are touched; steps it
 * leaves out go to Removed (so they can be restored); new steps are added where the AI put them. With { keepRemoved: true } (for the preview) the
 * steps it would delete stay in place so they can be drawn struck through. Returns what changed: { ids, added, changed: [{ id, changes: [{ field, from, to }] }], removed, arrowsAdded, arrowsRemoved }. */
export function applyEdit(d, flowId, edit, { keepRemoved = false } = {}) {
  const f = d.flows.find((x) => x.id === flowId);
  if (!f) throw new Error('That flow no longer exists.');
  if (!f.steps.length) throw new Error('There is nothing to change yet; use Generate flow on an empty flow.');
  if (!edit?.steps?.length) throw new Error('The AI made no steps.');
  const free = f.layout === 'free', cur = [...f.steps], before = cur.map((_, i) => (free ? effectiveWaitsFree(f, i) : effectiveWaits(f, i))), allEntity = free && cur.every((s) => s.shape === 'entity'), sheetId = (n) => d.sheets.find((s) => s.name.toLowerCase() === String(n || '').toLowerCase())?.id;
  const kept = new Set(), ids = [], out = { ids, added: [], changed: [], removed: [], arrowsAdded: 0, arrowsRemoved: 0 };
  /* 1. the steps: keep, retype or add */
  edit.steps.forEach((st, i) => {
    const s = st.was != null ? cur[st.was] : null;
    if (s && !kept.has(s)) {
      kept.add(s); ids[i] = s.id;
      /* a field the AI left out (it is absent from `st`) stays as it is */
      const want = free ? { title: st.title } : { team: st.team, title: st.title }, was = { team: s.team, title: s.title, kind: s.kind, day: s.day || null, note: s.note || '' };
      if ('kind' in st) want.kind = !st.kind || st.kind === 'step' ? undefined : st.kind;
      if ('day' in st) want.day = st.day || null;
      if ('note' in st) want.note = st.note || '';
      const sid = st.sheet && sheetId(st.sheet), nameWanted = sid ? sheetLabel(d, { sheetId: sid }) : (st.sheetName || st.sheet || '');
      const patch = {}, changes = [];
      for (const k of Object.keys(want)) if (!same(want[k], was[k]) && !(k === 'team' && want.team.toLowerCase() === was.team.toLowerCase())) { patch[k] = want[k]; changes.push({ field: k, from: was[k] ?? '', to: want[k] ?? '' }); }
      if (('sheet' in st || 'sheetName' in st) && !same(nameWanted, sheetLabel(d, s))) { patch.sheetId = sid || undefined; patch.sheetName = sid ? undefined : (nameWanted || undefined); changes.push({ field: 'sheet', from: sheetLabel(d, s), to: nameWanted }); }
      if (changes.length) { o.updateStep(d, flowId, s.id, patch); out.changed.push({ id: s.id, changes }); }
    } else {
      const rest = { note: st.note || '' }; if (st.kind && st.kind !== 'step') rest.kind = st.kind; if (st.day) rest.day = st.day;
      const sid = st.sheet && sheetId(st.sheet); if (sid) rest.sheetId = sid; else if (st.sheetName || st.sheet) rest.sheetName = st.sheetName || st.sheet;
      if (free) {
        /* on a free canvas the new box goes beside the first box it connects to (or under everything), clear of every box, including ones the preview keeps */
        const size = sizeOf({ ...st, kind: st.kind === 'step' ? null : st.kind }, allEntity ? 'entity' : 'flowchart'), at = st.waits.map((w) => f.steps.find((x) => x.id === ids[w.on])).find((x) => x && Number.isFinite(x.x));
        const spot = freeSpot(f.steps.map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h })), size, at ? { x: at.x, y: at.y, w: at.w, h: at.h } : null);
        ids[i] = o.addShape(d, flowId, { x: spot.x, y: spot.y, w: size.w, h: size.h, shape: size.shape, title: st.title }); o.updateStep(d, flowId, ids[i], rest);
      } else {
        const prev = i > 0 ? ids[i - 1] : null;
        ids[i] = o.addStep(d, flowId, { team: st.team, title: st.title, ...rest, ...(prev ? { afterStepId: prev } : {}) });
        if (!prev) { const n = f.steps.pop(); n.sort = f.steps[0].sort - 1024; f.steps.unshift(n); }
      }
      out.added.push(ids[i]);
    }
  });
  /* 2. the arrows: a kept step whose arrows the AI did not change is left exactly as it was (the automatic arrow stays automatic) */
  edit.steps.forEach((st, i) => {
    const s = f.steps.find((x) => x.id === ids[i]), waits = (st.waits || []).filter((w) => (free ? w.on !== i : w.on < i) && ids[w.on]).map((w) => ({ stepId: ids[w.on], msg: w.msg || '' }));
    const was = st.was != null && cur[st.was] === s ? before[st.was].map((w) => ({ stepId: cur[w.on].id, msg: w.msg })) : null;
    if (was) {
      if (key(was.map((w) => ({ on: w.stepId, msg: w.msg }))) === key(waits.map((w) => ({ on: w.stepId, msg: w.msg })))) return;
      const have = new Set(was.map((w) => `${w.stepId}|${w.msg}`)), want = new Set(waits.map((w) => `${w.stepId}|${w.msg}`));
      out.arrowsAdded += [...want].filter((x) => !have.has(x)).length; out.arrowsRemoved += [...have].filter((x) => !want.has(x)).length;
    } else out.arrowsAdded += waits.length;
    s.triggers = waits;
    if (free) { if (s.triggers.length) delete s.standalone; else s.standalone = true; }
    else if (!s.triggers.length && (was || st.kind === 'start') && f.steps.indexOf(s) > 0) s.standalone = true; else delete s.standalone;
  });
  /* 3. the steps the AI left out */
  cur.filter((s) => !kept.has(s)).forEach((s) => { out.removed.push(s.id); if (!keepRemoved) o.removeStep(d, flowId, s.id); });
  /* 4. new notes */
  let row = 0;
  (edit.notes || []).forEach((n) => {
    const at = n.step != null && ids[n.step] ? f.steps.find((x) => x.id === ids[n.step]) : null;
    if (at) o.addNote(d, flowId, { text: n.text, x: NOTE_AT.x, y: free ? (at.h || 74) + 12 : NOTE_AT.y, stepId: at.id });
    else o.addNote(d, flowId, { text: n.text, x: 20 + (row++) * NOTE_W, y: free ? bottomOf(f.steps.map((x) => ({ y: x.y, h: x.h }))) + 40 : f.teams.length * LANE_H + 20 });
  });
  return out;
}
