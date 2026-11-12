import collections
import http.server
import json
import os
import re
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
FIREBASE_SERVICE_ACCOUNT_JSON = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
# 로컬 개발용: JSON 내용을 환경변수에 넣는 대신 키 파일 경로를 줄 수도 있다 (프로젝트 폴더 밖에 두고 쓰는 것을 권장)
_SA_FILE = os.environ.get("FIREBASE_SERVICE_ACCOUNT_FILE", "").strip().strip('"')
if _SA_FILE and not FIREBASE_SERVICE_ACCOUNT_JSON:
    try:
        with open(_SA_FILE, "r", encoding="utf-8-sig") as _f:
            FIREBASE_SERVICE_ACCOUNT_JSON = json.dumps(json.load(_f))
    except (OSError, ValueError) as _e:
        print(f"[설정 오류] FIREBASE_SERVICE_ACCOUNT_FILE 을 읽지 못했습니다: {_e}")
# Firebase Authentication ID 토큰 검증용 (콘솔 > 프로젝트 설정 > 프로젝트 ID)
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "codingmastars").strip()
# 로컬 개발 전용: 1 이면 "dev:<uid>" 형태의 가짜 토큰을 허용한다. 배포 환경에서는 절대 켜지 말 것.
DEV_AUTH_BYPASS = os.environ.get("DEV_AUTH_BYPASS", "") == "1"
LOCAL_DB_FILE = os.path.join(BASE_DIR, "local_db.json")  # Firebase 미설정 시 테스트용 저장소

QUESTION_RANGE = range(1, 101)
MAX_CODE_LEN = 50_000
FAKE_EMAIL_DOMAIN = "codingmasters.local"
LOGIN_ID_RE = re.compile(r"^[a-z0-9_]{4,20}$")
# Firebase 경로 키에 쓸 수 없는 문자(. $ # [ ] /)를 배제한 표시 이름 규칙
DISPLAY_NAME_RE = re.compile(r"^[0-9A-Za-z가-힣_\- ]{2,12}$")
DEFAULT_CODE = """import sys

a = int(sys.stdin.readline())
b = int(sys.stdin.readline())

print(a + b)
"""

STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
}
# js/, css/, icons/ 폴더 아래 정적 파일만 허용 (상위 경로 접근 차단)
STATIC_DIRS = ("js", "css", "icons")
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
}

_lock = threading.Lock()
_version_counter = 0
_version_prefix = str(int(time.time()))


# ---------------------------------------------------------------- storage
# DB 루트 기준 경로로 읽고 쓴다: users/{uid}, loginIndex/{id}, nameIndex/{name}, solutions/{문제}/{uid}
_credentials = None


def _service_account_token():
    """서비스 계정(FIREBASE_SERVICE_ACCOUNT_JSON)으로 OAuth 액세스 토큰을 받는다 (관리자 권한, 보안 규칙 우회)."""
    global _credentials
    import google.auth.transport.requests
    from google.oauth2 import service_account
    if _credentials is None:
        try:
            key_info = json.loads(FIREBASE_SERVICE_ACCOUNT_JSON)
        except ValueError:
            raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON 값이 올바른 JSON이 아닙니다 "
                               "(.env 에 서비스 계정 JSON 내용을 줄바꿈 없이 한 줄로 넣었는지 확인하세요)")
        _credentials = service_account.Credentials.from_service_account_info(
            key_info,
            scopes=["https://www.googleapis.com/auth/firebase.database",
                    "https://www.googleapis.com/auth/userinfo.email",
                    "https://www.googleapis.com/auth/cloud-platform"])  # cloud-platform: Auth 계정 조회용
    if not _credentials.valid:
        _credentials.refresh(google.auth.transport.requests.Request())
    return _credentials.token


def _firebase_url(path=""):
    # 한글 이름 등이 경로에 들어갈 수 있으므로 URL 인코딩한다 (슬래시는 경로 구분자로 유지)
    path = urllib.parse.quote(path, safe="/")
    url = f"{FIREBASE_DB_URL}/{path}.json" if path else f"{FIREBASE_DB_URL}/.json"
    # 보안 규칙이 클라이언트 접근을 막으므로 서버만 관리자 자격으로 접근한다
    if FIREBASE_SERVICE_ACCOUNT_JSON:
        url += "?access_token=" + urllib.parse.quote(_service_account_token())
    elif FIREBASE_AUTH:  # 구형 데이터베이스 시크릿 (deprecated)
        url += "?auth=" + urllib.parse.quote(FIREBASE_AUTH)
    return url


def _firebase_request(method, url, body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            text = res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:200]
        raise RuntimeError(f"Firebase DB 요청 실패 (HTTP {e.code}): {detail}")
    try:
        return json.loads(text or "null")
    except ValueError:
        raise RuntimeError(f"Firebase DB 응답이 JSON이 아닙니다: {text[:100]!r} (FIREBASE_DB_URL 주소를 확인하세요)")


def _local_load():
    if os.path.exists(LOCAL_DB_FILE):
        with open(LOCAL_DB_FILE, "r", encoding="utf-8") as f:
            content = f.read().strip()
            return json.loads(content) if content else {}
    return {}


def _local_save(data):
    with open(LOCAL_DB_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _as_dict(raw):
    """Firebase 는 키가 0,1,2... 처럼 보이면 배열로 돌려줄 수 있어 dict 로 통일한다."""
    if isinstance(raw, list):
        return {str(i): v for i, v in enumerate(raw) if v is not None}
    return raw if isinstance(raw, dict) else {}


def db_get(path):
    _stats["db_reads"] += 1
    if FIREBASE_DB_URL:
        return _firebase_request("GET", _firebase_url(path))
    node = _local_load()
    for part in [p for p in path.split("/") if p]:
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node


def db_update(updates):
    """멀티패스 업데이트: {"users/uid/displayName": "이름", "nameIndex/이전": None(삭제)} 를 한 번에 반영."""
    if not updates:
        return
    _stats["db_writes"] += 1
    if FIREBASE_DB_URL:
        _firebase_request("PATCH", _firebase_url(""), updates)
        return
    data = _local_load()
    for path, value in updates.items():
        parts = [p for p in path.split("/") if p]
        node = data
        for part in parts[:-1]:
            if not isinstance(node.get(part), dict):
                node[part] = {}
            node = node[part]
        if value is None:
            node.pop(parts[-1], None)
        else:
            node[parts[-1]] = value
    _local_save(data)


def _is_template(code):
    """기본 템플릿(줄 끝 공백만 다른 초기 시드 포함)인지 확인한다."""
    def norm(s):
        return "\n".join(line.rstrip() for line in s.strip().splitlines())
    return norm(code) == norm(DEFAULT_CODE)


def name_key(display_name):
    return display_name.strip().lower()


# ---------------------------------------------------------------- cache (서버 메모리)
# 풀이 전체와 사용자 목록을 메모리에 두고 읽기 요청은 Firebase 를 거치지 않는다.
# - 모든 쓰기는 이 서버를 거치므로, 쓰기 성공 직후 캐시도 같이 고친다.
# - 콘솔/스크립트로 DB 를 직접 고친 경우를 위해 CACHE_REFRESH_SECS 마다 Firebase 와 대조해 차이를 반영한다.
# - 바뀐 칸은 변경 로그(_log)에 남겨, 클라이언트가 마지막으로 받은 버전 이후의 변경분만 받아 가게 한다.
CACHE_REFRESH_SECS = float(os.environ.get("CACHE_REFRESH_SECS", "60"))
LOG_MAX = 5000
_cache_lock = threading.RLock()   # 메모리 연산만 짧게 잡는 락 (네트워크 호출 중에는 잡지 않는다)
_reload_lock = threading.Lock()
# "passed": {문제번호: {uid: True}} — 문제 예제를 모두 통과한 풀이 (브라우저가 채점해서 알려 준다). "푼 문제"는 이것만 센다.
_cache = {"loaded": False, "loaded_at": 0.0, "solutions": {}, "passed": {}, "users": {}, "counts": {}}
_log = collections.deque()        # (버전 번호, 문제번호, uid, 코드 또는 None=삭제, 통과 여부)
_log_floor = 0                    # 로그에서 밀려난 마지막 버전 번호 (이보다 오래된 since 는 전체 동기화)
_users_rev = 0                    # 사용자 목록(이름/가입/탈퇴/푼 문제 수)이 바뀔 때마다 증가
_stats = {"db_reads": 0, "db_writes": 0, "cache_reloads": 0}


def _clean_user(user):
    return {k: v for k, v in user.items() if v is not None}


def _count_solved(passed_by_q):
    counts = {}
    for passed in passed_by_q.values():
        for uid in passed:
            counts[uid] = counts.get(uid, 0) + 1
    return counts


def _bump(cells=(), users=False):
    """_cache_lock 을 잡은 상태에서 호출. 버전을 올리고 바뀐 칸을 변경 로그에 남긴다."""
    global _version_counter, _log_floor, _users_rev
    _version_counter += 1
    for qid, uid, code, passed in cells:
        _log.append((_version_counter, str(qid), uid, code, passed))
    while len(_log) > LOG_MAX:
        _log_floor = _log.popleft()[0]
    if users:
        _users_rev += 1


def _cache_reload_locked():
    """Firebase 에서 풀이/사용자를 읽어 캐시를 채운다. 이미 캐시가 있으면 차이만 변경 로그에 남긴다."""
    with _cache_lock:
        start_seq = _version_counter
    solutions = {}
    for qid, cells in _as_dict(db_get("solutions")).items():
        cells = _as_dict(cells)
        solutions[str(qid)] = {u: c for u, c in cells.items() if isinstance(c, str)}
    passed = {}
    for qid, flags in _as_dict(db_get("passed")).items():
        ok = {u: True for u, f in _as_dict(flags).items() if f is True and u in solutions.get(str(qid), {})}
        if ok:
            passed[str(qid)] = ok
    users = {uid: _clean_user(u) for uid, u in _as_dict(db_get("users")).items() if isinstance(u, dict)}
    with _cache_lock:
        if _cache["loaded"] and _version_counter != start_seq:
            # 읽는 사이에 저장/가입이 있었다 → 낡은 결과일 수 있으니 버리고 곧 다시 시도
            _cache["loaded_at"] = time.time() - CACHE_REFRESH_SECS + 3
            return
        diff_cells, users_changed = [], False
        if _cache["loaded"]:
            old, old_passed = _cache["solutions"], _cache["passed"]
            for qid, cells in solutions.items():
                for uid, code in cells.items():
                    now_ok = uid in passed.get(qid, {})
                    if old.get(qid, {}).get(uid) != code or (uid in old_passed.get(qid, {})) != now_ok:
                        diff_cells.append((qid, uid, code, now_ok))
            for qid, cells in old.items():
                for uid in cells:
                    if uid not in solutions.get(qid, {}):
                        diff_cells.append((qid, uid, None, False))
            users_changed = users != _cache["users"]
        was_loaded = _cache["loaded"]
        _cache["solutions"], _cache["passed"], _cache["users"] = solutions, passed, users
        _cache["counts"] = _count_solved(passed)
        _cache["loaded"], _cache["loaded_at"] = True, time.time()
        _stats["cache_reloads"] += 1
        if was_loaded and (diff_cells or users_changed):
            _bump(cells=diff_cells, users=users_changed or bool(diff_cells))
            print(f"[CACHE] DB 직접 변경 감지: 풀이 {len(diff_cells)}칸, 사용자 목록 {'변경' if users_changed else '동일'}")


def _cache_ensure():
    with _cache_lock:
        loaded = _cache["loaded"]
        stale = time.time() - _cache["loaded_at"] >= CACHE_REFRESH_SECS
    if loaded and not stale:
        return
    if not loaded:
        with _reload_lock:  # 처음 한 번: 동시에 들어온 요청은 모두 기다렸다가 같은 결과를 쓴다
            with _cache_lock:
                if _cache["loaded"]:
                    return
            _cache_reload_locked()
        return
    if _reload_lock.acquire(blocking=False):
        # 주기적 재확인은 백그라운드에서: 요청은 기다리지 않고 기존 캐시를 그대로 쓴다 (한 번에 하나만 실행)
        def run():
            try:
                _cache_reload_locked()
            except Exception as e:
                print(f"[WARN] 캐시 재확인 실패(기존 캐시 유지, 10초 뒤 재시도): {e}")
                with _cache_lock:
                    _cache["loaded_at"] = time.time() - CACHE_REFRESH_SECS + 10
            finally:
                _reload_lock.release()
        threading.Thread(target=run, daemon=True).start()


def cached_user(uid):
    _cache_ensure()
    with _cache_lock:
        user = _cache["users"].get(uid)
    if user is None:
        fresh = db_get(f"users/{uid}")  # 캐시가 낡아 있을 수 있으니(스크립트로 막 만든 계정 등) DB 에서 확인
        if isinstance(fresh, dict):
            _cache_put_user(uid, fresh)
            return _clean_user(fresh)
    return user


def cached_cell(qid, uid):
    _cache_ensure()
    with _cache_lock:
        return _cache["solutions"].get(str(qid), {}).get(uid)


def _cache_put_user(uid, user, bump=True):
    with _cache_lock:
        _cache["users"][uid] = _clean_user(user)
        if bump:
            _bump(users=True)


def cached_passed(qid, uid):
    _cache_ensure()
    with _cache_lock:
        return uid in _cache["passed"].get(str(qid), {})


def _cache_set_cell(qid, uid, code, passed=False):
    with _cache_lock:
        cells = _cache["solutions"].setdefault(str(qid), {})
        flags = _cache["passed"].setdefault(str(qid), {})
        was = uid in flags
        passed = bool(passed) and code is not None
        if code is None:
            cells.pop(uid, None)
        else:
            cells[uid] = code
        if passed:
            flags[uid] = True
        else:
            flags.pop(uid, None)
        delta = (1 if passed else 0) - (1 if was else 0)
        if delta:
            _cache["counts"][uid] = max(0, _cache["counts"].get(uid, 0) + delta)
        _bump(cells=[(qid, uid, code, passed)], users=bool(delta))


def _cache_remove_user(uid):
    with _cache_lock:
        gone = []
        for qid, cells in _cache["solutions"].items():
            if uid in cells:
                cells.pop(uid)
                gone.append((qid, uid, None, False))
        for flags in _cache["passed"].values():
            flags.pop(uid, None)
        _cache["users"].pop(uid, None)
        _cache["counts"].pop(uid, None)
        _bump(cells=gone, users=True)


def cache_users_view():
    _cache_ensure()
    with _cache_lock:
        out = []
        for uid, user in _cache["users"].items():
            item = _profile_public(uid, user)
            item["solvedCount"] = _cache["counts"].get(uid, 0)
            out.append(item)
        rev = _users_rev
    out.sort(key=lambda u: u["displayName"])
    return out, rev


def cache_sync(uids, since):
    """since("접두사-번호")가 유효하면 그 이후 바뀐 칸만(delta), 아니면 요청한 사용자들의 전체(full)."""
    _cache_ensure()
    with _cache_lock:
        version = f"{_version_prefix}-{_version_counter}"
        base = {"version": version, "usersRev": _users_rev}
        m = re.match(r"^(\d+)-(\d+)$", since or "")
        if m and m.group(1) == _version_prefix and int(m.group(2)) >= _log_floor and int(m.group(2)) <= _version_counter:
            n = int(m.group(2))
            cells = [[q, u, c, p] for (seq, q, u, c, p) in _log if seq > n and u in uids]
            return {"mode": "delta", "cells": cells, **base}
        solutions = {}
        for qid, cells in _cache["solutions"].items():
            picked = {u: c for u, c in cells.items() if u in uids}
            if picked:
                solutions[qid] = picked
        passed = {}
        for qid, flags in _cache["passed"].items():
            picked = {u: True for u in flags if u in uids}
            if picked:
                passed[qid] = picked
        return {"mode": "full", "solutions": solutions, "passed": passed, **base}


# ---------------------------------------------------------------- auth
class AuthError(Exception):
    pass


def verify_token(token):
    """Firebase ID 토큰을 검증해 클레임(dict, 'uid' 포함)을 돌려준다. 실패하면 AuthError."""
    if DEV_AUTH_BYPASS and token.startswith("dev:"):
        uid = token[4:]
        if not re.match(r"^[A-Za-z0-9_\-]{1,40}$", uid):
            raise AuthError("bad dev token")
        return {"uid": uid, "email": f"{uid}@{FAKE_EMAIL_DOMAIN}", "firebase": {"sign_in_provider": "password"}}
    if not FIREBASE_PROJECT_ID:
        raise AuthError("서버에 FIREBASE_PROJECT_ID 가 설정되지 않았습니다")
    try:
        import google.auth.transport.requests
        from google.oauth2 import id_token
        claims = id_token.verify_firebase_token(
            token, google.auth.transport.requests.Request(),
            audience=FIREBASE_PROJECT_ID, clock_skew_in_seconds=10)
    except Exception as e:
        raise AuthError(str(e))
    if not claims or not claims.get("sub"):
        raise AuthError("invalid token")
    claims["uid"] = claims["sub"]
    return claims


def _login_id_from_claims(claims):
    """아이디 방식 가입자(가짜 이메일)면 loginId 를, Google 등 그 외는 None 을 돌려준다."""
    email = (claims.get("email") or "").lower()
    suffix = "@" + FAKE_EMAIL_DOMAIN
    if email.endswith(suffix):
        return email[:-len(suffix)]
    return None


def _email_public(claims):
    """실제 이메일이면 돌려주고, 아이디 방식의 내부용 가짜 이메일이면 None."""
    email = (claims.get("email") or "").lower()
    return None if not email or email.endswith("@" + FAKE_EMAIL_DOMAIN) else email


def _auth_email_for(uid, user):
    """아이디로 로그인할 때 Firebase 에 넘길 이메일. 가능하면 Auth 에서 실시간 조회하고(이메일을 바꾼 직후에도 정확),
    실패하면 DB 에 저장된 값, 그것도 없으면 아이디 방식의 내부용 이메일을 돌려준다."""
    if FIREBASE_SERVICE_ACCOUNT_JSON and not (DEV_AUTH_BYPASS and not uid):
        try:
            url = f"https://identitytoolkit.googleapis.com/v1/projects/{FIREBASE_PROJECT_ID}/accounts:lookup"
            req = urllib.request.Request(
                url, data=json.dumps({"localId": [uid]}).encode("utf-8"), method="POST",
                headers={"Content-Type": "application/json", "Authorization": "Bearer " + _service_account_token()})
            with urllib.request.urlopen(req, timeout=10) as res:
                users = (json.loads(res.read().decode("utf-8") or "{}").get("users") or [])
            if users and users[0].get("email"):
                return users[0]["email"].lower()
        except Exception as e:
            print(f"[WARN] Auth 이메일 조회 실패, 저장된 값 사용: {e}")
    return (user.get("authEmail") or f"{user.get('loginId')}@{FAKE_EMAIL_DOMAIN}").lower()


def _web_api_key():
    """Firebase 웹 API 키(공개값). 환경변수 FIREBASE_WEB_API_KEY, 없으면 공개 파일 js/config.js 에서 읽는다."""
    key = os.environ.get("FIREBASE_WEB_API_KEY", "").strip()
    if key:
        return key
    try:
        with open(os.path.join(BASE_DIR, "js", "config.js"), "r", encoding="utf-8") as f:
            m = re.search(r'apiKey:\s*"([^"]+)"', f.read())
        return m.group(1) if m else ""
    except OSError:
        return ""


def _identity_post(endpoint, body):
    """Identity Toolkit REST 호출. 성공하면 dict, 실패하면 오류 코드 문자열을 담은 RuntimeError."""
    url = f"https://identitytoolkit.googleapis.com/v1/{endpoint}?key=" + urllib.parse.quote(_web_api_key())
    req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode("utf-8")).get("error", {}).get("message", "")
        except ValueError:
            msg = ""
        raise RuntimeError(msg or f"HTTP {e.code}")


def _make_custom_token(uid):
    """서비스 계정 키로 서명한 Firebase 커스텀 토큰(브라우저가 signInWithCustomToken 으로 로그인)."""
    from google.auth import crypt, jwt
    key_info = json.loads(FIREBASE_SERVICE_ACCOUNT_JSON)
    signer = crypt.RSASigner.from_service_account_info(key_info)
    now = int(time.time())
    payload = {"iss": key_info["client_email"], "sub": key_info["client_email"],
               "aud": "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
               "iat": now, "exp": now + 3600, "uid": uid}
    return jwt.encode(signer, payload).decode("utf-8")


_login_fails = {}  # (ip, 아이디) -> 실패 시각 목록 (무차별 대입 방지, 서버 재시작 시 초기화)
LOGIN_MAX_FAILS, LOGIN_WINDOW = 8, 600


def _throttled(key):
    now = time.time()
    fails = [t for t in _login_fails.get(key, []) if now - t < LOGIN_WINDOW]
    _login_fails[key] = fails
    return len(fails) >= LOGIN_MAX_FAILS


def _profile_public(uid, user):
    return {"uid": uid, "displayName": user.get("displayName", ""), "loginId": user.get("loginId")}


# ---------------------------------------------------------------- http
class ApiError(Exception):
    def __init__(self, status, code, message=""):
        super().__init__(message or code)
        self.status, self.code, self.message = status, code, message or code


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "CodingMasters/2.0"

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))
        sys.stdout.flush()

    def _send(self, status, body=b"", content_type="application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status, obj):
        self._send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def _is_static_asset(self, path):
        parts = path.lstrip("/").split("/")
        if len(parts) < 2 or parts[0] not in STATIC_DIRS or ".." in parts:
            return False
        full = os.path.join(BASE_DIR, *parts)
        return os.path.splitext(full)[1] in CONTENT_TYPES and os.path.isfile(full)

    def _claims(self):
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer ") or len(header) < 10:
            raise ApiError(401, "unauthorized", "로그인이 필요합니다")
        try:
            return verify_token(header[7:].strip())
        except AuthError as e:
            print(f"[AUTH FAIL] {e}")
            raise ApiError(401, "unauthorized", "로그인이 만료되었거나 올바르지 않습니다")

    def _body(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > 200_000:
            raise ApiError(413, "too_large")
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except ValueError:
            raise ApiError(400, "bad_json")
        if not isinstance(data, dict):
            raise ApiError(400, "bad_json")
        return data

    def _dispatch(self, fn):
        try:
            fn()
        except ApiError as e:
            self._json(e.status, {"error": e.code, "message": e.message})
        except Exception as e:  # DB 장애 등
            print(f"[SERVER ERROR] {self.command} {self.path}: {e!r}")
            self._json(500, {"error": "server_error", "message": str(e)})

    def do_OPTIONS(self):
        self._send(204)

    # ----- GET
    def do_GET(self):
        self._dispatch(self._get)

    def _get(self):
        parsed = urllib.parse.urlparse(self.path)
        path, query = parsed.path, urllib.parse.parse_qs(parsed.query)

        if path == "/api/version":
            try:
                _cache_ensure()  # 주기가 지났으면 한 요청만 Firebase 와 대조 → 콘솔/스크립트로 직접 바꾼 DB 도 곧 퍼진다
            except Exception as e:
                print(f"[WARN] 캐시 확인 실패: {e}")
            with _cache_lock:
                return self._json(200, {"version": f"{_version_prefix}-{_version_counter}", "usersRev": _users_rev})
        if path == "/healthz":
            return self._send(200, b"ok", "text/plain")
        if path == "/api/check":
            return self._json(200, self._check(query))
        if path == "/api/me":
            return self._me()
        if path == "/api/users":
            return self._users()
        if path == "/api/sync":
            return self._sync(query)
        if path == "/api/stats" and os.environ.get("DEBUG_STATS") == "1":  # 부하/캐시 점검용 (기본 꺼짐)
            with _cache_lock:
                return self._json(200, {**_stats, "log": len(_log), "users": len(_cache["users"]),
                                        "version": _version_counter, "usersRev": _users_rev})
        if path in STATIC_FILES or self._is_static_asset(path):
            name = STATIC_FILES.get(path) or path.lstrip("/")
            with open(os.path.join(BASE_DIR, name), "rb") as f:
                body = f.read()
            return self._send(200, body, CONTENT_TYPES[os.path.splitext(name)[1]])
        self._send(404, b"not found", "text/plain")

    def _check(self, query):
        login_id = (query.get("loginId", [""])[0]).strip().lower()
        name = (query.get("name", [""])[0]).strip()
        out = {}
        if login_id:
            out["loginIdValid"] = bool(LOGIN_ID_RE.match(login_id))
            out["loginIdTaken"] = bool(out["loginIdValid"] and db_get(f"loginIndex/{login_id}"))
        if name:
            out["nameValid"] = bool(DISPLAY_NAME_RE.match(name))
            out["nameTaken"] = bool(out["nameValid"] and db_get(f"nameIndex/{name_key(name)}"))
        return out

    def _me(self):
        claims = self._claims()
        uid = claims["uid"]
        user = db_get(f"users/{uid}")
        if not user:
            raise ApiError(404, "no_profile", "프로필이 없습니다. 표시 이름을 먼저 등록해 주세요")
        auth_email = (claims.get("email") or "").lower()
        if auth_email and user.get("authEmail") != auth_email:
            db_update({f"users/{uid}/authEmail": auth_email})  # 이메일 변경 직후에도 아이디 로그인이 되도록 기록
            _cache_put_user(uid, {**user, "authEmail": auth_email}, bump=False)
        out = _profile_public(uid, user)
        out["email"] = _email_public(claims)
        out["tempPassword"] = bool(user.get("tempPassword"))
        out["provider"] = (claims.get("firebase") or {}).get("sign_in_provider")
        self._json(200, out)

    def _users(self):
        self._claims()
        users, rev = cache_users_view()  # 메모리에서 바로 (Firebase 를 읽지 않는다)
        self._json(200, {"users": users, "usersRev": rev})

    def _sync(self, query):
        claims = self._claims()
        uids = {claims["uid"]}
        for chunk in query.get("users", []):
            uids.update(u for u in chunk.split(",") if re.match(r"^[A-Za-z0-9_\-]{1,40}$", u))
        if len(uids) > 8:  # 나 + 추가한 사람 최대 5명 (+ 보고 있는 사람) 에 여유를 둔 상한
            raise ApiError(400, "too_many_users", "한 번에 조회할 수 있는 사용자 수를 초과했습니다")
        since = (query.get("since", [""])[0] or "").strip()
        self._json(200, cache_sync(uids, since))

    # ----- POST / PATCH
    def do_POST(self):
        self._dispatch(self._post)

    def do_PATCH(self):
        self._dispatch(self._patch)

    def do_DELETE(self):
        self._dispatch(self._delete)

    def _delete(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/profile":
            return self._delete_account()
        self._send(404, b"not found", "text/plain")

    def _delete_account(self):
        """회원 탈퇴: 프로필·이름/아이디 색인·내 풀이를 모두 지운다 (되돌릴 수 없음).
        사용자 목록(/api/users)은 users 노드에서 읽으므로 즉시 검색/목록에서 사라진다.
        Firebase 인증 계정 자체는 브라우저가 이어서 삭제한다."""
        global _version_counter
        claims = self._claims()
        uid = claims["uid"]  # 토큰의 uid 만 사용 → 자기 계정만 삭제할 수 있다
        with _lock:
            user = db_get(f"users/{uid}")
            updates = {}
            if user:
                updates[f"users/{uid}"] = None
                name = user.get("displayName")
                if name and db_get(f"nameIndex/{name_key(name)}") == uid:
                    updates[f"nameIndex/{name_key(name)}"] = None
                login_id = user.get("loginId")
                if login_id and db_get(f"loginIndex/{login_id}") == uid:
                    updates[f"loginIndex/{login_id}"] = None
            for qid in QUESTION_RANGE:
                updates[f"solutions/{qid}/{uid}"] = None
                updates[f"passed/{qid}/{uid}"] = None
            db_update(updates)
            _cache_remove_user(uid)  # 캐시에서도 지우고 버전을 올려 다른 사용자의 화면이 곧바로 갱신되게 한다
        print(f"[ACCOUNT] deleted uid={uid}")
        self._json(200, {"status": "deleted"})

    def _client_ip(self):
        fwd = self.headers.get("X-Forwarded-For", "")
        return fwd.split(",")[0].strip() if fwd else self.client_address[0]

    def _login(self):
        """아이디 로그인: 서버가 비밀번호를 확인하고 커스텀 토큰을 준다. 이메일 주소는 브라우저에 알려 주지 않는다."""
        data = self._body()
        login_id = str(data.get("id", "")).strip().lower()
        password = str(data.get("password", ""))
        bad = ApiError(401, "bad_credentials", "아이디 또는 비밀번호가 올바르지 않습니다.")
        if not FIREBASE_SERVICE_ACCOUNT_JSON or not _web_api_key():
            raise ApiError(503, "login_unavailable", "서버에 로그인 설정(서비스 계정/웹 API 키)이 없습니다")
        key = (self._client_ip(), login_id)
        if _throttled(key):
            raise ApiError(429, "too_many", "시도 횟수가 많아 잠시 막혔습니다. 10분 뒤 다시 시도해 주세요.")
        uid = db_get(f"loginIndex/{login_id}") if LOGIN_ID_RE.match(login_id) and password else None
        user = db_get(f"users/{uid}") if uid else None
        if not user:
            _login_fails.setdefault(key, []).append(time.time())
            # 화면에는 항상 같은 메시지를 주고(계정 존재 여부 노출 방지), 원인은 서버 로그에만 남긴다
            reason = ("아이디 형식/비밀번호 비어 있음" if not (LOGIN_ID_RE.match(login_id) and password)
                      else "DB에 이 아이디가 없음(loginIndex 없음: 계정 생성 스크립트 미실행 또는 아이디 불일치)" if not uid
                      else "loginIndex 는 있으나 users 프로필이 없음")
            print(f"[LOGIN] failed id={login_id}: {reason}")
            raise bad
        try:
            res = _identity_post("accounts:signInWithPassword",
                                 {"email": _auth_email_for(uid, user), "password": password, "returnSecureToken": False})
            if res.get("localId") != uid:
                raise RuntimeError("uid mismatch")
        except RuntimeError as e:
            _login_fails.setdefault(key, []).append(time.time())
            print(f"[LOGIN] failed id={login_id}: {e}")
            raise bad
        _login_fails.pop(key, None)
        self._json(200, {"customToken": _make_custom_token(uid)})

    def _password_reset(self):
        """아이디로 비밀번호 재설정 메일 요청. 계정/이메일 유무와 상관없이 같은 응답을 준다."""
        login_id = str(self._body().get("id", "")).strip().lower()
        key = (self._client_ip(), "reset")
        if _throttled(key):
            raise ApiError(429, "too_many", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.")
        _login_fails.setdefault(key, []).append(time.time())
        uid = db_get(f"loginIndex/{login_id}") if LOGIN_ID_RE.match(login_id) else None
        user = db_get(f"users/{uid}") if uid else None
        if user and _web_api_key():
            email = _auth_email_for(uid, user)
            if not email.endswith("@" + FAKE_EMAIL_DOMAIN):
                try:
                    _identity_post("accounts:sendOobCode", {"requestType": "PASSWORD_RESET", "email": email})
                except RuntimeError as e:
                    print(f"[RESET] failed id={login_id}: {e}")
        self._json(200, {"status": "ok"})

    def _post(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/login":
            return self._login()
        if path == "/api/password-reset":
            return self._password_reset()
        if path == "/api/profile":
            return self._create_profile()
        if path == "/api/solution":  # PATCH 를 못 쓰는 환경 대비
            return self._save_solution()
        self._send(404, b"not found", "text/plain")

    def _patch(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/profile":
            return self._update_profile()
        if path == "/api/solution":
            return self._save_solution()
        self._send(404, b"not found", "text/plain")

    def _create_profile(self):
        claims = self._claims()
        uid = claims["uid"]
        data = self._body()
        name = str(data.get("displayName", "")).strip()
        if not DISPLAY_NAME_RE.match(name):
            raise ApiError(400, "bad_name", "표시 이름은 2~12자의 한글/영문/숫자/_/-/공백만 쓸 수 있습니다")
        login_id = _login_id_from_claims(claims)
        if login_id is not None and not LOGIN_ID_RE.match(login_id):
            raise ApiError(400, "bad_login_id", "아이디는 영문 소문자/숫자/_ 4~20자여야 합니다")
        with _lock:
            if db_get(f"users/{uid}"):
                raise ApiError(409, "profile_exists", "이미 프로필이 있습니다")
            if db_get(f"nameIndex/{name_key(name)}"):
                raise ApiError(409, "name_taken", "이미 사용 중인 표시 이름입니다")
            updates = {
                f"users/{uid}": {"displayName": name, "loginId": login_id, "createdAt": int(time.time()),
                                  "authEmail": (claims.get("email") or "").lower() or None},
                f"nameIndex/{name_key(name)}": uid,
            }
            if login_id:
                if db_get(f"loginIndex/{login_id}"):
                    raise ApiError(409, "login_id_taken", "이미 사용 중인 아이디입니다")
                updates[f"loginIndex/{login_id}"] = uid
            db_update(updates)
            _cache_put_user(uid, updates[f"users/{uid}"])
        print(f"[PROFILE] created uid={uid} name={name}")
        out = _profile_public(uid, {"displayName": name, "loginId": login_id})
        out["email"] = _email_public(claims)
        self._json(200, out)

    def _update_profile(self):
        claims = self._claims()
        uid = claims["uid"]
        data = self._body()
        with _lock:
            user = db_get(f"users/{uid}")
            if not user:
                raise ApiError(404, "no_profile", "프로필이 없습니다")
            updates = {}
            if "displayName" in data:
                name = str(data["displayName"]).strip()
                if not DISPLAY_NAME_RE.match(name):
                    raise ApiError(400, "bad_name", "표시 이름은 2~12자의 한글/영문/숫자/_/-/공백만 쓸 수 있습니다")
                old = user.get("displayName", "")
                if name_key(name) != name_key(old):
                    owner = db_get(f"nameIndex/{name_key(name)}")
                    if owner and owner != uid:
                        raise ApiError(409, "name_taken", "이미 사용 중인 표시 이름입니다")
                    if old:
                        updates[f"nameIndex/{name_key(old)}"] = None
                    updates[f"nameIndex/{name_key(name)}"] = uid
                updates[f"users/{uid}/displayName"] = name
            if "loginId" in data:
                if (claims.get("firebase") or {}).get("sign_in_provider") == "google.com":
                    raise ApiError(400, "no_login_id", "Google 계정은 아이디를 설정할 수 없습니다")
                new_id = str(data["loginId"]).strip().lower()
                if not LOGIN_ID_RE.match(new_id):
                    raise ApiError(400, "bad_login_id", "아이디는 영문 소문자/숫자/_ 4~20자여야 합니다")
                old_id = user.get("loginId")
                if new_id != old_id:
                    owner = db_get(f"loginIndex/{new_id}")
                    if owner and owner != uid:
                        raise ApiError(409, "login_id_taken", "이미 사용 중인 아이디입니다")
                    if old_id and db_get(f"loginIndex/{old_id}") == uid:
                        updates[f"loginIndex/{old_id}"] = None
                    updates[f"loginIndex/{new_id}"] = uid
                    updates[f"users/{uid}/loginId"] = new_id
            if data.get("tempPasswordDone"):
                updates[f"users/{uid}/tempPassword"] = None
            db_update(updates)
            user = db_get(f"users/{uid}") or user
            _cache_put_user(uid, user)
        self._json(200, _profile_public(uid, user))

    def _save_solution(self):
        claims = self._claims()
        uid = claims["uid"]  # 클라이언트가 보낸 uid/이름은 쓰지 않는다 → 내 칸에만 저장
        data = self._body()
        qid, code = data.get("questionId"), data.get("code")
        if not (isinstance(qid, int) and not isinstance(qid, bool) and qid in QUESTION_RANGE):
            raise ApiError(400, "bad_question", "문제 번호가 올바르지 않습니다")
        if not isinstance(code, str) or len(code) > MAX_CODE_LEN:
            raise ApiError(400, "bad_code", "코드가 올바르지 않거나 너무 깁니다")
        with _lock:
            if not cached_user(uid):
                raise ApiError(403, "no_profile", "프로필을 먼저 등록해 주세요")
            old = cached_cell(qid, uid)
            old_passed = cached_passed(qid, uid)
            # passed: 이 코드가 예제를 모두 통과했는지(브라우저 채점 결과). 안 보내면 코드가 그대로일 때만 이전 값을 유지한다.
            new_passed = data.get("passed")
            if new_passed is None:
                new_passed = old_passed if code == old else False
            elif not isinstance(new_passed, bool):
                raise ApiError(400, "bad_passed", "통과 여부가 올바르지 않습니다")
            if code == old and new_passed == old_passed:
                return self._json(200, {"status": "success", "changed": 0})
            # 기본 템플릿이 이미 저장된 실제 풀이를 덮어쓰지 않도록 방지 (초기화 버튼은 reset=true)
            if old and _is_template(code) and not data.get("reset"):
                return self._json(200, {"status": "success", "changed": 0})
            db_update({f"solutions/{qid}/{uid}": code, f"passed/{qid}/{uid}": True if new_passed else None})
            _cache_set_cell(qid, uid, code, new_passed)  # 쓰기 성공 후 캐시/변경 로그/버전 갱신
        print(f"[SAVE OK] uid={uid} q={qid}")
        self._json(200, {"status": "success", "changed": 1})


class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128  # 기본값 5 는 접속이 한꺼번에 몰리면 넘쳐서 1초씩 지연된다


def startup_check():
    """시작할 때 설정을 점검해 문제의 원인을 알려 준다 (비밀 값은 출력하지 않는다)."""
    print("[점검] FIREBASE_DB_URL:", FIREBASE_DB_URL or "(비어 있음 → 로컬 파일 모드)")
    if not FIREBASE_DB_URL:
        return
    if FIREBASE_SERVICE_ACCOUNT_JSON:
        try:
            info = json.loads(FIREBASE_SERVICE_ACCOUNT_JSON)
            ok_keys = all(k in info for k in ("type", "project_id", "private_key", "client_email"))
            print(f"[점검] FIREBASE_SERVICE_ACCOUNT_JSON: JSON 해석 OK, 필수 항목 {'있음' if ok_keys else '누락'}, project_id={info.get('project_id')}")
            if info.get("project_id") != FIREBASE_PROJECT_ID:
                print(f"[점검][주의] 서비스 계정 project_id({info.get('project_id')}) 와 FIREBASE_PROJECT_ID({FIREBASE_PROJECT_ID}) 가 다릅니다")
        except ValueError:
            print("[점검][실패] FIREBASE_SERVICE_ACCOUNT_JSON 이 올바른 JSON이 아닙니다 "
                  f"(길이 {len(FIREBASE_SERVICE_ACCOUNT_JSON)}자, 첫 글자 {FIREBASE_SERVICE_ACCOUNT_JSON[:1]!r}). "
                  "서비스 계정 JSON 내용을 줄바꿈 없이 한 줄로 넣어야 합니다.")
            return
    else:
        print("[점검] FIREBASE_SERVICE_ACCOUNT_JSON: 비어 있음 (DB 규칙이 막혀 있으면 읽기/쓰기가 실패합니다)")
    try:
        db_get("users")
        print("[점검][성공] Firebase DB 읽기 성공")
    except Exception as e:
        print(f"[점검][실패] Firebase DB 읽기 실패: {e}")


def migrate_legacy_passed():
    """채점 기능이 생기기 전에 '저장만으로 완료'였던 풀이(기본 템플릿이 아닌 코드)를 통과로 한 번만 옮겨 준다.
    DB 의 meta/passedMigrated 표시가 있으면 다시 하지 않는다 (이후 코드를 고쳐서 풀린 완료가 되살아나지 않도록)."""
    if db_get("meta/passedMigrated"):
        return 0
    with _lock:
        with _cache_lock:
            todo = [(qid, uid, code) for qid, cells in _cache["solutions"].items() for uid, code in cells.items()
                    if not _is_template(code) and uid not in _cache["passed"].get(qid, {})]
        updates = {f"passed/{qid}/{uid}": True for qid, uid, _ in todo}
        updates["meta/passedMigrated"] = True
        db_update(updates)
        for qid, uid, code in todo:
            _cache_set_cell(qid, uid, code, True)
    return len(todo)


if __name__ == "__main__":
    mode = "Firebase" if FIREBASE_DB_URL else "로컬 JSON 파일(테스트용: local_db.json)"
    print(f"[CODING MASTERS] port={PORT} storage={mode} auth_project={FIREBASE_PROJECT_ID or '(미설정)'}"
          + (" DEV_AUTH_BYPASS=ON" if DEV_AUTH_BYPASS else ""))
    sys.stdout.flush()
    startup_check()
    try:
        _cache_ensure()
        print(f"[캐시] 사용자 {len(_cache['users'])}명, 풀이 {sum(len(c) for c in _cache['solutions'].values())}칸을 메모리에 불러왔습니다 "
              f"(Firebase 와 {int(CACHE_REFRESH_SECS)}초마다 대조)")
        moved = migrate_legacy_passed()
        if moved:
            print(f"[이전] 기존 완료 풀이 {moved}칸을 통과 상태로 옮겼습니다 (한 번만 실행됩니다)")
    except Exception as e:
        print(f"[캐시][실패] 첫 로드 실패(요청이 올 때 다시 시도합니다): {e}")
    sys.stdout.flush()
    try:
        ThreadedServer(("0.0.0.0", PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        print("서버를 종료합니다.")
