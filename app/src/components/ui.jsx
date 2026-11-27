import { useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState } from '@xyflow/react';
import { nodeTypes } from './nodes.jsx';
import { SKINS, skinVars } from '../lib/skins.js';

export function Canvas({ graph, onNode, onEdge, onConnect, fitKey, types = nodeTypes, minimap = true, rf = {}, skin = null }) {
  const t = skin ? SKINS[skin] : null;
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);
  /* redrawing keeps what the canvas has already measured, so a box that has not changed size is never left hidden waiting to be measured again */
  useEffect(() => { setNodes((old) => graph.nodes.map((n) => { const m = old.find((x) => x.id === n.id)?.measured; return m ? { ...n, measured: m } : n; })); setEdges(graph.edges); }, [graph, setNodes, setEdges]);
  return (
    <ReactFlow key={fitKey} nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={types}
      onNodeClick={(_, n) => onNode?.(n)} onEdgeClick={(_, e) => onEdge?.(e)} onConnect={onConnect} onPaneClick={() => onNode?.(null)} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.2} nodesConnectable={!!onConnect} forceColorMode={t?.dark ? 'dark' : 'light'} style={skin ? skinVars(skin) : undefined} {...rf}>
      <Background gap={22} color={t ? t.dot : '#e2e8f0'} /><Controls showInteractive={false} />{minimap && <MiniMap pannable zoomable className="!hidden md:!block" />}
    </ReactFlow>
  );
}
export const Select = ({ value, onChange, children }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">{children}</select>
);

/* A text field that applies its change when you leave it (or press Enter), so a rename is one edit, not one per keystroke. */
export function CommitInput({ value, onCommit, multiline = false, className = '', ...rest }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => { if (v !== (value ?? '')) onCommit(v); };
  const base = `rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 ${className}`;
  return multiline
    ? <textarea {...rest} className={`${base} min-h-16 w-full`} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} />
    : <input {...rest} className={`${base} w-full`} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />;
}
export const Btn = ({ danger, primary, className = '', ...p }) => <button type="button" {...p} className={`rounded-lg border px-2.5 py-1 text-sm disabled:opacity-40 ${primary ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : danger ? 'border-red-300 bg-white text-red-700 hover:bg-red-50' : 'border-slate-300 bg-white hover:border-blue-500'} ${className}`} />;
