import { renderQuadDiffView } from './compare.js';
import { FIXED_MEMBERS, STATE, STORAGE_KEY_FIREBASE } from './config.js';
import { loadCurrentMemberCode, renderSidebarQuestions, updateProgress } from './navigation.js';
import { executeSave, saveLocal } from './storage.js';
import { setSyncStatus, showToast } from './ui.js';

export function getFirebaseEndpoint() {
  if (!STATE.firebaseUrl) return null;
  let url = STATE.firebaseUrl.trim();
  if (url.endsWith("/")) url = url.slice(0, -1);
  if (!url.endsWith(".json")) {
    url += "/codingmasters_solutions.json";
  }
  return url;
}

/* ==========================================================================
   Firebase Realtime Database Setup & Streaming
   ========================================================================== */
export function updateFirebaseButtonState(isConnected) {
  const btn = document.getElementById("btn-open-firebase-modal");
  const label = document.getElementById("firebase-btn-label");
  if (!btn || !label) return;
  if (isConnected) {
    btn.classList.add("connected");
    label.innerHTML = `<i class="fa-solid fa-check"></i> Firebase 연동됨`;
  } else {
    btn.classList.remove("connected");
    label.textContent = "Firebase 연동";
  }
}

// Firebase SSE 실시간 변경 감지 스트림
export function initFirebaseRealtimeSync() {
  const fbEndpoint = getFirebaseEndpoint();
  if (!fbEndpoint) return;

  try {
    if (STATE.firebaseEventSource) {
      STATE.firebaseEventSource.close();
    }

    const fbSSE = new EventSource(fbEndpoint);
    STATE.firebaseEventSource = fbSSE;

    fbSSE.addEventListener("put", (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed && parsed.data) {
          const newData = parsed.data;
          let hasChange = false;
          Object.keys(newData).forEach(qId => {
            if (!STATE.solutions[qId]) STATE.solutions[qId] = {};
            FIXED_MEMBERS.forEach(m => {
              const isCurrent = (Number(qId) === STATE.currentQuestionId && m === STATE.currentMember && STATE.hasUnsavedChanges);
              if (!isCurrent && newData[qId] && newData[qId][m] && newData[qId][m] !== STATE.solutions[qId][m]) {
                STATE.solutions[qId][m] = newData[qId][m];
                hasChange = true;
              }
            });
          });
          if (hasChange) {
            saveLocal();
            if (STATE.isDiffMode) renderQuadDiffView();
            else loadCurrentMemberCode();
            renderSidebarQuestions();
            updateProgress();
            showToast("🔥 [Firebase] 다른 컴퓨터의 풀이가 실시간 동기화되었습니다!");
          }
        }
      } catch (err) {}
    });

    fbSSE.onerror = () => {
      // 자동 재연결
    };
  } catch (err) {
    console.warn("Firebase SSE 에러:", err);
  }
}

// Firebase 설정 모달 제어
export function setupFirebaseModal() {
  const modal = document.getElementById("firebase-modal");
  const openBtn = document.getElementById("btn-open-firebase-modal");
  const closeBtn = document.getElementById("btn-close-firebase-modal");
  const input = document.getElementById("firebase-url-input");
  const saveBtn = document.getElementById("btn-save-firebase-url");
  const disconnectBtn = document.getElementById("btn-disconnect-firebase");
  const hint = document.getElementById("firebase-status-hint");

  if (!modal) return;

  // 기저장된 Firebase URL이 있으면 자동 반영
  if (STATE.firebaseUrl) {
    input.value = STATE.firebaseUrl;
    updateFirebaseButtonState(true);
    initFirebaseRealtimeSync();
  }

  openBtn?.addEventListener("click", () => {
    input.value = STATE.firebaseUrl || "";
    modal.style.display = "flex";
  });

  closeBtn?.addEventListener("click", () => {
    modal.style.display = "none";
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  // 연결 및 즉시 동기화 버튼 클릭
  saveBtn?.addEventListener("click", async () => {
    const rawUrl = input.value.trim();
    if (!rawUrl) {
      alert("Firebase Realtime Database URL을 입력해주세요.\n예: https://내프로젝트-default-rtdb.firebaseio.com");
      return;
    }

    saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 연결 테스트 중...`;

    try {
      let endpoint = rawUrl;
      if (endpoint.endsWith("/")) endpoint = endpoint.slice(0, -1);
      if (!endpoint.endsWith(".json")) endpoint += "/codingmasters_solutions.json";

      // GET 요청으로 연결 및 규칙 확인
      const testRes = await fetch(endpoint);
      if (testRes.ok) {
        STATE.firebaseUrl = rawUrl;
        localStorage.setItem(STORAGE_KEY_FIREBASE, rawUrl);
        updateFirebaseButtonState(true);
        initFirebaseRealtimeSync();

        // 기존 풀이를 Firebase로 즉시 업로드
        await executeSave(true);

        showToast("🔥 Firebase 클라우드 연결 및 동기화 성공!");
        if (hint) hint.innerHTML = `<span style="color: #10b981; font-weight: 600;">✓ Firebase 클라우드가 성공적으로 연결되었습니다!</span>`;
        setTimeout(() => { modal.style.display = "none"; }, 900);
      } else {
        throw new Error(`HTTP 상태코드 ${testRes.status} (보안 규칙이 클라이언트 접근을 차단 중입니다. 저장은 서버(server_db.py)를 통해 이뤄집니다)`);
      }
    } catch (err) {
      alert("Firebase 연결 실패: " + err.message);
      if (hint) hint.innerHTML = `<span style="color: #ef4444; font-weight: 600;">✕ 연결 실패: ${err.message}</span>`;
    } finally {
      saveBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> <span>연결 & 즉시 동기화</span>`;
    }
  });

  // 연결 해제 버튼 클릭
  disconnectBtn?.addEventListener("click", () => {
    if (confirm("Firebase 클라우드 연동을 해제하시겠습니까?\n(로컬 저장소와 서버 파일은 계속 유지됩니다)")) {
      STATE.firebaseUrl = "";
      localStorage.removeItem(STORAGE_KEY_FIREBASE);
      if (STATE.firebaseEventSource) {
        STATE.firebaseEventSource.close();
        STATE.firebaseEventSource = null;
      }
      input.value = "";
      updateFirebaseButtonState(false);
      setSyncStatus("connected", "로컬 저장소 연결됨");
      showToast("Firebase 연결이 해제되었습니다.");
      modal.style.display = "none";
    }
  });
}
