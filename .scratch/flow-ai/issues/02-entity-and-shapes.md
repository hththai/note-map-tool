# 02: Entity box, pill, diamond and notes on the free canvas

**What to build:** A shape palette on the free canvas: rectangle, rounded, pill, diamond, note, and an entity box (bold title, free description lines, optional Sheet reference). Relationships are labelled arrows with text such as "1 to many"; no field types or keys.

**Blocked by:** 01: Free canvas Flow with shapes and arrows

**Status:** done on branch `feat/ai-flows`

- [x] Palette adds each shape; text is editable inside the shape
- [x] Start, end and decision steps map to pill and diamond; Yes/No branch labels still work
- [x] Entity box holds a title, free lines and an optional Sheet reference
- [x] Notes work as in swimlane flows (free or pinned)
- [x] Undo, Removed/restore and Save round-trip cover every shape
- [x] An entity diagram and a waterfall can be drawn by hand, saved and reloaded
