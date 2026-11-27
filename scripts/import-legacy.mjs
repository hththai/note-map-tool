// One-time (re-runnable) import: old files in maps/ -> one Data file per map in data/.
// The old files are only READ. Usage:
//   node scripts/import-legacy.mjs --all            import every map
//   node scripts/import-legacy.mjs work demo        import some
//   add --dry-run to only check, --force to replace an existing data/<name>.json (the old one is kept in data/.history/)
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const root = path.resolve(import.meta.dirname, '..'), lib = (f) => import(pathToFileURL(path.join(root, 'app/src/lib', f)).href);
const { importLegacy } = await lib('import-legacy.js'), { roundTrip } = await lib('roundtrip.js');
const args = process.argv.slice(2), flag = (f) => args.includes(f), names = args.filter((a) => !a.startsWith('--'));
const maps = path.join(root, 'maps'), out = path.join(root, 'data');
const all = fs.readdirSync(maps).filter((f) => f.endsWith('.md') && !f.endsWith('.flows.md')).map((f) => f.replace(/\.md$/, '')).sort();
const todo = flag('--all') ? all : names;
if (!todo.length) { console.log('Usage: node scripts/import-legacy.mjs --all | <name> ...   [--dry-run] [--force]\nMaps found:', all.join(', ')); process.exit(2); }
const read = (f) => (fs.existsSync(path.join(maps, f)) ? fs.readFileSync(path.join(maps, f), 'utf8') : null);
let failed = 0;
for (const name of todo) {
  if (!all.includes(name)) { console.log(`FAIL ${name}: maps/${name}.md not found`); failed++; continue; }
  const t = read(name + '.tickets.json'), old = { mapMd: read(name + '.md'), flowsMd: read(name + '.flows.md') || '', ticketsJson: t ? JSON.parse(t) : null };
  const { data, report } = importLegacy({ ...old, source: { map: name + '.md', flows: old.flowsMd ? name + '.flows.md' : null, tickets: t ? name + '.tickets.json' : null } });
  const problems = roundTrip(old, data), c = report.counts;
  console.log(`${problems.length ? 'FAIL' : 'OK  '} ${name}: ${c.departments} departments, ${c.sheets} sheets and apps, ${c.links} links, ${c.flows} flows (${c.steps} steps), ${c.tickets} tickets`);
  report.unresolved.forEach((u) => console.log('       kept by name (not on the map):', u));
  if (data.meta.legacy) console.log('       some text could not be modelled and is kept word for word in meta.legacy:', Object.keys(data.meta.legacy).join(', '));
  if (problems.length) { problems.forEach((p) => console.log('       PROBLEM:', p)); failed++; continue; }
  if (flag('--dry-run')) continue;
  const file = path.join(out, name + '.json'), text = JSON.stringify(data, null, 2) + '\n';
  fs.mkdirSync(out, { recursive: true });
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, 'utf8') === text) { console.log('       data/' + name + '.json is already up to date'); continue; }
    if (!flag('--force')) { console.log(`       data/${name}.json already exists and differs (the app may have edited it). Nothing written; use --force to replace it.`); failed++; continue; }
    const h = path.join(out, '.history', name + '.json'); fs.mkdirSync(h, { recursive: true });
    fs.copyFileSync(file, path.join(h, 'before-reimport-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'));
  }
  fs.writeFileSync(file + '.tmp', text); fs.renameSync(file + '.tmp', file);
  console.log('       wrote data/' + name + '.json');
}
process.exit(failed ? 1 : 0);
