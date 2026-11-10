// Application Configuration
export const DEFAULT_CODE = `import sys

a = int(sys.stdin.readline())
b = int(sys.stdin.readline())

print(a + b)
`;

// Firebase 웹 앱 설정 (공개되어도 되는 값. 접근 제어는 서버의 토큰 검증과 DB 규칙이 담당한다)
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAbCZF17Hpwv7_1M6qXGtzWWbhoxMzfZ2M",
  authDomain: "codingmastars.firebaseapp.com",
  projectId: "codingmastars",
  appId: "1:328158401911:web:0d4764885b724512cf7d72"
};
export const FIREBASE_SDK_VERSION = "10.14.1";
// 아이디 방식 가입자는 내부적으로 {아이디}@codingmasters.local 이메일로 등록된다
export const FAKE_EMAIL_DOMAIN = "codingmasters.local";

// 서버(server_db.py) 주소
export const API_BASE = (window.location.protocol.startsWith("http"))
  ? window.location.origin
  : "http://localhost:5173";
export const LOCAL_SERVER_API = `${API_BASE}/api/sync`;

// 줄 끝 공백만 다른 기본 코드도 기본 템플릿으로 취급 (server_db.py 의 _is_template 과 동일 규칙)
const normalizeCode = (s) => s.split("\n").map(l => l.trimEnd()).join("\n").trim();
export const isTemplateCode = (code) => normalizeCode(code) === normalizeCode(DEFAULT_CODE);

export const STORAGE_KEY_SOLUTIONS = "codingmasters_solutions_v6";
export const STORAGE_KEY_VIEW = "codingmasters_view_v2";
export const STORAGE_KEY_COMPARE = "codingmasters_compare_v1";
export const STORAGE_KEY_FAV = "codingmasters_favorites_v1";

export const MIN_COMPARE = 2; // 나 포함 최소 인원
export const MAX_COMPARE = 5; // 나 포함 최대 인원

export const STATE = {
  questions: [],        // 지금은 1차 문제 100개 (2차 문제가 만들어지면 STATE.round 로 구분해 불러온다)
  round: 1,             // 선택된 차수 (1 | 2)
  currentQuestionId: 1,
  me: null,            // { uid, displayName, loginId, tempPassword, provider }
  users: [],           // [{ uid, displayName, loginId, solvedCount }]
  currentMember: null, // 지금 에디터에서 보고 있는 사람의 uid (내 uid 이면 편집 가능, 아니면 읽기 전용)
  compareUids: [],     // 비교 대상(나 제외) uid 목록
  syncVersion: null,   // 마지막으로 반영한 서버 버전 (이후 바뀐 칸만 받아 오는 데 사용)
  syncedUids: [],      // 위 버전까지 변경분을 계속 받고 있는 사용자 uid 들
  usersRev: null,      // 마지막으로 반영한 사용자 목록 버전
  favorites: [],       // 즐겨찾기(별표)한 사람 uid 목록 (선택 목록에서 맨 위에 표시)
  solutions: {},       // { [qId]: { [uid]: code } }
  isDiffMode: false,
  pyodide: null,
  isPyodideReady: false,
  editor: null,
  saveTimer: null,
  isAutoSaveEnabled: false,
  hasUnsavedChanges: false,
  isSyncing: false,
  lastSavedAt: null,
  clientId: "client_" + Math.random().toString(36).substring(2, 9)
};

export const isMe = (uid) => !!STATE.me && uid === STATE.me.uid;
export const isViewingOther = () => !!STATE.me && STATE.currentMember !== STATE.me.uid;
export const nameOf = (uid) => {
  if (STATE.me && uid === STATE.me.uid) return STATE.me.displayName;
  const u = STATE.users.find(x => x.uid === uid);
  return u ? u.displayName : "(알 수 없음)";
};
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// from 항목을 to 항목 자리로 옮긴 새 배열 (뒤로 끌면 대상의 뒤에, 앞으로 끌면 대상의 앞에 놓인다)
export const moveItem = (list, from, to) => {
  const fromIdx = list.indexOf(from);
  const toIdx = list.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
  const rest = list.filter(x => x !== from);
  rest.splice(fromIdx < toIdx ? rest.indexOf(to) + 1 : rest.indexOf(to), 0, from);
  return rest;
};

/* ---------------- 즐겨찾기 (별표) : 사용자별로 브라우저에 기억 ---------------- */
const favKey = () => `${STORAGE_KEY_FAV}_${STATE.me.uid}`;
export function loadFavorites() {
  try { STATE.favorites = (JSON.parse(localStorage.getItem(favKey()) || "[]") || []).filter(x => typeof x === "string"); }
  catch (e) { STATE.favorites = []; }
}
export function toggleFavorite(uid) {
  STATE.favorites = STATE.favorites.includes(uid) ? STATE.favorites.filter(x => x !== uid) : [...STATE.favorites, uid];
  try { localStorage.setItem(favKey(), JSON.stringify(STATE.favorites)); } catch (e) { /* 무시 */ }
}
// 즐겨찾기한 사람이 맨 위, 그 안에서는 이름순
export function sortFavoritesFirst(users) {
  const byName = (a, b) => a.displayName.localeCompare(b.displayName, "ko");
  const fav = users.filter(u => STATE.favorites.includes(u.uid)).sort(byName);
  const rest = users.filter(u => !STATE.favorites.includes(u.uid)).sort(byName);
  return { fav, rest };
}
