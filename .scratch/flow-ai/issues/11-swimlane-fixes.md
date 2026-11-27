# 11: Swimlane layout fixes left from phase 3

**What to build:** Two decision branches that land in the same lane are stacked instead of overlapping, and the user decides whether dragging a step sideways within its lane reorders it.

**Blocked by:** None (can start immediately)

**Status:** done on branch `feat/ai-flows`

- [x] Same-lane branches out of a decision sit in separate rows; arrows and labels are not hidden behind boxes
- [x] Within-lane drag: either reorders without breaking "waits on an earlier step", or is dropped on purpose and noted in the plan
- [x] Existing flow canvas browser tests still pass
