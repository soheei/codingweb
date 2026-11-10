"""기존 4명(김민희/양소희/정호준/차승우) 계정을 미리 만들고 기존 풀이를 각자 uid 칸으로 복사하는 1회용 스크립트.

사용법 (먼저 --dry-run 으로 확인):
    python tools/create_legacy_users.py --key-file 서비스계정키.json --dry-run
    python tools/create_legacy_users.py --key-file 서비스계정키.json

- 서비스 계정 키는 `--key-file` 로 경로를 주거나, 환경변수 FIREBASE_SERVICE_ACCOUNT_JSON 에 JSON 내용을 넣는다.
  (이 스크립트는 .env 를 읽지 않는다)
- 이미 만들어진 계정/프로필은 건너뛰므로 여러 번 실행해도 안전하다.
- 임시 비밀번호는 실행 마지막에 한 번만 출력된다. 각자에게 전달하고, 각자 '내 정보 설정'에서 바꾸게 한다.
- 기존 데이터(codingmasters_solutions)는 삭제하지 않는다.
"""
import argparse
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

FAKE_EMAIL_DOMAIN = "codingmasters.local"
DEFAULT_DB_URL = "https://codingmastars-default-rtdb.firebaseio.com"
DEFAULT_MAP = "김민희=minhee,양소희=sohee,정호준=hojun,차승우=seungwoo"
LEGACY_NODE = "codingmasters_solutions"
DEFAULT_CODE = """import sys

a = int(sys.stdin.readline())
b = int(sys.stdin.readline())

print(a + b)
"""
PW_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 헷갈리는 문자(0/O, 1/l/I) 제외


def is_template(code):
    def norm(s):
        return "\n".join(line.rstrip() for line in s.strip().splitlines())
    return norm(code) == norm(DEFAULT_CODE)


def as_dict(raw):
    if isinstance(raw, list):
        return {str(i): v for i, v in enumerate(raw) if v is not None}
    return raw if isinstance(raw, dict) else {}


def plan_cells(legacy, name):
    """기존 데이터에서 name 의 풀이만 {문제번호: 코드} 로 뽑는다 (빈 칸/기본 템플릿 제외)."""
    out = {}
    for qid, cells in as_dict(legacy).items():
        code = as_dict(cells).get(name)
        if isinstance(code, str) and code.strip() and not is_template(code):
            out[str(qid)] = code
    return out


def parse_map(text):
    pairs = {}
    for item in text.split(","):
        name, login_id = item.split("=")
        pairs[name.strip()] = login_id.strip().lower()
    return pairs


class Google:
    def __init__(self, key_info):
        from google.oauth2 import service_account
        import google.auth.transport.requests
        self._req = google.auth.transport.requests.Request()
        self._cred = service_account.Credentials.from_service_account_info(
            key_info, scopes=["https://www.googleapis.com/auth/cloud-platform",
                              "https://www.googleapis.com/auth/firebase.database",
                              "https://www.googleapis.com/auth/userinfo.email"])
        self.project_id = key_info["project_id"]

    def token(self):
        if not self._cred.valid:
            self._cred.refresh(self._req)
        return self._cred.token

    def call(self, method, url, body=None):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={
            "Content-Type": "application/json", "Authorization": f"Bearer {self.token()}"})
        try:
            with urllib.request.urlopen(req, timeout=20) as res:
                return json.loads(res.read().decode("utf-8") or "null")
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")
            raise RuntimeError(f"{method} {url.split('?')[0]} -> HTTP {e.code}: {detail[:300]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--key-file", help="서비스 계정 키 JSON 파일 경로")
    ap.add_argument("--db-url", default=DEFAULT_DB_URL)
    ap.add_argument("--map", default=DEFAULT_MAP, help="이름=아이디 쌍 (쉼표 구분)")
    ap.add_argument("--dry-run", action="store_true", help="아무것도 쓰지 않고 할 일만 출력")
    ap.add_argument("--only", help="이 아이디들만 처리(쉼표 구분). 예: minhee,seungwoo,hojun")
    ap.add_argument("--check", help="로그인 문제 점검: 아이디(쉼표 구분)의 Auth 계정/DB 프로필 상태만 출력")
    ap.add_argument("--reset-password", help="아이디(쉼표 구분)의 임시 비밀번호를 새로 만들어 적용")
    args = ap.parse_args()

    if args.key_file:
        with open(args.key_file, "r", encoding="utf-8") as f:
            key_info = json.load(f)
    elif os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON"):
        key_info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"])
    else:
        sys.exit("서비스 계정 키가 필요합니다: --key-file 경로 또는 FIREBASE_SERVICE_ACCOUNT_JSON 환경변수")

    g = Google(key_info)
    db = args.db_url.rstrip("/")
    pid = g.project_id
    mapping = parse_map(args.map)
    if args.only:  # 예: --only minhee,seungwoo,hojun → 해당 아이디만 처리(나머지는 건드리지 않음)
        wanted = {x.strip().lower() for x in args.only.split(",") if x.strip()}
        mapping = {n: i for n, i in mapping.items() if i in wanted}
        if not mapping:
            sys.exit("--only 에 해당하는 아이디가 --map 에 없습니다")

    def db_get(path):
        path = urllib.parse.quote(path, safe="/")  # 한글 이름이 경로에 들어가므로 URL 인코딩
        return g.call("GET", f"{db}/{path}.json" if path else f"{db}/.json")

    def db_update(updates):
        g.call("PATCH", f"{db}/.json", updates)

    def lookup_auth(email):
        found = g.call("POST", f"https://identitytoolkit.googleapis.com/v1/projects/{pid}/accounts:lookup", {"email": [email]})
        users = (found or {}).get("users") or []
        return users[0] if users else None

    # --check 아이디 : 로그인이 안 될 때 계정/프로필 상태를 점검한다 (아무것도 바꾸지 않음)
    if args.check:
        for login_id in [x.strip().lower() for x in args.check.split(",")]:
            email = f"{login_id}@{FAKE_EMAIL_DOMAIN}"
            auth_user = lookup_auth(email)
            idx_uid = db_get(f"loginIndex/{login_id}")
            profile = db_get(f"users/{idx_uid}") if idx_uid else None
            print(f"\n[{login_id}] 로그인 이메일: {email}")
            print(f"  - Firebase Auth 계정: {'있음 (uid=' + auth_user['localId'] + ')' if auth_user else '없음  <- 이 경우 로그인 불가. 스크립트를 --dry-run 없이 실행해야 합니다'}")
            print(f"  - DB 아이디 등록(loginIndex): {idx_uid or '없음'}")
            print(f"  - DB 프로필(users): {'있음 (' + str(profile.get('displayName')) + ', 임시비밀번호 안내=' + str(bool(profile.get('tempPassword'))) + ')' if profile else '없음'}")
            if auth_user and idx_uid and auth_user["localId"] != idx_uid:
                print("  - [주의] Auth uid 와 DB uid 가 다릅니다 (계정을 지우고 다시 만든 경우). 풀이가 연결되지 않습니다.")
        return

    # --reset-password 아이디 : 임시 비밀번호를 새로 만들어 해당 계정에 적용한다
    if args.reset_password:
        for login_id in [x.strip().lower() for x in args.reset_password.split(",")]:
            email = f"{login_id}@{FAKE_EMAIL_DOMAIN}"
            auth_user = lookup_auth(email)
            if not auth_user:
                print(f"[{login_id}] Auth 계정이 없습니다. 먼저 계정 생성부터 실행하세요.")
                continue
            new_pw = "".join(secrets.choice(PW_ALPHABET) for _ in range(10))
            if args.dry_run:
                print(f"[{login_id}] (dry-run) 비밀번호를 새로 만들 예정")
                continue
            g.call("POST", f"https://identitytoolkit.googleapis.com/v1/projects/{pid}/accounts:update",
                   {"localId": auth_user["localId"], "password": new_pw})
            uid = db_get(f"loginIndex/{login_id}")
            if uid:
                db_update({f"users/{uid}/tempPassword": True})
            print(f"[{login_id}] 새 임시 비밀번호: {new_pw}   (이 화면은 다시 볼 수 없습니다)")
        return

    print(f"프로젝트: {pid} / DB: {db} / {'DRY-RUN' if args.dry_run else '실제 실행'}")
    legacy = db_get(LEGACY_NODE)
    if not legacy:
        print(f"[주의] 기존 데이터({LEGACY_NODE})가 비어 있습니다. 계정만 만들어집니다.")

    results = []
    for name, login_id in mapping.items():
        email = f"{login_id}@{FAKE_EMAIL_DOMAIN}"
        cells = plan_cells(legacy, name)
        existing_uid = db_get(f"loginIndex/{login_id}")
        name_owner = db_get(f"nameIndex/{name.lower()}")
        print(f"\n[{name}] 아이디={login_id} / 복사할 풀이 {len(cells)}개")
        if existing_uid or name_owner:
            old_uid = existing_uid or name_owner
            # 콘솔에서 로그인 계정(Auth)만 지우면 DB 프로필/풀이는 남는다 → 같은 uid 로 계정을 다시 만들어 풀이를 그대로 연결
            auth_by_uid = g.call("POST", f"https://identitytoolkit.googleapis.com/v1/projects/{pid}/accounts:lookup",
                                 {"localId": [old_uid]})
            if (auth_by_uid or {}).get("users"):
                print(f"  - 이미 등록됨(uid={old_uid}, 로그인 계정 있음) → 건너뜁니다")
                results.append((name, login_id, None, "이미 있음"))
                continue
            if lookup_auth(email):
                print(f"  - [주의] {email} 로그인 계정이 다른 uid 로 이미 있어 건너뜁니다. 콘솔에서 확인이 필요합니다.")
                results.append((name, login_id, None, "충돌: 확인 필요"))
                continue
            if args.dry_run:
                print(f"  - (dry-run) 로그인 계정이 없음 → 같은 uid({old_uid})로 {email} 재생성 예정, 기존 풀이는 그대로 유지")
                results.append((name, login_id, "(dry-run)", "재생성 예정"))
                continue
            password = "".join(secrets.choice(PW_ALPHABET) for _ in range(10))
            g.call("POST", f"https://identitytoolkit.googleapis.com/v1/projects/{pid}/accounts",
                   {"localId": old_uid, "email": email, "password": password, "displayName": name, "emailVerified": False})
            db_update({f"users/{old_uid}/tempPassword": True, f"users/{old_uid}/authEmail": None,
                       f"users/{old_uid}/loginId": login_id, f"loginIndex/{login_id}": old_uid,
                       f"nameIndex/{name.lower()}": old_uid})
            print(f"  - 완료: 같은 uid({old_uid})로 로그인 계정 재생성, 기존 풀이 유지")
            results.append((name, login_id, password, "계정 재생성"))
            continue
        if args.dry_run:
            print(f"  - (dry-run) 계정 {email} 생성, 풀이 {len(cells)}개 복사 예정")
            results.append((name, login_id, "(dry-run)", "예정"))
            continue

        password = "".join(secrets.choice(PW_ALPHABET) for _ in range(10))
        try:
            created = g.call("POST", f"https://identitytoolkit.googleapis.com/v1/projects/{pid}/accounts",
                             {"email": email, "password": password, "displayName": name, "emailVerified": False})
            uid = created["localId"]
        except RuntimeError as e:
            if "EMAIL_EXISTS" not in str(e):
                raise
            # Auth 에는 있는데 DB 프로필만 없는 경우: 기존 계정에 프로필만 연결 (비밀번호는 그대로)
            found = g.call("POST", f"https://identitytoolkit.googleapis.com/v1/projects/{pid}/accounts:lookup", {"email": [email]})
            uid = found["users"][0]["localId"]
            password = None
            print("  - 이미 Auth 계정이 있어 비밀번호는 바꾸지 않고 프로필만 연결합니다")

        updates = {
            f"users/{uid}": {"displayName": name, "loginId": login_id, "legacyName": name,
                             "tempPassword": password is not None, "createdAt": int(time.time())},
            f"nameIndex/{name.lower()}": uid,
            f"loginIndex/{login_id}": uid,
        }
        for qid, code in cells.items():
            updates[f"solutions/{qid}/{uid}"] = code
        db_update(updates)
        print(f"  - 완료: uid={uid}, 풀이 {len(cells)}개 복사")
        results.append((name, login_id, password, "생성됨" if password else "프로필 연결"))

    print("\n" + "=" * 52)
    print("이름 / 아이디 / 임시 비밀번호 (각자에게 전달하세요. 이 화면은 다시 볼 수 없습니다)")
    for name, login_id, password, status in results:
        print(f"  {name} / {login_id} / {password if password else '-'}  [{status}]")


if __name__ == "__main__":
    main()
