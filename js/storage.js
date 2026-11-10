import { DEFAULT_CODE, STATE, STORAGE_KEY_SOLUTIONS, isMe } from './config.js';
import { apiFetch } from './auth.js';
import { renderSidebarQuestions, updateProgress } from './navigation.js';
import { setSyncStatus, showToast } from './ui.js';

/* ==========================================================================
   Data Loading & Saving
   - 저장은 항상 "내 칸"에만 한다 (서버도 로그인 토큰의 uid 칸에만 쓴다).
   - 다른 사람의 풀이는 읽기 전용으로 내려받는다.
   ========================================================================== */
const cacheKey = () => `${STORAGE_KEY_SOLUTIONS}_${STATE.me.uid}`;

// 지금 화면에 필요한 사용자들(나 + 보고 있는 사람 + 비교 대상)
export function neededUids(extra = []) {
  const set = new Set([STATE.me.uid, STATE.currentMember, ...STATE.compareUids, ...extra]);
  set.delete(null);
  set.delete(undefined);
  return [...set];
}

// 서버에서 풀이를 받아 STATE.solutions 에 합친다.
// - 이미 받아 둔 사용자들만 필요하면 "마지막 버전 이후 바뀐 칸"만 받는다(증분). 처음이거나 새 사람이 늘었거나
//   서버가 다시 시작됐으면 서버가 알아서 전체를 내려준다.
// - 내가 지금 편집 중인 칸(저장 전 변경)은 덮어쓰지 않는다. 반환값: 바뀐 칸이 있는지.
export async function fetchSolutions(uids = neededUids()) {
  const synced = new Set(STATE.syncedUids);
  const needFull = !STATE.syncVersion || uids.some(u => !synced.has(u));
  let url = `/api/sync?users=${encodeURIComponent(uids.join(","))}`;
  if (!needFull) url += `&since=${encodeURIComponent(STATE.syncVersion)}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`sync failed: ${res.status}`);
  const body = await res.json();

  const cells = body.mode === "delta"
    ? body.cells
    : Object.entries(body.solutions || {}).flatMap(([qId, byUid]) =>
        Object.entries(byUid).map(([uid, code]) => [qId, uid, code, !!(body.passed && body.passed[qId] && body.passed[qId][uid])]));

  let changed = false;
  for (const [qId, uid, code, passed] of cells) {
    if (!STATE.solutions[qId]) STATE.solutions[qId] = {};
    if (!STATE.passed[qId]) STATE.passed[qId] = {};
    const isEditingNow = (Number(qId) === STATE.currentQuestionId && isMe(uid) && STATE.hasUnsavedChanges);
    if (isEditingNow) continue;
    if (code === null) { // 상대가 풀이를 지움(탈퇴 등)
      if (uid in STATE.solutions[qId]) { delete STATE.solutions[qId][uid]; changed = true; }
      if (STATE.passed[qId][uid]) { delete STATE.passed[qId][uid]; changed = true; }
    } else if (typeof code === "string") {
      if (STATE.solutions[qId][uid] !== code) { STATE.solutions[qId][uid] = code; changed = true; }
      if (!!STATE.passed[qId][uid] !== !!passed) {
        if (passed) STATE.passed[qId][uid] = true; else delete STATE.passed[qId][uid];
        changed = true;
      }
    }
  }
  STATE.syncVersion = body.version;
  STATE.syncedUids = [...uids];
  return changed;
}

// 사용자 목록을 새로 받고, 탈퇴해서 사라진 사람은 내 추가 목록/보고 있던 화면에서 정리한다.
// 반환: { pinsChanged, viewReset } — 호출한 쪽이 필요하면 화면을 다시 그린다.
export async function loadUsers() {
  const res = await apiFetch("/api/users");
  if (!res.ok) throw new Error(`users failed: ${res.status}`);
  const body = await res.json();
  STATE.users = body.users;
  STATE.usersRev = body.usersRev;
  const mine = STATE.users.find(u => u.uid === STATE.me.uid);
  if (mine) STATE.me.displayName = mine.displayName;

  const exists = new Set(STATE.users.map(u => u.uid));
  const before = STATE.compareUids.length;
  STATE.compareUids = STATE.compareUids.filter(uid => exists.has(uid));
  STATE.favorites = STATE.favorites.filter(uid => exists.has(uid));
  const viewReset = STATE.currentMember !== STATE.me.uid && !exists.has(STATE.currentMember);
  if (viewReset) STATE.currentMember = STATE.me.uid;
  return { pinsChanged: STATE.compareUids.length !== before, viewReset };
}

export async function loadInitialSolutions() {
  let loaded = false;

  try {
    await loadUsers();
    await fetchSolutions();
    loaded = true;
    setSyncStatus("connected", "서버 연결됨 (실시간 동기화)");
  } catch (err) {
    console.warn("서버 로드 실패:", err);
  }

  // 서버에 닿지 않을 때만 브라우저에 남겨둔 내 풀이로 복원
  if (!loaded) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey()) || "null");
      if (cached && typeof cached === "object") {
        STATE.solutions = cached;
        const cachedPassed = JSON.parse(localStorage.getItem(cacheKey() + "_passed") || "null");
        if (cachedPassed && typeof cachedPassed === "object") STATE.passed = cachedPassed;
        setSyncStatus("connected", "오프라인: 브라우저 저장소에서 불러옴");
      }
    } catch (e) { /* 무시 */ }
  }

  // 빈 칸은 화면에서만 기본 템플릿으로 대체 (내 칸만 채운다)
  STATE.questions.forEach(q => {
    if (!STATE.solutions[q.id]) STATE.solutions[q.id] = {};
    if (!STATE.solutions[q.id][STATE.me.uid]) STATE.solutions[q.id][STATE.me.uid] = DEFAULT_CODE;
  });

  updateProgress();
  updateSaveStatus("saved");
}

// 로컬 저장 (내 풀이만 브라우저에 백업)
export function saveLocal() {
  try {
    const mine = {};
    Object.keys(STATE.solutions).forEach(qId => {
      const code = STATE.solutions[qId] && STATE.solutions[qId][STATE.me.uid];
      if (typeof code === "string") mine[qId] = { [STATE.me.uid]: code };
    });
    localStorage.setItem(cacheKey(), JSON.stringify(mine));
    const minePassed = {};
    Object.keys(STATE.passed).forEach(qId => {
      if (STATE.passed[qId] && STATE.passed[qId][STATE.me.uid]) minePassed[qId] = { [STATE.me.uid]: true };
    });
    localStorage.setItem(cacheKey() + "_passed", JSON.stringify(minePassed));
  } catch (e) { /* 저장소 사용 불가 시 무시 */ }
  updateProgress();
}

/* ==========================================================================
   Unified Save Engine
   ========================================================================== */
// 사용자가 에디터에 타이핑할 때 호출 (내 코드를 보고 있을 때만 의미가 있다)
export function handleEditorChange() {
  if (STATE.isDiffMode) return;
  if (!isMe(STATE.currentMember)) return; // 남의 코드는 수정/저장 대상이 아니다

  const currentCode = STATE.editor.getValue();
  if (!STATE.solutions[STATE.currentQuestionId]) {
    STATE.solutions[STATE.currentQuestionId] = {};
  }

  // 코드가 바뀌면 이전 채점 결과는 더 이상 유효하지 않다 → 다시 채점해서 통과해야 완료로 표시된다
  if (STATE.solutions[STATE.currentQuestionId][STATE.me.uid] !== currentCode) {
    clearPassed(STATE.currentQuestionId);
  }
  STATE.solutions[STATE.currentQuestionId][STATE.me.uid] = currentCode;
  STATE.hasUnsavedChanges = true;
  updateSaveStatus("dirty");

  if (STATE.isAutoSaveEnabled) {
    if (STATE.saveTimer) clearTimeout(STATE.saveTimer);
    STATE.saveTimer = setTimeout(() => {
      executeSave(false);
    }, 800);
  }
}

// 내 풀이의 "예제 통과" 표시를 켜거나 끈다 (서버에는 저장할 때 코드와 함께 보낸다)
export function setPassed(qId, passed) {
  if (!STATE.passed[qId]) STATE.passed[qId] = {};
  if (passed) { STATE.passed[qId][STATE.me.uid] = true; delete STATE.failed[qId]; }
  else delete STATE.passed[qId][STATE.me.uid];
}
// 코드를 고치면 통과/오답 표시를 모두 지운다
const clearPassed = (qId) => { setPassed(qId, false); delete STATE.failed[qId]; };
const isPassed = (qId) => !!(STATE.passed[qId] && STATE.passed[qId][STATE.me.uid]);

// passed 를 생략하면 서버가 코드가 그대로일 때만 기존 통과 표시를 유지한다
async function saveCell(qId, code, reset = false, passed = undefined) {
  const res = await apiFetch("/api/solution", {
    method: "PATCH",
    body: { questionId: Number(qId), code, reset, ...(passed === undefined ? {} : { passed }) }
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).message || msg; } catch (e) { /* 무시 */ }
    throw new Error(msg);
  }
}

// isManual: 수동 저장 여부
// saveAll=true: 내 모든 풀이를 서버에 보냄 (백업 불러오기 직후)
// resetCurrent=true: 현재 문제의 내 풀이를 기본 코드로 되돌려 서버에 반영
export async function executeSave(isManual = false, saveAll = false, resetCurrent = false) {
  if (STATE.saveTimer) clearTimeout(STATE.saveTimer);
  updateSaveStatus("saving");
  saveLocal();

  let ok = false;
  let errorText = "";
  try {
    const mine = (qId) => STATE.solutions[qId] && STATE.solutions[qId][STATE.me.uid];
    if (resetCurrent) {
      clearPassed(STATE.currentQuestionId);
      await saveCell(STATE.currentQuestionId, DEFAULT_CODE, true, false);
    } else if (saveAll) {
      for (const q of STATE.questions) {
        const code = mine(q.id);
        if (typeof code === "string" && code !== DEFAULT_CODE) await saveCell(q.id, code);
      }
    } else {
      // 지금 보고 있는 문제의 내 풀이만 저장 (한 칸 단위 → 다른 사람 칸을 덮어쓸 일이 없다)
      const code = mine(STATE.currentQuestionId);
      if (typeof code === "string") await saveCell(STATE.currentQuestionId, code, false, isPassed(STATE.currentQuestionId));
    }
    ok = true;
  } catch (err) {
    errorText = err.message || String(err);
    console.warn("서버 저장 실패:", err);
  }

  STATE.lastSavedAt = new Date();
  renderSidebarQuestions();

  if (ok) {
    STATE.hasUnsavedChanges = false;
    updateSaveStatus("saved");
    setSyncStatus("connected", `서버에 저장 완료 (${STATE.lastSavedAt.toLocaleTimeString()})`);
    if (isManual) showToast("서버에 저장되었습니다.");
  } else {
    updateSaveStatus("dirty");
    setSyncStatus("loading", `서버 저장 실패: ${errorText} (브라우저에는 임시 저장됨)`);
    showToast(`서버 저장에 실패했습니다: ${errorText}`);
  }
}

// 저장 상태 인디케이터 UI 업데이트
export function updateSaveStatus(status) {
  const tag = document.getElementById("autosave-status");
  if (!tag) return;

  const timeStr = STATE.lastSavedAt ? STATE.lastSavedAt.toLocaleTimeString() : "";

  if (status === "dirty") {
    tag.innerHTML = `<i class="fa-solid fa-circle-dot" style="color: #f59e0b;"></i> <span style="color: #d97706; font-weight: 600;">저장되지 않은 변경사항</span>`;
  } else if (status === "saving") {
    tag.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color: #3b82f6;"></i> <span style="color: #2563eb;">저장 중...</span>`;
  } else if (status === "saved") {
    const modeLabel = STATE.isAutoSaveEnabled ? "자동 저장됨" : "수동 저장됨";
    tag.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> <span style="color: #059669; font-weight: 500;">${modeLabel} ${timeStr ? `(${timeStr})` : ""}</span>`;
  }
}
