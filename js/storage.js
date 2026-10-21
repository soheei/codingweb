import { DEFAULT_CODE, FIXED_MEMBERS, LOCAL_SERVER_API, STATE, STORAGE_KEY_SOLUTIONS } from './config.js';
import { getFirebaseEndpoint, updateFirebaseButtonState } from './firebase.js';
import { renderSidebarQuestions, updateProgress } from './navigation.js';
import { setSyncStatus, showToast } from './ui.js';

/* ==========================================================================
   Data Loading & Multi-Tier Storage Engine
   ========================================================================== */
export async function loadInitialSolutions() {
  let loaded = false;

  // 1순위: Firebase 클라우드가 설정되어 있다면 Firebase에서 최우선 로드 (GitHub Pages 완전 지원)
  const fbEndpoint = getFirebaseEndpoint();
  if (fbEndpoint) {
    try {
      const fbRes = await fetch(fbEndpoint, { cache: "no-store" });
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        if (fbData && Object.keys(fbData).length > 0) {
          STATE.solutions = fbData;
          localStorage.setItem(STORAGE_KEY_SOLUTIONS, JSON.stringify(fbData));
          loaded = true;
          setSyncStatus("connected", "🔥 Firebase 실시간 클라우드 DB 연결됨 (GitHub Pages 지원)");
          updateFirebaseButtonState(true);
        }
      }
    } catch (err) {
      console.warn("Firebase 로드 실패:", err);
    }
  }

  // 2순위: 로컬 파이썬 서버(team_solutions_db.json)에서 로드 시도
  if (!loaded) {
    try {
      const res = await fetch(LOCAL_SERVER_API, { cache: "no-store" });
      if (res.ok) {
        const serverData = await res.json();
        if (serverData && Object.keys(serverData).length > 0) {
          STATE.solutions = serverData;
          localStorage.setItem(STORAGE_KEY_SOLUTIONS, JSON.stringify(serverData));
          loaded = true;
          setSyncStatus("connected", "로컬 서버 파일(team_solutions_db.json) 연결됨");
        }
      }
    } catch (err) {
      // 로컬 서버가 아직 안 켜져 있거나 오프라인일 때
    }
  }

  // 3순위: 브라우저 localStorage에서 복원
  if (!loaded) {
    const localData = localStorage.getItem(STORAGE_KEY_SOLUTIONS);
    if (localData) {
      try {
        STATE.solutions = JSON.parse(localData);
        loaded = true;
        setSyncStatus("connected", "로컬 브라우저 저장소 로드됨");
      } catch (e) {}
    }
  }

  // 4순위: 기본 템플릿 코드 채우기
  STATE.questions.forEach(q => {
    if (!STATE.solutions[q.id]) STATE.solutions[q.id] = {};
    FIXED_MEMBERS.forEach(m => {
      if (!STATE.solutions[q.id][m]) {
        STATE.solutions[q.id][m] = DEFAULT_CODE;
      }
    });
  });

  updateProgress();
  updateSaveStatus("saved");
}

// 로컬 저장 (localStorage)
export function saveLocal() {
  localStorage.setItem(STORAGE_KEY_SOLUTIONS, JSON.stringify(STATE.solutions));
  updateProgress();
}

/* ==========================================================================
   Unified Save Engine (자동 저장 및 수동 저장 둘 다 완벽 지원)
   ========================================================================== */
// 사용자가 에디터에 타이핑할 때 호출
export function handleEditorChange() {
  if (STATE.isDiffMode) return;
  
  const currentCode = STATE.editor.getValue();
  if (!STATE.solutions[STATE.currentQuestionId]) {
    STATE.solutions[STATE.currentQuestionId] = {};
  }
  
  // 변경사항 반영
  STATE.solutions[STATE.currentQuestionId][STATE.currentMember] = currentCode;
  STATE.hasUnsavedChanges = true;
  updateSaveStatus("dirty");

  // 자동 저장이 켜져 있으면 디바운스 실행 (800ms)
  if (STATE.isAutoSaveEnabled) {
    if (STATE.saveTimer) clearTimeout(STATE.saveTimer);
    STATE.saveTimer = setTimeout(() => {
      executeSave(false);
    }, 800);
  }
}

// 실제 저장 실행 (isManual: 수동 저장 버튼 클릭 여부)
// saveAll=false(기본): 현재 선택된 사람(탭)의 풀이만 서버에 보낸다. (다른 사람 칸을 덮어쓰지 않기 위함)
// resetCurrent=true: 현재 문제/사람의 풀이만 기본 코드로 되돌려 서버에 반영 (서버의 템플릿 덮어쓰기 방지 규칙 우회)
export async function executeSave(isManual = false, saveAll = false, resetCurrent = false) {
  if (STATE.saveTimer) clearTimeout(STATE.saveTimer);
  updateSaveStatus("saving");

  // 1. 브라우저 localStorage 즉시 저장
  saveLocal();

  let firebaseSaved = false;
  let serverSaved = false;

  // 2. Firebase 실시간 클라우드 DB에 영구 저장 (GitHub Pages에서 핵심 동작)
  const fbEndpoint = getFirebaseEndpoint();
  if (fbEndpoint) {
    try {
      const fbRes = await fetch(fbEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(STATE.solutions)
      });
      if (fbRes.ok) {
        firebaseSaved = true;
      }
    } catch (err) {
      console.warn("Firebase 저장 에러:", err);
    }
  }

  // 3. 로컬 파이썬 서버에 영구 파일 저장 시도 (team_solutions_db.json)
  try {
    let serverPayload = STATE.solutions;
    if (resetCurrent) {
      serverPayload = { [STATE.currentQuestionId]: { [STATE.currentMember]: DEFAULT_CODE } };
    } else if (!saveAll) {
      serverPayload = {};
      Object.keys(STATE.solutions).forEach(qId => {
        const code = STATE.solutions[qId] && STATE.solutions[qId][STATE.currentMember];
        if (typeof code === "string") serverPayload[qId] = { [STATE.currentMember]: code };
      });
    }
    // 4인 비교 모드에서는 현재 문제의 모든 사람 칸이 편집될 수 있으므로 함께 보낸다
    if (STATE.isDiffMode && !resetCurrent && !saveAll) {
      serverPayload[STATE.currentQuestionId] = { ...STATE.solutions[STATE.currentQuestionId] };
    }
    const serverRes = await fetch(resetCurrent ? `${LOCAL_SERVER_API}?reset=1` : LOCAL_SERVER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serverPayload)
    });
    if (serverRes.ok) {
      serverSaved = true;
    }
  } catch (err) {
    // 로컬 서버 오프라인인 경우
  }

  STATE.hasUnsavedChanges = false;
  STATE.lastSavedAt = new Date();
  updateSaveStatus("saved");
  renderSidebarQuestions();

  // 상태 메시지 갱신
  let statusMsg = "저장 완료";
  if (firebaseSaved) {
    statusMsg = "🔥 Firebase 클라우드에 영구 저장 완료 (GitHub Pages 동기화)";
  } else if (serverSaved) {
    const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    statusMsg = isLocalHost
      ? "내 컴퓨터 서버(localhost)에 저장 완료 (배포 서버 아님)"
      : "배포 서버(Firebase)에 저장 완료";
  } else {
    statusMsg = "브라우저 로컬 저장소에 안전하게 저장 완료";
  }

  setSyncStatus("connected", `${statusMsg} (${STATE.lastSavedAt.toLocaleTimeString()})`);

  if (isManual) {
    showToast(`✓ [수동 저장 완료] ${statusMsg}!`);
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
