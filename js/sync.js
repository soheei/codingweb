import { renderCompareView } from './compare.js';
import { API_BASE, STATE } from './config.js';
import { loadCurrentMemberCode, renderSidebarQuestions, updateProgress } from './navigation.js';
import { fetchSolutions, loadUsers, saveLocal } from './storage.js';
import { showToast } from './ui.js';

/* ==========================================================================
   Server Polling Sync (server_db.py 의 /api/version 을 3초마다 확인)
   - 내가 보고 있는 사람 / 비교 대상의 새 풀이만 받아온다.
   ========================================================================== */
export function setupServerPolling() {
  let lastVersion = null;

  const tick = async () => {
    try {
      const vRes = await fetch(`${API_BASE}/api/version`, { cache: "no-store" });
      if (!vRes.ok) return;
      const { version } = await vRes.json();
      if (version === lastVersion) return;
      const first = lastVersion === null;
      lastVersion = version;
      if (first) return; // 최초 로드는 loadInitialSolutions 가 이미 처리

      const hasDiff = await fetchSolutions();
      loadUsers().then(renderSidebarQuestions).catch(() => {}); // 풀이 수/새 사용자 반영

      if (hasDiff) {
        saveLocal();
        if (STATE.isDiffMode) {
          renderCompareView();
        } else {
          loadCurrentMemberCode();
        }
        renderSidebarQuestions();
        updateProgress();
        showToast("[실시간 동기화] 최신 풀이가 반영되었습니다!");
      }
    } catch (err) {
      // 서버 일시 오프라인 - 다음 주기에 재시도
    }
  };

  tick();
  setInterval(tick, 3000);
}
