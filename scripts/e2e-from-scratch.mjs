// End-to-end proof that the new app works WITHOUT any legacy file or the old app: start from an empty folder, build a map with
// departments, sections, sheets, an app, a link, a ticket project and a flow through the UI, save, reload, and check the file.
// Runs on a throwaway sandbox only. Run: node scripts/e2e-from-scratch.mjs
import path from 'node:path'; import { pathToFileURL } from 'node:url';
import { harness, reporter } from './lib/e2e-harness.mjs';
const lib = (f) => import(pathToFileURL(path.resolve(import.meta.dirname, '../app/src/lib', f)).href);
const { exportLegacy } = await lib('export-legacy.js'), { importLegacy } = await lib('import-legacy.js'), { roundTrip } = await lib('roundtrip.js'), { validate } = await lib('schema.js');
const r = reporter(), H = await harness({ files: [] }), { until, click, type, choose, typeLabel, js } = H;
const saved = () => until(`document.querySelector('[role=status]').textContent.includes('Saved')`, 'saved');
try {
  await H.goto(`${H.url}/#structure`);
  await until(`document.body.textContent.includes('Start your first map')`, 'first-map screen');
  r.check('an empty install offers to start a map (no legacy needed)', true);
  await typeLabel('Title', 'Test Organisation'); await click('Create map'); await until(`document.body.textContent.includes('This map is empty')`, 'map opened on an empty canvas');
  r.check('a new map asks only for a title and opens on an empty canvas with one big button', true);
  r.check('creating a map writes a valid empty data file named after the title', H.readJson('data/test-organisation.json').schemaVersion === 1 && validate(H.readJson('data/test-organisation.json')).length === 0);
  const dlgOpen = (name) => until(`!!document.querySelector('[role=dialog][aria-label^=${JSON.stringify(name)}]')`, 'modal ' + name), gone = () => until(`!document.querySelector('[role=dialog]')`, 'modal closed');
  const onMap = (text) => until(`[...document.querySelectorAll('.react-flow__node')].some((n) => n.textContent.startsWith(${JSON.stringify(text)}))`, text + ' on the map');
  const clickMap = (text, button) => js(`(() => { const n = [...document.querySelectorAll('.react-flow__node')].find((x) => x.textContent.startsWith(${JSON.stringify(text)})); const b = ${button ? `[...n.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(button)})` : 'n'}; b.click(); return true; })()`);

  // a department with a member, straight from the empty map
  await click('+ Add department'); await dlgOpen('New department'); await typeLabel('Name', 'Operations'); await click('+ Add member'); await type('Member name', 'Kim Tran'); await type('Member role', 'Lead');
  await H.dlg('Save'); await gone(); await onMap('Operations'); await saved();
  r.check('a department and its member were saved by the modal alone', H.readJson('data/test-organisation.json').departments[0]?.members?.[0]?.name === 'Kim Tran');
  // a function from the + on its department, a file from the + on its function
  await clickMap('Operations', '+ Function'); await dlgOpen('New function in Operations'); await typeLabel('Title', 'Weekly stock count'); await H.dlg('Save'); await gone(); await onMap('Weekly stock count');
  await clickMap('Weekly stock count', '+ File'); await dlgOpen('New file');
  r.check('the + on a function pre-fills the function', await js(`document.querySelector('[role=dialog] [role=combobox][aria-label=Function]').value === 'Operations › Weekly stock count'`));
  await typeLabel('Name', 'Orders'); await typeLabel('Owner', 'Kim'); await typeLabel('Criticality', 'high'); await typeLabel('File type', 'pdf');
  r.check('the Owner field offers the department members', await js(`[...document.querySelectorAll('datalist option')].some((o) => o.value === 'Kim Tran')`));
  await click('+ Add link'); await type('Documentation label', 'How-to'); await type('Documentation address', 'https://doc.test/how');
  await H.dlg('Save'); await gone(); await onMap('Orders');
  // a second file from the top bar, finding its function by typing, not by scrolling a list
  await click('+ File'); await dlgOpen('New file'); await typeLabel('Name', 'Vendors'); await H.pick('Function', 'oper stock', 'Operations › Weekly stock count'); await H.dlg('Save'); await gone(); await onMap('Vendors');
  await click('+ App'); await dlgOpen('New app'); await typeLabel('Name', 'CRM'); await H.dlg('Save'); await gone(); await onMap('CRM');
  // a link from the top bar
  await click('+ Link'); await dlgOpen('New link'); await H.pick('From', 'ord', 'Orders'); await H.pick('To', 'crm', 'CRM'); await click('IMPORTRANGE'); await H.dlg('Save'); await gone();
  await until(`document.querySelectorAll('.react-flow__edge').length >= 1`, 'link drawn');
  r.check('structure built entirely from the map', true);
  await saved();

  await click('Tickets & projects'); await until(`document.body.textContent.includes('New ticket')`, 'work'); await click('New ticket');
  await until(`!!document.querySelector('form[aria-label=Ticket]')`, 'ticket form');
  await typeLabel('Title', 'Rebuild Orders import'); await typeLabel('Type', 'project'); await typeLabel('About', await js(`[...document.querySelectorAll('select option')].find((o) => o.text === 'Orders').value`));
  await click('Create'); await until(`document.body.textContent.includes('Rebuild Orders import') && !document.querySelector('form[aria-label=Ticket]')`, 'ticket on board, form closed');
  r.check('ticket created from the form', true);
  await js(`document.querySelector('[aria-label^="Open P"]').click(), true`); await until(`!!document.querySelector('[aria-label="Hours worked"]')`, 'ticket opened again');
  await type('Hours worked', '2.5'); await type('What did you do', 'First test'); await click('Log'); await until(`document.body.textContent.includes('2.5 h')`, 'time logged');
  await click('Save'); await H.sleep(300);

  await click('Business flows'); await until(`!!document.querySelector('[aria-label="New flow name"]')`, 'flows view');
  await type('New flow name', 'Weekly stock'); await click('New flow'); await until(`!!document.querySelector('[aria-label="New step team"]')`, 'flow editor');
  await type('New step team', 'Operations'); await type('New step title', 'Count the stock'); await click('Add step');
  const stepNodes = (n) => until(`document.querySelectorAll('.react-flow__node-step').length >= ${n}`, 'step ' + n + ' on the diagram');
  /* a step's details open when it is selected on the diagram */
  const selectStep = (text, group) => js(`(() => { const n = [...document.querySelectorAll('.react-flow__node-step')].find((x) => x.textContent.includes(${JSON.stringify(text)})); n.click(); return true; })()`).then(() => until(`!!document.querySelector('[role=group][aria-label="${group}"]')`, group));
  await stepNodes(1);
  await type('New step team', 'Sales'); await type('New step title', 'Use the numbers'); await click('Add step');
  await stepNodes(2);
  await selectStep('Use the numbers', 'Step 2'); await choose('Add waits on', '1.', 'Step 2');
  await selectStep('Count the stock', 'Step 1'); await choose('Step sheet', 'Orders', 'Step 1');
  await until(`document.querySelectorAll('.react-flow__node').length >= 4`, 'flow drawn', 8000);
  r.check('flow with two steps, an arrow and a sheet built in the UI', true);
  await click('Save'); await saved(); await H.shot('4-from-scratch');

  const f = H.readJson('data/test-organisation.json');
  r.check('data file is valid', validate(f).length === 0, validate(f).join('; '));
  r.check('everything was saved', f.departments.length === 1 && f.departments[0].sections.length === 1 && f.sheets.length === 3 && f.sheets.some((s) => s.kind === 'app') && f.links.length === 1 && f.tickets.items.length === 1 && f.flows[0].steps.length === 2 && f.flows[0].steps[1].triggers.length === 1 && !!f.flows[0].steps[0].sheetId, JSON.stringify({ d: f.departments.length, s: f.sheets.length, l: f.links.length, t: f.tickets.items.length, steps: f.flows[0]?.steps.length }));
  r.check('the ticket keeps its time log and link to the sheet', f.tickets.items[0].type === 'project' && f.tickets.items[0].log?.[0].hours === 2.5 && f.tickets.items[0].targetId === f.sheets.find((s) => s.name === 'Orders').id && /^P\d{8}\.001$/.test(f.tickets.items[0].id));
  const org = f.departments[0], orders = f.sheets.find((s) => s.name === 'Orders');
  r.check('members, file type and documentation link were saved', org.members?.length === 1 && org.members[0].name === 'Kim Tran' && org.members[0].role === 'Lead' && orders.type === 'pdf' && orders.docs?.[0].url === 'https://doc.test/how' && orders.docs[0].label === 'How-to', JSON.stringify({ m: org.members, t: orders.type, d: orders.docs }));
  const legacy = exportLegacy(f), back = importLegacy(legacy);
  r.check('it exports to the legacy formats and round-trips with nothing lost', roundTrip(legacy, back.data).length === 0 && /- Orders \| Kim \| high/.test(legacy.mapMd) && /Orders -> CRM \| IMPORTRANGE/.test(legacy.mapMd), legacy.mapMd.replace(/\n/g, ' / ').slice(0, 120));

  await H.goto(`${H.url}/?map=test-organisation#overview`); await until(`document.body.textContent.includes('Test Organisation') && [...document.querySelectorAll('.react-flow__node')].some((n) => n.textContent.startsWith('Orders'))`, 'reloaded');
  r.check('after a reload the map is still there', true);
  await clickMap('Operations'); await dlgOpen('Department · Operations');
  r.check('clicking a department on the map opens it with its members, functions and open tickets', await js(`(() => { const t = document.querySelector('[role=dialog]').textContent; return t.includes('Weekly stock count') && t.includes('1 open ticket') && [...document.querySelectorAll('[role=dialog] input[aria-label="Member name"]')].some((i) => i.value === 'Kim Tran'); })()`));
  await H.dlg('Cancel'); await gone();
  await clickMap('Orders'); await dlgOpen('File · Orders');
  r.check('clicking a file opens it with its type, docs, connections and open tickets', await js(`(() => { const t = document.querySelector('[role=dialog]').textContent; return t.includes('Open tickets (1)') && t.includes('Rebuild Orders import') && t.includes('this → CRM') && [...document.querySelectorAll('[role=dialog] input[aria-label="Documentation address"]')].some((i) => i.value === 'https://doc.test/how'); })()`));
  r.check('no JavaScript errors in the page', H.errors.length === 0, H.errors[0] || '');
  console.log('\nsandbox (screenshot 4-from-scratch):', H.sandbox);
} catch (e) { console.log('FAIL ' + e.message); r.fail(); }
finally { H.finish(); }
process.exit(r.failed ? 1 : 0);
