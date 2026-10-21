# Coding Masters 배포 / DB 구축 계획

> 목표: 여러 명이 웹사이트에서 풀이를 등록하고, 모두가 실시간으로 볼 수 있게 서버 + DB를 배포한다.
> 

---

# 확정된 결정 (2026-10-21)

| 항목 | 결정 |
|---|---|
| DB | **Firebase Realtime Database** (REST로 서버가 접근) |
| 호스팅 | **Render 단독** (Web Service, 무료) |
| 서버 파일 | `server_db.py` **신규 분리** (기존 `server.py`는 로컬용으로 그대로 유지) |
| app.js | 폴링 함수 `setupServerPolling()` **추가만** + DOMContentLoaded에 1줄 호출 |
| 암호 | 없음 |

> 아래 본문의 Postgres/Neon 내용은 초기 비교안이다. 실제 구현은 위 결정을 따른다.
> 스키마는 Firebase 노드 `codingmasters_solutions/{문제번호}/{이름} = 코드` (기존 JSON과 동일 구조).
> 서버(`server_db.py`)는 `PATCH`로 바뀐 칸만 저장하고, `FIREBASE_DB_URL`(필수)·`FIREBASE_AUTH`(선택) 환경변수를 사용한다.
> 배포/설정 절차는 README_SH.md 참고. 구현 파일: `server_db.py`, `render.yaml`, `app.js`(추가분).

---

## 1. 현재 코드 분석 결과

### 1-1. 파일 구성
| 파일 | 역할 |
|---|---|
| `index.html`, `style.css` | 화면 (정적 파일) |
| `app.js` (약 1200줄) | 모든 프론트 로직: 에디터(CodeMirror), 실행(Pyodide), 저장/동기화 |
| `questions.js` | 문제 100개 생성 (`generateAll100Questions`) |
| `server.py` | 파이썬 표준 라이브러리만 쓰는 정적 서버 + JSON 파일 저장 API |
| `team_solutions_db.json` | "DB" 역할의 JSON 파일 (약 48KB) |
| `서버실행.bat` | `python server.py` 실행 |

### 1-2. 데이터 구조 (현재 "DB")
```json
{ "문제번호": { "김민희": "코드", "양소희": "코드", "정호준": "코드", "차승우": "코드" }, ... }
```
- 사용자는 4명 고정 (`FIXED_MEMBERS`), 문제 100개 → 최대 400개 칸(cell).
- 로그인 없음. 화면에서 이름 탭을 골라 그 사람 칸에 코드를 쓴다.

### 1-3. 데이터 저장/불러오기 방식 (app.js 기준)
**불러오기** `loadInitialSolutions()` (app.js:92) — 우선순위:
1. Firebase URL이 설정돼 있으면 Firebase
2. `GET /api/sync` (server.py → JSON 파일 전체)
3. 브라우저 localStorage
4. 기본 템플릿 코드(`DEFAULT_CODE`)로 빈 칸 채움

**저장** `executeSave()` (app.js:192) — 타이핑 후 800ms 뒤 자동 저장, 아래를 전부 시도:
1. localStorage 저장
2. Firebase `PUT` (설정 시)
3. `POST /api/sync` — **전체 데이터(400칸)를 통째로** 전송
4. ntfy.sh 공개 채널로 브로드캐스트

**실시간 수신** : ntfy.sh SSE(app.js:305), Firebase SSE(app.js:1065) 두 가지뿐.
→ `server.py`에는 **변경 알림(push/polling) 기능이 없다.**

### 1-4. 현 구조의 문제점 (배포 시 반드시 해결할 것)
| # | 문제 | 영향 |
|---|---|---|
| A | `POST /api/sync`가 **전체 덮어쓰기** (`server.py:66`) | A가 오래된 화면 상태로 저장하면 B의 최신 풀이가 사라짐 (마지막 저장자 승리) |
| B | 서버에서 저장된 데이터를 다른 브라우저에 알려주는 기능이 없음 | 서버 배포만 해서는 "실시간으로 모두가 봄"이 안 됨 (새로고침해야 보임) |
| C | ntfy.sh 브로드캐스트에 전체 데이터(수십 KB)를 담음 | ntfy 메시지 크기 제한(약 4KB)을 넘을 가능성이 높아 실제로는 동작하지 않을 수 있음. 또 공개 채널이라 누구나 읽고 쓸 수 있음 (확인 필요) |
| D | JSON 파일 저장 | 동시 쓰기에 취약, 무료 호스팅은 재배포/재시작 시 파일이 사라짐 |
| E | 인증 없음 + CORS `*` | 주소를 아는 사람은 누구나 수정 가능 |
| F | `DEFAULT_CODE`로 빈 칸을 채운 뒤 전체 전송 | 서버 로드에 실패한 클라이언트가 저장하면 기본 코드가 실제 풀이를 덮어쓸 수 있음 |

---

## 2. 선택안 비교

| 안 | 내용 | app.js 수정 | 장점 | 단점 |
|---|---|---|---|---|
| **1. Firebase 연동 (기존 기능 활용)** | UI에 이미 있는 "Firebase 연동" 버튼 사용. Realtime DB URL만 입력 | **0줄** | 가장 빠름. 실시간 SSE 이미 구현됨. 서버 불필요(GitHub Pages 가능) | 문제 A(전체 덮어쓰기) 그대로. 보안 규칙을 공개(test mode)로 열어야 함 |
| **2. 서버 + Postgres (권장)** | `server.py`를 DB 연동 버전으로 확장해 배포. API 주소(`/api/sync`)는 그대로 유지 | **0~약 30줄 (선택)** | 우리가 통제하는 진짜 DB. 칸 단위 병합으로 덮어쓰기 문제 해결 가능 | 서버 배포 필요 |
| 3. 서버 + SQLite | 2번과 같지만 DB가 파일 | 동일 | 가장 단순 | 무료 호스팅은 디스크가 사라져 영구 보관 불가 (유료 디스크/볼륨 필요) |

### ✅ 결정: 2번 — **PostgreSQL(Neon 또는 Supabase 무료) + 파이썬 서버(Render 무료)**
- 이유: 팀 4명 규모이므로 무료 티어로 충분하고, 서버 재시작/재배포에도 데이터가 남는다.
- 보험: 1번(Firebase)은 코드 수정 없이 바로 켤 수 있으므로 **배포가 막힐 때의 대안**으로 둔다.

---

## 3. 목표 아키텍처

```
브라우저(팀원 4명) ──HTTPS──▶ Render (server.py: 정적 파일 + /api)
                                   │
                                   ▼
                        Neon/Supabase PostgreSQL
                        (solutions 테이블)
```

### DB 스키마 (1개 테이블)
```sql
CREATE TABLE solutions (
  question_id INT          NOT NULL,
  member      TEXT         NOT NULL,
  code        TEXT         NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, member)
);
```
- 칸 1개 = 행 1개. 400칸 → 최대 400행.
- 기존 JSON `{문제: {이름: 코드}}` ↔ 행 변환은 서버가 담당 → **프론트는 JSON 모양 그대로** 주고받음.

### API (기존 주소 유지 → app.js 호환)
| 메서드 | 경로 | 동작 |
|---|---|---|
| GET | `/api/sync` (`/api/load`) | 전체를 기존 JSON 모양으로 반환 |
| POST | `/api/sync` (`/api/save`) | 받은 JSON을 **칸 단위 upsert**. 아래 규칙 적용 |
| GET | `/api/version` *(신규)* | 마지막 변경 시각/카운터 반환 (폴링용, 가벼움) |
| GET | `/healthz` *(신규)* | 배포 헬스체크 |

POST 병합 규칙 (문제 A, F 해결, **프론트 수정 없이 서버만으로**):
1. 내용이 DB와 같으면 건너뜀 (`updated_at` 갱신 안 함)
2. 들어온 값이 `DEFAULT_CODE`인데 DB에 다른 코드가 있으면 **덮어쓰지 않음**
3. 4명 이름·1~100번 범위 밖 키는 무시, 코드 길이 상한(예: 50KB) 적용

> 남는 한계: 두 사람이 *같은 칸*을 동시에 고치면 마지막 저장이 이김 (이름 칸이 사람별로 나뉘어 있어 실사용에서는 거의 없음).

---

## 4. 실시간 반영 방법

현재 프론트는 서버 변경을 받을 수단이 없다 (문제 B). 두 단계로 나눈다.

### 단계 1 — 수정 0줄 (기본 동작)
- 저장은 즉시 DB에 반영, 다른 사람은 새로고침 시 확인.
- (ntfy 경로는 문제 C 때문에 기대하지 않는다.)

### 단계 2 — app.js에 **추가만** 하는 폴링 (약 30줄, 기존 줄은 수정/삭제 없음)
- 3초마다 `GET /api/version` → 값이 바뀌면 `GET /api/sync` → 기존 SSE 수신부(app.js:329~356)와 **같은 병합 로직**으로 반영
  (내가 지금 편집 중인 칸은 건드리지 않음)
- 위치: `setupRealtimeCloudSync()` 아래에 새 함수 `setupServerPolling()` 추가 + DOMContentLoaded에서 한 줄 호출.
- 3초 폴링은 4명 규모에서 부하가 사실상 없고, SSE보다 무료 호스팅에서 끊김 걱정이 적다.

> 이 단계 2가 "모두가 실시간으로 본다"를 만족시키는 **유일한 프론트 수정**이다. 승인 후 진행.

---

## 5. 작업 순서

| 단계 | 작업 | 수정 파일 | 산출물 |
|---|---|---|---|
| 0 | 이 계획 확정 (DB/호스팅 선택 확인) | - | plan.md |
| 1 | Neon(또는 Supabase) 프로젝트 생성, `DATABASE_URL` 확보 | - (외부 서비스) | 접속 문자열 |
| 2 | 서버 DB 연동 | `server.py` (또는 새 `server_db.py`로 분리해 기존 파일 보존), `requirements.txt`(psycopg) 신규 | DB 연동 서버 |
| 3 | 기존 `team_solutions_db.json` → DB 이관 스크립트 | `migrate_json_to_db.py` 신규 | 기존 풀이 보존 |
| 4 | 로컬 테스트 (브라우저 2개로 저장→반영 확인) | - | 확인 결과 |
| 5 | Render에 배포 (GitHub 저장소 연결, 환경변수 `DATABASE_URL`, 시작 명령 `python server.py`) | `server.py`가 `PORT` 환경변수와 `0.0.0.0` 사용하도록 | 공개 URL |
| 6 | (승인 시) 실시간 폴링 추가 | `app.js` 추가만 | 실시간 반영 |
| 7 | 팀원 4명 동시 접속 테스트, README_SH.md 최종 보정 | 문서 | 완료 |

### server.py 수정 시 필요한 점
- `PORT = 5173` 고정 → `int(os.environ.get("PORT", 5173))`
- `DATA_FILE` JSON 읽기/쓰기 → DB 읽기/쓰기로 교체 (엔드포인트와 응답 JSON 모양은 유지)
- 정적 파일 서빙은 그대로 (`SimpleHTTPRequestHandler`). 단, 현재는 작업 폴더 전체를 서빙하므로 **`server.py`, `.env`, DB 접속 정보가 URL로 노출되지 않도록** 허용 파일 목록(`index.html, app.js, style.css, questions.js`)만 서빙하게 제한한다.
- `team_solutions_db.json` 직접 접근도 막는다 (데이터는 `/api/sync`로만).

---

## 6. 보안 / 운영

- DB 접속 문자열은 **절대 git에 올리지 않음** → Render 환경변수로만 설정.
- 최소 보호: 팀 공용 암호(환경변수 `TEAM_KEY`)를 API 헤더로 확인하는 방식은 가능하지만 프론트 수정이 필요하므로 **선택 사항**. 기본안은 "주소를 팀에게만 공유".
- CORS `*`는 같은 도메인에서 서빙하므로 배포 버전에서는 제거 가능.
- Render 무료 서버는 15분 무접속 시 잠들고 첫 접속에 약 30~60초 걸림 (데이터는 DB에 있으므로 유실 없음).
- 백업: 필요 시 화면의 "내보내기" 버튼(기존 기능)으로 JSON 다운로드.

## 7. 확정이 필요한 사항
1. 호스팅/DB: Render + Neon(Postgres) 으로 진행해도 되는지 (대안: Firebase만 쓰기)
2. 실시간 반영을 위해 `app.js`에 약 30줄 **추가**해도 되는지
3. `server.py`를 직접 수정할지, 새 파일(`server_db.py`)로 분리하고 기존은 로컬용으로 남길지 (권장: 분리)
4. 팀 암호 보호가 필요한지

## 8. 롤백
- 모든 변경이 `server.py`/신규 파일 + `app.js` 추가분에 한정 → git 되돌리기로 복구 가능.
- 기존 `서버실행.bat` 로컬 방식은 계속 사용 가능하게 유지.
