/* The Flow document: each Flow as Markdown with a Mermaid diagram (it renders on GitHub), plus its notes. An Export is for people to read and is never read back.
 * Mermaid places the boxes itself, so a free canvas keeps its boxes, shapes and arrows but not their positions. Decisions keep their Yes / No labels;
 * sticky notes are listed under the diagram and written inside it as comments. An all-entity free canvas becomes a Mermaid ER diagram. */

const one = (t) => String(t ?? '').replace(/\s*\n\s*/g, ' ').trim();
/* text inside a Mermaid label: in quotes, with quotes and angle brackets made safe, line breaks as <br/> */
const q = (t) => '"' + String(t ?? '').trim().replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;').replace(/\s*\n\s*/g, '<br/>') + '"';
const id = (i) => 's' + (i + 1);
const shapeOf = (st, text) => {
  const kind = st.kind, shape = st.shape;
  if (kind === 'decision' || shape === 'diamond') return `{${text}}`;
  if (kind === 'start' || kind === 'end' || shape === 'pill') return `([${text}])`;
  if (shape === 'rect') return `[${text}]`;
  if (shape === 'entity') return `[${text}]`;
  return shape === 'rounded' ? `(${text})` : `[${text}]`;
};
const label = (st) => (st.shape === 'entity' ? [st.title, ...String(st.note || '').split('\n').filter((l) => l.trim())].join('\n') : st.title);

/* arrows: a "waits on" arrow is solid, a "sent back" arrow is dashed; a message is the label */
function edges(flow) {
  const out = [], at = (sid) => flow.steps.findIndex((x) => x.id === sid);
  flow.steps.forEach((s, i) => {
    const waits = flow.layout === 'free' ? s.triggers.filter((t) => t.stepId).map((t) => ({ from: at(t.stepId), msg: t.msg })) : null;
    (waits || waitsOf(flow, i)).forEach((w) => { if (w.from >= 0) out.push(`${id(w.from)} -->${w.msg ? `|${q(w.msg)}|` : ''} ${id(i)}`); });
    s.backs.forEach((b) => { const j = at(b.stepId); if (j >= 0) out.push(`${id(i)} -.->|${q(b.msg || 'sent back')}| ${id(j)}`); });
  });
  return out;
}
/* what the swimlane draws into step i: its arrows from steps, from the nearest earlier step of a named team, or the automatic one from the step before */
function waitsOf(flow, i) {
  const s = flow.steps[i], out = [];
  s.triggers.forEach((t) => {
    if (t.stepId) { const k = flow.steps.findIndex((x) => x.id === t.stepId); if (k >= 0 && k < i) out.push({ from: k, msg: t.msg }); return; }
    for (let j = i - 1; j >= 0; j--) if (flow.steps[j].team.toLowerCase() === String(t.team || '').toLowerCase()) { out.push({ from: j, msg: t.msg }); return; }
  });
  return out.length || s.triggers.length || s.standalone || i === 0 ? out : [{ from: i - 1, msg: '' }];
}

const erName = (n) => (/^[A-Za-z0-9_-]+$/.test(n) ? n : '"' + String(n).replace(/"/g, "'") + '"');
const CARD = [[/^\s*(1|one)\s*(to|-|:)\s*(1|one)\s*$/i, '||--||'], [/^\s*(1|one)\s*(to|-|:)\s*(many|n|\*)\s*$/i, '||--o{'], [/^\s*(many|n|\*)\s*(to|-|:)\s*(1|one)\s*$/i, '}o--||'], [/^\s*(many|n|\*)\s*(to|-|:)\s*(many|n|\*)\s*$/i, '}o--o{']];
const cardinality = (msg) => (CARD.find(([re]) => re.test(msg || '')) || [null, '}o--o{'])[1];
/* a field name in an ER diagram must be plain letters, digits and underscores (Mermaid refuses accents), so the name is transliterated and the real text kept as the field's comment */
const ascii = (t) => one(t).replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
const attr = (line, used) => { let n = ascii(line) || 'field'; if (/^\d/.test(n)) n = 'f_' + n; while (used.has(n)) n += '_'; used.add(n); return `    string ${n}${n !== one(line) ? ` ${q(one(line))}` : ''}`; };

/* a free canvas of nothing but entities is a Mermaid ER diagram */
function erDiagram(flow) {
  const names = flow.steps.map((s) => s.title.trim() || 'Entity'), lines = ['erDiagram'], at = (sid) => flow.steps.findIndex((x) => x.id === sid);
  flow.steps.forEach((s, i) => { const used = new Set(), body = String(s.note || '').split('\n').filter((l) => l.trim()); lines.push(`  ${erName(names[i])} {`, ...(body.length ? body.map((l) => '  ' + attr(l, used)) : []), '  }'); });
  flow.steps.forEach((s, i) => s.triggers.filter((t) => t.stepId).forEach((t) => { const j = at(t.stepId); if (j >= 0) lines.push(`  ${erName(names[j])} ${cardinality(t.msg)} ${erName(names[i])} : ${q(t.msg || 'relates to')}`); }));
  return lines;
}

/* the Mermaid lines (without the fence) for one flow */
export function flowMermaid(flow) {
  if (flow.layout === 'free' && flow.steps.length && flow.steps.every((s) => s.shape === 'entity')) return erDiagram(flow);
  const free = flow.layout === 'free', lines = [free ? 'flowchart TD' : 'flowchart LR'], node = (s, i) => `${id(i)}${shapeOf(s, q(label(s)))}`;
  if (free) flow.steps.forEach((s, i) => lines.push('  ' + node(s, i)));
  else flow.teams.forEach((t, li) => {
    const mine = flow.steps.map((s, i) => [s, i]).filter(([s]) => s.team.toLowerCase() === t.toLowerCase());
    if (!mine.length) return;
    lines.push(`  subgraph L${li + 1}[${q(t)}]`, '    direction LR', ...mine.map(([s, i]) => '    ' + node(s, i)), '  end');
  });
  lines.push(...edges(flow).map((e) => '  ' + e));
  (flow.notes || []).filter((n) => n.text.trim()).forEach((n) => { const st = n.stepId ? flow.steps.find((x) => x.id === n.stepId) : null; lines.push(`  %% Note${st ? ` on "${one(st.title).replace(/%/g, '')}"` : ''}: ${one(n.text).replace(/%%/g, '%')}`); });
  return lines;
}

/* one flow as a document: title, its text, the diagram, then the notes where people can read them */
export function flowDoc(flow, level = 1) {
  const h = '#'.repeat(level), notes = (flow.notes || []).filter((n) => n.text.trim()), out = [`${h} ${one(flow.title)}`, ''];
  if (flow.every) out.push(`Runs: ${one(flow.every)}`, '');
  if (flow.note && flow.note.trim()) out.push(...flow.note.trim().split('\n').map((l) => '> ' + l), '');
  if (flow.brief && flow.brief.trim()) out.push('**Brief:** ' + one(flow.brief), '');
  if (!flow.steps.length) return [...out, '_This flow has no steps yet._', ''].join('\n');
  out.push('```mermaid', ...flowMermaid(flow), '```', '');
  if (flow.layout === 'free') out.push('_Drawn from a free canvas: the boxes and arrows are the same, but Mermaid chooses where to place them._', '');
  if (notes.length) out.push('**Notes**', '', ...notes.map((n) => { const st = n.stepId ? flow.steps.find((x) => x.id === n.stepId) : null; return `- ${one(n.text)}${st ? ` _(on ${one(st.title)})_` : ''}`; }), '');
  return out.join('\n');
}

/* how the flows connect: a diagram of the flows that have a connection, with the connection labels */
function mapDoc(data) {
  const links = (data.flowLinks || []).filter((l) => data.flows.some((f) => f.id === l.fromFlowId) && data.flows.some((f) => f.id === l.toFlowId));
  if (!links.length) return [];
  const used = data.flows.filter((f) => links.some((l) => l.fromFlowId === f.id || l.toFlowId === f.id)), id = (fid) => 'f' + (data.flows.findIndex((f) => f.id === fid) + 1);
  return ['## How flows connect', '', '```mermaid', 'flowchart LR', ...used.map((f) => `  ${id(f.id)}[${q(f.title)}]`), ...links.map((l) => `  ${id(l.fromFlowId)} -->${l.label ? `|${q(l.label)}|` : ''} ${id(l.toFlowId)}`), '```', ''];
}

/* every flow of a map in one document, after a diagram of how they connect */
export function flowsDoc(data, title = 'Business flows') {
  return [`# ${one(title)}`, '', ...mapDoc(data), ...(data.flows.length ? data.flows.map((f) => flowDoc(f, 2)) : ['_No business flows yet._', ''])].join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
