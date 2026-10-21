// Application Configuration (김민희, 양소희, 정호준, 차승우 4인 고정)
export const FIXED_MEMBERS = ["김민희", "양소희", "정호준", "차승우"];
export const DEFAULT_CODE = `import sys 

a = int(sys.stdin.readline()) 
b = int(sys.stdin.readline())

print(a + b)
`;

// 동기화 엔드포인트 설정
// 1. 로컬 파이썬 서버 엔드포인트 (server.py 연동)
export const LOCAL_SERVER_API = (window.location.protocol.startsWith("http")) 
  ? `${window.location.origin}/api/sync` 
  : "http://localhost:5173/api/sync";

// 줄 끝 공백만 다른 기본 코드도 기본 템플릿으로 취급 (server_db.py 의 _is_template 과 동일 규칙)
const normalizeCode = (s) => s.split("\n").map(l => l.trimEnd()).join("\n").trim();
export const isTemplateCode = (code) => normalizeCode(code) === normalizeCode(DEFAULT_CODE);

export const STORAGE_KEY_SOLUTIONS = "codingmasters_solutions_v5";
export const STORAGE_KEY_FIREBASE = "codingmasters_firebase_url_v1";

export const STATE = {
  questions: [],
  currentQuestionId: 1,
  currentMember: "김민희",
  members: FIXED_MEMBERS,
  solutions: {}, // { [qId]: { [member]: code } }
  isDiffMode: false,
  pyodide: null,
  isPyodideReady: false,
  editor: null,
  saveTimer: null,
  isAutoSaveEnabled: false,
  hasUnsavedChanges: false,
  isSyncing: false,
  lastSavedAt: null,
  clientId: "client_" + Math.random().toString(36).substring(2, 9),
  firebaseUrl: "", // 배포 서버(server_db.py)가 Firebase를 대신 사용하므로 브라우저 직접 연동은 쓰지 않음
  firebaseEventSource: null
};
