# 10: Mermaid export of Flows

**What to build:** The Flow document export includes a Mermaid diagram with notes and decisions, so it renders on GitHub.

**Blocked by:** 02: Entity box, pill, diamond and notes on the free canvas

**Status:** done on branch `feat/ai-flows`

- [x] Swimlane and free-canvas Flows both export with their steps and arrows; Mermaid places the boxes itself, so free-canvas positions are not kept (say so in the export)
- [x] An entity diagram exports as a Mermaid ER diagram
- [x] Decisions show Yes/No labels; notes appear as comments
- [x] An Export is never edited or read back
