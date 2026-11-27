# Sheets Ecosystem Map

A map of departments, Google Sheets, connected apps and the links between them. The map is drawn from a plain Markdown file.

![Sheets Ecosystem Map demo](docs/screenshot.png)

## Quick start with your existing (legacy) files

Your old `maps/*.md`, `*.flows.md` and `*.tickets.json` work as they are. Two commands, from this folder:

    ./start.command                          # builds the app if needed, serves it on http://localhost:8000/
    node scripts/import-legacy.mjs --all     # optional: import every old map into data/ (add --dry-run to only check)

Without the second command, opening a map that has only old files shows an **Import** button that does the same and checks nothing is lost. Your old files are only read, never changed; the old page stays at http://localhost:8000/legacy/. Needs Node (first run builds `app/`) and Python 3.

## Run locally

Double-click `start.command` (macOS), or in a terminal in this folder:

    python3 server.py

Then open:

- http://localhost:8000/ for your map (`maps/work.md`)
- http://localhost:8000/?map=demo.md for the example data (`maps/demo.md`)
- Add `#flows` or `#tickets` to the address (for example http://localhost:8000/?map=demo.md#flows) to open that tab directly.

`maps/work.md` is private and not tracked by git. Create your own copy (for example from `maps/demo.md`) and edit it. Without it the page shows the built-in demo.

Opening `index.html` directly also works, but it can only show the built-in demo. Browsers block reading `maps/*.md` from a file path.

## Edit

1. Edit `maps/work.md` in any text editor, then refresh the page. Or tap Edit in the page.
   - **Form** (default): click a sheet, app, section or department name on the map and change it in the side panel. A sheet shows name, owner and criticality, then "Connected to"; link, note and move are under "More". The "+ Sheet", "+ Section", "+ Department" and "+ App" buttons on the map add things, and the new item's name is selected so you can type straight away. Press Enter in a sheet's Name to add the next one below it. Renaming a sheet updates its links and tickets.
   - **Connected to**: pick a sheet or app from the search box, choose Sends to or Receives from, optionally tap how it is linked (IMPORTRANGE, manual copy, ...), then Add link. Existing links can be re-worded or removed, and a name opens that card.
   - **Undo / Redo** (buttons or Cmd/Ctrl+Z, Shift+Z) cover form changes. Typing in the Markdown box starts a fresh history.
   - **Markdown text**: the same file as plain text. Both views stay in sync.
   - Comments (`<!-- -->`) and unreadable lines are not kept by the form; it asks before the first change if your file has any.
2. New map: press "+ New map" in the header, enter a title and it creates `maps/<title>.md` (never over an existing file) with one department, one section and one example sheet, and opens it in the form. The drop-down next to it switches between the maps in `maps/`. Both need `server.py`.
3. In the page, press Save (or Cmd/Ctrl+S in the editor). It writes straight to `maps/work.md` and keeps the previous version as `maps/work.md.bak`. This needs `server.py`, which `start.command` runs.
4. Download .md is still there if you want a separate copy.

## Markdown format

    # Map title

    ## Department name
    Lead: free text line (optional)
    > Section title (yellow card, repeat as needed)
      Optional note, indented two spaces
    - Sheet name | owner | high | https://link     (criticality: high, medium or low; link optional)
      Optional note, indented two spaces
    - Another sheet | owner | medium
    > Next section
    - Sheet in the next section | owner | low

    ## Apps
    - App name | what it does
      Optional note

    ## Links
    - Sheet A -> Sheet B | IMPORTRANGE
    - Sheet C -> Sheet D | manual copy               (a note containing "manual" is drawn dashed)

- A `>` line starts a section. The `-` lines under it belong to that section. A department can have as many sections as you like.
- An indented line under a section or an item is its note. Tap the card on the map to open a note card with the note, the owner, the sheet link and what it sends to or receives from. Cards with a note show a small "i".
- Names in Links must match a sheet or app name exactly (capitals ignored). A mismatch shows a warning under the map.

## Tickets

The Tickets tab shows tickets and projects as a Kanban board (To do, In progress, Blocked, Done) or as a table. Switch with Board / Table; the choice is remembered. Each ticket can be linked to a sheet, a connected app or a whole department, and is drawn as a chip in the map's colours (green sheet, purple app, yellow department).

- A summary at the top shows how many tickets are in each status, and one red line per blocked ticket. Click that line to open the ticket.
- IDs are date based: `T20261116.001` for a ticket and `P20261116.001` for a project (prefix, the date it was created, then a counter that restarts at 001 each day, separately for T and P). Tickets created before this change keep their old `T-1` style IDs, and those never change.
  - The ID follows the type: switch a ticket to a Project and `T20261116.001` becomes `P20261116.001` when you Save (the form says "ID will become …" first). The date stays; the number stays too unless it is already taken, then the next free number is used. Items in the project, and flow steps that name the ticket, are updated to the new ID. The old ID is kept as "formerly …", is searchable, and is never given to another ticket.
  - A project that still has items cannot be switched to another type until its items are moved out.
  - Check map: the gear beside the map title opens a menu with **Check map…** (and **AI settings…**). It lists tickets whose ID letter does not match their type (for example a Project still called `T…`), including ones in Removed, with a tick box for each. **Repair selected** is one change you can Undo and is only written when you press Save. The type is treated as correct; untick a row if the type is the mistake. The gear shows a red count when there is something to look at.
- Description: describe what the request is (what is being asked, and by whom) in the Description box under the title. It shows as a short preview on the board card and under the title in the table (hover for the full text), and the search box looks in it too. Notes is still there for anything else.
- Projects, change requests and features: Type can be Ticket, Project, Change request or Feature. IDs start with `T`, `P`, `C` or `F` (for example `C20261116.001`). Any item that is not a project has a "Part of project" dropdown to attach it to a project.
  - Open a project to see its items, and use "+ Change request", "+ Feature" or "+ Ticket" there to add one already attached. The project card and table row show "3 of 7 items done" and the hours logged on the project and its items. Rejected change requests are not counted.
  - A Change request also records who requested it and when, its impact (for example "adds about 6 h"), and a decision: Proposed, Approved or Rejected. The decision shows as a badge on the card. It is separate from the status, so a request can wait for approval while still To do.
  - Filter by type to see only change requests, and search also matches the requester, the impact and the project name.
  - Deleting a project (or changing it to another type) keeps its items, which then no longer belong to a project.
- Priority: every ticket and project has a priority, Urgent, High, Normal or Low. New items are Normal. Urgent, High and Low show as a small badge on the card and in the table, and Normal shows nothing. Lists are ordered with the most important first, and the Priority filter at the top narrows them to one level. Normal is not written to the file, so older tickets without a priority count as Normal.
- Press New ticket to add one. Click a card or row to edit it in the drawer beside the list. Set the status with the buttons in the drawer; Blocked asks what it is waiting on, and that text shows on the card.
- Board: drag a card to another column to move it.
- Table: grouped by department, with the status changeable in place from the dropdown in each row.
- Time: open a ticket and use "Time spent" to log hours (for example 1.5) with an optional note. Each entry is dated and can be removed. The total shows on the card and in the table's Time column.
- Filter by type, owner, open only, or search the text.
- On the Map tab, linked cards and departments show a small badge with the number of open tickets. Tap a card to see its tickets and jump to them.
- To create a ticket from the map, tap a sheet or app, type a title in "Add a ticket to ..." and press Add. It is saved as a To do ticket linked to that card. Press More... to add the owner, link and notes in the Tickets tab first.
- A ticket linked to something that is no longer on the map shows "unlinked" and a warning under the map.
- Tickets are saved to `maps/<map>.tickets.json` (for example `maps/work.tickets.json`), with the previous version kept as `.bak`. This needs `server.py`, which `start.command` runs.
- `maps/work.tickets.json` is private and not tracked by git. `maps/demo.tickets.json` is the example, shown with `?map=demo.md`.

## Files

- `index.html`: the page markup and the built-in demo map. No build step, no dependencies. Fonts load from Google Fonts when online and fall back to system fonts.
- `css/`: styles. `theme.css` (colours, light and dark), `base.css` (reset, buttons, form controls), `map.css` (map, cards, wires, detail panel), `editor.css` (Markdown editor panel), `tickets.css` (Tickets tab), `flows.css` (Flows tab).
- `js/`: the app, as plain scripts (not ES modules) so `index.html` still opens from a file path. Each file adds what it shares to the `App` object from `core.js`, and `index.html` loads them in this order:
  - `core.js`: the `App` namespace and the shared state (`App.S`).
  - `parser.js`: Markdown to map model.
  - `flows-parser.js`: Markdown to flows, and back again for the form editor.
  - `tickets-data.js`: ticket constants, IDs, totals, loading and saving the tickets file.
  - `tickets-board.js`: summary strip, Kanban board, table, filters.
  - `map.js`: map drawing, wires, selection, detail panel.
  - `tickets-form.js`: ticket drawer form, time log, "Add a ticket" row.
  - `flows-view.js`: Flows tab: swimlane drawing, drag and drop, form editor, loading and saving the flows file.
  - `editor.js`: Markdown editor panel and saving `maps/<map>.md`.
  - `map-switch.js`: map drop-down and "+ New map" in the header.
  - `main.js`: tab switching and startup (keep last).
- `maps/demo.md`: example data.
- `maps/work.md`: your map. Start here.
- `maps/demo.tickets.json`: example tickets. `maps/work.tickets.json` holds your own.
- `maps/demo.flows.md`: example flows. `maps/work.flows.md` holds your own (not tracked by git).
- `server.py`: the local server. It serves the folder and accepts saves to `maps/*.md` and `maps/*.json` only, from this page only, on localhost only.
- `start.command`: builds the React app if needed, restarts `server.py` (one port, 8000) and opens the browser on macOS. The new app is at `/`, the old page at `/legacy/`.
test commitlint

## Flows

The Flows tab draws business flows as swimlanes: one lane per team, one box per step, and arrows for the hand-offs between teams. The text lives in `maps/<map>.flows.md` (for `work.md` that is `maps/work.flows.md`, not tracked by git; `maps/demo.flows.md` is the example). Click a step to edit it in a form (team, text, day, sheet, ticket, what it waits for), or use Add step, New flow and the move/delete buttons; Save writes the file. Drag a step to another lane or to another place in the order. With the editor open, each lane has buttons to rename it (or double-click its name), move it up or down, and remove it when empty; Add lane creates one. A lane named like a department on the map shows a Department tag. Edit as text is there too, but the form rewrites the text, so comments you add by hand are not kept.

    # Weekly payroll
    Every: Friday, then Monday           (optional text)
    Teams: Harvest, IT, Finance          (lane order, optional)
    1. Harvest | Check piece work | Fri
    2. IT | Top up | Fri | <- Harvest: Piece work ready
    3. Finance | Review OT | Mon | sheet: Payroll Summary | ticket: T20261116.001 | <- IT: Top up done
      Indented line = note for the step above

- `<- Team: message` means the step starts when that team sends the message; the arrow carries the message. `<- 2` (a number) means the step starts when step 2 itself is done, and a step can wait on several: `3. IT | Clean data | <- 1 | <- 2` draws an arrow from step 1 and another from step 2 into step 3 (add `: message` to either to label it). In the form, "+ Waits for a team or step" adds a row where you pick a team or an earlier step. A step with no `<-` follows the step before it; `<- start` says it has no arrow in and starts on its own.
- Editing arrows without typing: with the editor open, click an arrow (or its message label) to select it. The panel shows where it comes from (a team or an earlier step) and its message, and Delete arrow removes it. To draw a new one, drag from the dot on the right edge of a step onto another step: onto a later step it adds an arrow in, onto an earlier step it adds a dashed "sent back" arrow. Deleting a step's last arrow in marks it `<- start`, so it does not fall back to following the step before it. `-> 1: message` sends the work back: a dashed red arrow loops from that step to step 1 (use the step's number; in the form, "Sends back to" keeps the target when you reorder steps).
- `sheet:` must match a sheet or connected app on the map (shown as a chip, with its link). `ticket:` must be a ticket ID (shown with its status). A mismatch shows a warning under the diagram.
- Start another `# Flow name` for another flow; the drop-down switches between them.
