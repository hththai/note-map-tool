import { useRecords } from '../lib/records.js';
import { FILE_TYPE_LABEL } from '../lib/schema.js';
import { low, toneOf, deptOf, whereIs, feedsOf, fedByOf, flowsOf, nodeByKey } from '../data.js';

export function Chip({ l, onPick }) {
  const t = toneOf(deptOf(l.key));
  return (
    <button onClick={() => onPick?.(l.key)} title={l.label} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs hover:brightness-95 ${t.soft} ${t.ring} ${l.manual ? 'border-dashed' : ''}`}>
      <i className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />{l.name}{l.manual && <span title="Copied by hand">✋</span>}
    </button>
  );
}

const Tile = ({ title, children, stub }) => (
  <div className={`rounded-xl p-3.5 ${stub ? 'border border-dashed border-amber-300 bg-amber-50' : 'border border-slate-200 bg-white'}`}>
    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}{stub ? ' · stub' : ''}</div>
    <div className="whitespace-pre-wrap text-sm leading-relaxed">{children}</div>
  </div>
);

/* the four documentation questions, plus the procedure that surrounds the sheet */
export default function DocTiles({ n, onPick }) {
  const { data } = useRecords(), rec = data.sheets.find((x) => x.name.toLowerCase() === n.key), w = whereIs()[n.key] || {}, feeds = feedsOf(n.key), fl = flowsOf(n.name), teams = [...new Set(fl.map((x) => x.s.team))];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Tile title="What it is">{[rec?.type && 'Type: ' + FILE_TYPE_LABEL[rec.type], n.note || n.details || 'No description yet.'].filter(Boolean).join('\n')}</Tile>
      <Tile title="Who uses it">{[n.parts?.[0] && 'Owner: ' + n.parts[0], w.dept && w.dept + ' team', teams.length ? 'In flows: ' + teams.join(', ') : ''].filter(Boolean).join('\n') || 'Not recorded'}</Tile>
      <Tile title="Who needs it">
        {feeds.length ? <div className="flex flex-wrap gap-1.5">{feeds.map((l) => <Chip key={l.key} l={l} onPick={onPick} />)}</div> : <span className="text-slate-400">Nothing downstream</span>}
      </Tile>
      <Tile title="Documentation">
        {rec?.docs?.length ? <ul className="space-y-0.5">{rec.docs.map((x, i) => <li key={i}>{/^https?:/i.test(x.url) ? <a className="text-blue-600 underline" href={x.url} target="_blank" rel="noreferrer">{x.label || x.url} ↗</a> : x.label || x.url}</li>)}</ul> : <span className="text-slate-400">No documentation links yet.</span>}
      </Tile>
      <Tile title="What it is for" stub>One line of purpose, in business words. This would be a new field.</Tile>
      {w.sec?.note && <div className="rounded-xl border border-amber-300 bg-amber-100 p-3.5 text-sm md:col-span-2"><b className="mb-0.5 block text-xs uppercase tracking-wider text-amber-900">Procedure · {w.sec.title}</b>{w.sec.note}</div>}
    </div>
  );
}
