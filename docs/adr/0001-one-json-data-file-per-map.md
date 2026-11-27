---
status: accepted
---

# One JSON Data file per map

Each map is stored as one structured JSON Data file holding all its Entries (sheets, apps, links, flows, tickets and Removed). Markdown is only ever generated from it as an Export. The app is the single editor, one person uses it, and the data is a few KB, so one file keeps saving atomic, Snapshots and the Base hash simple, gives Entries stable IDs so renames never break links, and gives reports a single place to read from.

## Considered Options

- **Keep three files per map (`.md`, `.flows.md`, `.tickets.json`)**: readable and hand-editable, but Entries refer to each other by name, there is no clean home for Removed, and three files must stay consistent. Rejected because hand-editing is not a need.
- **SQLite**: strong for heavy reporting, but opaque binary, needs a real API instead of a file server, and the data is far too small to benefit.

## Consequences

- A one-time, re-runnable import reads the old files and never modifies them. `npm run verify` proves the import, exported back to the old formats, matches every old file.
- An Export as legacy files stays available, so leaving the new app is always possible.
- Every Data file carries a `schemaVersion`; upgrading the format is an explicit step that takes a Snapshot first.
