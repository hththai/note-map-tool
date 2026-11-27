import { useEffect, useState } from 'react';
import { listMaps, listData, loadData } from './lib/store.js';
import { useRecords, openData, isDirty } from './lib/records.js';
import { model, flows, tickets, allNodes } from './data.js';
import Toolbar from './components/Toolbar.jsx';
import Overview from './views/Overview.jsx';
import Journey from './views/Journey.jsx';
import FlowMap from './views/FlowMap.jsx';
import Catalog from './views/Catalog.jsx';
import Detail from './views/Detail.jsx';
import Work from './views/Work.jsx';
import Flows from './views/Flows.jsx';
import Removed from './views/Removed.jsx';
import ImportPanel from './views/ImportPanel.jsx';
import { ModalProvider } from './components/modals/ModalHost.jsx';
import NewMap from './components/NewMap.jsx';
import MapMenu from './components/MapMenu.jsx';

const hashWs = () => location.hash.replace('#', '') || 'overview';

function Message({ title, children }) {
  return <div className="grid h-full place-items-center p-8"><div className="max-w-md text-center"><h1 className="mb-2 text-lg font-semibold">{title}</h1><p className="text-sm text-slate-600">{children}</p></div></div>;
}

export default function App() {
  const r = useRecords();
  const [names, setNames] = useState(null), [file, setFile] = useState(null), [state, setState] = useState({ status: 'loading' });
  const [ws, setWsState] = useState(hashWs), [sel, setSel] = useState(null), [fIdx, setFIdx] = useState(0), [creating, setCreating] = useState(false);
  const created = (n) => { setCreating(false); setNames((l) => [...(l || []).filter((x) => x.name !== n), { name: n, hasData: true }].sort((a, b) => a.name.localeCompare(b.name))); setFile(n); setState({ status: 'ready' }); };
  const setWs = (k) => { setWsState(k); history.replaceState(null, '', '#' + k); };
  const pickMap = (n) => { if (!isDirty() || window.confirm('You have unsaved changes in this map. Discard them?')) setFile(n); };

  /* every map that has a data file or old files */
  useEffect(() => {
    Promise.all([listData(), listMaps()]).then(([d, m]) => {
      const list = [...new Set([...d.map((x) => x.replace(/\.json$/, '')), ...m.map((x) => x.replace(/\.md$/, ''))])].sort();
      const info = list.map((n) => ({ name: n, hasData: d.includes(n + '.json') }));
      setNames(info);
      const want = new URLSearchParams(location.search).get('map')?.replace(/\.md$/, '');
      setFile(list.includes(want) ? want : list.includes('work') ? 'work' : list[0] || null);
      if (!list.length) setState({ status: 'empty' });
    }).catch((e) => setState({ status: 'error', message: e.message }));
  }, []);
  useEffect(() => {
    if (!file) return;
    setState({ status: 'loading' }); setSel(null); setFIdx(0);
    loadData(file).then((got) => {
      if (!got) return setState({ status: 'needs-import' });
      openData(file, got.data, got.hash); setState({ status: 'ready' });
    }).catch((e) => setState({ status: 'error', message: e.message }));
    const u = new URL(location.href); u.searchParams.set('map', file); history.replaceState(null, '', u);
  }, [file]);
  /* the import panel finished: the data file now exists */
  useEffect(() => { if (state.status === 'needs-import' && r.name === file && r.data) { setState({ status: 'ready' }); setNames((l) => l.map((x) => (x.name === file ? { ...x, hasData: true } : x))); } }, [r.name, r.data, state.status, file]);

  if (state.status === 'error') return <Message title="Cannot load your records">{state.message}. Start the app with <code>./start.command</code> so <code>server.py</code> is running. Nothing has been changed.</Message>;
  if (state.status === 'empty') return <div className="grid h-full place-items-center p-8"><div className="w-80"><h1 className="mb-1 text-lg font-semibold">Start your first map</h1><p className="mb-3 text-sm text-slate-600">A map is the sheets your organisation uses, who owns them, and how data flows between them.</p><NewMap onCreated={created} /></div></div>;
  if (!names || !file || state.status === 'loading') return <Message title="Loading…" />;

  const picker = names.length > 1 && <select aria-label="Map" value={file} onChange={(e) => pickMap(e.target.value)} className="mb-3 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">{names.map((m) => <option key={m.name} value={m.name}>{m.name}{m.hasData ? '' : ' (not imported)'}</option>)}</select>;
  const newMap = creating ? <div className="mb-3"><NewMap taken={names.map((x) => x.name)} onCreated={created} onCancel={() => setCreating(false)} /></div> : <button type="button" className="mb-3 rounded-lg border border-dashed border-slate-300 px-2 py-1 text-left text-sm text-slate-600 hover:border-blue-500" onClick={() => setCreating(true)}>＋ New map</button>;
  if (state.status === 'needs-import') return <div className="flex h-full"><nav className="w-60 shrink-0 border-r border-slate-200 bg-white p-3"><div className="mb-2 px-2 font-semibold">Sheets map</div>{picker}{newMap}</nav><main className="flex-1 overflow-auto"><ImportPanel name={file} /></main></div>;

  const open = tickets.filter((t) => t.status !== 'done'), blocked = open.filter((t) => t.status === 'blocked').length;
  const groups = [
    ['Map', [['overview', 'Overview', 'see and edit'], ['journey', 'Journey', 'how data travels']]],
    ['Docs', [['catalog', 'Catalog', allNodes().length], ['detail', 'Detail', '']]],
    ['Work', [['work', 'Tickets & projects', open.length + (blocked ? ' · ' + blocked + '!' : '')]]],
    ['Workflows', [['flows', 'Business flows', flows.length], ['flowmap', 'Flow map', (r.data.flowLinks || []).length || 'how flows connect']]],
    ['Safety', [['removed', 'Removed', r.data.removed.length || '']]],
  ];
  const toDetail = () => setWs('detail');
  return (
    <ModalProvider>
    <div className="flex h-full">
      <nav className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-3">
        <div className="mb-1 flex items-center justify-between gap-2 px-2"><div className="min-w-0 truncate text-base font-semibold tracking-tight">{model.title}</div><MapMenu /></div>
        {picker}
        {newMap}
        {groups.map(([g, items]) => (
          <div key={g} className="mb-3"><div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g}</div>
            {items.map(([k, label, hint]) => (
              <button key={k} onClick={() => setWs(k)} className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${ws === k ? 'bg-slate-100 font-semibold shadow-[inset_3px_0_0_#0b6bcb]' : 'text-slate-600 hover:bg-slate-50'}`}>
                {label}<small className={`text-xs font-normal ${String(hint).includes('!') ? 'text-red-600' : 'text-slate-400'}`}>{hint}</small>
              </button>
            ))}
          </div>
        ))}
        {sel && <div className="mt-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-500">Selected<div className="font-semibold text-slate-800">{allNodes().find((n) => n.key === sel)?.name}</div><button className="mt-1 text-blue-600" onClick={() => setSel(null)}>Clear</button></div>}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar />
        <main className="min-h-0 flex-1">
          {(ws === 'overview' || ws === 'structure') && <Overview key={file} setSel={setSel} />}
          {ws === 'journey' && <Journey key={file} sel={sel} setSel={setSel} onDetail={toDetail} />}
          {ws === 'catalog' && <Catalog key={file} sel={sel} setSel={setSel} onDetail={toDetail} />}
          {ws === 'detail' && <Detail key={file} sel={sel} setSel={setSel} />}
          {ws === 'work' && <div className="h-full overflow-auto"><Work key={file} /></div>}
          {ws === 'flows' && <Flows key={file} idx={fIdx} setIdx={setFIdx} />}
          {ws === 'flowmap' && <FlowMap key={file} onOpen={(i) => { setFIdx(i); setWs('flows'); }} />}
          {ws === 'removed' && <div className="h-full overflow-auto"><Removed /></div>}
        </main>
      </div>
    </div>
    </ModalProvider>
  );
}
