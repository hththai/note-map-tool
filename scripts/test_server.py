"""Tests for the storage rules in server.py. Run: python3 scripts/test_server.py  (uses a temp folder, never touches maps/)"""
import hashlib, http.client, json, os, sys, tempfile, threading, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import server


class StorageRules(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.makedirs(os.path.join(self.tmp.name, "maps"))
        server.ROOT = self.tmp.name
        self.srv = server.http.server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        self.port = self.srv.server_port
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def tearDown(self):
        self.srv.shutdown(); self.srv.server_close(); self.tmp.cleanup()

    def req(self, method, path, body=None, **headers):
        h = {"Origin": "http://localhost:%d" % self.port, "X-Map-Save": "1"}
        h.update({k.replace("_", "-"): v for k, v in headers.items()})
        c = http.client.HTTPConnection("127.0.0.1", self.port)
        c.request(method, path, body=body, headers=h)
        r = c.getresponse(); data = r.read(); c.close()
        return r.status, r.getheader("X-Content-Hash"), data

    def file(self, name, folder="maps"): return os.path.join(self.tmp.name, folder, name)
    def read(self, name):
        with open(self.file(name), "rb") as f: return f.read()
    def history(self, name):
        d = os.path.join(self.tmp.name, "maps", ".history", name)
        return sorted(os.listdir(d)) if os.path.isdir(d) else []
    sha = staticmethod(lambda b: hashlib.sha256(b).hexdigest())

    def test_create_then_get_returns_hash(self):
        self.assertEqual(self.req("PUT", "/maps/a.md", b"# A\n", X_Map_Create="1")[0], 204)
        st, h, body = self.req("GET", "/maps/a.md")
        self.assertEqual((st, body, h), (200, b"# A\n", self.sha(b"# A\n")))

    def test_create_refuses_existing_name(self):
        self.req("PUT", "/maps/a.md", b"one", X_Map_Create="1")
        self.assertEqual(self.req("PUT", "/maps/a.md", b"two", X_Map_Create="1")[0], 409)
        self.assertEqual(self.read("a.md"), b"one")

    def test_save_keeps_bak_and_history(self):
        self.req("PUT", "/maps/a.md", b"v1", X_Map_Create="1")
        st, h, _ = self.req("PUT", "/maps/a.md", b"v2", X_Base_Hash=self.sha(b"v1"))
        self.assertEqual((st, h), (204, self.sha(b"v2")))
        self.assertEqual(self.read("a.md.bak"), b"v1")
        self.assertEqual(len(self.history("a.md")), 1)
        with open(os.path.join(self.tmp.name, "maps", ".history", "a.md", self.history("a.md")[0]), "rb") as f:
            self.assertEqual(f.read(), b"v1")

    def test_stale_write_is_refused_and_changes_nothing(self):
        self.req("PUT", "/maps/a.md", b"v1", X_Map_Create="1")
        with open(self.file("a.md"), "wb") as f: f.write(b"edited elsewhere")
        st, _, body = self.req("PUT", "/maps/a.md", b"mine", X_Base_Hash=self.sha(b"v1"))
        self.assertEqual(st, 409)
        self.assertEqual(json.loads(body)["hash"], self.sha(b"edited elsewhere"))
        self.assertEqual(self.read("a.md"), b"edited elsewhere")
        self.assertEqual(self.history("a.md"), [])

    def test_force_overwrites_but_snapshots_the_other_version(self):
        self.req("PUT", "/maps/a.md", b"v1", X_Map_Create="1")
        with open(self.file("a.md"), "wb") as f: f.write(b"edited elsewhere")
        self.assertEqual(self.req("PUT", "/maps/a.md", b"mine", X_Base_Hash=self.sha(b"v1"), X_Force="1")[0], 204)
        self.assertEqual(self.read("a.md"), b"mine")
        with open(os.path.join(self.tmp.name, "maps", ".history", "a.md", self.history("a.md")[0]), "rb") as f:
            self.assertEqual(f.read(), b"edited elsewhere")

    def test_old_page_without_base_hash_still_saves(self):
        self.req("PUT", "/maps/a.md", b"v1", X_Map_Create="1")
        self.assertEqual(self.req("PUT", "/maps/a.md", b"v2")[0], 204)

    def test_history_keeps_last_20_and_never_overwrites_within_a_second(self):
        self.req("PUT", "/maps/a.md", b"v0", X_Map_Create="1")
        for i in range(1, 26): self.req("PUT", "/maps/a.md", ("v%d" % i).encode())
        names = self.history("a.md")
        self.assertEqual(len(names), server.KEEP_HISTORY)
        newest = os.path.join(self.tmp.name, "maps", ".history", "a.md", names[-1])
        with open(newest, "rb") as f: self.assertEqual(f.read(), b"v24")

    def test_rejections(self):
        self.assertEqual(self.req("PUT", "/maps/a.json", b"{bad")[0], 400)
        self.assertEqual(self.req("PUT", "/maps/a.md", b"x", Origin="http://evil.example")[0], 403)
        self.assertEqual(self.req("PUT", "/maps/../x.md", b"x")[0], 403)
        self.assertEqual(self.req("PUT", "/maps/a.md", b"\xff\xfe")[0], 400)
        self.assertFalse(os.path.exists(self.file("a.md")))

    GOOD = json.dumps({"schemaVersion": 1, "departments": [], "sheets": [], "links": [], "flows": [], "removed": [], "tickets": {"nextId": 1, "extra": {}, "items": []}}).encode()

    def test_data_file_create_save_snapshot_and_list(self):
        self.assertEqual(self.req("PUT", "/data/a.json", self.GOOD, X_Map_Create="1")[0], 204)
        self.assertEqual(self.req("PUT", "/data/a.json", self.GOOD, X_Map_Create="1")[0], 409)
        v2 = self.GOOD.replace(b"nextId\": 1", b"nextId\": 2")
        st, h, _ = self.req("PUT", "/data/a.json", v2, X_Base_Hash=self.sha(self.GOOD))
        self.assertEqual((st, h), (204, self.sha(v2)))
        folder = os.path.join(self.tmp.name, "data", ".history", "a.json")
        self.assertEqual(len(os.listdir(folder)), 1)
        self.assertEqual(self.req("PUT", "/data/a.json", self.GOOD, X_Base_Hash=self.sha(self.GOOD))[0], 409)
        st, _, body = self.req("GET", "/api/data")
        self.assertEqual((st, json.loads(body)), (200, ["a.json"]))
        self.assertEqual(self.req("GET", "/data/a.json")[1], self.sha(v2))

    def test_data_file_shape_is_checked(self):
        for bad in (b"[]", b'{"schemaVersion": "1"}', b'{"schemaVersion": 1}', json.dumps({"schemaVersion": 1, "departments": [], "sheets": [], "links": [], "flows": [], "removed": [], "tickets": []}).encode()):
            self.assertEqual(self.req("PUT", "/data/b.json", bad)[0], 400, bad)
        self.assertFalse(os.path.exists(self.file("b.json", "data")))
        self.assertEqual(self.req("PUT", "/data/../maps/x.json", self.GOOD)[0], 403)
        self.assertEqual(self.req("PUT", "/data/c.md", b"x")[0], 403)

    def page(self, rel, text):
        full = os.path.join(self.tmp.name, rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as f: f.write(text)

    def test_root_serves_built_app_and_legacy_serves_old_page(self):
        self.page("index.html", "OLD"); self.page("app/dist/index.html", "NEW"); self.page("app/dist/assets/a.js", "JS")
        self.assertEqual(self.req("GET", "/")[2], b"NEW")
        self.assertEqual(self.req("GET", "/?map=demo.md")[2], b"NEW")
        self.assertEqual(self.req("GET", "/assets/a.js")[2], b"JS")
        self.assertEqual(self.req("GET", "/legacy/")[2], b"OLD")
        self.assertEqual(self.req("GET", "/legacy")[2], b"OLD")

    def test_root_falls_back_to_old_page_when_not_built(self):
        self.page("index.html", "OLD")
        self.assertEqual(self.req("GET", "/")[2], b"OLD")

    def test_legacy_relative_calls_still_reach_maps(self):
        self.assertEqual(self.req("PUT", "/legacy/maps/a.md", b"x", X_Map_Create="1")[0], 204)
        self.assertEqual(self.read("a.md"), b"x")
        self.assertEqual(self.req("GET", "/legacy/api/maps")[2], b'["a.md"]')

    def test_legacy_prefix_cannot_write_elsewhere(self):
        self.assertEqual(self.req("PUT", "/legacy/index.html", b"x")[0], 403)
        self.assertEqual(self.req("PUT", "/legacy/app/dist/index.html", b"x")[0], 403)

    def test_no_tmp_file_left_behind(self):
        self.req("PUT", "/maps/a.md", b"v1", X_Map_Create="1")
        self.assertFalse([n for n in os.listdir(os.path.join(self.tmp.name, "maps")) if n.endswith(".tmp")])


if __name__ == "__main__":
    unittest.main(verbosity=2)
