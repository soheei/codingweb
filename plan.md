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


---
---

# 🆕 다중 사용자 확장 계획: 회원가입 · 로그인 · 사용자 선택 비교 (2026-11-10)

> UI 목업: `mockup/auth-compare-mockup.html` (검토용, 실제 동작 아님)
> 위쪽 내용은 4인 고정 구조의 배포 계획이다. 이 섹션은 그 위에 얹는 **추가 계획**이며, 충돌하는 부분은 이 섹션이 우선한다.

## A. 확정된 요구사항

| # | 항목 | 결정 |
|---|---|---|
| 1 | 로그인 | **필수**. 비로그인 둘러보기 없음. **Firebase Authentication 사용**, **누구나 가입 가능** |
| 2 | 가입 항목 | 아이디 / 표시 이름 / 비밀번호 (**이메일 없음**) |
| 3 | 로그인 유지 | 한 번 로그인하면 계속 유지 (Firebase SDK 기본 동작) |
| 4 | 편집 권한 | **내 코드만** 수정·저장. 남의 코드는 읽기 전용 |
| 5 | 단일 에디터 UI | **현재 UI 그대로 유지**. 4개 고정 탭만 `★ 내 코드` + `＋ 다른 사람 코드 보기`로 교체 |
| 6 | 다른 사람 코드 보기 | 읽기 전용, **실행 가능 · "내 코드로 복사" 가능** |
| 7 | 비교하기 | 나 + 1~4명 선택 = **총 2~5명**. 기존 "4인 전체 비교 모드" 대체 |
| 8 | 비교 화면 크기 조절 | 카드 경계선 드래그로 **가로·세로 자유 조절**, 더블클릭 시 균등 복귀, 카드별 최대화/복귀(⤢) |
| 9 | 기존 4명 데이터 | **관리자가 4개 계정을 미리 만들어 기존 풀이를 연결**해 둔다(가입으로 연결하지 않음). 4명은 임시 비밀번호로 로그인 후 설정에서 직접 변경 |
| 10 | 설정 | 사용자가 **내 정보 설정**에서 **표시 이름 변경**, **비밀번호 변경** 가능 |
| 11 | 로그인 방법 | 이메일(아이디)/비밀번호 + **Google 로그인**(Firebase 콘솔에 둘 다 사용 설정 완료) |

## B. 인증 방식 (결정: **Firebase Authentication** + 서버가 토큰 검증)

> 2026-11-10 변경: 초기안(서버 직접 구현)을 폐기하고 Firebase Auth로 확정.

```
브라우저 ──(Firebase Auth SDK)──▶ 로그인/가입/로그아웃/자동 로그인
   │  ID 토큰(JWT)을 Authorization: Bearer 로 전송
   ▼
server_db.py ──토큰 검증(google-auth, 이미 requirements에 있음)──▶ uid 확보 ──▶ Firebase RTDB(서비스 계정)
```

- **로그인/가입/로그아웃**: 브라우저의 Firebase Auth SDK(Email/Password 방식)가 처리. 비밀번호 해시·실패 횟수 제한은 Firebase가 담당 → 직접 구현 불필요.
- **로그인 유지**: SDK 기본 동작이 `browserLocalPersistence`(IndexedDB)라 한 번 로그인하면 브라우저를 껐다 켜도 유지된다. 토큰 갱신도 SDK가 자동 처리. 로그아웃을 누르기 전까지 계속 로그인 상태.
- **아이디 방식 유지**: 사용자는 "아이디 + 비밀번호"만 입력하고, 내부적으로 `{loginId}@codingmasters.local` 형태의 가짜 이메일로 Firebase에 등록한다. (이메일을 받지 않는 현재 UI 유지)
  - 단점: 가짜 이메일이라 **"비밀번호 찾기 메일"은 못 쓴다.** 분실 시 Firebase 콘솔(Authentication → Users)에서 관리자가 비밀번호 재설정/계정 삭제. 스터디 규모에서는 감수 가능.
  - 대안(원하면 변경 가능): 진짜 이메일로 가입하게 하면 Firebase가 재설정 메일까지 자동 발송.
- **Google 로그인**: 콘솔에 이미 사용 설정됨. 로그인 화면에 "Google로 계속하기" 버튼을 추가(`signInWithPopup`). 최초 Google 로그인 시 표시 이름을 한 번 입력받아 프로필을 만든다. (진짜 이메일이므로 Google 계정은 비밀번호 분실 걱정 없음)
- **비밀번호 변경**: 서버 개입 없이 클라이언트에서 처리 — `reauthenticateWithCredential`(현재 비밀번호 확인) 후 `updatePassword`. Google 계정은 해당 메뉴 숨김.
- **가입 개방**: **누구나 가입 가능**(가입 코드/인원 제한 없음). 남용이 걱정되면 나중에 Firebase 콘솔 설정이나 가입 코드로 막을 수 있게 구조만 열어 둔다.
- **서버 검증**: 쓰기/읽기 API는 `Authorization: Bearer <ID 토큰>`을 `google.oauth2.id_token.verify_firebase_token`으로 검증해 **uid를 얻는다.** 클라이언트가 보낸 uid·이름은 쓰지 않으므로 남의 코드는 서버에서 수정 불가.
- **RTDB 규칙은 계속 전체 차단**(`database.rules.json` 변경 없음). 브라우저가 DB에 직접 접근하지 않고 서버(서비스 계정)만 접근하는 현재 구조를 그대로 유지한다.
- **필요한 설정(1회)**: Firebase 콘솔에서 Authentication 시작 → Email/Password 사용 설정 → 웹 앱 등록해서 `apiKey`, `authDomain`, `projectId` 확보(공개되어도 되는 값, `js/config.js`에 기입). 서버는 `FIREBASE_PROJECT_ID` 환경변수 추가.

## C. 데이터 모델 (Firebase RTDB)

```
users/{uid}               = { loginId, displayName, createdAt, legacyName: "양소희" | null }
loginIndex/{loginId}      = uid            # 아이디 중복 확인용 (Auth가 이메일 중복은 막지만 조회 편의)
nameIndex/{displayName_lower} = uid        # 표시 이름 중복 방지 + 기존 4명 연결 판단
solutions/{문제번호}/{uid}  = 코드          # 신규 저장 위치 (uid는 Firebase Auth uid)
codingmasters_solutions/…  = (기존 데이터, 이름 키) # 마이그레이션 후 읽기 전용 보관
```

- 비밀번호·세션 정보는 DB에 저장하지 않는다(Firebase Auth가 보관).
- uid는 Firebase가 발급하는 불변 ID → 표시 이름을 바꿔도 풀이 유지.

## D. 기존 4명 계정: 관리자 사전 생성 (결정)

가입 시 자동 연결 방식은 폐기. 이름 선점 위험이 구조적으로 사라진다.

**1회성 스크립트 `tools/create_legacy_users.py`** (서비스 계정으로 실행, 배포 코드와 분리):
1. 4명(김민희/양소희/정호준/차승우) 각각 Firebase Auth 사용자 생성 — 이메일 `{loginId}@codingmasters.local`, **임시 비밀번호는 무작위 생성해 콘솔에 출력**(관리자가 각자에게 전달).
2. `users/{uid}` = `{loginId, displayName: 이름, legacyName: 이름, createdAt}` 기록, `nameIndex`·`loginIndex` 등록 → 같은 이름·아이디로 신규 가입 불가.
3. `codingmasters_solutions/{문제번호}/{이름}` → `solutions/{문제번호}/{uid}` 복사(원본은 삭제하지 않고 보관 → 롤백 가능).
4. 멱등(재실행해도 중복 생성 안 함, 이미 있으면 건너뜀). 실행 전 `--dry-run`으로 대상/건수 확인.

**4명의 첫 로그인**: 임시 비밀번호로 로그인 → 상단에 "임시 비밀번호입니다. 설정에서 변경해 주세요" 배너(`users/{uid}.tempPassword = true`, 변경 완료 시 서버가 해제) → 내 정보 설정에서 비밀번호 변경.

**아이디(loginId) 정하기**: 아래는 제안이며 스크립트 실행 전 확정 필요 — 김민희 `minhee`, 양소희 `sohee`, 정호준 `hojun`, 차승우 `seungwoo`. (로그인 후 표시 이름은 자유롭게 변경 가능)

## E. API 변경 (server_db.py)

로그인/가입/로그아웃은 Firebase SDK가 처리하므로 **서버에 인증 엔드포인트가 필요 없다.** 서버는 토큰 검증 후 데이터만 다룬다.

| 엔드포인트 | 설명 | 인증 |
|---|---|---|
| `POST /api/profile` | 신규 가입/최초 Google 로그인 직후 프로필(표시 이름) 생성. 이미 있으면 거부 | ID 토큰 |
| `PATCH /api/profile` | **표시 이름 변경**(2~12자, 중복 불가, `nameIndex` 갱신). 비밀번호 변경 완료 시 `tempPassword` 해제도 여기서 처리 | ID 토큰 |
| `GET  /api/me` | 내 프로필 `{uid, loginId, displayName}` | ID 토큰 |
| `GET  /api/check?loginId=&name=` | 아이디/표시 이름 중복 확인(입력 즉시 안내) | 불필요 |
| `GET  /api/users` | 사용자 목록 `[{uid, displayName, loginId, solvedCount}]` (비교 선택/검색용) | ID 토큰 |
| `GET  /api/sync?users=uidA,uidB` | 지정한 사용자들의 풀이 + 내 풀이 (전체 덮어쓰기 구조 폐지) | ID 토큰 |
| `PATCH /api/solution` | `{questionId, code}` → **토큰의 uid 칸에만** 저장 | ID 토큰 |

- 기존 `POST /api/sync`(전체 400칸 통째 전송)는 제거. 위쪽 문제점 A(전체 덮어쓰기)도 함께 해소된다.
- 입력 검증: 문제 번호 1~100, 코드 길이 `MAX_CODE_LEN`, loginId `^[a-z0-9_]{4,20}$`, 비밀번호 6자 이상(Firebase 최소값; UI는 8자 권장), 표시 이름 2~12자.
- 표시 이름 변경은 `nameIndex` 이전 이름 삭제 + 새 이름 등록을 한 번의 멀티패스 업데이트로 처리하고, 새 이름이 이미 있으면 거부(동시 요청 경합은 RTDB 조건부 쓰기로 방지).
- 가입 직후 `/api/profile` 호출이 실패하면(네트워크 등) 다음 로그인 때 프로필이 없는 계정을 감지해 이름 입력을 다시 요청한다.

## F. 프런트엔드 변경

현재 상태 기준(하드코딩 위치): `js/config.js`의 `FIXED_MEMBERS`·`currentMember`, `js/questions.js:128-131`, `index.html:46,253`, `server_db.py:40`.

| 파일 | 변경 |
|---|---|
| `index.html` | 로그인/회원가입 화면(전체 화면 오버레이, Google 버튼 포함) 추가, 헤더 우측 사용자 칩(내 정보 설정·로그아웃), 내 정보 설정 모달(표시 이름 변경·비밀번호 변경), 임시 비밀번호 안내 배너, 부제목에서 4명 이름 제거, "4인 전체 비교" → "비교하기", 비교 대상 선택 모달 |
| `js/auth.js` (신규) | Firebase Auth SDK(CDN, 모듈 방식) 초기화, `createUserWithEmailAndPassword` / `signInWithEmailAndPassword` / `signOut`, `onAuthStateChanged`로 자동 로그인 판단(로그인 상태면 바로 앱, 아니면 로그인 화면). 모든 API 호출에 `Authorization: Bearer <ID 토큰>` 헤더 부착(`getIdToken()`이 만료 시 자동 갱신) |
| `js/config.js` | Firebase 웹 설정값(`apiKey`, `authDomain`, `projectId`) 추가, `FIXED_MEMBERS` 제거 → `STATE.me`, `STATE.users`, `STATE.viewingUid`(null=내 코드), `STATE.compareUids`(선택 목록) |
| `js/navigation.js` | `renderMemberTabs` → `★ 내 코드` + `＋ 다른 사람 코드 보기` 드롭다운. 다른 사람 선택 시 CodeMirror `readOnly: true` + 읽기 전용 배지/배너, 저장 버튼 대신 "내 코드로 복사" |
| `js/storage.js` · `js/sync.js` · `js/firebase.js` | 이름 키 → uid 키. 저장은 `PATCH /api/solution`(내 칸만), 읽기는 `GET /api/sync?users=…`. 폴링은 내가 선택/보는 사용자만 대상. 브라우저 직접 Firebase SSE는 이미 규칙상 불가하므로 정리 |
| `js/questions.js` | 문제 생성 시 4명 기본 코드 채우기 제거 (빈 칸은 `DEFAULT_CODE`로 화면에서만 대체) |
| `js/compare.js` · `css/compare.css` | 고정 4분할 → **N(2~5)분할 + 크기 조절**(아래 G), 선택 모달, 내 카드만 편집 가능 |
| `js/notebook.js` | 내보내기 대상 선택 목록을 사용자 목록 기반으로 변경 (기본: 나) |

로그인 화면은 앱 로드 직후 `me` 응답 전까지 빈 화면(스플래시)을 보여 로그인 폼이 깜빡이지 않게 한다.

## G. 비교하기 상세 (목업 기준)

- **선택 모달**: 검색 + 체크박스 목록, 나는 항상 포함(해제 불가), 선택 4명 도달 시 나머지 비활성(총 5명 상한), 총 2명 미만이면 "비교 시작" 비활성, "기존 팀원 전체" 프리셋(가입된 경우만).
- **선택 기억**: 마지막 선택을 `localStorage`에 저장(사용자별 키), 없는 사용자는 자동 제외.
- **레이아웃**: 인원별 기본 분할 2→2×1, 3→3×1, 4→2×2, 5→3열×2행(5번째 카드는 2칸 차지).
- **크기 조절**: CSS Grid의 `fr` 값을 배열로 관리. 카드 사이 경계선(8px 핸들)을 Pointer Events로 드래그 → 인접한 두 열/행의 `fr`를 서로 주고받음(최소 0.25fr). 더블클릭 시 균등 복귀. 창 크기 변경 시 핸들 위치 재계산. 이미 있는 `js/resizer.js`(열 폭 조절)의 방식과 맞춰 재사용 가능한 부분은 공통화.
- **카드 최대화**: ⤢ 버튼으로 해당 카드만 전체 영역에 표시, 다시 누르면 복귀. 크기 비율은 복귀 시 유지.
- **권한**: 내 카드만 CodeMirror 편집 가능, 나머지는 `readOnly`. 실행(▶)·복사(📋)는 전체 카드 가능. 좁은 화면(≤820px)에서는 세로 1열, 핸들 숨김.

## H. 작업 순서

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 0 | Firebase 콘솔: Authentication(Email/Password) 활성화, 웹 앱 등록, 설정값 확보 | 콘솔에서 테스트 사용자 생성 가능 |
| 1 | 서버: ID 토큰 검증 모듈, `/api/profile`, `/api/me`, `/api/check` | 유효 토큰 200, 없는/만료/위조 토큰 401 |
| 2 | 서버: `PATCH /api/solution`, `GET /api/sync?users=`, `GET /api/users`, 권한 검사 | 남의 uid로 쓰기 시도해도 내 칸만 바뀜/거부 |
| 3 | `tools/create_legacy_users.py`(dry-run → 실행) + 기존 `/api/sync` POST 제거 | 4개 계정으로 임시 비밀번호 로그인 시 각자 기존 풀이가 그대로 보임 |
| 4 | 프런트: `auth.js`(Firebase SDK) + 로그인/가입 화면 + 사용자 칩 + 자동 로그인 | 새로고침·브라우저 재시작 후에도 로그인 유지 |
| 4-1 | 프런트: 내 정보 설정(표시 이름·비밀번호 변경), Google 로그인 | 이름 변경이 비교/목록에 즉시 반영, 비밀번호 변경 후 재로그인 가능 |
| 5 | 프런트: 단일 에디터 탭 교체(내 코드/다른 사람 보기, 읽기 전용, 복사) — 나머지 UI 불변 | 기존 화면과 동일, 남의 코드 편집 불가 |
| 6 | 프런트: 비교하기(선택 모달, N분할, 크기 조절, 최대화) | 2·3·4·5명 모두 동작, 드래그/더블클릭 확인 |
| 7 | 노트북 내보내기·진행률·폴링을 uid 기반으로 수정 | 기존 기능 회귀 없음 |
| 8 | Render 배포(환경변수 `FIREBASE_PROJECT_ID` 추가), 기존 4명에게 아이디/임시 비밀번호 전달, 실사용 점검 | 4명 + 신규 1명 동시 접속 테스트 |

각 단계는 별도 커밋. 1~3단계는 `server_db.py`만, 로컬 `server.py`는 건드리지 않는다(로컬용 유지).

## I. 검증 체크리스트

- [ ] 가입: 중복 아이디/표시 이름 거부, 비밀번호 최소 길이 미만 거부, 누구나 가입 가능
- [ ] 브라우저를 껐다 켜도 자동 로그인, 로그아웃 후에는 로그인 화면, 사이트 데이터 삭제 시에만 풀림
- [ ] 다른 uid로 `PATCH /api/solution` 불가 (서버 레벨), 토큰 없이/위조 토큰으로 모든 API 401
- [ ] 사전 생성된 4개 계정: 풀이 100문제 그대로 연결, 같은 이름/아이디로 신규 가입 거부
- [ ] 표시 이름 변경 후 중복 이름 거부, 변경한 이름이 목록·비교 카드에 반영
- [ ] 비밀번호 변경(현재 비밀번호 틀리면 거부), 변경 후 임시 비밀번호 배너 사라짐
- [ ] Google 로그인: 최초 1회 표시 이름 입력 후 정상 사용
- [ ] 다른 사람 코드: 편집 불가·실행 가능·복사 가능, 내 코드 복사 시 내 칸에만 반영
- [ ] 비교: 1명만 선택 시 시작 불가, 5명 초과 선택 불가, 경계선 드래그/더블클릭/최대화 동작
- [ ] 동시 편집: A가 오래된 화면에서 저장해도 B의 칸이 사라지지 않음(칸 단위 저장)
- [ ] 모바일 폭(≤820px) 레이아웃

## J. 롤백

- 기존 데이터(`codingmasters_solutions`)는 삭제하지 않고 유지 → 문제가 생기면 이전 커밋의 `server_db.py`/프런트로 되돌리면 이전 상태 복귀.
- 새 데이터(`users`, `solutions` 등)는 별도 노드라 삭제만 하면 초기화 가능. Firebase Auth 사용자는 콘솔에서 삭제.

## K. 결정 사항 / 남은 확인

- ✅ 가입 범위: 누구나 가입 가능
- ✅ 인증: Firebase Authentication (이메일/비밀번호 + Google, 콘솔 설정 완료)
- ✅ 기존 4명: 관리자가 계정 사전 생성, 비밀번호는 본인이 설정에서 변경
- ✅ 표시 이름 변경 허용
- ⏳ 4명의 아이디(loginId) 확정 — D 섹션 제안(`minhee/sohee/hojun/seungwoo`) 그대로 괜찮은지
- ⏳ 일반 가입 시 이메일 방식: 현재는 아이디(가짜 이메일). 이 경우 일반 가입자의 비밀번호 분실은 관리자 초기화(Google 로그인 사용자는 해당 없음)


---

## L. 구현 현황 (2026-11-10)

| 단계 | 상태 | 비고 |
|---|---|---|
| 서버 토큰 검증 · 프로필/사용자/동기화/저장 API (`server_db.py`) | ✅ 완료·테스트 | 로컬 모드(`DEV_AUTH_BYPASS=1`, 가짜 토큰)로 API 검증: 무토큰/위조 토큰 401, 남의 uid 지정해도 내 칸만 저장, 이름 중복·변경 |
| 프런트: 로그인/가입/Google/자동 로그인, 사용자 칩, 내 정보 설정(이름·비밀번호) | ✅ 완료 | 로그인 화면은 실제 Firebase SDK로 확인. 로그인 후 화면은 가짜 로그인 모듈로 확인(실계정 로그인은 미확인) |
| 단일 에디터: 내 코드 / 다른 사람 보기(읽기 전용, 실행, 내 코드로 복사) | ✅ 완료·브라우저 검증 | 기존 레이아웃 유지 |
| 비교하기: 2~5명 선택, 경계선 드래그 크기 조절, 더블클릭 균등, 카드 최대화, 칩 제외 | ✅ 완료·브라우저 검증 | |
| 기존 4명 계정 생성 스크립트 `tools/create_legacy_users.py` | ✅ 작성 (실행 전) | 실제 DB/Auth 에는 아직 실행하지 않음. 순수 로직만 단위 확인. 먼저 `--dry-run` |
| Render 배포, 4명에게 임시 비밀번호 전달 | ⏳ 사용자 작업 | 아래 설정 목록 참고 |

### 설정해야 할 값 목록
| 값 | 어디서 얻나 | 어디에 넣나 |
|---|---|---|
| Firebase 웹 설정(`apiKey`, `authDomain`, `projectId`, `appId`) | 콘솔 > 프로젝트 설정 > 일반 > 내 앱 | **이미 `js/config.js`에 반영됨** (공개 값) |
| 서비스 계정 키 JSON (재발급 후) | 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 | Render 환경변수 `FIREBASE_SERVICE_ACCOUNT_JSON` (한 줄) / 로컬 `.env` / 계정 생성 스크립트 `--key-file` |
| 이전 서비스 계정 키 삭제 | Google Cloud 콘솔 > IAM > 서비스 계정 > 키 | 삭제만 (노출됐으므로 필수) |
| `FIREBASE_DB_URL` = `https://codingmastars-default-rtdb.firebaseio.com` | 콘솔 > Realtime Database | Render 환경변수 |
| `FIREBASE_PROJECT_ID` = `codingmastars` | 콘솔 > 프로젝트 설정 | `render.yaml`에 반영됨 (코드 기본값도 동일) |
| 승인된 도메인 (Render 주소) | — | 콘솔 > Authentication > 설정 > 승인된 도메인 (Google 로그인에 필요) |
| `DEV_AUTH_BYPASS` | — | **배포에서는 절대 설정하지 않는다** (로컬 테스트 전용) |

### 추가 반영 (2026-11-10, 2차)
- 회원가입: 이메일 방식으로 변경(로그인은 이메일 또는 기존 아이디 모두 가능), 이메일 계정은 "비밀번호를 잊으셨나요?"로 재설정 메일 발송. 기존 아이디 계정은 계속 관리자 초기화.
- 입력값/실행결과 패널: 가운데 회색 막대를 위아래로 드래그해 높이 조절(더블클릭 초기화, 새로고침 후 유지).
- "다른 사람 추가": 추가한 사람은 탭으로 남고(× 로 삭제, 드래그로 순서 이동) 새로고침해도 유지. 비교하기와 같은 목록을 공유.
- 비교 화면: 카드 머리글을 끌어 순서 이동, 카드 크기 비율 새로고침 후 유지.

### 추가 반영 (2026-11-10, 3차)
- 회원 탈퇴: 설정 > 회원 탈퇴 (비밀번호 재확인 / Google 은 재로그인 팝업). 서버가 프로필·이름/아이디 색인·풀이를 삭제(`DELETE /api/profile`)하고 브라우저가 로그인 계정을 삭제. 사용자 목록·검색에서 즉시 제외되고, 다른 사용자의 추가 목록/보고 있던 화면은 3초 내 자동 정리. 이름·아이디는 다시 사용 가능.

### 추가 반영 (2026-11-10, 4차)
- **읽기 전용 안내 배너 삭제**: 다른 사람 코드를 볼 때 뜨던 "○○님의 코드입니다…" 줄을 제거(`index.html`). 수정 잠금·실행·복사 동작은 그대로. (비교 카드의 "읽기 전용" 배지는 유지)
- **내 정보 설정: 아이디 / 이메일 분리** (Google 계정은 해당 칸 숨김)
  - 아이디: 단독으로 변경(`PATCH /api/profile {loginId}`, 영문 소문자/숫자/_ 4~20자, 중복 불가, `loginIndex` 갱신). 이메일 가입자도 아이디 설정 가능.
  - 이메일: 현재 비밀번호 재확인 후 `verifyBeforeUpdateEmail` 로 새 이메일에 인증 메일 발송 → 링크 클릭 시 로그인 이메일이 바뀜(이후 재로그인 필요). 서버는 `/api/me` 때 `users/{uid}/authEmail` 을 동기화.
- **아이디 로그인을 서버가 대신 처리** (이메일 주소가 브라우저에 노출되지 않도록)
  - `POST /api/login {id, password}`: 서버가 Firebase REST(`signInWithPassword`)로 비밀번호 확인 → 서비스 계정으로 서명한 **커스텀 토큰** 반환 → 브라우저 `signInWithCustomToken`. 같은 IP+아이디 10분 내 8회 실패 시 429.
  - `POST /api/password-reset {id}`: 등록된 이메일이 있으면 서버가 재설정 메일 발송(`sendOobCode`). 계정/이메일 유무와 무관하게 항상 같은 응답.
  - 이메일 입력(`@` 포함)은 기존대로 Firebase 직접 로그인/재설정. 이메일을 노출하던 `/api/resolve-login` 은 만들었다가 삭제.
  - 필요: 서버에 `FIREBASE_SERVICE_ACCOUNT_JSON`(토큰 서명) — 없으면 아이디 로그인 불가(503). 웹 API 키는 `FIREBASE_WEB_API_KEY` 또는 `js/config.js` 값 사용. 서비스 계정 권한 범위에 `cloud-platform` 추가(Auth 이메일 조회용). **서버 재배포 필요.**
  - 아이디 로그인 세션은 provider 가 `custom` 으로 보이므로, 서버의 아이디 변경 검사는 Google 만 차단하도록 함.
  - 미확인: 실계정으로 아이디 로그인 / 이메일 인증 변경 / 재설정 메일 end-to-end 시험은 아직 안 함(문법·토큰 서명만 확인).
- **문제 목록 차수 선택(1차/2차) 버튼 추가**
  - 사이드바 필터 줄에 `1차 | 2차` 토글, 드롭다운이 좁은 폭에서 잘리던 문제 수정(`min-width:0`).
  - 현재 1~100번 = **1차 코딩마스터스**. 2차를 누르면 "2차 문제는 준비 중입니다." / 완료율 `0 / 0`. 선택값은 `STATE.round`(`js/config.js`).
  - **2차 문제 생성 시 해야 할 일**: ① `renderSidebarQuestions`/`updateProgress`(`js/navigation.js`)의 `STATE.round !== 1` 분기에서 2차 문제 목록(1~100번)을 불러오도록 교체 ② **풀이 저장 경로에 차수 포함**(현재 `solutions/{문제번호}/{uid}` 는 차수 구분이 없어 2차 1번이 1차 1번 칸을 덮어씀 → 예: `solutions/r{차수}/{번호}/{uid}` 또는 `solutions2/...`, 기존 1차 데이터 마이그레이션/호환 필요) ③ 문제 데이터(`questions`)·샘플 입력·`/api/sync`·`/api/solution`·비교/사용자 목록의 완료 수(`solvedCount`)를 차수별로 계산 ④ 선택 차수를 새로고침 후에도 유지할지 결정.
- **남은 확인(원래 문제)**: 민희/호준/승우 로그인 불가 — `python tools/create_legacy_users.py --key-file 다운로드한키.json --check minhee,sohee,hojun,seungwoo` 결과 대기. 계정 없으면 `--dry-run` 없이 실행, 비밀번호 모르면 `--reset-password`. (비밀번호는 스크립트가 무작위로 만든 임시 비밀번호이며 사용자가 정하는 값이 아님)

### 추가 반영 (2026-11-10, 5차) — 접속 인원 늘어도 버티도록 동기화 방식 개선
- **서버 메모리 캐시**: 풀이 전체/사용자 목록을 메모리에 두고 읽기(`/api/sync`, `/api/users`)는 Firebase 를 거치지 않음. 저장·가입·이름변경·탈퇴 때 캐시도 같이 갱신. `CACHE_REFRESH_SECS`(기본 60초)마다 백그라운드로 Firebase 와 대조해, 콘솔/스크립트로 직접 바꾼 DB 도 `/api/version` 폴링만으로 퍼짐. 서버가 1대일 때를 전제로 함(여러 대로 늘리면 캐시 방식 재검토 필요).
- **푼 문제 수**: DB 에 저장하지 않고 메모리에서 저장 때마다 증감(캐시 최초 로드 때 기존 데이터로 한 번 계산).
- **증분 동기화**: `/api/sync?users=..&since=버전` → 그 이후 바뀐 칸만(`mode: delta`). 서버 재시작/접두사 불일치/로그 범위 초과/새 사람 추가 시 자동으로 전체(`mode: full`). 삭제는 코드 `null` 로 전달. `/api/version` 은 `usersRev` 도 돌려주고, 사용자 목록은 이 값이 바뀔 때만 다시 받음.
- **접속 몰림 대비**: 서버 listen backlog 5 → 128 (30명이 동시에 접속하면 1초 지연되던 문제 해결).
- 점검용: 환경변수 `DEBUG_STATS=1` 일 때만 `/api/stats`(DB 읽기/쓰기 횟수) 열림. 배포에서는 켜지 않는다.
- 로컬 측정(파일 DB 모드, 동시 30명, 저장 6회): Firebase 읽기 2회, 응답 중앙값 14ms / p95 23ms. (이전 방식은 저장 1회마다 접속자 전원이 풀이 전체를 2번씩 읽었음)
