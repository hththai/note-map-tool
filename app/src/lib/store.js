/* Reading and saving records through server.py. The page never writes anywhere else.
 * Rules (docs/DESIGN.md): every read keeps the file's hash; every save sends it back as X-Base-Hash,
 * and a 409 means the file changed since it was loaded, so nothing was written. */
const EMPTY_TICKETS = { nextId: 1, tickets: [] };

async function read(url, { optional = false } = {}) {
  const r = await fetch(url, { cache: 'no-store' });
  if (r.status === 404 && optional) return { text: null, hash: null };
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return { text: (await r.text()).replace(/^\n+|\n+$/g, ''), hash: r.headers.get('X-Content-Hash') };
}

export async function listMaps() {
  const r = await fetch('/api/maps', { cache: 'no-store' });
  if (!r.ok) throw new Error('Cannot list maps: is server.py running?');
  return r.json();
}

export async function listData() {
  const r = await fetch('/api/data', { cache: 'no-store' });
  if (!r.ok) throw new Error('Cannot list data files: is server.py running?');
  return r.json();
}

/* data/<name>.json, or null if there is none yet */
export async function loadData(name) {
  const r = await read(`/data/${name}.json`, { optional: true });
  return r.text == null ? null : { data: JSON.parse(r.text), hash: r.hash };
}

/* the old files: maps/<name>.md + <name>.flows.md + <name>.tickets.json; the last two may not exist yet */
export async function loadRecords(mapFile) {
  const base = mapFile.replace(/\.md$/, '');
  const [map, flows, tix] = await Promise.all([read(`/maps/${mapFile}`), read(`/maps/${base}.flows.md`, { optional: true }), read(`/maps/${base}.tickets.json`, { optional: true })]);
  return {
    mapMd: map.text, flowsMd: flows.text ?? '', ticketsJson: tix.text == null ? EMPTY_TICKETS : JSON.parse(tix.text),
    files: { map: { name: `${base}.md`, hash: map.hash }, flows: { name: `${base}.flows.md`, hash: flows.hash }, tickets: { name: `${base}.tickets.json`, hash: tix.hash } },
  };
}

/* ok: saved, hash is the new base hash. conflict: the file changed on disk, nothing written.
 * Pass base = null for a file that does not exist yet (creates it, refuses if the name is taken). */
export async function saveFile(url, text, base, { force = false } = {}) {
  const headers = { 'X-Map-Save': '1', 'Content-Type': 'text/plain' };
  if (base) headers['X-Base-Hash'] = base; else headers['X-Map-Create'] = '1';
  if (force) headers['X-Force'] = '1';
  const r = await fetch(url, { method: 'PUT', headers, body: text.replace(/\s+$/, '') + '\n' });
  if (r.status === 204) return { ok: true, hash: r.headers.get('X-Content-Hash') };
  if (r.status === 409) return { conflict: true };
  throw new Error(`Could not save ${url}: ${r.status}`);
}
