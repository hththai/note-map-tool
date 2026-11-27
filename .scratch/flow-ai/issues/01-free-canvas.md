# 01: Free canvas Flow with shapes and arrows

**What to build:** A Flow can be set to a free-canvas layout. The user adds rectangles and rounded boxes, drags and resizes them, types inside them, and joins them with labelled arrows. Swimlane stays the default; old flows are unchanged. A swimlane Flow can be switched to free canvas (one way only), keeping its on-screen positions.

**Blocked by:** None (can start immediately)

**Status:** done on branch `feat/ai-flows`

Decisions this ticket rests on:
- A free-canvas shape is a Flow step with position, size and shape added, not a new kind of Entry.
- The swimlane canvas draws from flows rebuilt from the old Markdown format, which cannot hold positions. The free canvas must draw straight from the Data file.

- [x] Optional Flow `layout` (`swimlane` default, `free`); old Data files load unchanged
- [x] On `free`, steps keep their own position and size; drag and resize work
- [x] Arrows are labelled connectors with an arrowhead, reusing the step's existing arrows
- [x] "Switch to free canvas" copies current positions; there is no way back, and the user is told so
- [x] Every action goes through apply/undo; deletes go to Removed and restore exactly
- [x] Save writes a valid Data file; round-trip and delete/restore tests cover the new fields
- [x] The legacy Markdown export of a free-canvas Flow still lists its steps
