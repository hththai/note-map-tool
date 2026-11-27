/* Drawing on the flow canvas, as plain edits of the Data file (called from inside apply()). Pure: no DOM.
 * The canvas shows a copy of each flow built from the file, so an arrow it draws is found again by its place in the step's list.
 * That copy leaves out arrows to steps that are in Removed, so a place in it is turned back into a place in the file here. */

const live = (f, id) => f.steps.some((x) => x.id === id);
/* the n-th arrow the canvas shows for a list of triggers or backs, as its place in the file's list (-1 if it is not there) */
export function placeInFile(f, list, n) {
  let seen = -1;
  for (let k = 0; k < list.length; k++) if (!list[k].stepId || live(f, list[k].stepId)) { seen++; if (seen === n) return k; }
  return -1;
}

/* The first two arrows out of a decision are its Yes and No branches; any other arrow starts without a message. */
export function branchLabel(f, from) {
  if (from?.kind !== 'decision') return '';
  return ['Yes', 'No'][f.steps.reduce((n, x) => n + x.triggers.filter((t) => t.stepId === from.id).length, 0)] || '';
}

/* A new arrow between two steps, by their place in the flow. Into a later step it is a "waits on" arrow; to an earlier step (or from
 * the bottom handle) it is a dashed "sent back" arrow. Returns false when there was nothing to add. */
export function connect(d, flowId, a, b, back) {
  const f = d.flows.find((x) => x.id === flowId), A = f?.steps[a], B = f?.steps[b];
  if (!A || !B || A === B) return false;
  if (back) { if (A.backs.some((x) => x.stepId === B.id)) return false; A.backs.push({ stepId: B.id, msg: '' }); return true; }
  if (B.triggers.some((x) => x.stepId === A.id)) return false;
  /* a step with no arrow in follows the step before it; keep that arrow, so drawing a new one adds to it instead of replacing it */
  const before = f.steps[b - 1];
  if (!B.triggers.length && !B.standalone && before && before !== A) B.triggers.push({ stepId: before.id, msg: '' });
  B.triggers.push({ stepId: A.id, msg: branchLabel(f, A) }); delete B.standalone; return true;
}

/* Take away one arrow the canvas drew. `e` is the data the canvas keeps on it: { kind: 'trigger', to, tIdx } or { kind: 'back', from, k }.
 * A step left with no arrow in is marked "starts on its own", so it does not quietly start following the step before it. */
export function removeArrow(d, flowId, e) {
  const f = d.flows.find((x) => x.id === flowId); if (!f) return;
  if (e.kind === 'trigger') {
    const s = f.steps[e.to]; if (!s) return;
    if (e.tIdx >= 0) { const k = placeInFile(f, s.triggers, e.tIdx); if (k < 0) return; s.triggers.splice(k, 1); }
    if (!s.triggers.some((t) => !t.stepId || live(f, t.stepId))) s.standalone = true;
  } else {
    const s = f.steps[e.from]; if (!s) return;
    const k = placeInFile(f, s.backs, e.k); if (k >= 0) s.backs.splice(k, 1);
  }
}

/* The message on one arrow the canvas drew ('' if none). Same address as removeArrow: { kind: 'trigger', to, tIdx } or { kind: 'back', from, k }. */
export function arrowMessage(d, flowId, e) {
  const f = d.flows.find((x) => x.id === flowId); if (!f) return '';
  const s = f.steps[e.kind === 'trigger' ? e.to : e.from]; if (!s) return '';
  const list = e.kind === 'trigger' ? s.triggers : s.backs, k = e.kind === 'trigger' ? (e.tIdx >= 0 ? placeInFile(f, list, e.tIdx) : -1) : placeInFile(f, list, e.k);
  return k >= 0 ? list[k].msg || '' : '';
}
/* Change the message on one arrow. The automatic arrow from the step before has no message of its own, so it becomes a real "waits on" arrow first. */
export function setArrowMessage(d, flowId, e, msg) {
  const f = d.flows.find((x) => x.id === flowId); if (!f) return;
  if (e.kind === 'trigger') {
    const s = f.steps[e.to]; if (!s) return;
    if (e.tIdx < 0) { const before = f.steps[e.to - 1]; if (!before) return; s.triggers.push({ stepId: before.id, msg }); return; }
    const k = placeInFile(f, s.triggers, e.tIdx); if (k >= 0) s.triggers[k].msg = msg;
  } else {
    const s = f.steps[e.from]; if (!s) return; const k = placeInFile(f, s.backs, e.k); if (k >= 0) s.backs[k].msg = msg;
  }
}

/* the arrows into a step as a swimlane diagram draws them: a "waits on" arrow to a step, an arrow from the nearest earlier step of a named team,
 * or (when the step has no arrow of its own) the one automatic arrow from the step before. Same rules as lib/flows-parser.js. */
export function effectiveWaits(f, i) {
  const s = f.steps[i], out = [];
  s.triggers.forEach((t) => {
    if (t.stepId) { const k = f.steps.findIndex((x) => x.id === t.stepId); if (k >= 0 && k < i) out.push({ on: k, msg: t.msg || '' }); return; }
    for (let j = i - 1; j >= 0; j--) if (f.steps[j].team.toLowerCase() === String(t.team || '').toLowerCase()) { out.push({ on: j, msg: t.msg || '' }); return; }
  });
  return out.length || s.triggers.length || s.standalone || i === 0 ? out : [{ on: i - 1, msg: '' }];
}

/* A new arrow on a free canvas: from one box to another, in any direction (there is no "earlier" or "later" without lanes).
 * Returns false when there was nothing to add. */
export function connectFree(d, flowId, a, b) {
  const f = d.flows.find((x) => x.id === flowId), A = f?.steps[a], B = f?.steps[b];
  if (!A || !B || A === B || B.triggers.some((x) => x.stepId === A.id)) return false;
  B.triggers.push({ stepId: A.id, msg: branchLabel(f, A) }); delete B.standalone; return true;
}

/* the arrows into a box on a free canvas: exactly the "waits on" arrows to other boxes, in any direction (no automatic arrow, no lanes) */
export function effectiveWaitsFree(f, i) {
  return f.steps[i].triggers.filter((t) => t.stepId).map((t) => ({ on: f.steps.findIndex((x) => x.id === t.stepId), msg: t.msg || '' })).filter((w) => w.on >= 0 && w.on !== i);
}
