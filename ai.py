"""AI provider for the Sheets Ecosystem Map (server side only).

Config lives in data/.ai.json (gitignored, never served, never listed):
  { "provider": "claude" | "deepseek", "apiKey": "...", "model": "optional", "baseUrl": "optional" }
Only the configured provider is ever called. The key stays in this process: it is not sent to the page and
not written to any log or error message.
"""
import json, os, urllib.error, urllib.request

CONFIG_NAME = ".ai.json"
PROVIDERS = {
    "claude": {"label": "Claude", "base": "https://api.anthropic.com", "model": "claude-sonnet-5-5"},
    "deepseek": {"label": "DeepSeek", "base": "https://api.deepseek.com", "model": "deepseek-flash"},
}
MAX_TEXT_CHARS = 8000   # the brief and the draft, each; keeps one request's cost bounded
MAX_OUT_TOKENS = 4000
TIMEOUT = 60


class AiError(Exception):
    """A message that is safe to show the user (never contains the key)."""


def config_path(root):
    return os.path.join(root, "data", CONFIG_NAME)


def load_config(root):
    """Return (config, problem). Exactly one of them is None."""
    path = config_path(root)
    if not os.path.isfile(path):
        return None, "AI is not set up. Create data/.ai.json with a provider and an API key (see docs/AI.md)."
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
    except (OSError, ValueError):
        return None, "data/.ai.json is not valid JSON."
    if not isinstance(raw, dict):
        return None, "data/.ai.json must be a JSON object."
    provider = raw.get("provider")
    if provider not in PROVIDERS:
        return None, 'data/.ai.json: "provider" must be "claude" or "deepseek".'
    key = raw.get("apiKey")
    if not isinstance(key, str) or not key.strip():
        return None, 'data/.ai.json: "apiKey" is missing.'
    p = PROVIDERS[provider]
    model = raw.get("model") if isinstance(raw.get("model"), str) and raw["model"].strip() else p["model"]
    base = raw.get("baseUrl") if isinstance(raw.get("baseUrl"), str) and raw["baseUrl"].strip() else p["base"]
    return {"provider": provider, "label": p["label"], "apiKey": key.strip(), "model": model.strip(), "base": base.rstrip("/")}, None


def status(root):
    """What the page may know: on or off, the provider's name, and a problem text when off. Never the key or model."""
    cfg, problem = load_config(root)
    if cfg:
        return {"on": True, "provider": cfg["provider"], "label": cfg["label"]}
    return {"on": False, "provider": None, "label": None, "problem": problem}


def check_length(**texts):
    for name, t in texts.items():
        if t is not None and len(t) > MAX_TEXT_CHARS:
            raise AiError("The %s is too long (%d characters; the limit is %d)." % (name, len(t), MAX_TEXT_CHARS))


def _scrub(text, key):
    return text.replace(key, "***") if key else text


def _post(url, headers, body, key):
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=dict(headers, **{"Content-Type": "application/json"}), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise AiError("The provider refused the API key (HTTP %d). Check the key in data/.ai.json." % e.code)
        if e.code == 429:
            raise AiError("The provider says too many requests or no credit left (HTTP 429).")
        raise AiError("The provider answered with an error (HTTP %d)." % e.code)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise AiError("Could not reach the provider: %s" % _scrub(str(getattr(e, "reason", e)), key))
    except ValueError:
        raise AiError("The provider's answer was not understood.")


def complete(cfg, system, user, max_tokens=MAX_OUT_TOKENS):
    """Send one request to the configured provider and return the reply text."""
    if cfg["provider"] == "claude":
        data = _post(cfg["base"] + "/v1/messages", {"x-api-key": cfg["apiKey"], "anthropic-version": "2023-06-01"},
                     {"model": cfg["model"], "max_tokens": max_tokens, "system": system, "messages": [{"role": "user", "content": user}]}, cfg["apiKey"])
        parts = [b.get("text", "") for b in data.get("content", []) if isinstance(b, dict) and b.get("type") == "text"]
        text = "".join(parts)
    else:
        data = _post(cfg["base"] + "/chat/completions", {"Authorization": "Bearer " + cfg["apiKey"]},
                     {"model": cfg["model"], "max_tokens": max_tokens, "stream": False, "thinking": {"type": "disabled"},
                      "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}, cfg["apiKey"])
        try:
            text = data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError):
            text = ""
    if not text.strip():
        raise AiError("The provider returned an empty answer.")
    return text


def test_connection(root):
    cfg, problem = load_config(root)
    if not cfg:
        return {"ok": False, "error": problem}
    try:
        complete(cfg, "Reply with the single word OK.", "Say OK.", max_tokens=16)
    except AiError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, "label": cfg["label"]}
