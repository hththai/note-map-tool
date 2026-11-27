# 03: Flow connections and the Flow map

**What to build:** The user connects one Flow to another with an optional label (and optionally a starting step). A new Flow map view under Business flows draws each Flow as a box with connections as arrows. Clicking a box opens that Flow.

**Blocked by:** None (can start immediately)

**Status:** done on branch `feat/ai-flows`

- [x] New Flow connection Entry with a permanent sort; old files load unchanged
- [x] Box colour comes from the Department of the Flow's first Team, or a neutral colour when that Team is not a Department
- [x] Draw and delete connections on the Flow map; deleting sends to Removed and restores exactly
- [x] Deleting a Flow sends its connections with it; restoring the Flow brings them back
- [x] Add "Flow connection" and "Flow map" to GLOSSARY.md (avoid "Link"), after asking the user
- [x] Unit and browser tests
