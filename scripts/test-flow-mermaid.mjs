// The Flow document with Mermaid diagrams (lib/flow-mermaid.js). Run: node --test scripts/test-flow-mermaid.mjs
import test from 'node:test'; import assert from 'node:assert/strict'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const lib = (f) => import(pathToFileURL(path.join(import.meta.dirname, '../app/src/lib', f)).href);
const o = await lib('ops.js'), { emptyData } = await lib('schema.js'), { connectFree } = await lib('flow-edit.js'), { flowMermaid, flowDoc, flowsDoc } = await lib('flow-mermaid.js');
const src = (flow) => flowMermaid(flow).join('\n');
function swim() {
  const d = emptyData('T'), f = o.addFlow(d, { title: 'Quote approval', every: 'per quote' });
  const a = o.addStep(d, f, { team: 'Sales', title: 'Draft "quote"', kind: 'start' }), b = o.addStep(d, f, { team: 'Finance', title: 'Price OK?\nsecond line', kind: 'decision', triggers: [{ stepId: a, msg: 'quote' }] });
  const c = o.addStep(d, f, { team: 'Sales', title: 'Send <order>', triggers: [{ stepId: b, msg: 'Yes' }] }), e = o.addStep(d, f, { team: 'Sales', title: 'Rework', triggers: [{ stepId: b, msg: 'No' }] }), g = o.addStep(d, f, { team: 'Sales', title: 'Done', kind: 'end' });
  d.flows[0].steps[3].backs.push({ stepId: a, msg: 'redo' }); d.flows[0].steps[4].triggers = [{ team: 'Sales', msg: 'sent' }];
  o.addNote(d, f, { text: 'Assumed Finance approves\nsecond line', x: 20, y: 86, stepId: b }); o.addNote(d, f, { text: 'Who owns pricing?', x: 300, y: 300 });
  return { d, flow: d.flows[0], ids: { a, b, c, e, g } };
}
function free(shapes) {
  const d = emptyData('T'), f = o.addFlow(d, { title: 'Free' }); o.switchToFree(d, f, {}); shapes.forEach(([shape, title, note]) => { const id = o.addShape(d, f, { shape, title }); if (note) o.updateStep(d, f, id, { note }); }); return { d, f, flow: d.flows[0] };
}

test('a swimlane is a left-to-right flowchart with a subgraph per lane, and every step in its lane with its shape', () => {
  const t = src(swim().flow); assert.match(t, /^flowchart LR/); assert.match(t, /subgraph L1\["Sales"\]/); assert.match(t, /subgraph L2\["Finance"\]/);
  assert.equal((t.match(/subgraph /g) || []).length, (t.match(/^\s+end$/gm) || []).length);
  assert.match(t, /s1\(\["Draft #quot;quote#quot;"\]\)/); assert.match(t, /s2\{"Price OK\?<br\/>second line"\}/); assert.match(t, /s3\["Send #lt;order#gt;"\]/); assert.match(t, /s5\(\["Done"\]\)/);
  assert.ok(!/<order>/.test(t) && !/\n\s+[^%]*"Draft "quote""/.test(t));
});
test('arrows keep their messages: the decision has Yes and No, a hand-off has its message, a sent-back arrow is dashed', () => {
  const t = src(swim().flow); assert.match(t, /s1 -->\|"quote"\| s2/); assert.match(t, /s2 -->\|"Yes"\| s3/); assert.match(t, /s2 -->\|"No"\| s4/); assert.match(t, /s4 -\.->\|"redo"\| s1/);
  assert.match(t, /s4 -->\|"sent"\| s5/, 'an arrow "from a team" is drawn from that team\'s nearest earlier step');
});
test('a step with no arrow of its own follows the one before, like on the swimlane', () => {
  const d = emptyData('T'), f = o.addFlow(d, { title: 'T' }); o.addStep(d, f, { team: 'A', title: 'one' }); o.addStep(d, f, { team: 'A', title: 'two' }); const s3 = o.addStep(d, f, { team: 'A', title: 'three' }); d.flows[0].steps[2].standalone = true; assert.ok(s3);
  const t = src(d.flows[0]); assert.match(t, /s1 --> s2/); assert.ok(!/ s3$/m.test(t.split('\n').filter((l) => l.includes('-->')).join('\n')));
});
test('sticky notes are comments inside the diagram and a list under it, with the step they are on', () => {
  const { flow } = swim(), t = src(flow), doc = flowDoc(flow);
  assert.match(t, /%% Note on "Price OK\? second line": Assumed Finance approves second line/); assert.match(t, /%% Note: Who owns pricing\?/); assert.ok(!t.split('\n').some((l) => !l.trim().startsWith('%%') && l.includes('Who owns')));
  assert.match(doc, /\*\*Notes\*\*/); assert.match(doc, /- Who owns pricing\?/); assert.match(doc, /- Assumed Finance approves second line _\(on Price OK\? second line\)_/);
});
test('the document has the title, rhythm, flow note and brief, then a fenced Mermaid block that is closed', () => {
  const { d, flow } = swim(); o.updateFlow(d, flow.id, { note: 'Line one\nLine two', brief: 'Quotes wait\nfor Finance' }); const doc = flowDoc(d.flows[0]);
  assert.ok(doc.startsWith('# Quote approval\n\nRuns: per quote\n\n> Line one\n> Line two\n\n**Brief:** Quotes wait for Finance\n\n```mermaid\nflowchart LR')); assert.equal((doc.match(/```/g) || []).length, 2);
});
test('a free canvas is a top-down flowchart with a node per shape, and says positions are not kept', () => {
  const { d, f, flow } = free([['rect', 'Plain'], ['rounded', 'Soft'], ['pill', 'Go'], ['diamond', 'OK?']]); connectFree(d, f, 3, 0); connectFree(d, f, 0, 3); connectFree(d, f, 3, 2);
  const t = src(d.flows[0]), doc = flowDoc(d.flows[0]); assert.match(t, /^flowchart TD/); assert.ok(!t.includes('subgraph'));
  assert.match(t, /s1\["Plain"\]/); assert.match(t, /s2\("Soft"\)/); assert.match(t, /s3\(\["Go"\]\)/); assert.match(t, /s4\{"OK\?"\}/); assert.match(t, /s4 -->\|"Yes"\| s1/, 'arrows work in either direction'); assert.match(t, /s1 --> s4/); assert.match(doc, /Mermaid chooses where to place them/); assert.ok(flow);
});
test('a free canvas of only entity boxes becomes an ER diagram with fields, sheet-free names and cardinalities from the labels', () => {
  const { d, f } = free([['entity', 'Customer', 'id\nfull name\nemail address'], ['entity', 'Order', 'id\ntotal'], ['entity', 'Order line'], ['entity', 'Khách hàng']]);
  connectFree(d, f, 0, 1); d.flows[0].steps[1].triggers[0].msg = '1 to many'; connectFree(d, f, 1, 2); d.flows[0].steps[2].triggers[0].msg = 'many to 1'; connectFree(d, f, 2, 3); d.flows[0].steps[3].triggers[0].msg = 'sometimes';
  const t = src(d.flows[0]); assert.match(t, /^erDiagram/); assert.match(t, /Customer \{\n\s+string id\n\s+string full_name "full name"\n\s+string email_address "email address"\n\s+\}/);
  assert.match(t, /Customer \|\|--o\{ Order : "1 to many"/); assert.match(t, /Order \}o--\|\| "Order line" : "many to 1"/); assert.match(t, /"Order line" \}o--o\{ "Khách hàng" : "sometimes"/); assert.match(t, /"Order line" \{\n\s+\}/);
});
test('ER field names are plain ASCII (Mermaid refuses accents), with the real text kept as the comment, and are never empty or repeated', () => {
  const { d, f } = free([['entity', 'Khách', 'tên khách hàng\nđịa chỉ\n123\n!!!\nid\nID']]); const t = src(d.flows[0]);
  assert.match(t, /string ten_khach_hang "tên khách hàng"/); assert.match(t, /string dia_chi "địa chỉ"/); assert.match(t, /string f_123 "123"/); assert.match(t, /string field "!!!"/); assert.match(t, /string id\n/); assert.match(t, /string id_ "ID"/); assert.ok(!/[^\x00-\x7f]/.test(t.split('\n').filter((l) => l.includes('string ')).map((l) => l.replace(/"[^"]*"/g, '')).join('')));
});
test('entities mixed with other boxes stay in a flowchart, the entity box showing its lines', () => {
  const { flow } = free([['entity', 'Order', 'id\ntotal'], ['rounded', 'Ship']]); const t = src(flow); assert.match(t, /^flowchart TD/); assert.match(t, /s1\["Order<br\/>id<br\/>total"\]/);
});
test('an empty flow gives a note instead of an empty diagram, and a document of all flows has a heading for each', () => {
  const d = emptyData('T'); o.addFlow(d, { title: 'Empty' }); const s = swim(); d.flows.push(s.flow);
  assert.match(flowDoc(d.flows[0]), /no steps yet/); assert.ok(!flowDoc(d.flows[0]).includes('mermaid')); const all = flowsDoc(d, 'Demo flows');
  assert.ok(all.startsWith('# Demo flows\n\n## Empty\n')); assert.match(all, /\n## Quote approval\n/); assert.ok(all.endsWith('\n') && !all.endsWith('\n\n')); assert.match(flowsDoc(emptyData('T')), /No business flows yet/);
});
test('the same flow always exports the same text', () => { const { flow } = swim(); assert.equal(flowDoc(flow), flowDoc(flow)); });

test('the document of all flows starts with a diagram of how the flows connect, and has none when nothing is connected', () => {
  const d = emptyData('T'), a = o.addFlow(d, { title: 'Payroll' }), b = o.addFlow(d, { title: 'Budget "review"' }); o.addFlow(d, { title: 'Alone' }); o.addStep(d, a, { team: 'A', title: 'x' });
  assert.ok(!flowsDoc(d).includes('How flows connect')); o.addFlowLink(d, { fromFlowId: a, toFlowId: b, label: 'monthly close' }); const doc = flowsDoc(d, 'Demo');
  assert.match(doc, /^# Demo\n\n## How flows connect\n\n```mermaid\nflowchart LR\n  f1\["Payroll"\]\n  f2\["Budget #quot;review#quot;"\]\n  f1 -->\|"monthly close"\| f2\n```/); assert.ok(!doc.split('How flows connect')[1].split('```')[1].includes('Alone'));
  assert.ok(doc.indexOf('How flows connect') < doc.indexOf('## Payroll'));
});
