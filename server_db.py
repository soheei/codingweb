"""Coding Masters 배포용 서버 (Render + Firebase Realtime Database).

- 정적 파일(index.html 등) 서빙
- /api/sync    GET/POST : 기존 server.py와 같은 주소/JSON 형태 (app.js 그대로 호환)
- /api/version GET      : 변경 감지용 (app.js 폴링)
- 저장소: Firebase Realtime Database (REST). FIREBASE_DB_URL 이 없으면 로컬 JSON 파일로 동작(테스트용)

환경변수
  PORT              Render가 자동 지정 (기본 5173)
  FIREBASE_DB_URL   예: https://내프로젝트-default-rtdb.firebaseio.com
  FIREBASE_AUTH     (선택) 데이터베이스 시크릿/토큰. 규칙을 잠갔을 때만 필요
"""
import http.server
import json
import os
import socketserver
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_dotenv():
    """같은 폴더의 .env 를 읽어 환경변수로 채운다 (이미 설정된 값은 유지)."""
    path = os.path.join(BASE_DIR, ".env")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            value = value.strip().strip('"').strip("'")
            if value:
                os.environ.setdefault(key.strip(), value)


_load_dotenv()
PORT = int(os.environ.get("PORT", 5173))
FIREBASE_DB_URL = os.environ.get("FIREBASE_DB_URL", "").strip().rstrip("/")
FIREBASE_AUTH = os.environ.get("FIREBASE_AUTH", "").strip()
FIREBASE_NODE = "codingmasters_solutions"
LOCAL_FILE = os.path.join(BASE_DIR, "team_solutions_db.json")

FIXED_MEMBERS = ["김민희", "양소희", "정호준", "차승우"]
QUESTION_RANGE = range(1, 101)
MAX_CODE_LEN = 50_000
# app.js 의 DEFAULT_CODE 와 동일해야 함
DEFAULT_CODE = """import sys

a = int(sys.stdin.readline())
b = int(sys.stdin.readline())

print(a + b)
"""

STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/app.js": "app.js",
    "/questions.js": "questions.js",
    "/style.css": "style.css",
}
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
}

_lock = threading.Lock()
_version_counter = 0
_version_prefix = str(int(time.time()))


# ---------------------------------------------------------------- storage
def _firebase_url(path=""):
    url = f"{FIREBASE_DB_URL}/{FIREBASE_NODE}{path}.json"
    if FIREBASE_AUTH:
        url += "?auth=" + urllib.parse.quote(FIREBASE_AUTH)
    return url


def _firebase_request(method, url, body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as res:
        return json.loads(res.read().decode("utf-8") or "null")


def _normalize(raw):
    """Firebase는 키가 1,2,3... 이면 배열로 돌려줄 수 있어 dict로 통일한다."""
    if raw is None:
        return {}
    if isinstance(raw, list):
        raw = {str(i): v for i, v in enumerate(raw) if v is not None}
    out = {}
    for qid, members in raw.items():
        if isinstance(members, list):
            members = {str(i): v for i, v in enumerate(members) if v is not None}
        if isinstance(members, dict):
            out[str(qid)] = members
    return out


def load_all():
    if FIREBASE_DB_URL:
        return _normalize(_firebase_request("GET", _firebase_url()))
    if os.path.exists(LOCAL_FILE):
        with open(LOCAL_FILE, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return _normalize(json.loads(content)) if content else {}
    return {}


def save_changes(changes):
    """changes: {"문제/이름": 코드}. 바뀐 칸만 저장."""
    if not changes:
        return
    if FIREBASE_DB_URL:
        _firebase_request("PATCH", _firebase_url(), changes)
        return
    data = load_all()
    for key, code in changes.items():
        qid, member = key.split("/", 1)
        data.setdefault(qid, {})[member] = code
    with open(LOCAL_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def compute_changes(incoming, current):
    """받은 전체 데이터에서 실제로 저장해야 할 칸만 골라낸다."""
    changes = {}
    if not isinstance(incoming, dict):
        return changes
    for qid, members in incoming.items():
        if not (str(qid).isdigit() and int(qid) in QUESTION_RANGE and isinstance(members, dict)):
            continue
        for member, code in members.items():
            if member not in FIXED_MEMBERS or not isinstance(code, str) or len(code) > MAX_CODE_LEN:
                continue
            old = current.get(str(qid), {}).get(member)
            if code == old:
                continue
            # 기본 템플릿이 이미 저장된 실제 풀이를 덮어쓰지 않도록 방지
            if code == DEFAULT_CODE and old:
                continue
            changes[f"{int(qid)}/{member}"] = code
    return changes


# ---------------------------------------------------------------- http
class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "CodingMasters/1.0"

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))
        sys.stdout.flush()

    def _send(self, status, body=b"", content_type="application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, obj):
        self._send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def do_OPTIONS(self):
        self._send(204)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/api/sync", "/api/load"):
            try:
                self._json(200, load_all())
            except Exception as e:
                print(f"[LOAD ERROR] {e}")
                self._json(502, {"error": str(e)})
        elif path == "/api/version":
            self._json(200, {"version": f"{_version_prefix}-{_version_counter}"})
        elif path == "/healthz":
            self._send(200, b"ok", "text/plain")
        elif path in STATIC_FILES:
            name = STATIC_FILES[path]
            with open(os.path.join(BASE_DIR, name), "rb") as f:
                body = f.read()
            self._send(200, body, CONTENT_TYPES[os.path.splitext(name)[1]])
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        global _version_counter
        path = urllib.parse.urlparse(self.path).path
        if path not in ("/api/sync", "/api/save"):
            self._send(404, b"not found", "text/plain")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 5_000_000:
                self._json(413, {"status": "error", "message": "too large"})
                return
            incoming = json.loads(self.rfile.read(length).decode("utf-8"))
            with _lock:
                changes = compute_changes(incoming, load_all())
                save_changes(changes)
                if changes:
                    _version_counter += 1
            if changes:
                print(f"[SAVE OK] {len(changes)} cell(s): {', '.join(changes)[:200]}")
            self._json(200, {"status": "success", "changed": len(changes)})
        except Exception as e:
            print(f"[SAVE ERROR] {e}")
            self._json(500, {"status": "error", "message": str(e)})


class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    mode = "Firebase" if FIREBASE_DB_URL else "로컬 JSON 파일(테스트용)"
    print(f"[CODING MASTERS] port={PORT} storage={mode}")
    sys.stdout.flush()
    try:
        ThreadedServer(("0.0.0.0", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("서버를 종료합니다.")
