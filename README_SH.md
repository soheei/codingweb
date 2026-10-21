# 📘 Coding Masters 서버 배포 쉬운 설명 (팀원용)

## 한 줄 요약
**풀이를 "Firebase(데이터베이스)"에 저장하고, 사이트는 "Render(무료 호스팅)"에 올려서 4명이 같은 주소로 들어와 서로의 풀이를 실시간으로 봐요.**

```
 팀원 4명의 브라우저
        │  (Render 주소 하나)
        ▼
   [Render]  server_db.py  ← 사이트 보여주기 + 저장 담당
        │
        ▼
   [Firebase Realtime Database] ← 풀이 보관 창고
```

| 용어 | 쉬운 뜻 |
|---|---|
| **Render** | 우리 사이트를 인터넷에 24시간 올려주는 곳 (서버) |
| **Firebase** | 풀이를 안전하게 보관하는 구글의 데이터베이스(DB) |
| **배포** | 내 컴퓨터에만 있던 사이트를 인터넷에 올리는 것 |

## 무엇이 바뀌었나요?
- 🆕 `server_db.py` : 배포용 서버 (기존 `server.py`는 **그대로** 두었어요. 내 컴퓨터용으로 계속 사용 가능)
- 🆕 `render.yaml` : Render 설정 파일
- ✏️ `app.js` : 실시간 반영을 위해 **함수 1개를 추가**했어요 (3초마다 새 풀이 확인). 기존 코드는 안 바꿨어요.
- 화면(`index.html`, `style.css`), 문제(`questions.js`)는 그대로예요.

## 이렇게 동작해요
- 코드를 치면 0.8초 뒤 자동 저장 → 서버가 **바뀐 칸만** Firebase에 저장해요.
- 다른 팀원 브라우저는 **3초마다** 확인해서 새 풀이가 있으면 자동으로 화면에 반영해요. (내가 지금 치는 칸은 안 건드려요)
- 서버가 알아서 막아주는 것: 기본 템플릿 코드가 남의 진짜 풀이를 덮어쓰는 것, 오래된 화면 때문에 남의 풀이가 지워지는 것(칸 단위 저장).

---

## 🚀 배포하는 방법 (한 사람이 한 번만 하면 돼요)

### 1단계. Firebase DB 만들기 (약 5분)
1. https://console.firebase.google.com 접속 → **프로젝트 추가** (Google Analytics는 꺼도 돼요)
2. 왼쪽 메뉴 **빌드 → Realtime Database → 데이터베이스 만들기**
3. 위치 선택 후 **테스트 모드로 시작** (읽기/쓰기 허용)
4. 화면 위쪽에 보이는 주소를 복사해요.
   예: `https://내프로젝트-default-rtdb.firebaseio.com`  ← 이게 **FIREBASE_DB_URL**
   (주소 맨 끝에 `/`나 `.json`은 빼요)

> ⚠️ 테스트 모드는 30일 뒤 규칙이 만료돼요. 만료되면 Firebase **규칙** 탭에서 `".read": true, ".write": true`로 다시 바꿔주세요.

### 2단계. Render에 올리기 (약 5분)
1. 이 폴더를 GitHub에 push해요 (`server_db.py`, `render.yaml` 포함).
2. https://render.com 가입 → **New → Blueprint** → 이 GitHub 저장소 선택
   (또는 **New → Web Service**: Runtime `Python`, Build Command 비움, Start Command `python server_db.py`)
3. 환경변수 **`FIREBASE_DB_URL`** 에 1단계에서 복사한 주소를 입력해요.
4. Deploy → 완료되면 `https://codingmasters-xxxx.onrender.com` 같은 주소가 생겨요. **이 주소를 팀원에게 공유!**

### 3단계. 기존 풀이 옮기기 (선택, 한 번만)
기존 `team_solutions_db.json`의 풀이를 올리고 싶다면, 서버가 켜진 뒤 터미널에서:
```
curl -X POST -H "Content-Type: application/json" --data-binary @team_solutions_db.json https://내주소.onrender.com/api/sync
```

### 내 컴퓨터에서 먼저 테스트하고 싶다면
```
python server_db.py
```
→ http://localhost:5173 (환경변수를 안 넣으면 `team_solutions_db.json` 파일로 저장돼요. Firebase로 테스트하려면 `FIREBASE_DB_URL`을 설정하고 실행해요.)

---

## ⚠️ 알아두세요
- 무료 Render는 **15분 동안 아무도 안 쓰면 잠들어요.** 다시 접속하면 처음 30~60초는 느려요. (풀이는 Firebase에 있어서 안 사라져요!)
- 로그인/암호가 없어서 **주소를 아는 사람은 누구나 수정할 수 있어요.** 주소는 팀원끼리만 공유하고, **자기 이름 칸만** 수정해요.
- 화면의 **"Firebase 연동" 버튼은 누르지 마세요.** 서버가 이미 Firebase를 쓰고 있어서 둘이 겹칠 필요가 없어요.
- 저장할 때 기존 코드가 공개 채널(ntfy.sh)로도 전송돼요. (기존 기능이에요. 문제가 되면 말해주세요.)
- 화면의 **내보내기** 버튼으로 풀이를 JSON 파일로 백업할 수 있어요.

자세한 기술 내용은 [plan.md](plan.md)를 보세요.
