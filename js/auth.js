import { API_BASE, FAKE_EMAIL_DOMAIN, FIREBASE_CONFIG, FIREBASE_SDK_VERSION, STATE } from './config.js';
import { showToast } from './ui.js';

/* ==========================================================================
   Firebase Authentication (이메일(아이디)/비밀번호 + Google)
   - 로그인 상태는 SDK 가 브라우저에 보관하므로 한 번 로그인하면 계속 유지된다.
   - 서버 API 는 모든 요청에 ID 토큰(Authorization: Bearer)을 붙여 호출한다.
   ========================================================================== */
const SDK = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
let fb = null;        // { auth, mod }
let loginResolve = null;

const $ = (id) => document.getElementById(id);

// 입력이 이메일이면 그대로, 아니면 아이디로 보고 내부용 이메일로 바꾼다 (기존 아이디 계정 호환)
const toEmail = (input) => {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? v : `${v}@${FAKE_EMAIL_DOMAIN}`;
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const withTimeout = (promise, ms, label) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} 응답이 ${ms / 1000}초 안에 오지 않았습니다`)), ms))
]);

async function loadSdk() {
  if (fb) return fb;
  const [appMod, authMod] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`)
  ]);
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  const auth = authMod.getAuth(app);
  auth.languageCode = "ko";
  fb = { auth, mod: authMod };
  return fb;
}

/* ---------------------------------------------------------------- API */
export async function apiFetch(path, options = {}) {
  const { auth } = await loadSdk();
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다");
  const token = await user.getIdToken(); // 만료되면 SDK 가 자동 갱신
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  if (res.status === 401) {
    // 토큰이 서버에서 거부됨 (계정 삭제 등) → 로그인 화면으로
    await fb.mod.signOut(auth);
    location.reload();
    throw new Error("로그인이 만료되었습니다");
  }
  return res;
}

async function publicFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  return res.json();
}

async function errMessage(res, fallback) {
  try { return (await res.json()).message || fallback; } catch (e) { return fallback; }
}

/* ---------------------------------------------------------------- 화면 */
function showPanel(name) { // "login" | "profile" | null
  $("auth-splash").style.display = "none";
  $("auth-overlay").style.display = name ? "flex" : "none";
  $("auth-login-card").style.display = name === "login" ? "block" : "none";
  $("auth-profile-card").style.display = name === "profile" ? "block" : "none";
  document.body.classList.toggle("auth-locked", !!name);
}

function setError(msg) {
  const box = $("auth-error");
  box.textContent = msg || "";
  box.style.display = msg ? "block" : "none";
}

function switchTab(t) {
  document.querySelectorAll(".auth-tab").forEach(b => b.classList.toggle("active", b.dataset.t === t));
  $("auth-form-in").style.display = t === "in" ? "block" : "none";
  $("auth-form-up").style.display = t === "up" ? "block" : "none";
  setError("");
}

function authErrorText(e) {
  const code = e && e.code ? e.code : "";
  const map = {
    "auth/invalid-credential": "아이디 또는 비밀번호가 올바르지 않습니다.",
    "auth/wrong-password": "아이디 또는 비밀번호가 올바르지 않습니다.",
    "auth/user-not-found": "아이디 또는 비밀번호가 올바르지 않습니다.",
    "auth/invalid-email": "이메일(또는 아이디) 형식이 올바르지 않습니다.",
    "auth/email-already-in-use": "이미 가입된 이메일입니다. 로그인해 주세요.",
    "auth/weak-password": "비밀번호가 너무 약합니다. 8자 이상으로 입력해 주세요.",
    "auth/too-many-requests": "시도 횟수가 많아 잠시 막혔습니다. 잠시 후 다시 시도해 주세요.",
    "auth/network-request-failed": "네트워크 연결을 확인해 주세요.",
    "auth/popup-closed-by-user": "Google 로그인 창이 닫혔습니다.",
    "auth/cancelled-popup-request": "Google 로그인 창이 닫혔습니다.",
    "auth/popup-blocked": "팝업이 차단되었습니다. 팝업을 허용해 주세요.",
    "auth/requires-recent-login": "보안을 위해 다시 로그인한 뒤 시도해 주세요.",
    "auth/operation-not-allowed": "이 로그인 방법이 Firebase 콘솔에서 꺼져 있습니다."
  };
  return map[code] || (e && e.message) || "오류가 발생했습니다.";
}

/* ---------------------------------------------------------------- 프로필 */
// 로그인된 계정의 서버 프로필을 가져온다. 없으면 null.
async function fetchProfile() {
  const res = await apiFetch("/api/me");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errMessage(res, "프로필을 불러오지 못했습니다"));
  return res.json();
}

async function finishLogin(profile) {
  STATE.me = profile;
  showPanel(null);
  if (loginResolve) { loginResolve(profile); loginResolve = null; }
}

// 로그인 직후: 프로필이 있으면 앱 시작, 없으면 표시 이름 입력 화면
async function afterSignedIn() {
  const profile = await fetchProfile();
  if (profile) return finishLogin(profile);
  const { auth } = await loadSdk();
  const suggested = auth.currentUser?.displayName || "";
  $("auth-profile-name").value = suggested.replace(/[^0-9A-Za-z가-힣_\- ]/g, "").slice(0, 12);
  $("auth-profile-error").textContent = "";
  showPanel("profile");
}

/* ---------------------------------------------------------------- 로그인 흐름 */
function bindAuthUi() {
  document.querySelectorAll(".auth-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.t)));

  const withBusy = (btn, fn) => async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    setError("");
    try { await fn(); } catch (e) { setError(authErrorText(e)); } finally { btn.disabled = false; }
  };

  const loginBtn = $("btn-auth-login");
  const doLogin = withBusy(loginBtn, async () => {
    const id = $("auth-login-id").value.trim().toLowerCase();
    const pw = $("auth-login-pw").value;
    if (!id || !pw) return setError("이메일(또는 아이디)과 비밀번호를 입력해 주세요.");
    const { auth, mod } = await loadSdk();
    await mod.signInWithEmailAndPassword(auth, toEmail(id), pw);
    await afterSignedIn();
  });
  loginBtn.addEventListener("click", doLogin);
  ["auth-login-id", "auth-login-pw"].forEach(id => $(id).addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); }));

  const googleBtn = $("btn-auth-google");
  googleBtn.addEventListener("click", withBusy(googleBtn, async () => {
    const { auth, mod } = await loadSdk();
    await mod.signInWithPopup(auth, new mod.GoogleAuthProvider());
    await afterSignedIn();
  }));

  // 비밀번호 재설정 메일 (실제 이메일로 가입한 계정만 가능)
  $("btn-auth-reset").addEventListener("click", async (e) => {
    e.preventDefault();
    setError("");
    const v = $("auth-login-id").value.trim().toLowerCase();
    if (!v.includes("@")) {
      return setError("이메일을 위 입력칸에 먼저 입력해 주세요. (아이디로 만든 계정은 재설정 메일을 받을 수 없으니 관리자에게 문의하세요.)");
    }
    if (v.endsWith("@" + FAKE_EMAIL_DOMAIN)) return setError("이 계정은 재설정 메일을 받을 수 없습니다. 관리자에게 문의하세요.");
    try {
      const { auth, mod } = await loadSdk();
      await mod.sendPasswordResetEmail(auth, v);
      setError("");
      showToast(`${v} 로 비밀번호 재설정 메일을 보냈습니다. (가입된 이메일이면 도착합니다)`);
    } catch (err) { setError(authErrorText(err)); }
  });

  // 회원가입: 입력 즉시 이메일 형식/이름 중복 확인
  const hint = (id, text, cls) => { const el = $(id); el.textContent = text; el.className = `auth-hint ${cls || ""}`; };
  let checkTimer = null;
  const runCheck = () => {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(async () => {
      const email = $("auth-up-email").value.trim().toLowerCase();
      const name = $("auth-up-name").value.trim();
      if (email) {
        if (!EMAIL_RE.test(email)) hint("hint-up-email", "이메일 형식이 올바르지 않습니다.", "err");
        else if (email.endsWith("@" + FAKE_EMAIL_DOMAIN)) hint("hint-up-email", "사용할 수 없는 이메일입니다.", "err");
        else hint("hint-up-email", "", "");
      }
      if (!name) return;
      try {
        const r = await publicFetch(`/api/check?name=${encodeURIComponent(name)}`);
        if (!r.nameValid) hint("hint-up-name", "2~12자의 한글/영문/숫자/_/-/공백만 쓸 수 있습니다.", "err");
        else if (r.nameTaken) hint("hint-up-name", "이미 사용 중인 표시 이름입니다.", "err");
        else hint("hint-up-name", "사용 가능한 이름입니다.", "ok");
      } catch (e) { /* 서버 일시 오류는 무시 */ }
    }, 300);
  };
  $("auth-up-email").addEventListener("input", runCheck);
  $("auth-up-name").addEventListener("input", runCheck);
  $("auth-up-pw").addEventListener("input", () => {
    const n = $("auth-up-pw").value.length;
    if (!n) hint("hint-up-pw", "8자 이상 입력해 주세요.");
    else if (n < 8) hint("hint-up-pw", "8자 이상 입력해 주세요.", "err");
    else hint("hint-up-pw", "사용 가능한 비밀번호입니다.", "ok");
  });

  const signupBtn = $("btn-auth-signup");
  signupBtn.addEventListener("click", withBusy(signupBtn, async () => {
    const email = $("auth-up-email").value.trim().toLowerCase();
    const name = $("auth-up-name").value.trim();
    const pw = $("auth-up-pw").value;
    if (!EMAIL_RE.test(email) || email.endsWith("@" + FAKE_EMAIL_DOMAIN)) return setError("올바른 이메일 주소를 입력해 주세요.");
    if (pw.length < 8) return setError("비밀번호는 8자 이상이어야 합니다.");
    if (pw !== $("auth-up-pw2").value) return setError("비밀번호 확인이 일치하지 않습니다.");
    const r = await publicFetch(`/api/check?name=${encodeURIComponent(name)}`);
    if (!r.nameValid) return setError("표시 이름은 2~12자의 한글/영문/숫자/_/-/공백만 쓸 수 있습니다.");
    if (r.nameTaken) return setError("이미 사용 중인 표시 이름입니다.");

    const { auth, mod } = await loadSdk();
    await mod.createUserWithEmailAndPassword(auth, email, pw);
    const res = await apiFetch("/api/profile", { method: "POST", body: { displayName: name } });
    if (res.ok) return finishLogin({ ...(await res.json()), tempPassword: false, provider: "password" });
    // 계정은 만들어졌지만 프로필 등록 실패(동시 가입 등) → 이름 입력 화면에서 다시 시도
    await afterSignedIn();
    $("auth-profile-error").textContent = await errMessage(res, "프로필 등록에 실패했습니다. 이름을 다시 입력해 주세요.");
  }));

  // 프로필(표시 이름) 입력 화면: Google 최초 로그인 등
  const profBtn = $("btn-auth-profile");
  profBtn.addEventListener("click", async () => {
    const name = $("auth-profile-name").value.trim();
    $("auth-profile-error").textContent = "";
    profBtn.disabled = true;
    try {
      const res = await apiFetch("/api/profile", { method: "POST", body: { displayName: name } });
      if (!res.ok) { $("auth-profile-error").textContent = await errMessage(res, "등록에 실패했습니다."); return; }
      const { auth } = await loadSdk();
      const providerId = auth.currentUser?.providerData?.[0]?.providerId;
      finishLogin({ ...(await res.json()), tempPassword: false, provider: providerId === "google.com" ? "google.com" : "password" });
    } catch (e) {
      $("auth-profile-error").textContent = authErrorText(e);
    } finally { profBtn.disabled = false; }
  });
  $("btn-auth-profile-logout").addEventListener("click", () => logout());
}

// 앱 시작 시 호출: 로그인된 상태이면 바로 프로필을 돌려주고, 아니면 로그인 화면을 보여 로그인 완료를 기다린다.
export async function requireLogin() {
  const fail = (msg) => {
    $("auth-splash").style.display = "none";
    $("auth-overlay").style.display = "flex";
    $("auth-login-card").style.display = "block";
    $("auth-profile-card").style.display = "none";
    document.body.classList.add("auth-locked");
    setError(msg);
    return new Promise(() => {}); // 앱 시작 중단 (새로고침 필요)
  };

  try {
    bindAuthUi();
  } catch (e) {
    console.error("[auth] UI 연결 실패", e);
    return fail(`화면을 준비하지 못했습니다: ${e.message}`);
  }

  let sdk;
  try {
    sdk = await withTimeout(loadSdk(), 10000, "Firebase 모듈 로드");
    await withTimeout(sdk.auth.authStateReady(), 10000, "저장된 로그인 확인"); // 자동 로그인 복원 대기
  } catch (e) {
    console.error("[auth] Firebase 초기화 실패", e);
    return fail(`Firebase 로그인 모듈을 준비하지 못했습니다. (${e.message}) 인터넷 연결과 광고/추적 차단 확장 프로그램을 확인하고 새로고침해 주세요.`);
  }

  const done = new Promise(resolve => { loginResolve = resolve; });
  if (sdk.auth.currentUser) {
    try {
      await afterSignedIn();
    } catch (e) {
      console.error("[auth] 프로필 확인 실패", e);
      showPanel("login");
      setError(e.message || "로그인 정보를 불러오지 못했습니다.");
    }
  } else {
    switchTab("in");
    showPanel("login");
  }
  return done;
}

export async function logout() {
  const { auth, mod } = await loadSdk();
  await mod.signOut(auth);
  location.reload();
}

/* ---------------------------------------------------------------- 내 정보 설정 */
export function setupAccountUi({ onNameChanged }) {
  const chip = $("user-chip");
  const render = () => {
    $("user-chip-name").textContent = STATE.me.displayName;
    $("user-chip-avatar").textContent = STATE.me.displayName.slice(0, 1);
  };
  render();

  chip.addEventListener("click", (e) => {
    if (e.target.closest(".user-menu")) return;
    chip.classList.toggle("open");
  });
  document.addEventListener("click", (e) => { if (!e.target.closest("#user-chip")) chip.classList.remove("open"); });
  $("btn-logout").addEventListener("click", () => logout());

  const modal = $("settings-modal");
  const close = () => { modal.style.display = "none"; };
  const open = () => {
    $("set-login-id").value = STATE.me.loginId || STATE.me.email || "(Google 계정)";
    $("set-name").value = STATE.me.displayName;
    $("set-name-msg").textContent = "";
    $("set-pw-msg").textContent = "";
    ["set-pw-cur", "set-pw-new", "set-pw-new2"].forEach(id => { $(id).value = ""; });
    $("set-temp-note").style.display = STATE.me.tempPassword ? "block" : "none";
    $("set-pw-section").style.display = STATE.me.provider === "google.com" ? "none" : "block";
    modal.style.display = "flex";
  };
  $("btn-open-settings").addEventListener("click", () => { chip.classList.remove("open"); open(); });
  $("btn-close-settings").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  const say = (id, text, ok) => { const el = $(id); el.textContent = text; el.className = `auth-hint ${ok ? "ok" : "err"}`; };

  $("btn-save-name").addEventListener("click", async () => {
    const name = $("set-name").value.trim();
    if (name === STATE.me.displayName) return say("set-name-msg", "현재 이름과 같습니다.", false);
    try {
      const res = await apiFetch("/api/profile", { method: "PATCH", body: { displayName: name } });
      if (!res.ok) return say("set-name-msg", await errMessage(res, "이름을 변경하지 못했습니다."), false);
      const p = await res.json();
      STATE.me.displayName = p.displayName;
      render();
      say("set-name-msg", "표시 이름이 변경되었습니다.", true);
      onNameChanged?.();
    } catch (e) { say("set-name-msg", authErrorText(e), false); }
  });

  $("btn-change-pw").addEventListener("click", async () => {
    const cur = $("set-pw-cur").value, nw = $("set-pw-new").value;
    if (!cur) return say("set-pw-msg", "현재 비밀번호를 입력해 주세요.", false);
    if (nw.length < 8) return say("set-pw-msg", "새 비밀번호는 8자 이상이어야 합니다.", false);
    if (nw !== $("set-pw-new2").value) return say("set-pw-msg", "새 비밀번호 확인이 일치하지 않습니다.", false);
    try {
      const { auth, mod } = await loadSdk();
      const user = auth.currentUser;
      const cred = mod.EmailAuthProvider.credential(user.email, cur);
      await mod.reauthenticateWithCredential(user, cred);
      await mod.updatePassword(user, nw);
      if (STATE.me.tempPassword) {
        await apiFetch("/api/profile", { method: "PATCH", body: { tempPasswordDone: true } });
        STATE.me.tempPassword = false;
        $("set-temp-note").style.display = "none";
        $("temp-pw-banner").style.display = "none";
      }
      ["set-pw-cur", "set-pw-new", "set-pw-new2"].forEach(id => { $(id).value = ""; });
      say("set-pw-msg", "비밀번호가 변경되었습니다.", true);
      showToast("비밀번호가 변경되었습니다.");
    } catch (e) { say("set-pw-msg", authErrorText(e), false); }
  });

  // 임시 비밀번호 안내 배너
  const banner = $("temp-pw-banner");
  banner.style.display = STATE.me.tempPassword ? "flex" : "none";
  $("btn-temp-pw-open").addEventListener("click", open);
}
