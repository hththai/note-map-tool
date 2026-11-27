"""Tests for generating a flow from a brief: what is sent to the AI, how its answer is checked, and what the endpoint says. Fake provider only.
Run: python3 scripts/test_ai_flow.py"""
import http.client, json, os, sys, tempfile, threading, unittest
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..")); sys.path.insert(0, os.path.join(HERE, "lib"))
import ai, ai_flow, server
from ai_stub import AiStub

KEY = "sk-secret-123456"
DATA = {"schemaVersion": 1, "removed": [{"id": "x1", "kind": "ticket", "label": "SECRET-REMOVED-TICKET"}], "links": [],
        "departments": [{"id": "d1", "name": "Finance", "text": ["Pays suppliers. Contact: boss@example.com"], "members": [{"id": "m1", "name": "Secret Person", "role": "Lead", "email": "secret.person@example.com"}],
                         "sections": [{"id": "s1", "title": "Payroll", "note": "Run on Fridays, see T20261112.001"}]}],
        "sheets": [{"id": "h1", "name": "Payroll Sheet", "kind": "sheet", "departmentId": "d1", "sectionId": "s1", "url": "https://secret.example/doc", "docs": [{"label": "x", "url": "https://secret.example/docs"}], "owner": "Secret Owner"}, {"id": "h2", "name": "CRM", "kind": "app"}],
        "flows": [{"id": "f1", "title": "OTHER-FLOW-TITLE", "every": "", "teams": [], "steps": []}],
        "tickets": {"nextId": 2, "extra": {}, "items": [{"id": "T20261112.001", "title": "SECRET-TICKET-TITLE"}]}}
GOOD = {"chart": "swimlane", "reason": "Two teams hand work over.", "teams": ["Sales", "Finance"], "steps": [
    {"team": "Sales", "title": "Send quote", "kind": "start", "sheet": "crm"},
    {"team": "Finance", "title": "Price OK?", "kind": "decision", "waits": [{"on": 0, "msg": "quote"}]},
    {"team": "Sales", "title": "Send order", "waits": [{"on": 1, "msg": "Yes"}], "sheet": "Mystery Sheet", "day": "Fri"},
    {"team": "Sales", "title": "Rework quote", "waits": [{"on": 1, "msg": "No"}]}],
    "notes": [{"text": "I assumed Finance approves", "step": 1}, {"text": "Who owns pricing?", "step": None}]}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); os.makedirs(os.path.join(self.tmp.name, "data"))
        with open(os.path.join(self.tmp.name, "data", "m.json"), "w") as f: json.dump(DATA, f)
        server.ROOT = self.tmp.name
        self.srv = server.http.server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler); self.port = self.srv.server_port
        threading.Thread(target=self.srv.serve_forever, daemon=True).start(); self.stub = None

    def tearDown(self):
        self.srv.shutdown(); self.srv.server_close(); self.tmp.cleanup()
        if self.stub: self.stub.close()

    def on(self, reply, provider="claude"):
        self.stub = AiStub(key=KEY, reply=reply if isinstance(reply, str) else json.dumps(reply))
        with open(os.path.join(self.tmp.name, "data", ".ai.json"), "w") as f: json.dump({"provider": provider, "apiKey": KEY, "baseUrl": self.stub.url}, f)

    def post(self, body, origin=True, path="/api/ai/flow"):
        h = {"Origin": "http://localhost:%d" % self.port, "X-Map-Save": "1"} if origin else {}
        c = http.client.HTTPConnection("127.0.0.1", self.port); c.request("POST", path, body=json.dumps(body), headers=h)
        r = c.getresponse(); data = r.read(); c.close(); return r.status, (json.loads(data) if data.startswith(b"{") else data)

    def sent(self): return json.dumps(self.stub.requests[0]["body"])


class Generate(Base):
    # what is sent
    def test_only_allowed_text_is_sent_and_emails_and_tickets_are_stripped(self):
        self.on(GOOD)
        st, out = self.post({"mapId": "m", "title": "Quotes", "brief": "Mail me at me@example.com about T20261113.002", "draft": "- send"})
        self.assertTrue(out["ok"], out); sent = self.sent()
        for good in ("Finance", "Pays suppliers", "Payroll", "Payroll Sheet", "CRM", "Quotes", "Mail me"): self.assertIn(good, sent)
        for bad in ("example.com", "secret.person", "Secret Person", "Secret Owner", "secret.example", "SECRET-TICKET-TITLE", "T20261112.001", "T20261113.002", "OTHER-FLOW-TITLE", "SECRET-REMOVED-TICKET", KEY):
            self.assertNotIn(bad, sent, bad)
        self.assertIn("[email removed]", sent); self.assertIn("[ticket]", sent)

    def test_the_key_goes_to_the_provider_only(self):
        self.on(GOOD); st, out = self.post({"mapId": "m", "title": "t", "brief": "b"})
        self.assertEqual(self.stub.requests[0]["key"], KEY); self.assertNotIn(KEY, json.dumps(out))

    def test_an_unknown_map_still_works_with_no_context(self):
        self.on(GOOD); st, out = self.post({"mapId": "../../etc/passwd", "title": "t", "brief": "b"}); self.assertTrue(out["ok"])
        self.assertIn("(none)", self.sent())

    # what comes back
    def test_a_good_answer_is_checked_and_normalised(self):
        self.on(GOOD); f = self.post({"mapId": "m", "title": "t", "brief": "b"})[1]["flow"]
        self.assertEqual(f["teams"], ["Sales", "Finance"]); self.assertEqual([s["kind"] for s in f["steps"]], ["start", "decision", None, None])
        self.assertEqual(f["steps"][0]["sheet"], "CRM")                       # matched by name, case-insensitive
        self.assertEqual((f["steps"][2]["sheet"], f["steps"][2]["sheetName"]), (None, "Mystery Sheet")); self.assertEqual(f["unknownSheets"], ["Mystery Sheet"])
        self.assertEqual(f["steps"][2]["waits"], [{"on": 1, "msg": "Yes"}]); self.assertEqual(f["steps"][2]["day"], "Fri")
        self.assertEqual(f["notes"][0], {"text": "I assumed Finance approves", "step": 1})

    def test_json_in_a_code_fence_or_with_chatter_is_accepted(self):
        for wrap in ("```json\n%s\n```", "Here is your flow:\n%s\nHope it helps"):
            self.on(wrap % json.dumps(GOOD)); self.assertTrue(self.post({"mapId": "m", "title": "t", "brief": "b"})[1]["ok"])

    def test_forward_or_bad_references_are_dropped_not_trusted(self):
        bad = {"steps": [{"team": "A", "title": "one", "waits": [{"on": 0}, {"on": 5}, {"on": -1}, {"on": "x"}, {"on": True}]}, {"team": "A", "title": "two", "waits": [{"on": 0}, {"on": 0}]}]}
        f = ai_flow.parse_answer(json.dumps(bad), [])
        self.assertEqual([s["waits"] for s in f["steps"]], [[], [{"on": 0, "msg": ""}]])

    def test_unusable_answers_are_errors_and_change_nothing(self):
        for reply in ("not json at all", "{}", '{"steps": []}', '{"steps": [{"team": "", "title": "x"}]}', '{"steps": ["a"]}',
                      json.dumps({"steps": [{"team": "T%d" % i, "title": "x"} for i in range(13)]}), json.dumps({"steps": [{"team": "A", "title": "x"}] * 41})):
            self.on(reply); out = self.post({"mapId": "m", "title": "t", "brief": "b"})[1]
            self.assertFalse(out["ok"], reply[:40]); self.assertIn("Nothing was changed" if "Nothing" in out["error"] else "AI", out["error"])
            self.assertNotIn("flow", out)

    # the endpoint
    def test_off_empty_and_too_long(self):
        self.assertIn("not set up", self.post({"mapId": "m", "brief": "b"})[1]["error"])
        self.on(GOOD)
        self.assertIn("brief or a rough draft", self.post({"mapId": "m", "brief": "  ", "draft": ""})[1]["error"]); self.assertEqual(self.stub.requests, [])
        out = self.post({"mapId": "m", "brief": "x" * (ai.MAX_TEXT_CHARS + 1)})[1]; self.assertIn("too long", out["error"]); self.assertEqual(self.stub.requests, [])

    def test_wrong_key_and_other_origins(self):
        self.on(GOOD)
        with open(os.path.join(self.tmp.name, "data", ".ai.json"), "w") as f: json.dump({"provider": "deepseek", "apiKey": "wrong", "baseUrl": self.stub.url}, f)
        self.assertIn("refused", self.post({"mapId": "m", "brief": "b"})[1]["error"])
        self.assertEqual(self.post({"mapId": "m", "brief": "b"}, origin=False)[0], 403)

    def test_deepseek_reply_works_too(self):
        self.on(GOOD, "deepseek"); self.assertTrue(self.post({"mapId": "m", "title": "t", "brief": "b"})[1]["ok"])
        self.assertEqual(self.stub.requests[0]["path"], "/chat/completions")


EDIT_ANSWER = {"chart": "swimlane", "summary": "Added a QA check", "teams": ["Sales", "Finance"], "steps": [
    {"was": 0, "team": "Sales", "title": "Send quote", "kind": "start"},
    {"was": 1, "team": "Finance", "title": "Price OK?", "kind": "decision", "waits": [{"on": 0, "msg": "quote"}]},
    {"team": "Finance", "title": "QA check", "waits": [{"on": 1, "msg": "Yes"}]},
    {"was": 1, "team": "Sales", "title": "dup was", "waits": [{"on": 1}]},
    {"was": 99, "team": "Sales", "title": "bad was"}],
    "notes": [{"text": "Who does QA?", "step": 2}]}
CURRENT = {"steps": [{"team": "Sales", "title": "Send quote", "kind": "start", "ticket": "T20261112.001", "x": 5, "waits": []},
                     {"team": "Finance", "title": "Price OK? mail a@b.com", "kind": "decision", "note": "see T20261113.002", "waits": [{"on": 0, "msg": "quote"}, {"on": 5}]}]}


class Edit(Base):
    def test_edit_sends_the_current_flow_and_the_instruction_and_nothing_private(self):
        self.on(EDIT_ANSWER)
        out = self.post({"mapId": "m", "title": "Quotes", "brief": "Mail x@y.com", "instruction": "add a QA check after pricing, mail me@z.com", "flow": CURRENT})[1]
        self.assertTrue(out["ok"], out); sent = self.sent()
        for good in ("Send quote", "QA check after pricing", "Current flow", "Payroll Sheet"): self.assertIn(good, sent)
        for bad in ("T20261112", "T20261113", "a@b.com", "me@z.com", "x@y.com", "secret.person", "SECRET-TICKET-TITLE", "OTHER-FLOW-TITLE", '"x": 5', KEY): self.assertNotIn(bad, sent, bad)
        self.assertIn("[email removed]", sent); self.assertIn("[ticket]", sent)

    def test_edit_answers_keep_valid_was_numbers_only_once_and_add_summary_and_notes(self):
        self.on(EDIT_ANSWER)
        f = self.post({"mapId": "m", "title": "t", "instruction": "go", "flow": CURRENT})[1]["flow"]
        self.assertEqual([s["was"] for s in f["steps"]], [0, 1, None, None, None]); self.assertEqual(f["summary"], "Added a QA check"); self.assertEqual(f["notes"][0]["step"], 2)

    def test_edit_needs_an_instruction_and_a_flow_and_respects_the_limit(self):
        self.on(EDIT_ANSWER)
        self.assertIn("Type the change", self.post({"mapId": "m", "instruction": "  ", "flow": CURRENT})[1]["error"])
        self.assertIn("no flow to change", self.post({"mapId": "m", "instruction": "x", "flow": {"steps": []}})[1]["error"])
        self.assertIn("no flow to change", self.post({"mapId": "m", "instruction": "x"})[1]["error"])
        self.assertIn("too long", self.post({"mapId": "m", "instruction": "x" * (ai.MAX_TEXT_CHARS + 1), "flow": CURRENT})[1]["error"]); self.assertEqual(self.stub.requests, [])

    def test_in_an_edit_a_field_the_ai_leaves_out_stays_absent_so_it_means_unchanged(self):
        f = ai_flow.parse_answer(json.dumps({"steps": [{"was": 0, "team": "A", "title": "x"}, {"was": 1, "team": "A", "title": "y", "note": "n", "kind": "step", "sheet": None}]}), [], 2)["steps"]
        self.assertEqual([k in f[0] for k in ("kind", "day", "note", "sheet", "sheetName")], [False] * 5)
        self.assertEqual((f[1]["note"], f[1]["kind"], f[1]["sheet"]), ("n", "step", None))
        g = ai_flow.parse_answer(json.dumps({"steps": [{"team": "A", "title": "x"}]}), [])["steps"][0]
        self.assertEqual((g["note"], g["kind"]), ("", None))   # making a new flow still fills every field

    def test_a_generate_answer_has_no_was_numbers(self):
        self.on(GOOD); f = self.post({"mapId": "m", "title": "t", "brief": "b"})[1]["flow"]; self.assertEqual([s["was"] for s in f["steps"]], [None] * 4)

    def test_a_bad_edit_answer_is_an_error(self):
        self.on("nonsense"); out = self.post({"mapId": "m", "instruction": "x", "flow": CURRENT})[1]; self.assertFalse(out["ok"])


ENTITY = {"chart": "entity", "reason": "These are things and how they relate.", "steps": [
    {"title": "Customer", "lines": ["id", "name", "email", "x" * 200, "", "f", "g", "h", "i", "j"], "sheet": "crm"},
    {"title": "Order", "lines": "id\ntotal", "waits": [{"on": 0, "msg": "1 to many"}], "kind": "decision", "team": "Sales"}]}


FREE_CURRENT = {"layout": "free", "steps": [{"title": "Customer", "kind": "step", "note": "id\nname", "waits": [{"on": 1, "msg": "belongs to"}]}, {"title": "Order", "waits": [{"on": 0, "msg": "1 to many"}, {"on": 1}, {"on": 9}]}]}
FREE_ANSWER = {"summary": "Added Shipment", "steps": [{"was": 0, "team": "General", "title": "Customer", "waits": [{"on": 1, "msg": "belongs to"}]}, {"was": 1, "team": "General", "title": "Order", "lines": ["id", "total"], "waits": [{"on": 0, "msg": "1 to many"}, {"on": 1}]},
                                                                     {"team": "General", "title": "Shipment", "lines": ["id", "carrier"], "waits": [{"on": 1, "msg": "1 to 1"}, {"on": 2}, {"on": 7}]}]}


class FreeEdit(Base):
    def test_a_free_canvas_keeps_arrows_that_point_forward_and_tells_the_ai_it_is_free(self):
        self.on(FREE_ANSWER); out = self.post({"mapId": "m", "title": "Data", "instruction": "add a shipment entity", "flow": FREE_CURRENT})[1]; self.assertTrue(out["ok"], out)
        sent = self.sent(); self.assertIn("FREE CANVAS", sent); self.assertIn('\\"on\\": 1, \\"msg\\": \\"belongs to\\"', sent); self.assertIn("id\\nname", self.stub.requests[0]["body"]["messages"][0]["content"]); self.assertNotIn('"on": 9', sent)   # the forward arrow is kept, the one at nothing is dropped
        steps = out["flow"]["steps"]; self.assertEqual(steps[0]["waits"], [{"on": 1, "msg": "belongs to"}]); self.assertEqual(steps[1]["waits"], [{"on": 0, "msg": "1 to many"}])   # its own index is refused
        self.assertEqual(steps[2]["waits"], [{"on": 1, "msg": "1 to 1"}]); self.assertEqual([s["was"] for s in steps], [0, 1, None])

    def test_lines_in_an_edit_become_the_description_and_a_missing_note_still_means_unchanged(self):
        self.on(FREE_ANSWER); steps = self.post({"mapId": "m", "title": "t", "instruction": "x", "flow": FREE_CURRENT})[1]["flow"]["steps"]
        self.assertEqual(steps[1]["note"], "id\ntotal"); self.assertEqual(steps[2]["note"], "id\ncarrier"); self.assertNotIn("note", steps[0])

    def test_a_swimlane_still_refuses_arrows_that_point_forward(self):
        f = ai_flow.parse_answer(json.dumps({"steps": [{"was": 0, "team": "A", "title": "x", "waits": [{"on": 1}]}, {"was": 1, "team": "A", "title": "y"}]}), [], 2)["steps"]; self.assertEqual(f[0]["waits"], [])
        cur = ai_flow.current_flow({"steps": [{"title": "a", "waits": [{"on": 1}]}, {"title": "b"}]}); self.assertEqual(cur[0][0]["waits"], []); self.assertFalse(cur[1])


class Charts(Base):
    def test_the_prompt_offers_all_four_chart_types_and_the_entity_format(self):
        self.assertTrue(all(w in ai_flow.SYSTEM for w in ('"swimlane"', '"flowchart"', '"waterfall"', '"entity"', '"lines"', "relationship")))

    def test_each_chart_type_is_kept_and_an_unknown_one_becomes_swimlane(self):
        for c in ("swimlane", "flowchart", "waterfall", "entity"):
            self.assertEqual(ai_flow.parse_answer(json.dumps({"chart": c, "steps": [{"team": "A", "title": "x"}]}), [])["chart"], c)
        self.assertEqual(ai_flow.parse_answer(json.dumps({"chart": "pie", "steps": [{"team": "A", "title": "x"}]}), [])["chart"], "swimlane")

    def test_an_entity_answer_needs_no_team_and_keeps_its_lines_short_and_few(self):
        f = ai_flow.parse_answer(json.dumps(ENTITY), ["CRM"]); a, b = f["steps"]
        self.assertEqual((f["chart"], a["team"], a["title"], a["sheet"], a["kind"]), ("entity", "General", "Customer", "CRM", None))
        self.assertEqual(a["note"].split("\n")[:3], ["id", "name", "email"]); self.assertEqual(len(a["note"].split("\n")), 7)   # 8 allowed, the empty one dropped; the long one cut
        self.assertEqual(max(len(x) for x in a["note"].split("\n")), 80)
        self.assertEqual((b["note"], b["waits"], b["kind"], b["team"]), ("id\ntotal", [{"on": 0, "msg": "1 to many"}], None, "Sales"))

    def test_a_process_answer_still_needs_a_team(self):
        with self.assertRaises(ai.AiError): ai_flow.parse_answer(json.dumps({"chart": "flowchart", "steps": [{"title": "x"}]}), [])

    def test_the_endpoint_returns_the_chart_for_an_entity_answer(self):
        self.on(ENTITY); out = self.post({"mapId": "m", "title": "Data", "brief": "customers place orders"})[1]
        self.assertTrue(out["ok"]); self.assertEqual(out["flow"]["chart"], "entity"); self.assertIn("reason", out["flow"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
