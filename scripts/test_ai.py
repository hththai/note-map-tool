"""Tests for the AI provider setup: config, status, privacy of the key, Test connection. Uses a fake provider (scripts/lib/ai_stub.py),
so it never calls a real AI. Run: python3 scripts/test_ai.py"""
import http.client, json, os, sys, tempfile, threading, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..")); sys.path.insert(0, os.path.join(HERE, "lib"))
import ai, server
from ai_stub import AiStub

KEY = "sk-secret-123456"


class AiSetup(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); os.makedirs(os.path.join(self.tmp.name, "data"))
        server.ROOT = self.tmp.name
        self.srv = server.http.server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler); self.port = self.srv.server_port
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.stubs = []

    def tearDown(self):
        self.srv.shutdown(); self.srv.server_close(); self.tmp.cleanup()
        for s in self.stubs: s.close()

    def config(self, **cfg):
        with open(os.path.join(self.tmp.name, "data", ".ai.json"), "w") as f: json.dump(cfg, f)

    def stub(self, **kw):
        s = AiStub(**kw); self.stubs.append(s); return s

    def req(self, method, path, body=None, origin=True):
        h = {"Origin": "http://localhost:%d" % self.port, "X-Map-Save": "1"} if origin else {}
        c = http.client.HTTPConnection("127.0.0.1", self.port); c.request(method, path, body=body, headers=h)
        r = c.getresponse(); data = r.read(); c.close(); return r.status, data

    def status(self): return json.loads(self.req("GET", "/api/ai/status")[1])
    def test(self): return json.loads(self.req("POST", "/api/ai/test")[1])

    # status and config
    def test_off_without_a_config_file_and_says_how_to_set_it_up(self):
        s = self.status(); self.assertFalse(s["on"]); self.assertIn("data/.ai.json", s["problem"])

    def test_bad_configs_are_off_with_a_clear_reason(self):
        for cfg, word in ((dict(provider="gpt", apiKey=KEY), "provider"), (dict(provider="claude"), "apiKey"), (dict(provider="claude", apiKey="  "), "apiKey")):
            self.config(**cfg); s = self.status(); self.assertFalse(s["on"]); self.assertIn(word, s["problem"])
        with open(os.path.join(self.tmp.name, "data", ".ai.json"), "w") as f: f.write("{nope")
        self.assertIn("JSON", self.status()["problem"])

    def test_status_names_the_provider_and_nothing_secret(self):
        self.config(provider="deepseek", apiKey=KEY, model="my-model")
        st, body = self.req("GET", "/api/ai/status")
        self.assertEqual(json.loads(body), {"on": True, "provider": "deepseek", "label": "DeepSeek"})
        self.assertNotIn(KEY.encode(), body); self.assertNotIn(b"my-model", body)

    def test_default_models(self):
        self.config(provider="claude", apiKey=KEY); self.assertEqual(ai.load_config(self.tmp.name)[0]["model"], "claude-sonnet-5-5")
        self.config(provider="deepseek", apiKey=KEY); self.assertEqual(ai.load_config(self.tmp.name)[0]["model"], "deepseek-flash")

    # the key never leaves the server
    def test_the_config_file_is_never_served_listed_or_written(self):
        self.config(provider="claude", apiKey=KEY)
        for path in ("/data/.ai.json", "/data/%2eai.json", "/data/./.ai.json", "/data/../data/.ai.json"):
            st, body = self.req("GET", path); self.assertNotEqual(st, 200, path); self.assertNotIn(KEY.encode(), body, path)
        with open(os.path.join(self.tmp.name, "data", "a.json"), "w") as f: f.write("{}")
        self.assertEqual(json.loads(self.req("GET", "/api/data")[1]), ["a.json"])
        self.assertEqual(self.req("PUT", "/data/.ai.json", b'{"provider":"claude"}')[0], 403)

    # Test connection
    def test_connection_works_for_claude_and_sends_the_key_only_to_the_provider(self):
        s = self.stub(key=KEY); self.config(provider="claude", apiKey=KEY, baseUrl=s.url)
        st, body = self.req("POST", "/api/ai/test")
        self.assertEqual(json.loads(body), {"ok": True, "label": "Claude"}); self.assertNotIn(KEY.encode(), body)
        r = s.requests[0]; self.assertEqual((r["path"], r["key"], r["body"]["model"]), ("/v1/messages", KEY, "claude-sonnet-5-5"))

    def test_connection_works_for_deepseek(self):
        s = self.stub(key=KEY); self.config(provider="deepseek", apiKey=KEY, baseUrl=s.url)
        self.assertEqual(self.test(), {"ok": True, "label": "DeepSeek"})
        r = s.requests[0]; self.assertEqual((r["path"], r["key"], r["body"]["model"]), ("/chat/completions", KEY, "deepseek-flash"))

    def test_a_wrong_key_is_reported_without_echoing_it(self):
        s = self.stub(key="the-right-key"); self.config(provider="claude", apiKey=KEY, baseUrl=s.url)
        st, body = self.req("POST", "/api/ai/test"); out = json.loads(body)
        self.assertFalse(out["ok"]); self.assertIn("refused", out["error"]); self.assertNotIn(KEY.encode(), body)

    def test_an_unreachable_provider_or_empty_answer_is_a_clear_error(self):
        self.config(provider="claude", apiKey=KEY, baseUrl="http://127.0.0.1:9")
        out = self.test(); self.assertFalse(out["ok"]); self.assertIn("reach", out["error"]); self.assertNotIn(KEY, out["error"])
        s = self.stub(key=KEY, reply="  "); self.config(provider="deepseek", apiKey=KEY, baseUrl=s.url)
        self.assertIn("empty", self.test()["error"])

    def test_not_configured_is_a_message_not_a_crash(self):
        out = self.test(); self.assertFalse(out["ok"]); self.assertIn("not set up", out["error"])

    def test_test_connection_refuses_other_pages(self):
        s = self.stub(key=KEY); self.config(provider="claude", apiKey=KEY, baseUrl=s.url)
        self.assertEqual(self.req("POST", "/api/ai/test", origin=False)[0], 403); self.assertEqual(s.requests, [])
        self.assertEqual(self.req("POST", "/api/other")[0], 403)

    def test_length_limit(self):
        ai.check_length(brief="x" * ai.MAX_TEXT_CHARS)
        with self.assertRaises(ai.AiError): ai.check_length(brief="x" * (ai.MAX_TEXT_CHARS + 1))


if __name__ == "__main__":
    unittest.main(verbosity=2)
