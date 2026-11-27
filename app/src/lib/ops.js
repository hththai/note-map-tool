/* Edits on a Data file. Each function changes the draft it is given and nothing else (no DOM, no saving),
 * so they are easy to test and the app can undo them by keeping the previous copy. A function that cannot do what was
 * asked throws an Error with a plain-words reason; the app shows it and changes nothing.
 *
 * Deleting never destroys: a sheet, app, ticket, link, flow or flow step goes to data.removed with everything needed to put it
 * back exactly. Every one of those carries a permanent `sort` number that never changes when something is removed, so an Entry
 * restored later goes back exactly where it was. Tickets and flow steps keep pointing at a removed sheet's id, and arrows keep pointing at a removed step's id
 * (the file stays valid while it is in Removed), so restoring needs no re-linking. Departments and sections can only be deleted when empty,
 * so nothing is lost with them. */
import { newId, STEP, FILE_TYPES } from './schema.js';
import { effectiveWaits } from './flow-edit.js';

export { STEP };
const now = () => new Date().toISOString();
/* today's date where the user is (not UTC: before 11am in Tasmania, UTC is still yesterday) */
const today = () => { const x = new Date(); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const need = (cond, why) => { if (!cond) throw new Error(why); };
const pick = (list, id, what) => { const x = list.find((y) => y.id === id); need(x, `That ${what} no longer exists.`); return x; };

function place(list, item) {
  const i = list.findIndex((x) => x.sort > item.sort);
  list.splice(i < 0 ? list.length : i, 0, item);
}
/* the sort number for a new Entry after everything in `list`, counting what is in Removed too so a restore can never collide */
function sortAfter(d, what, list, flowId) {
  const gone = d.removed.flatMap((r) => {
    if (what === 'sheets') return r.kind === 'sheet' || r.kind === 'app' ? [r.entry] : [];
    if (what === 'links') return [...(r.links || []).map((x) => x.link), ...(r.kind === 'link' ? [r.entry] : [])];
    if (what === 'tickets') return r.kind === 'ticket' ? [r.entry] : [];
    if (what === 'flows') return r.kind === 'flow' ? [r.entry] : [];
    if (what === 'flowlinks') return [...(r.flowLinks || []), ...(r.kind === 'flowlink' ? [r.entry] : [])];
    if (what === 'notes') return r.kind === 'note' && r.flowId === flowId ? [r.entry] : [];
    return r.kind === 'step' && r.flowId === flowId ? [r.entry] : [];
  });
  return Math.max(0, ...list.map((x) => x.sort || 0), ...gone.map((x) => x.sort || 0)) + STEP;
}
/* swap two neighbours' places: both their sort numbers and their positions */
function shift(list, id, dir, same = () => true) {
  const mine = list.findIndex((x) => x.id === id);
  let j = mine + dir; while (list[j] && !same(list[j])) j += dir;
  if (!list[j]) return;
  [list[mine].sort, list[j].sort] = [list[j].sort, list[mine].sort];
  [list[mine], list[j]] = [list[j], list[mine]];
}

/* ---- departments and sections ---- */
export function addDepartment(d, name) { need(name.trim(), 'A department needs a name.'); const dep = { id: newId('d'), name: name.trim(), text: [], sections: [] }; d.departments.push(dep); return dep.id; }
export function updateDepartment(d, id, patch) { Object.assign(pick(d.departments, id, 'department'), patch); }
export function removeDepartment(d, id) {
  const dep = pick(d.departments, id, 'department');
  need(!d.sheets.some((s) => s.departmentId === id), `"${dep.name}" still has sheets. Move or delete them first.`);
  need(!d.tickets.items.some((t) => t.targetId === id), `"${dep.name}" still has tickets about it.`);
  need(!(dep.members || []).length, `"${dep.name}" still has members. Remove them first.`);
  d.departments = d.departments.filter((x) => x.id !== id);
}
/* members of a department: who is in it and what they do. Sheet owners stay plain names; members are what the owner pick-list offers. */
const findMember = (d, depId, id) => pick(pick(d.departments, depId, 'department').members || [], id, 'member');
export function addMember(d, depId, { name, role = '', email = '' }) {
  need(String(name || '').trim(), 'A member needs a name.');
  const m = { id: newId('m'), name: name.trim(), role: role.trim() }; if (email.trim()) m.email = email.trim();
  (pick(d.departments, depId, 'department').members ||= []).push(m); return m.id;
}
export function updateMember(d, depId, id, patch) {
  if ('name' in patch) need(String(patch.name).trim(), 'A member needs a name.');
  const m = findMember(d, depId, id); Object.assign(m, patch); if (!m.email) delete m.email;
}
export function removeMember(d, depId, id) {
  const dep = pick(d.departments, depId, 'department'); findMember(d, depId, id);
  dep.members = dep.members.filter((m) => m.id !== id); if (!dep.members.length) delete dep.members;
}
/* replace the whole members list (a modal edits it as a draft). Rows without a name are dropped; new rows get an id; none left removes the field. */
export function setMembers(d, depId, list) {
  const dep = pick(d.departments, depId, 'department'), out = [];
  for (const m of list) {
    if (!String(m.name || '').trim()) continue;
    const x = { id: m.id || newId('m'), name: m.name.trim(), role: String(m.role || '').trim() }; if (String(m.email || '').trim()) x.email = m.email.trim();
    out.push(x);
  }
  if (out.length) dep.members = out; else delete dep.members;
}
export function shiftDepartment(d, id, dir) { const i = d.departments.findIndex((x) => x.id === id), j = i + dir; if (d.departments[j]) [d.departments[i], d.departments[j]] = [d.departments[j], d.departments[i]]; }
export function addSection(d, departmentId, title) { const sec = { id: newId('c'), title: title.trim() || null, note: '' }; pick(d.departments, departmentId, 'department').sections.push(sec); return sec.id; }
const findSection = (d, id) => { for (const dep of d.departments) { const s = dep.sections.find((x) => x.id === id); if (s) return { dep, s }; } throw new Error('That function no longer exists.'); };
export function updateSection(d, id, patch) { Object.assign(findSection(d, id).s, patch); }
export function removeSection(d, id) {
  const { dep, s } = findSection(d, id);
  need(!d.sheets.some((x) => x.sectionId === id), `"${s.title || 'This function'}" still has sheets. Move or delete them first.`);
  dep.sections = dep.sections.filter((x) => x.id !== id);
}
export function shiftSection(d, id, dir) { const { dep } = findSection(d, id), i = dep.sections.findIndex((x) => x.id === id), j = i + dir; if (dep.sections[j]) [dep.sections[i], dep.sections[j]] = [dep.sections[j], dep.sections[i]]; }

/* ---- sheets and apps ---- */
export function addSheet(d, { kind = 'sheet', name, departmentId = null, sectionId = null }) {
  need(name.trim(), 'A sheet needs a name.');
  if (kind === 'sheet') { need(departmentId && sectionId, 'A sheet belongs to a department and a function.'); need(findSection(d, sectionId).dep.id === departmentId, 'That function is not in that department.'); }
  const s = { id: newId('s'), kind, name: name.trim(), departmentId: kind === 'app' ? null : departmentId, sectionId: kind === 'app' ? null : sectionId, owner: '', details: [], crit: null, url: null, note: '', sort: sortAfter(d, 'sheets', d.sheets) };
  d.sheets.push(s); return s.id;
}
export function updateSheet(d, id, patch) {
  const s = pick(d.sheets, id, 'sheet');
  if ('type' in patch) need(!patch.type || FILE_TYPES.includes(patch.type), 'Unknown file type.');
  Object.assign(s, patch);
  if (!s.type || s.type === 'sheet') delete s.type; /* a Google Sheet is the default, so it is not written */
}
/* replace all documentation links (a modal edits them as a draft); rows without an address are dropped */
export function setDocs(d, sheetId, list) {
  const s = pick(d.sheets, sheetId, 'sheet'), docs = list.filter((x) => String(x.url || '').trim()).map((x) => ({ label: String(x.label || '').trim(), url: x.url.trim() }));
  if (docs.length) s.docs = docs; else delete s.docs;
}
/* documentation links of a file */
export function addDoc(d, sheetId, { label = '', url }) {
  need(String(url || '').trim(), 'A documentation link needs an address.');
  (pick(d.sheets, sheetId, 'sheet').docs ||= []).push({ label: label.trim(), url: url.trim() });
}
export function updateDoc(d, sheetId, index, patch) {
  const doc = (pick(d.sheets, sheetId, 'sheet').docs || [])[index]; need(doc, 'That documentation link no longer exists.');
  if ('url' in patch) need(String(patch.url).trim(), 'A documentation link needs an address.');
  Object.assign(doc, patch);
}
export function removeDoc(d, sheetId, index) {
  const s = pick(d.sheets, sheetId, 'sheet'); need((s.docs || [])[index], 'That documentation link no longer exists.');
  s.docs.splice(index, 1); if (!s.docs.length) delete s.docs;
}
export function moveSheet(d, id, sectionId) {
  const s = pick(d.sheets, id, 'sheet'); need(s.kind === 'sheet', 'Apps do not belong to a department.');
  const { dep } = findSection(d, sectionId);
  d.sheets = d.sheets.filter((x) => x !== s); s.departmentId = dep.id; s.sectionId = sectionId; s.sort = sortAfter(d, 'sheets', d.sheets); d.sheets.push(s);
}
export function shiftSheet(d, id, dir) { const s = pick(d.sheets, id, 'sheet'); shift(d.sheets, id, dir, (x) => x.sectionId === s.sectionId && x.kind === s.kind); }
export function removeSheet(d, id) {
  const i = d.sheets.findIndex((s) => s.id === id), sheet = d.sheets[i];
  need(sheet, 'That sheet no longer exists.');
  const links = d.links.filter((l) => l.fromId === id || l.toId === id).map((link) => ({ link }));
  d.links = d.links.filter((l) => l.fromId !== id && l.toId !== id);
  d.sheets.splice(i, 1);
  d.removed.push({ id: newId('x'), kind: sheet.kind, label: sheet.name, removedAt: now(), entry: sheet, links });
}

/* ---- links ---- */
export function addLink(d, { fromId, toId, label = '' }) {
  pick(d.sheets, fromId, 'sheet'); pick(d.sheets, toId, 'sheet'); need(fromId !== toId, 'A link needs two different sheets.');
  const l = { id: newId('l'), fromId, toId, label, sort: sortAfter(d, 'links', d.links) }; d.links.push(l); return l.id;
}
export function updateLink(d, id, patch) { Object.assign(pick(d.links, id, 'link'), patch); }
export function removeLink(d, id) {
  const i = d.links.findIndex((l) => l.id === id), l = d.links[i]; need(l, 'That link no longer exists.');
  const name = (x) => d.sheets.find((s) => s.id === x)?.name ?? '?';
  d.links.splice(i, 1);
  d.removed.push({ id: newId('x'), kind: 'link', label: `${l.fromId ? name(l.fromId) : l.fromName} → ${l.toId ? name(l.toId) : l.toName}`, removedAt: now(), entry: l });
}

/* ---- tickets ---- */
const PREFIX = { ticket: 'T', project: 'P', change: 'C', feature: 'F' };
const ID_RE = /^([TPCF])(\d{8})\.(\d+)$/;
const ticketPool = (d) => [...d.tickets.items, ...d.removed.filter((r) => r.kind === 'ticket').map((r) => r.entry)];
/* every id a ticket has ever had (its own and its former ones), for all tickets except `except`: none of these may be handed out again */
const idsTaken = (d, except) => new Set(ticketPool(d).filter((x) => x !== except).flatMap((x) => [x.id, ...(x.formerIds || [])]));
const nextFree = (taken, base) => base + String(1 + Math.max(0, ...[...taken].filter((id) => String(id).startsWith(base)).map((id) => parseInt(String(id).slice(base.length), 10) || 0))).padStart(3, '0');
export function newTicketId(d, type) { return nextFree(idsTaken(d), (PREFIX[type] || 'T') + today().replace(/-/g, '') + '.'); }
/* The id a ticket gets when it is (or should be) of `type`: same date, same number if that number is free, else the next free number.
 * An id that is not in the date-based form (the old T-1 style) never changes. */
export function idForType(d, t, type) {
  const m = ID_RE.exec(String(t.id)), prefix = PREFIX[type] || 'T';
  if (!m || m[1] === prefix) return t.id;
  const taken = idsTaken(d, t), base = prefix + m[2] + '.';
  return taken.has(base + m[3]) ? nextFree(taken, base) : base + m[3];
}
/* Give a ticket (live or in Removed) a new id and move everything that pointed at the old one: tickets in the project, flow steps, steps in Removed. The old id is remembered in formerIds. */
export function renameTicket(d, id, to) {
  const t = ticketPool(d).find((x) => x.id === id); need(t, 'That ticket no longer exists.');
  if (to === id) return id;
  need(!idsTaken(d, t).has(to), `${to} is already used by another ticket.`);
  t.formerIds = [...(t.formerIds || []).filter((x) => x !== to), id]; t.id = to;
  ticketPool(d).forEach((x) => { if (x.project === id) x.project = to; });
  const steps = [...d.flows.flatMap((f) => f.steps || []), ...d.removed.filter((r) => r.kind === 'step' && r.entry).map((r) => r.entry)];
  steps.forEach((s) => { if (s.ticket === id) s.ticket = to; });
  return to;
}
/* What fixing the ids would do: one row per ticket whose id letter does not match its type, in order (a later row sees the numbers an earlier one took).
 * `only` limits it to those ids. Each row says what else would be updated. Nothing is changed. */
export function planIdRepairs(d, only) {
  const w = structuredClone(d), rows = [];
  const liveCount = d.tickets.items.length;
  ticketPool(w).forEach((t, i) => {
    if (only && !only.has(t.id)) return;
    const to = idForType(w, t, t.type); if (to === t.id) return;
    const from = t.id, kids = ticketPool(w).filter((x) => x.project === from).length;
    const steps = [...w.flows.flatMap((f) => f.steps || []), ...w.removed.filter((r) => r.kind === 'step' && r.entry).map((r) => r.entry)].filter((s) => s.ticket === from).length;
    renameTicket(w, from, to); rows.push({ from, to, type: t.type, title: t.title, removed: i >= liveCount, kids, steps });
  });
  return rows;
}
/* how many ids planIdRepairs would change, without copying the map (for the gear's count) */
export const countIdMismatches = (d) => ticketPool(d).filter((t) => ID_RE.test(String(t.id)) && ID_RE.exec(String(t.id))[1] !== (PREFIX[t.type] || 'T')).length;
export function repairTicketIds(d, only) { return planIdRepairs(d, only).map((r) => { renameTicket(d, r.from, r.to); return r; }); }
export function addTicket(d, fields) {
  const type = fields.type || 'ticket'; need((fields.title || '').trim(), 'A ticket needs a title.');
  const t = { id: newTicketId(d, type), title: fields.title.trim(), type, status: 'todo', owner: '', ...fields, updated: today(), sort: sortAfter(d, 'tickets', d.tickets.items) };
  t.title = t.title.trim(); for (const [k, v] of Object.entries(t)) if (v === undefined) delete t[k];
  d.tickets.items.push(t); return t.id;
}
export function updateTicket(d, id, patch) {
  const t = pick(d.tickets.items, id, 'ticket');
  if ('title' in patch) need(String(patch.title).trim(), 'A ticket needs a title.');
  const retyped = patch.type && patch.type !== t.type;
  if (retyped && t.type === 'project' && patch.type !== 'project') {
    const n = d.tickets.items.filter((x) => x.project === id).length;
    need(!n, `Move its ${n} ${n === 1 ? 'item' : 'items'} out of this project first.`);
  }
  Object.assign(t, patch, { updated: today() });
  for (const [k, v] of Object.entries(t)) if (v === undefined) delete t[k];
  /* the id letter follows the type (T, P, C, F) */
  if (retyped) return renameTicket(d, id, idForType(d, t, t.type));
  return id;
}
/* drag and drop / quick status change: Blocked may carry a reason, any other status clears it */
export const STATUSES = ['todo', 'doing', 'blocked', 'done'];
export function moveTicket(d, id, status, reason = '') {
  need(STATUSES.includes(status), 'Unknown status.');
  updateTicket(d, id, { status, blocked: status === 'blocked' ? String(reason).trim() : undefined });
}
export function addLog(d, id, { date, hours, note = '' }) {
  need(+hours > 0 && +hours <= 24, 'Hours must be between 0 and 24.');
  const t = pick(d.tickets.items, id, 'ticket'); (t.log ||= []).push({ date: date || today(), hours: +hours, note }); t.updated = today();
}
export function removeLog(d, id, index) { const t = pick(d.tickets.items, id, 'ticket'); t.log.splice(index, 1); if (!t.log.length) delete t.log; t.updated = today(); }
export function removeTicket(d, id) {
  const i = d.tickets.items.findIndex((t) => t.id === id), t = d.tickets.items[i]; need(t, 'That ticket no longer exists.');
  d.tickets.items.splice(i, 1);
  d.removed.push({ id: newId('x'), kind: 'ticket', label: t.title || t.id, removedAt: now(), entry: t });
}

/* ---- flows and their steps ---- */
export function addFlow(d, { title, every = '', teams = [] }) {
  need(title.trim(), 'A flow needs a title.');
  const f = { id: newId('f'), sort: sortAfter(d, 'flows', d.flows), title: title.trim(), every, teams, unreadable: [], steps: [] }; d.flows.push(f); return f.id;
}
export function updateFlow(d, id, patch) { Object.assign(pick(d.flows, id, 'flow'), patch); }
export function removeFlow(d, id) {
  const i = d.flows.findIndex((f) => f.id === id), f = d.flows[i]; need(f, 'That flow no longer exists.');
  d.flows.splice(i, 1);
  /* the connections to and from it go with it (as a bundle, like the links of a sheet) and come back when it is restored */
  const bundle = (d.flowLinks || []).filter((l) => l.fromFlowId === id || l.toFlowId === id);
  if (bundle.length) d.flowLinks = d.flowLinks.filter((l) => !bundle.includes(l));          // a file with no connections is left exactly as it was
  d.removed.push({ id: newId('x'), kind: 'flow', label: f.title, removedAt: now(), entry: f, ...(bundle.length ? { flowLinks: bundle } : {}) });
}

/* ---- connections between flows: "this Flow leads to that one" (drawn on the Flow map) ---- */
export function addFlowLink(d, { fromFlowId, toFlowId, label = '', fromStepId = null }) {
  const a = pick(d.flows, fromFlowId, 'flow'), b = pick(d.flows, toFlowId, 'flow'); need(a !== b, 'A flow cannot lead to itself.');
  if (fromStepId) pick(a.steps, fromStepId, 'step');
  d.flowLinks ||= [];
  need(!d.flowLinks.some((l) => l.fromFlowId === fromFlowId && l.toFlowId === toFlowId && (l.fromStepId || null) === (fromStepId || null)), 'Those two flows are already connected that way.');
  const l = { id: newId('fl'), sort: sortAfter(d, 'flowlinks', d.flowLinks), fromFlowId, toFlowId, label: String(label).trim(), ...(fromStepId ? { fromStepId } : {}) };
  d.flowLinks.push(l); return l.id;
}
export function updateFlowLink(d, id, patch) {
  const l = pick(d.flowLinks || [], id, 'flow connection'); if ('label' in patch) patch = { ...patch, label: String(patch.label).trim() };
  if (patch.fromStepId) pick(pick(d.flows, l.fromFlowId, 'flow').steps, patch.fromStepId, 'step');
  Object.assign(l, patch); for (const [k, v] of Object.entries(l)) if (v === undefined || v === null && k === 'fromStepId') delete l[k];
}
export function removeFlowLink(d, id) {
  const i = (d.flowLinks || []).findIndex((x) => x.id === id), l = d.flowLinks?.[i]; need(l, 'That connection no longer exists.');
  const name = (fid) => d.flows.find((f) => f.id === fid)?.title || '?';
  d.flowLinks.splice(i, 1); d.removed.push({ id: newId('x'), kind: 'flowlink', label: `${name(l.fromFlowId)} → ${name(l.toFlowId)}${l.label ? ` (${l.label})` : ''}`, removedAt: now(), entry: l });
}
export function addStep(d, flowId, { team, title, afterStepId = null, ...rest }) {
  const f = pick(d.flows, flowId, 'flow'); need(team.trim() && title.trim(), 'A step needs a team and a title.');
  let sort = sortAfter(d, 'steps', f.steps, flowId), at = f.steps.length;
  if (afterStepId) { const i = f.steps.findIndex((x) => x.id === afterStepId); need(i >= 0, 'That step no longer exists.'); const next = f.steps[i + 1]; at = i + 1; if (next) sort = (f.steps[i].sort + next.sort) / 2; else sort = f.steps[i].sort + STEP; }
  const st = { id: newId('p'), sort, team: team.trim(), title: title.trim(), day: null, ticket: null, note: '', triggers: [], backs: [], ...rest };
  f.steps.splice(at, 0, st);
  if (!f.teams.some((t) => t.toLowerCase() === st.team.toLowerCase())) f.teams.push(st.team);
  return st.id;
}
const findStep = (d, flowId, stepId) => { const f = pick(d.flows, flowId, 'flow'); return { f, s: pick(f.steps, stepId, 'step') }; };
export function updateStep(d, flowId, stepId, patch) {
  const { f, s } = findStep(d, flowId, stepId);
  if ('title' in patch) need(String(patch.title).trim(), 'A step needs a title.');
  Object.assign(s, patch); for (const [k, v] of Object.entries(s)) if (v === undefined) delete s[k];
  if (s.team && !f.teams.some((t) => t.toLowerCase() === s.team.toLowerCase())) f.teams.push(s.team);
}
export function shiftStep(d, flowId, stepId, dir) { findStep(d, flowId, stepId); shift(pick(d.flows, flowId, 'flow').steps, stepId, dir); }
export function removeStep(d, flowId, stepId) {
  const { f, s } = findStep(d, flowId, stepId);
  f.steps = f.steps.filter((x) => x !== s);
  d.removed.push({ id: newId('x'), kind: 'step', label: `${f.title}: ${s.title}`, removedAt: now(), flowId, entry: s });
}

/* ---- the free canvas: a flow whose steps are boxes placed by hand ---- */
export const FREE_TEAM = 'General'; // a box has no lane, but every step has a team in the file; this is the one a new box gets
export const BOX = { W: 180, H: 74, MIN_W: 60, MIN_H: 40, ENTITY_W: 210, ENTITY_H: 130 };
const geom = ({ x, y, w, h }) => ({ x: Math.round(x), y: Math.round(y), w: Math.max(BOX.MIN_W, Math.round(w)), h: Math.max(BOX.MIN_H, Math.round(h)) });
export function addShape(d, flowId, { x = 0, y = 0, shape = 'rounded', title, w, h } = {}) {
  const f = pick(d.flows, flowId, 'flow'); need(f.layout === 'free', 'Boxes can only be added to a free-canvas flow.');
  const entity = shape === 'entity';
  /* a diamond is a yes/no question, so its arrows get the Yes and No labels like a decision on a swimlane */
  return addStep(d, flowId, { team: FREE_TEAM, title: title ?? (entity ? 'New entity' : 'New box'), shape, ...(shape === 'diamond' ? { kind: 'decision' } : {}), ...geom({ x, y, w: w ?? (entity ? BOX.ENTITY_W : BOX.W), h: h ?? (entity ? BOX.ENTITY_H : BOX.H) }), standalone: true });
}
export function placeShape(d, flowId, stepId, box) { const { f, s } = findStep(d, flowId, stepId); need(f.layout === 'free', 'That flow is not a free canvas.'); Object.assign(s, geom({ x: s.x, y: s.y, w: s.w, h: s.h, ...box })); }
/* Turn a swimlane flow into a free canvas, keeping what is on screen: `positions` is { stepId: { x, y, w, h } } as drawn now. Every arrow the swimlane
 * drew (including the automatic one and the "from a team" ones) becomes an explicit arrow between two boxes. There is no way back to lanes. */
export function switchToFree(d, flowId, positions) {
  const f = pick(d.flows, flowId, 'flow'); need(f.layout !== 'free', 'That flow is already a free canvas.');
  f.steps.forEach((s) => need(positions?.[s.id], 'A step has no place on the canvas yet.'));
  const waits = f.steps.map((_, i) => effectiveWaits(f, i));
  f.steps.forEach((s, i) => {
    s.triggers = waits[i].map((w) => ({ stepId: f.steps[w.on].id, msg: w.msg }));
    if (s.triggers.length) delete s.standalone; else s.standalone = true;   // a box with no arrow in stays that way: nothing quietly follows the box before it
    Object.assign(s, geom(positions[s.id]), { shape: s.shape || 'rounded' });
  });
  /* steps waiting in Removed get a place too, so restoring one onto the canvas is valid */
  d.removed.filter((r) => r.kind === 'step' && r.flowId === flowId).forEach((r, k) => Object.assign(r.entry, geom({ x: 24 + k * 24, y: 24 + k * 24, w: BOX.W, h: BOX.H }), { shape: r.entry.shape || 'rounded' }));
  f.layout = 'free';
}

/* ---- sticky notes on a flow: free text on the diagram, free-floating or pinned to a step ---- */
export function addNote(d, flowId, { text = '', x = 0, y = 0, stepId = null }) {
  const f = pick(d.flows, flowId, 'flow'); if (stepId) pick(f.steps, stepId, 'step');
  f.notes ||= [];
  const n = { id: newId('n'), sort: sortAfter(d, 'notes', f.notes, flowId), text, x: Math.round(x), y: Math.round(y), ...(stepId ? { stepId } : {}) };
  f.notes.push(n); return n.id;
}
export function updateNote(d, flowId, id, patch) {
  const n = pick(pick(d.flows, flowId, 'flow').notes || [], id, 'note'); Object.assign(n, patch);
  for (const [k, v] of Object.entries(n)) if (v === undefined) delete n[k];
}
export function removeNote(d, flowId, id) {
  const f = pick(d.flows, flowId, 'flow'), i = (f.notes || []).findIndex((x) => x.id === id); need(i >= 0, 'That note no longer exists.');
  const [n] = f.notes.splice(i, 1);
  d.removed.push({ id: newId('x'), kind: 'note', label: `${f.title}: ${n.text.trim().slice(0, 40) || '(empty note)'}`, removedAt: now(), flowId, entry: n });
}

/* ---- lanes: a flow's teams, in the order they are drawn ---- */
const sameTeam = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export function addTeam(d, flowId, name) {
  const f = pick(d.flows, flowId, 'flow'), t = String(name).trim(); need(t, 'A lane needs a name.'); need(!f.teams.some((x) => sameTeam(x, t)), 'That lane already exists.'); f.teams.push(t);
}
export function renameTeam(d, flowId, from, to) {
  const f = pick(d.flows, flowId, 'flow'), t = String(to).trim(); need(t, 'A lane needs a name.');
  need(!f.teams.some((x) => sameTeam(x, t) && !sameTeam(x, from)), 'Another lane already has that name.');
  f.teams = f.teams.map((x) => (sameTeam(x, from) ? t : x));
  f.steps.forEach((s) => { if (sameTeam(s.team, from)) s.team = t; s.triggers.forEach((x) => { if (x.team && sameTeam(x.team, from)) x.team = t; }); });
}
export function moveTeam(d, flowId, team, dir) {
  const f = pick(d.flows, flowId, 'flow'), i = f.teams.findIndex((x) => sameTeam(x, team)), j = i + dir;
  if (i >= 0 && f.teams[j]) [f.teams[i], f.teams[j]] = [f.teams[j], f.teams[i]];
}
export function removeTeam(d, flowId, team) {
  const f = pick(d.flows, flowId, 'flow'); need(!f.steps.some((s) => sameTeam(s.team, team)), 'Move or delete the steps in this lane first.');
  f.teams = f.teams.filter((x) => !sameTeam(x, team));
}

/* ---- Removed ---- */
export function restore(d, removedId) {
  const i = d.removed.findIndex((r) => r.id === removedId), r = d.removed[i];
  if (r.kind === 'ticket') place(d.tickets.items, r.entry);
  else if (r.kind === 'flow') {
    place(d.flows, r.entry);
    (r.flowLinks || []).forEach((l) => {
      d.flowLinks ||= [];
      /* the other end may itself be in Removed: hand the connection to that flow's bundle so it comes back with it, never dropped */
      const other = l.fromFlowId === r.entry.id ? l.toFlowId : l.fromFlowId, wait = !d.flows.some((f) => f.id === other) && d.removed.find((o) => o !== r && o.kind === 'flow' && o.entry.id === other);
      if (wait) (wait.flowLinks ||= []).push(l); else if (d.flows.some((f) => f.id === other)) place(d.flowLinks, l);
    });
  } else if (r.kind === 'flowlink') {
    need([r.entry.fromFlowId, r.entry.toFlowId].every((x) => d.flows.some((f) => f.id === x)), 'Restore the flows this connection joins first.');
    d.flowLinks ||= []; place(d.flowLinks, r.entry);
  }
  else if (r.kind === 'step') {
    const f = d.flows.find((x) => x.id === r.flowId); need(f, 'Restore the flow first: this step belongs to it.');
    place(f.steps, r.entry);
  } else if (r.kind === 'note') {
    const f = d.flows.find((x) => x.id === r.flowId); need(f, 'Restore the flow first: this note belongs to it.');
    f.notes ||= []; place(f.notes, r.entry);
  } else if (r.kind === 'link') {
    need([r.entry.fromId, r.entry.toId].every((x) => !x || d.sheets.some((s) => s.id === x)), 'Restore the sheets this link connects first.');
    place(d.links, r.entry);
  } else {
    place(d.sheets, r.entry);
    const known = new Set(d.sheets.map((s) => s.id));
    r.links.forEach(({ link }) => {
      /* the other end may itself be in Removed: hand the link to that bundle so it comes back with it, never dropped */
      const gone = [link.fromId, link.toId].find((x) => x && !known.has(x)), wait = gone && d.removed.find((o) => o !== r && o.kind !== 'ticket' && o.entry?.id === gone);
      if (wait) wait.links.push({ link });
      else if (!gone) place(d.links, link);
    });
  }
  d.removed.splice(i, 1);
}
export function purge(d, removedId) { d.removed = d.removed.filter((r) => r.id !== removedId); }
