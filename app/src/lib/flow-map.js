/* Where the flows go on the Flow map: left to right by how far each is down the chain of connections (a flow nothing leads to is at the start), flows in the
 * order they are listed. The map is laid out afresh each time, so nothing about it is stored. Pure. */
export function mapLayout(flows, links, { w = 250, h = 96, gx = 130, gy = 40 } = {}) {
  const n = flows.length, rank = new Map(flows.map((f) => [f.id, 0])), live = links.filter((l) => rank.has(l.fromFlowId) && rank.has(l.toFlowId));
  for (let pass = 0; pass < n; pass++) {                                   // push each flow one step past the ones that lead to it; a loop of connections just stops growing
    let moved = false;
    live.forEach((l) => { const r = Math.min(n - 1, rank.get(l.fromFlowId) + 1); if (rank.get(l.toFlowId) < r) { rank.set(l.toFlowId, r); moved = true; } });
    if (!moved) break;
  }
  const connected = new Set(live.flatMap((l) => [l.fromFlowId, l.toFlowId])), cols = [];
  [...flows].sort((a, b) => Number(connected.has(b.id)) - Number(connected.has(a.id)) || flows.indexOf(a) - flows.indexOf(b)).forEach((f) => (cols[rank.get(f.id)] ||= []).push(f));
  const out = {};
  cols.forEach((col, c) => col && col.forEach((f, i) => { out[f.id] = { x: 40 + c * (w + gx), y: 40 + i * (h + gy) }; }));
  return out;
}
