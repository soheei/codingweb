import { renderCompareView, restoreSelectionIfEmpty, saveCompareSelection } from './compare.js';
import { API_BASE, STATE } from './config.js';
import { loadCurrentMemberCode, renderMemberTabs, renderSidebarQuestions, updateProgress } from './navigation.js';
import { fetchSolutions, loadUsers, saveLocal } from './storage.js';
import { showToast } from './ui.js';

/* ==========================================================================
   Server Polling Sync (server_db.py 의 /api/version 을 3초마다 확인)
   - 내가 보고 있는 사람 / 비교 대상의 새 풀이만 받아온다.
   ========================================================================== */
export function setupServerPolling() {
  let busy = false;

  const refreshUsers = () => loadUsers().then(({ pinsChanged, viewReset }) => {
    if (pinsChanged) saveCompareSelection();
    // 모바일: 시작할 때 사용자 목록을 못 받아 비어 있던 "전에 고른 사람"을 저장값에서 되살린다
    const restored = window.matchMedia("(max-width: 860px)").matches && restoreSelectionIfEmpty();
    if (restored || pinsChanged || viewReset) {
      renderMemberTabs();
      if (viewReset) { loadCurrentMemberCode(); updateProgress(); }
      if (STATE.isDiffMode) renderCompareView();
    }
    renderSidebarQuestions();
  });

  const tick = async () => {
    if (busy) return; // 이전 확인이 아직 끝나지 않았으면 겹치지 않게 건너뜀
    busy = true;
    try {
      const vRes = await fetch(`${API_BASE}/api/version`, { cache: "no-store" });
      if (!vRes.ok) return;
      const { version, usersRev } = await vRes.json();

      // 서버 버전이 달라졌을 때만 가져온다. 마지막 버전 이후 바뀐 칸만 받으므로 가볍다.
      if (version !== STATE.syncVersion) {
        const hasDiff = await fetchSolutions();
        if (hasDiff) {
          saveLocal();
          if (STATE.isDiffMode) renderCompareView();
          else loadCurrentMemberCode();
          renderSidebarQuestions();
          updateProgress();
          showToast("[실시간 동기화] 최신 풀이가 반영되었습니다!");
        }
      }
      // 사용자 목록(새 사용자/이름 변경/탈퇴/푼 문제 수)은 바뀌었을 때만 다시 받는다
      if (usersRev !== STATE.usersRev) await refreshUsers();
    } catch (err) {
      // 서버 일시 오프라인 - 다음 주기에 재시도
    } finally {
      busy = false;
    }
  };

  tick();
  setInterval(tick, 3000);
}
