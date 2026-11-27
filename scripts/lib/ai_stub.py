"""A fake Claude / DeepSeek server for tests, so no test calls a real AI or needs a real key.
    stub = AiStub(key="k1", reply="OK"); stub.url -> http://127.0.0.1:<port>; stub.requests -> what it received; stub.close()
It answers like both APIs (/v1/messages and /chat/completions) and returns 401 for any other key."""
import http.server, json, threading


class AiStub:
    def __init__(self, key="test-key", reply="OK", status=200):
        stub = self; self.key, self.reply, self.status, self.requests = key, reply, status, []

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a): pass
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))) or b"{}")
                sent = self.headers.get("x-api-key") or (self.headers.get("Authorization") or "").replace("Bearer ", "")
                stub.requests.append({"path": self.path, "key": sent, "body": body})
                code = stub.status if sent == stub.key else 401
                if self.path == "/v1/messages": out = {"content": [{"type": "text", "text": stub.reply}]}
                elif self.path == "/chat/completions": out = {"choices": [{"message": {"content": stub.reply}}]}
                else: code, out = 404, {}
                data = json.dumps(out).encode()
                self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.url = "http://127.0.0.1:%d" % self.srv.server_port
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def close(self): self.srv.shutdown(); self.srv.server_close()
