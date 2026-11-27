# Diagram libraries: React Flow vs tldraw vs Mermaid

Researched 2026-11-22 from primary sources only (npm registry, official docs, GitHub raw files, bundlephobia API). Versions checked that day: `@xyflow/react` 13.0.2, `tldraw` 5.6.2, `mermaid` 12.3.0.

## Question

Which library should render (a) swimlane business-flow diagrams (lanes = teams, steps in lanes, hand-off arrows, some backward) and (b) a sheets-to-sheets connection map (cards grouped in department boxes, directed links), in a local-first Vite + React 19 + Tailwind app whose data is Markdown/JSON files with no database?

## Short answer

- **(a) Swimlane flows:** React Flow (`@xyflow/react`) with lanes as parent nodes and dagre or ELK for placement. Use Mermaid `swimlane-beta` only as a read-only preview or export. It is beta and cannot be edited on the canvas.
- **(b) Sheets map:** React Flow, with department boxes as `group` parent nodes and cards as custom nodes. Same stack as (a), so there is one editor to build and maintain.
- **tldraw:** skip it. Production use needs a paid license key (see below), and it has no graph auto-layout or node-and-edge data model.
- **Source of truth:** keep JSON (or fenced JSON/YAML in Markdown) as the truth. Generate React Flow and Mermaid from it. Do not parse Mermaid text back.

## Comparison

| Criterion | React Flow | tldraw | Mermaid |
|---|---|---|---|
| Version | 13.0.2 [1] | 5.6.2 [2] | 12.3.0 [3] |
| Lanes / groups | `parentId` plus `extent: 'parent'`; `group` node type; parents need not precede children since 13.0.0 [4][5] | Frames and groups exist; docs I read do not describe parent/child semantics (unverified) [6] | Flowchart `subgraph` (nestable). Subgraph direction is ignored if inner nodes link outside [7]. `swimlane-beta` since v11.16.0: one lane per node, nested subgraph drawn as a plain box [8] |
| Editing UX | Drag, connect (`onConnect`), reconnect edges, delete key. Inline edit is done with your own inputs plus the `nodrag` class [9] | Rich freeform canvas with arrows that bind to shapes [6][10] | None. Render-only SVG. `click` callbacks need `securityLevel: 'loose'` [7] |
| Auto-layout | None built in. Docs recommend dagre (simplest) or ELK (configurable, handles edge routing). Dagre has a sub-flow bug when a child links outside its parent [11] | Not mentioned in the docs I read [6] | Built in. ELK is the default since v12; dagre is available [7][12] |
| Licence | MIT. Attribution shown by default. Removing it needs a Pro subscription (Starter $169/mo as listed) [13][14] | Custom SDK licence: development use only. Production needs a trial, commercial or hobby key. Hobby keys require the "made with tldraw" watermark. Trial is 100 days [15][16] | MIT [3] |
| Bundle (bundlephobia API) | 262 kB min, 88 kB gzip [17] | 1.87 MB min, 555 kB gzip [17] | Main chunk 667 kB min, 159 kB gzip, plus lazy chunks of 0.2 to 1.5 MB each [17]. A "Tiny" build is about half the size and has no ELK [12] |
| Accessibility | Tab through nodes and edges, Enter/Space select, arrow keys move selected node, `aria-live` announcements, `ariaLabelConfig` [18] | Tab and Ctrl/Cmd+arrow selection, live-region announcements, `getAriaDescriptor()`. Default announcement is shape type and position only [19] | Static SVG with `aria-roledescription`, plus `accTitle` and `accDescr`. No keyboard interaction documented [20] |
| React 19 | Peer `react >=18` [1]. No explicit React 19 statement found in the docs (unverified beyond the peer range) | Peer `^18.2.0 \|\| ^19.2.1` [2] | Framework-agnostic; no React peer dependency [3] |
| Round-trip to text | `toObject()` gives JSON nodes, edges and viewport [21]. Mapping to our files is ours to write | `getSnapshot`/`loadSnapshot` gives JSON with a versioned schema. It is a canvas store, not a graph [22] | Text in, SVG out. `parse()` validates only [12]. No documented SVG-to-text path |

## Per-library notes

**React Flow.** Closest fit to a node-and-edge model with grouping. Lanes are large parent nodes and steps are children positioned relative to them [5]. Edges that cross lanes, including backward ones, are ordinary edges. Dagre is a 47 kB min / 16 kB gzip add-on [17]. ELK handles sub-flows and edge routing better, but `elkjs` is dual-licensed EPL-2.0 OR GPL-3.0-or-later [3 npm metadata for `elkjs`; check EPL fits your use]. Keyboard and ARIA support is on by default [18]. The 13.0.0 breaking changes are listed in the changelog [23].

**tldraw.** The licence text allows development use only and forbids production use [15]. Production needs a key. The docs list a 100-day trial, a commercial licence (priced by sales) and a discretionary hobby licence that must show a watermark [16]. It depends on TipTap, Radix and others [2]. It is a whiteboard, so there is no data-first graph model to generate from text. Not recommended.

**Mermaid.** Best for text-first output and README or PR previews. `swimlane-beta` fits (a) for static views but is beta and its syntax may change [8]. Lane-per-node is one-to-one, which suits hand-offs but cannot represent a step shared by two teams. Use `mermaid.render()` to get SVG [12]. Load it lazily because of its size [17].

## Round-trip to Markdown approach

1. Store a fenced block per diagram in the `.md` file, for example a `flow` JSON block holding `lanes[]`, `steps[] {id, lane, label}`, `links[] {from, to, label}` and optional `layout {id: {x, y}}`. The sheets map uses `groups[]` (departments) and `cards[]` the same way.
2. Load: JSON to React Flow nodes (lane or group as parent, `parentId` on children) and edges. If `layout` is missing, run dagre or ELK once and save the result.
3. Edit: on drag, connect or label change, map React Flow state back to the same JSON schema. Write only semantic fields plus positions. Do not store React Flow internals such as `measured` or `selected`.
4. Export: from the same JSON, emit `swimlane-beta` or `flowchart` text into a Mermaid block for GitHub rendering. This is one-way, which avoids parsing Mermaid.
5. Keep ids stable and the JSON key order deterministic so Git diffs stay readable.

## Open questions / unverified

- React Flow's React 19 support is only inferred from the peer range `>=18` [1]. Run the app's own smoke test.
- tldraw frame parent/child behaviour and arrow-binding details: the pages I fetched did not cover them [6]. Not needed given the recommendation.
- tldraw commercial price: the licence page gives none [16]. Check tldraw.dev/pricing (not fetched).
- Whether the dagre sub-flow bug [11] still affects `@dagrejs/dagre` 3.1.3: not tested. Plan to place children by hand per lane or use ELK.
- Bundle sizes come from the third-party bundlephobia API [17], not first-party. They are whole-package main-entry figures. Real Vite tree-shaken output will differ. Measure with `vite build`.
- React Flow's attribution wording is from a docs page [13]. The MIT licence text itself was not fetched. Confirm in the repo's LICENSE before shipping without attribution.
- Mermaid swimlane accessibility beyond `accTitle` and `accDescr` is undocumented in what I read [8][20].

## Sources

1. https://registry.npmjs.org/@xyflow/react/latest
2. https://registry.npmjs.org/tldraw/latest
3. https://registry.npmjs.org/mermaid/latest (also `/@dagrejs/dagre/latest`, `/elkjs/latest`)
4. https://raw.githubusercontent.com/xyflow/xyflow/main/packages/react/CHANGELOG.md
5. https://reactflow.dev/learn/layouting/sub-flows
6. https://tldraw.dev/docs/shapes
7. https://mermaid.js.org/syntax/flowchart.html
8. https://mermaid.js.org/syntax/swimlanes.html
9. https://reactflow.dev/api-reference/react-flow
10. https://tldraw.dev/docs/shapes (Bindings: "Connecting shapes together (like arrows)")
11. https://reactflow.dev/learn/layouting/layouting
12. https://mermaid.js.org/config/usage.html
13. https://reactflow.dev/learn/troubleshooting/remove-attribution
14. https://registry.npmjs.org/@xyflow/react/latest (license field MIT)
15. https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md
16. https://tldraw.dev/community/license
17. https://bundlephobia.com/api/size?package=NAME@VERSION (queried for each package)
18. https://reactflow.dev/learn/advanced-use/accessibility
19. https://tldraw.dev/sdk-features/accessibility
20. https://mermaid.js.org/config/accessibility.html
21. https://reactflow.dev/api-reference/types/react-flow-instance
22. https://tldraw.dev/docs/persistence
23. https://reactflow.dev/learn/troubleshooting/migrate-to-v12 (version banner only)
