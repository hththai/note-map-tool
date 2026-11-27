/* Draw one flow of a copy of the data exactly as the real canvas would, for a read-only preview. `marks` is { stepId: 'new' | 'changed' | 'removed' }. */
import { buildFlow } from '../graph.js';
import { buildFree } from '../free-graph.js';
import { exportLegacy } from '../lib/export-legacy.js';
import { parseFlows } from '../lib/flows-parser.js';

export function drawCopy(copy, flowId, marks = {}) {
  const i = copy.flows.findIndex((x) => x.id === flowId), meta = copy.flows[i];
  if (meta.layout === 'free') { const g = buildFree(meta, { sheets: copy.sheets }); return { ...g, nodes: g.nodes.map((n) => (n.type === 'free' && marks[meta.steps[n.data.idx]?.id] ? { ...n, data: { ...n.data, diff: marks[meta.steps[n.data.idx].id] } } : n)) }; }
  const legacy = parseFlows(exportLegacy(copy).flowsMd)[i], at = (id) => meta.steps.findIndex((x) => x.id === id);
  const g = buildFlow(legacy, { kinds: meta.steps.map((x) => x.kind || null), notes: (meta.notes || []).map((n) => ({ id: n.id, text: n.text, x: n.x, y: n.y, pinned: !!n.stepId, at: n.stepId ? at(n.stepId) : null })) });
  return { ...g, nodes: g.nodes.map((n) => (n.type === 'step' && marks[meta.steps[n.data.idx]?.id] ? { ...n, data: { ...n.data, diff: marks[meta.steps[n.data.idx].id] } } : n)) };
}
