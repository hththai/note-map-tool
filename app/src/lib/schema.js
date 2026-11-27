/* The Data file format (docs/adr/0001-one-json-data-file-per-map.md). Pure: no DOM, runs in the browser and in Node.
 *
 * {
 *   schemaVersion: 1, title,
 *   departments: [{ id, name, text: [] (the description), members?: [{ id, name, role, email? }], sections: [{ id, title|null, note }] }],   (a section is shown as a "Function"; its note is the description)
 *   sheets:      [{ id, kind: 'sheet'|'app', name, departmentId|null, sectionId|null, owner, details: [], crit|null, url|null, note,
 *                   type?: 'doc'|'excel'|'pdf'|'other' (absent = Google Sheet), docs?: [{ label, url }] }],
 *   links:       [{ id, fromId|fromName, toId|toName, label }],
 *   flows:       [{ id, title, every, note?: text about the whole flow, layout?: 'swimlane' | 'free' (on a free flow each step also has x, y, w, h and shape?: 'rect' | 'rounded' | 'pill' | 'diamond' | 'entity'), brief?: what the process is for and who is involved, draft?: a rough list of the steps (both are the input for AI, typed by the user), notes?: [{ id, sort, text, x, y, stepId? }] (sticky notes: x,y are canvas coordinates, or an offset from the step when stepId is set),
 *                   teams: [], unreadable: [], steps: [{ id, team, title, day, sheetId|sheetName, ticket, note, standalone?, kind?: 'start'|'end'|'decision' (absent = an ordinary step),
 *                   triggers: [{ stepId, msg } | { team, msg }], backs: [{ stepId, msg }] }] }],
 *   tickets:     { nextId, extra: {}, items: [ticket as before, with target replaced by targetId (or targetRaw if it points at nothing)] },
 *   removed:     [{ id, kind, label, removedAt, entry, ... where it sat, so it can be put back }],
 *   meta:        { importedFrom?, legacy?: { mapMd?, flowsMd? } }
 * }
 *   flowLinks?:  [{ id, sort, fromFlowId, toFlowId, label, fromStepId? }]   (a Flow connection: this Flow leads to that one; optional list, absent = none)
 * Sheets, links, tickets, flows and flow steps carry a permanent `sort` number (ascending in their list); see ops.js. Order of the arrays is the order on screen. Entries point at each other by id; names are only labels. */
export const SCHEMA_VERSION = 1;
export const STEP_KINDS = ['start', 'end', 'decision'];
/* a flow's layout: absent or 'swimlane' = lanes (the default); 'free' = every step is a box placed by hand (x, y, w, h and a shape) and there are no lanes */
export const LAYOUTS = ['swimlane', 'free'];
export const SHAPES = ['rect', 'rounded', 'pill', 'diamond', 'entity'];   // an entity box: the step's title is its name, its note the description lines, its sheet an optional reference
export const STEP = 1024;
export const FILE_TYPE_LABEL = { sheet: 'Google Sheet', doc: 'Doc', excel: 'Excel', pdf: 'PDF', other: 'Other' };
export const FILE_TYPES = Object.keys(FILE_TYPE_LABEL); /* a missing `type` means 'sheet' */ /* gap between neighbouring `sort` numbers */

function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/* Same seed in, same id out: lets the import be re-run and give an identical file. */
export function idFactory() {
  const used = new Set();
  return (prefix, seed) => {
    for (let n = 0; ; n++) {
      const id = prefix + '_' + cyrb53(prefix + '|' + seed + (n ? '#' + n : '')).toString(36).padStart(8, '0').slice(0, 8);
      if (!used.has(id)) { used.add(id); return id; }
    }
  };
}

/* New entries made in the app get a random id. */
export function newId(prefix) {
  const b = new Uint8Array(6); crypto.getRandomValues(b);
  return prefix + '_' + [...b].map((x) => (x % 36).toString(36)).join('') + (Date.now() % 36).toString(36) + ((Date.now() >> 3) % 36).toString(36);
}

export function emptyData(title = 'Sheets map') {
  return { schemaVersion: SCHEMA_VERSION, title, departments: [], sheets: [], links: [], flows: [], tickets: { nextId: 1, extra: {}, items: [] }, removed: [], meta: {} };
}

/* Returns a list of problems; an empty list means the file is safe to open. */
export function validate(d) {
  const bad = [];
  if (!d || typeof d !== 'object') return ['not an object'];
  if (!Number.isInteger(d.schemaVersion)) bad.push('schemaVersion missing');
  else if (d.schemaVersion > SCHEMA_VERSION) bad.push(`schemaVersion ${d.schemaVersion} is newer than this app understands (${SCHEMA_VERSION})`);
  for (const k of ['departments', 'sheets', 'links', 'flows', 'removed']) if (!Array.isArray(d[k])) bad.push(`${k} must be a list`);
  if (!d.tickets || !Array.isArray(d.tickets.items)) bad.push('tickets.items must be a list');
  if (bad.length) return bad;
  const ids = new Set(), dup = (id, what) => { if (!id) bad.push(`${what} has no id`); else if (ids.has(id)) bad.push(`duplicate id ${id}`); else ids.add(id); };
  const secs = new Map();
  d.departments.forEach((x) => { dup(x.id, 'department'); (x.members || []).forEach((m) => { dup(m.id, 'member'); if (!String(m.name || '').trim()) bad.push(`member ${m.id} has no name`); }); (x.sections || []).forEach((s) => { dup(s.id, 'section'); secs.set(s.id, x.id); }); });
  const deptIds = new Set(d.departments.map((x) => x.id)), sheetIds = new Set(d.sheets.map((x) => x.id));
  /* a sheet in Removed can still be pointed at by tickets and flow steps */
  const known = new Set([...sheetIds, ...d.removed.filter((r) => r.entry && r.kind !== 'ticket').map((r) => r.entry.id)]);
  d.sheets.forEach((s) => {
    dup(s.id, 'sheet');
    if (s.type !== undefined && !FILE_TYPES.includes(s.type)) bad.push(`sheet ${s.id} has an unknown type`);
    (s.docs || []).forEach((x) => { if (!String(x.url || '').trim()) bad.push(`sheet ${s.id} has a documentation link with no address`); });
    if (s.departmentId && !deptIds.has(s.departmentId)) bad.push(`sheet ${s.id} points at a missing department`);
    if (s.sectionId && secs.get(s.sectionId) !== s.departmentId) bad.push(`sheet ${s.id} points at a section that is not in its department`);
  });
  d.links.forEach((l) => {
    dup(l.id, 'link');
    if (l.fromId ? !sheetIds.has(l.fromId) : !l.fromName) bad.push(`link ${l.id} has no valid start`);
    if (l.toId ? !sheetIds.has(l.toId) : !l.toName) bad.push(`link ${l.id} has no valid end`);
  });
  d.flows.forEach((f) => {
    dup(f.id, 'flow');
    if (f.layout !== undefined && !LAYOUTS.includes(f.layout)) bad.push(`flow ${f.id} has an unknown layout`);
    ['brief', 'draft'].forEach((k) => { if (f[k] !== undefined && typeof f[k] !== 'string') bad.push(`flow ${f.id} has a ${k} that is not text`); });
    /* an arrow may point at a step that is in Removed */
    const steps = new Set([...(f.steps || []).map((s) => s.id), ...d.removed.filter((r) => r.kind === 'step' && r.flowId === f.id).map((r) => r.entry.id)]);
    (f.notes || []).forEach((n) => {
      dup(n.id, 'note');
      if (n.stepId && !steps.has(n.stepId)) bad.push(`note ${n.id} points at a missing step`);
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || typeof n.text !== 'string') bad.push(`note ${n.id} has no position or text`);
    });
    (f.steps || []).forEach((s) => {
      dup(s.id, 'step');
      if (s.kind != null && !STEP_KINDS.includes(s.kind)) bad.push(`step ${s.id} has an unknown kind`);
      if (s.shape !== undefined && !SHAPES.includes(s.shape)) bad.push(`step ${s.id} has an unknown shape`);
      if (f.layout === 'free' && !(Number.isFinite(s.x) && Number.isFinite(s.y) && s.w >= 20 && s.h >= 20)) bad.push(`step ${s.id} on a free canvas has no position or size`);
      if (s.sheetId && !known.has(s.sheetId)) bad.push(`step ${s.id} points at a missing sheet`);
      [...(s.triggers || []), ...(s.backs || [])].forEach((t) => { if (t.stepId && !steps.has(t.stepId)) bad.push(`step ${s.id} points at a missing step`); });
    });
  });
  /* Flow connections: both ends are flows of this map (a flow in Removed takes its connections with it), never the same flow, and a starting step must be one of that flow's */
  const flowIds = new Set(d.flows.map((f) => f.id));
  if (d.flowLinks !== undefined && !Array.isArray(d.flowLinks)) bad.push('flowLinks must be a list');
  (Array.isArray(d.flowLinks) ? d.flowLinks : []).forEach((l) => {
    dup(l.id, 'flow connection');
    if (!flowIds.has(l.fromFlowId) || !flowIds.has(l.toFlowId)) bad.push(`flow connection ${l.id} points at a missing flow`);
    else if (l.fromFlowId === l.toFlowId) bad.push(`flow connection ${l.id} joins a flow to itself`);
    if (l.fromStepId) { const f = d.flows.find((x) => x.id === l.fromFlowId); if (f && !(f.steps || []).some((s) => s.id === l.fromStepId) && !d.removed.some((r) => r.kind === 'step' && r.flowId === f.id && r.entry.id === l.fromStepId)) bad.push(`flow connection ${l.id} starts at a missing step`); }
    if (typeof l.label !== 'string') bad.push(`flow connection ${l.id} has no label text`);
  });
  d.tickets.items.forEach((t) => { if (t.targetId && !known.has(t.targetId) && !deptIds.has(t.targetId)) bad.push(`ticket ${t.id} points at a missing target`); });
  const sorted = (list, what) => list.forEach((x, i) => { if (typeof x.sort !== 'number' || (i && x.sort <= list[i - 1].sort)) bad.push(`${what} ${x.id ?? i} is out of order or has no sort number`); });
  sorted(d.sheets, 'sheet'); sorted(d.links, 'link'); sorted(d.tickets.items, 'ticket'); sorted(d.flows, 'flow'); sorted(Array.isArray(d.flowLinks) ? d.flowLinks : [], 'flow connection'); d.flows.forEach((f) => { sorted(f.steps || [], 'step'); sorted(f.notes || [], 'note'); });
  return bad;
}

/* Data files written by an earlier build can lack some `sort` numbers (flows and steps got them later). This fills them in,
 * keeping the order the entries are already in, and changes nothing else. It is safe to run on any file, any number of times.
 * The app applies it when a file is opened and asks you to Save, which takes a Snapshot first. */
export function upgrade(d) {
  const out = structuredClone(d), changes = [];
  out.removed ||= []; out.meta ||= {};
  const fill = (list, what) => {
    if (!Array.isArray(list) || !list.some((x, i) => typeof x.sort !== 'number' || (i && x.sort <= list[i - 1].sort))) return;
    list.forEach((x, i) => { x.sort = (i + 1) * STEP; }); changes.push(`numbered the ${what}`);
  };
  fill(out.sheets, 'sheets'); fill(out.links, 'links'); fill(out.tickets?.items, 'tickets'); fill(out.flows, 'flows'); fill(out.flowLinks, 'flow connections');
  (out.flows || []).forEach((f) => { fill(f.steps, `steps of "${f.title}"`); if (f.notes) fill(f.notes, `notes of "${f.title}"`); });
  return { data: out, changes };
}
