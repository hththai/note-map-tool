## Add as a new ## Git workflow section near the top of CLAUDE.md.\n\n## Git workflow
- NEVER merge into or push to `main` unless I explicitly say so. The default deliverable is a separate feature/release branch pushed to origin, not a PR or merge.
- Use Conventional Commits (feat:, fix:, chore:, docs:).
- Before creating a branch, check that the name doesn't collide with an existing branch (e.g. `release` vs `release/v1.3.0`).

## Add under a ## Conventions section in your global ~/.claude/CLAUDE.md so it applies across projects.\n\n## Artifacts & verification
- Save screenshots, mockups and diagrams inside the project folder (e.g. `docs/screenshots/`), never in a scratchpad or temp directory.
- Docs must render on GitHub: use Mermaid in Markdown, not standalone HTML.
- Mockups must reuse existing branding assets (dog/paw icons, favicon) from the repo.
- Run and test any generated script (e.g. Blender Python) headlessly before handing it to me.
