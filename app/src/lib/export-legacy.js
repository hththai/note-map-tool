/* Data file -> the old three file contents. Used for the "Export as legacy files" button and to prove the import lost nothing. */
import { stringify } from './serialize.js';
import { stringifyFlows } from './flows-parser.js';

const TYPE_LABEL = { doc: 'Doc', excel: 'Excel', pdf: 'PDF', other: 'Other' };
/* The old file format has no place for members, file types or documentation links. With { withNewFields: true } (the "Export as legacy files" button)
 * they are written as plain lines the old parser reads as text, so a person still sees them. The app itself never uses that form: the Data file holds them. */
export function exportLegacy(data, { withNewFields = false } = {}) {
  /* a sheet in Removed keeps its name for anything still pointing at it */
  const nameOf = (id) => data.sheets.find((s) => s.id === id)?.name ?? data.removed.find((r) => r.kind !== 'ticket' && r.entry.id === id)?.entry.name;
  const extra = (s) => (withNewFields ? [s.type && `Type: ${TYPE_LABEL[s.type]}`, ...(s.docs || []).map((x) => `Docs: ${x.label ? x.label + ' ' : ''}${x.url}`)].filter(Boolean) : []);
  const node = (s) => ({ name: s.name, parts: [s.owner, ...(s.details || [])].filter((p) => p), crit: s.crit, url: s.url, note: [s.note, ...extra(s)].filter(Boolean).join('\n') });
  const members = (d) => (withNewFields && (d.members || []).length ? [`Members: ${d.members.map((m) => `${m.name}${m.role ? ' (' + m.role + ')' : ''}${m.email ? ' <' + m.email + '>' : ''}`).join('; ')}`] : []);
  const model = {
    title: data.title,
    depts: data.departments.map((d) => ({ name: d.name, text: [...d.text, ...members(d)], sections: d.sections.map((sc) => ({ title: sc.title, note: sc.note, nodes: data.sheets.filter((s) => s.sectionId === sc.id).map(node) })) })),
    apps: data.sheets.filter((s) => s.kind === 'app').map(node),
    links: data.links.map((l) => ({ from: l.fromId ? nameOf(l.fromId) : l.fromName, to: l.toId ? nameOf(l.toId) : l.toName, label: l.label || '' })),
  };
  const flows = data.flows.map((f) => {
    const steps = f.steps.map((s) => ({ team: s.team, title: s.title, day: s.day, sheet: s.sheetId ? nameOf(s.sheetId) : s.sheetName || null, ticket: s.ticket, note: s.note, standalone: !!s.standalone, triggers: [], backs: [] }));
    const at = (stepId) => steps[f.steps.findIndex((x) => x.id === stepId)];
    /* an arrow to a step in Removed is not drawn or written until that step is restored */
    f.steps.forEach((s, i) => {
      steps[i].triggers = s.triggers.filter((t) => !t.stepId || at(t.stepId)).map((t) => (t.stepId ? { ref: at(t.stepId), msg: t.msg } : { team: t.team, msg: t.msg }));
      steps[i].backs = s.backs.filter((b) => at(b.stepId)).map((b) => ({ ref: at(b.stepId), msg: b.msg }));
    });
    /* the old format has no place for notes: with the new fields on they are written as comment lines, which the old parser skips */
    const one = (t) => String(t).trim().replace(/\s*\n\s*/g, ' / ').replace(/--+>/g, '->');
    const shapes = f.steps.map((x, i) => { const what = x.kind ? { decision: 'a decision', start: 'a start marker', end: 'an end marker' }[x.kind] : f.layout === 'free' && x.shape && x.shape !== 'rounded' ? { rect: 'a rectangle', pill: 'a pill', diamond: 'a diamond', entity: 'an entity box' }[x.shape] : null; return what && `Step ${i + 1} (${one(x.title)}) is ${what}`; }).filter(Boolean);
    const comments = withNewFields ? [f.note && `Flow note: ${one(f.note)}`, f.brief && f.brief.trim() && `Brief: ${one(f.brief)}`, f.draft && f.draft.trim() && `Draft: ${one(f.draft)}`, ...shapes, ...(f.notes || []).filter((n) => n.text.trim()).map((n) => `Note: ${one(n.text)}`)].filter(Boolean) : [];
    return { title: f.title, every: f.every, teams: f.teams, steps, comments };
  });
  const target = (t) => {
    const name = nameOf(t), dept = data.departments.find((d) => d.id === t);
    return name ? name.toLowerCase() : dept ? 'dept:' + dept.name : '';
  };
  const items = data.tickets.items.map((t) => {
    const o = {};
    for (const [k, v] of Object.entries(t)) { if (k === 'sort') continue; else if (k === 'targetId') o.target = target(v); else if (k === 'targetRaw') o.target = v; else o[k] = v; }
    return o;
  });
  return { mapMd: stringify(model), flowsMd: flows.length ? stringifyFlows(flows) : '', ticketsJson: { nextId: data.tickets.nextId, ...data.tickets.extra, tickets: items } };
}
