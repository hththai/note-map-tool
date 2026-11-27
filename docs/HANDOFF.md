# Handoff: sheets-map React rebuild

Repo: `/Users/huythai/Documents/0_Projects/0_map_tools/sheets-map` · branch `feat/react-app` (3 commits ahead of the prototypes; **not pushed**, `main` untouched).

## Goal
Replace the hand-wired vanilla UI with a React 19 + Vite + Tailwind v4 + React Flow app (`app/`) **without losing any record**, and make it fully usable on its own (no legacy app). The user wants it simple, modern and effective; Markdown is only an export.

## Read these first (do not re-derive)
- `docs/DESIGN.md`: storage rules, the verify gate, migration order, decisions.
- `docs/adr/0001-one-json-data-file-per-map.md`: why one JSON Data file per map.
- `GLOSSARY.md` (untracked, user's file): Entry, Data file, Snapshot, Base hash, Removed, Export. Use these words.
- `git log --oneline`: 9 commits tell the story. `docs/research/diagram-libraries.md`: why React Flow.
- Prototype history is on branch `proto/react-flow` (reference only, never for main).

## State: what works (all tested)
- `server.py` is the only writer: snapshots in `data/.history/` (last 20) + `.bak`, `X-Base-Hash` conflict check (409), atomic writes, data-file shape check. `PUT /data/<name>.json`, `GET /api/data`.
- Data file format + `import-legacy` / `export-legacy` / `roundtrip` / `upgrade` / `ops` in `app/src/lib/`. Every sheet, link, ticket, flow, step has a permanent `sort`; delete goes to **Removed** and restores exactly (2000-sequence random test).
- App: left rail (Overview, Journey, Edit map, Catalog, Detail, Tickets & projects, Business flows, Removed), Save/undo/redo/conflict banner, New map, ticket form with time log + filters, flow editor.
- Gates: `npm run verify` (27 node tests + 11 server tests + records check on every `maps/*` file) and `npm run e2e` (3 Chrome end-to-end tests on throwaway sandboxes, 31 checks). All green at last commit `15d1df4`.

## Not built yet (suggested order)
1. Backup button (copy Data files to a folder the user picks; reminder after 7 days) and **Export as legacy files**.
2. `⌘K` search, shared filters on every list, table view of tickets.
3. The three Exports as `.md` downloads: map document, ticket report, flow document (Mermaid).
4. Launcher: user asked for "a better solution" than running `./start.command` + `npm run dev`. Recommended (not yet done): make `start.command` build `app/dist` if needed, run `server.py`, open the new UI (works at `/app/dist/`, untested). Keep the old page reachable until switch-over. Also floated: a browser draft for unsaved edits. Awaiting the user's choice.
5. Switch-over only when: editors at parity, `npm run verify` passes on real files, a week of normal use; then keep old app/files 30 more days; delete only old UI code (`index.html`, `js/`, `css/`), never data.

## Gotchas / known issues
- **User's real `data/work.json`** (private, gitignored) was created by the user's earlier import and predates sort numbers on flows. `upgrade()` brings it up to date **in memory**; the file changes only when the user presses Save (snapshot first). `data/finance.json` is fine. Never overwrite `data/*.json`; `npm run import -- --all` refuses unless `--force`.
- `work.flows.md` has 4 steps pointing at sheets not on the `work` map (kept by name; user can relink in the flow editor).
- Overview's right panel puts "Edit this sheet" at the bottom (scroll); Edit map screen is easier. Long sheet names truncate on the canvas; a wrapped section title overlaps the first sheet slightly.
- Vite binds `localhost` (IPv6): use `localhost`, not `127.0.0.1`, for the dev URL. Dev proxy forwards `/maps`, `/data`, `/api` and rewrites Origin (server.py only accepts its own origin).
- Old `server.py` on port 8000 may still run the **old code**; user must restart with `./start.command`.
- Leftover background processes from my sessions: ports 5174, 5180, 5182 (Vite), 8010, 8022 (test servers). `pkill` was denied once by the permission classifier; kill specific PIDs by port (`lsof -ti tcp:PORT`) and ask if blocked.
- `husky` + commitlint enforce Conventional Commits; subject must not start with a capital letter.

## Working tree (uncommitted, not mine)
`CLAUDE.md`, `GLOSSARY.md` (user's, untracked; GLOSSARY has my Storage terms), `maps/finance.md`, `maps/demo.flows.md` (modified before this work), `app/package-lock.json`. Do not commit these without asking.

## User preferences / rules (from CLAUDE.md and the conversation)
- Never merge/push to `main`; default deliverable is a feature branch pushed to origin, but ask before pushing (not yet pushed).
- Conventional Commits. Screenshots go in `docs/screenshots/` (demo data only, never private data). Docs must render on GitHub (Mermaid, not HTML).
- Never touch `maps/` or any `.bak`. Test scripts headlessly before handing over.
- Answers: short, plain words, recommend an option and ask only real decisions. They answered "yes" to batched questions (grilling format).

## Suggested skills for the next agent
- `mattpocock-skills:domain-modeling`: when changing terms or the format (update GLOSSARY.md, offer an ADR sparingly).
- `mattpocock-skills:grilling`: before any new scope (backup, exports, launcher choice).
- `mattpocock-skills:tdd`: for new `ops`/export logic (the existing tests are the pattern).
- `mattpocock-skills:code-review` (or `code-review`): before pushing the branch.
- `mattpocock-skills:diagnosing-bugs`: if a gate or e2e test fails.
- `mattpocock-skills:prototype`: only for new UI questions, on a throwaway branch.
- `vercel:*` skills are not relevant (local-first app).
