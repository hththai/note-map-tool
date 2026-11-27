# 05: AI provider setup (Claude or DeepSeek)

**What to build:** The server reads a local gitignored config (provider, key, model) and tells the browser only whether AI is on and which provider. A "Test connection" check works, and a first-use notice names the provider and says the brief leaves the computer for that provider's servers.

**Blocked by:** None (can start immediately)

**Status:** done on branch `feat/ai-flows` (the first-use notice text is shown in the AI panel and exported as `aiNotice` for ticket 06 to show again before the first Generate)

- [x] Config file is gitignored; the key is never sent to the browser or logged
- [x] Provider `claude` or `deepseek` behind one function; only the configured provider is ever called
- [x] DeepSeek model names and API checked against its current docs at build time
- [x] Status endpoint exposes only on/off and provider name
- [x] Length limit on the brief and draft, so the cost of each request stays bounded
- [x] A local stub provider for tests: no test calls a real AI or needs a key
- [x] Missing or bad key gives a clear message and changes nothing
- [x] ADR records what is sent, what is not, and why the key stays server-side
