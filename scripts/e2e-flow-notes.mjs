// Notes on the Business flows canvas, in a real browser: pin a note to a step, drop a free note, edit and drag notes, Esc drops a draft,
// Delete sends a note to Removed (and Restore brings it back), the flow note shows above the diagram, and everything survives Save and a reload.
// Throwaway sandbox. Run: npm --prefix app run build && node scripts/e2e-flow-notes.mjs   (CHROME=/path/to/chrome if needed)
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { validate } = await lib('schema.js');
const rd = (f) => fs.readFileSync(path.join(root, 'maps', f), 'utf8');
const demo = importLegacy({ mapMd: rd('demo.md'), flowsMd: rd('demo.flows.md'), ticketsJson: JSON.parse(rd('demo.tickets.json')) }).data;
const r = reporter(), H = await harness({ data: { 'demo.json': demo } }), { js, until, sleep } = H;
const q = JSON.stringify, file = () => H.readJson('data/demo.json'), notesOf = () => file().flows[0].notes || [];
const step = (t) => `[...document.querySelectorAll('.react-flow__node-step')].find((x) => x.textContent.includes(${q(t)}))`;
const note = (t) => `[...document.querySelectorAll('.react-flow__node-note')].find((x) => x.textContent.includes(${q(t)}))`;
const rect = (sel) => js(`(() => { const e = ${sel}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
const mid = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const noteCount = () => js(`document.querySelectorAll('.react-flow__node-note').length`);
const typingNote = `document.activeElement?.getAttribute('aria-label') === 'New note text'`;
const save = async () => { await H.click('Save'); await until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved'); };
const toolbar = (label) => js(`(() => { const b = [...document.querySelectorAll('[role=toolbar] button')].find((x) => x.textContent.trim() === ${q(label)}); if (!b) throw new Error('no toolbar button ' + ${q(label)}); b.click(); return true; })()`);
try {
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-step').length >= 4`, 'flow drawn'); await sleep(500);
  r.check('a flow with no notes draws none, and shows no flow note', await noteCount() === 0 && !(await js(`!!document.querySelector('[aria-label="Flow note"][class*=amber]')`)));

  // 1. pin a note to a step
  await H.mclick(mid(await rect(step('Top up')))); await until(`!!document.querySelector('[role=toolbar][aria-label="Step actions"]')`, 'step toolbar'); await toolbar('+ Note');
  await until(typingNote, 'note box focused'); await H.insert('Hours are copied by hand. Check HR first.'); await H.blur(); await until(`!!${note('copied by hand')}`, 'note drawn'); await sleep(300);
  r.check('+ Note on a step adds a sticky note pinned to it, joined by a thin line', await noteCount() === 1 && await js(`!!document.querySelector('.react-flow__edge[data-testid^="rf__edge-nl"]')`));
  const pinned = await rect(note('copied by hand')), top = await rect(step('Top up'));
  r.check('the pinned note sits just below its step', pinned.y > top.y && Math.abs(pinned.x - (top.x + 20 * (top.w / 180))) < 12, JSON.stringify([pinned, top].map((b) => [Math.round(b.x), Math.round(b.y)])));

  // 2. Esc drops a note that is still being typed
  await H.mclick(mid(await rect(step('Top up')))); await toolbar('+ Note'); await until(typingNote, 'second draft'); await H.insert('never saved'); await H.key('Escape'); await sleep(300);
  r.check('Esc drops a note that is still being typed, and nothing is added', await noteCount() === 1 && !(await js(`!!document.querySelector('[aria-label="New note text"]')`)));

  // 3. a free note from the header button
  await H.click('+ Note'); await until(typingNote, 'free draft'); await H.insert('Payroll closes Monday 9am'); await H.blur(); await until(`!!${note('closes Monday')}`, 'free note drawn');
  r.check('+ Note in the header adds a free-floating note with no line to a step', await noteCount() === 2 && await js(`document.querySelectorAll('.react-flow__edge[data-testid^="rf__edge-nl"]').length`) === 1);

  // 4. drag the free note somewhere else
  await sleep(300); const before = await rect(note('closes Monday')); const c = mid(before);
  await H.drag(c, { x: c.x - 160, y: c.y - 120 }); await sleep(400); const after = await rect(note('closes Monday'));
  r.check('dragging a note moves it', after.x - before.x < -120 && after.x - before.x > -175 && after.y - before.y < -90 && after.y - before.y > -135, `${Math.round(after.x - before.x)}, ${Math.round(after.y - before.y)}`);

  // 5. drag the pinned note: the line follows, and it stays pinned
  const pb = await rect(note('copied by hand')); const pc = mid(pb); await H.drag(pc, { x: pc.x + 90, y: pc.y + 10 }); await sleep(400);
  r.check('a pinned note can be dragged and stays joined to its step', (await rect(note('copied by hand'))).x > pb.x + 60 && await js(`document.querySelectorAll('.react-flow__edge[data-testid^="rf__edge-nl"]').length`) === 1);

  // 6. double-click a note to edit it
  await H.dblclick(mid(await rect(note('closes Monday')))); await until(`document.activeElement?.getAttribute('aria-label') === 'Note text'`, 'note editor'); await H.insert('Payroll closes Tuesday 9am'); await H.blur();
  await until(`!!${note('closes Tuesday')}`, 'note edited');
  r.check('double-click edits the text of a note', await noteCount() === 2 && !(await rect(note('closes Monday'))));

  // 7. the flow note is shown above the diagram
  await js(`(() => { const i = document.querySelector('textarea[aria-label="Flow note"]'); i.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(i, 'Runs every Friday, finished Monday.'); i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); return true; })()`);
  await until(`!!document.querySelector('div[aria-label="Flow note"]')`, 'flow note banner');
  r.check('the flow note appears above the diagram', await js(`document.querySelector('div[aria-label="Flow note"]').textContent`) === 'Runs every Friday, finished Monday.');

  // 8. Delete sends a note to Removed; Undo brings it back
  await H.mclick(mid(await rect(note('closes Tuesday')))); await sleep(200); await H.key('Delete'); await sleep(400);
  r.check('Delete removes the selected note', await noteCount() === 1);
  await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Undo').click(), true`); await sleep(400);
  r.check('Undo brings the note back', await noteCount() === 2);

  // 9. delete again, save, and restore it from Removed
  await H.mclick(mid(await rect(note('closes Tuesday')))); await sleep(200); await H.key('Delete'); await sleep(400); await save();
  r.check('Save writes the notes: one pinned, one removed, valid file', validate(file()).length === 0 && notesOf().length === 1 && !!notesOf()[0].stepId && file().removed.some((x) => x.kind === 'note' && /closes Tuesday/.test(x.entry.text)) && file().flows[0].note === 'Runs every Friday, finished Monday.');
  await H.click('Removed'); await until(`document.body.innerText.includes('closes Tuesday')`, 'removed list'); await H.click('Restore'); await sleep(400); await save();
  r.check('Restore from Removed puts the note back', notesOf().length === 2 && !file().removed.some((x) => x.kind === 'note') && validate(file()).length === 0);

  // 10. after a reload everything is still there
  await H.goto(`${H.url}/?map=demo#flows`); await until(`document.querySelectorAll('.react-flow__node-note').length === 2`, 'notes after reload'); await sleep(300);
  await until(`document.querySelectorAll('.react-flow__edge[data-testid^="rf__edge-nl"]').length >= 1`, 'the note line drawn after reload').catch(() => {});
  const lines = await js(`document.querySelectorAll('.react-flow__edge').length + ':' + [...document.querySelectorAll('.react-flow__edge')].map((e) => e.getAttribute('data-testid')).join(',')`);
  r.check('after a reload both notes are drawn', await noteCount() === 2);
  r.check('after a reload the pinned note is still joined to its step by a line', await js(`document.querySelectorAll('.react-flow__edge[data-testid^="rf__edge-nl"]').length`) === 1, lines);
  r.check('after a reload the flow note is still above the diagram', await js(`!!document.querySelector('div[aria-label="Flow note"]')`));
  r.check('nothing was lost: every original step is still there', demo.flows[0].steps.every((s0) => file().flows[0].steps.some((s) => s.id === s0.id)));
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  await H.shot('flow-notes'); console.log('sandbox (screenshot flow-notes):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); await H.shot('flow-notes-fail').catch(() => {}); console.log('sandbox:', H.sandbox); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
