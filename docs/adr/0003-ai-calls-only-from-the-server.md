---
status: accepted
---

# AI calls are made by the server, with a key that never reaches the page

The page never talks to an AI provider. `server.py` reads the provider and key from `data/.ai.json`, makes the call, and gives the page only the validated result. The page learns only whether AI is on and the provider's name. The provider is chosen in that file: Claude or DeepSeek, and only that one is ever called.

## Considered Options

- **Call the provider from the page with a key typed into the app**: the key would live in browser storage and in every page script, and a copy of the page could send it anywhere. Rejected.
- **Environment variable instead of a file**: keeps the key out of `data/`, but is awkward for a double-click launcher and cannot name a provider or model. Rejected for now; the file is gitignored and dot-files in `data/` are never served.

## Consequences

- Text you write leaves the computer for a third party. The panel says so, naming the provider, before anything is sent. DeepSeek's servers are outside this machine and organisation, so the same care applies to what you put in a brief.
- Only brief, draft, descriptions, the current flow and sheet and app names are sent. Emails, tickets, time logs and other maps never are.
- Tests use a fake provider, so they need no key and no network.
