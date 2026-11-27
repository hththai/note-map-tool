# 12: Ask AI to change a free-canvas Flow

**What to build:** The Ask AI box also works on a free-canvas Flow (including entity diagrams): the user types a change ("add a Shipment entity related to Order") and sees a preview with new, changed and removed boxes marked, then Accept or Discard. New boxes are placed by the app near what they connect to, without overlapping.

**Blocked by:** 07: AI picks the chart type; the app lays it out (done); 08: Ask AI to edit a Flow (done)

**Status:** done on branch `feat/ai-flows`

- [x] The current flow is described to the AI including arrows that point at "later" boxes (free canvases have no earlier or later)
- [x] Kept boxes keep their position, size and shape; only words the AI changed are touched
- [x] New boxes are placed beside their first connection without overlapping any box
- [x] The preview marks boxes as NEW, CHANGED or REMOVED on the free canvas (the marks already exist for swimlane steps)
- [x] Accept is one undoable step; removed boxes go to Removed and restore exactly
- [x] Entity boxes keep their description lines and sheet unless the AI changes them
