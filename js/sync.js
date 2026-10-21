import { renderQuadDiffView } from './compare.js';
import { FIXED_MEMBERS, LOCAL_SERVER_API, STATE } from './config.js';
import { loadCurrentMemberCode, renderSidebarQuestions, updateProgress } from './navigation.js';
import { saveLocal } from './storage.js';
import { showToast } from './ui.js';

/* ==========================================================================
   Server Polling Sync (server_db.py 의 /api/version 을 3초마다 확인)
   ========================================================================== */
export function setupServerPolling() {
  const versionUrl = LOCAL_SERVER_API.replace(/\/api\/sync$/, "/api/version");
  let lastVersion = null;

  const tick = async () => {
    try {
      const vRes = await fetch(versionUrl, { cache: "no-store" });
      if (!vRes.ok) return; // 기존 server.py 등 /api/version 이 없으면 무시
      const { version } = await vRes.json();
      if (version === lastVersion) return;
      const first = lastVersion === null;
      lastVersion = version;
      if (first) return; // 최초 로드는 loadInitialSolutions 가 이미 처리

      const res = await fetch(LOCAL_SERVER_API, { cache: "no-store" });
      if (!res.ok) return;
      const serverData = await res.json();
      let hasDiff = false;
      Object.keys(serverData).forEach(qId => {
        if (!STATE.solutions[qId]) STATE.solutions[qId] = {};
        FIXED_MEMBERS.forEach(m => {
          const isCurrentlyEditing = (Number(qId) === STATE.currentQuestionId && m === STATE.currentMember && STATE.hasUnsavedChanges);
          const incoming = serverData[qId] && serverData[qId][m];
          if (!isCurrentlyEditing && incoming && STATE.solutions[qId][m] !== incoming) {
            STATE.solutions[qId][m] = incoming;
            hasDiff = true;
          }
        });
      });

      if (hasDiff) {
        saveLocal();
        if (STATE.isDiffMode) {
          renderQuadDiffView();
        } else {
          loadCurrentMemberCode();
        }
        renderSidebarQuestions();
        updateProgress();
        showToast("[실시간 동기화] 팀원의 최신 풀이가 반영되었습니다!");
      }
    } catch (err) {
      // 서버 일시 오프라인 - 다음 주기에 재시도
    }
  };

  tick();
  setInterval(tick, 3000);
}
