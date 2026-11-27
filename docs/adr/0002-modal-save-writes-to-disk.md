---
status: accepted
---

# A modal's Save writes the file at once

Editing happens in modals opened from the map. A modal's **Save** applies the change and writes the Data file immediately (a Snapshot is taken as always), instead of staging it for the toolbar Save. A modal is a draft until Save: Cancel or Escape throws it away. Inline edits that are not in a modal (the ticket board) stay staged until the toolbar Save. Because a file is written whole, a modal Save also writes any inline edits made earlier.

## Considered Options

- **Keep one explicit Save for everything**: the original rule (no autosave, a leave-page warning). Rejected for modals: a "Save" button that does not save was the confusing part, and it meant two saves per edit.
- **Autosave every change**: fewest clicks, but each keystroke would take a Snapshot and push real history out of the last 20, and a half-typed rename could reach disk.

## Consequences

- Every modal save can be refused with a 409 (the file changed on disk). The modal stays open and offers Reload or Overwrite; the edit is kept in memory meanwhile.
- Undo still works after a modal save (it leaves the file unsaved until you Save again).
- Snapshots grow with the number of modal saves (the last 20 are kept), so a quick series of edits uses them faster than before.
