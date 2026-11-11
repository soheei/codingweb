import { generateAll100Questions } from './questions.js';
import { MAX_COMPARE, STATE, loadFavorites } from './config.js';
import { requireLogin, setupAccountUi } from './auth.js';
import { loadCompareSelection, restoreDiffMode, setupCompareView, setupComparePicker } from './compare.js';
import { initCodeMirror } from './editor.js';
import { setupEventListeners } from './events.js';
import { loadQuestion, loadViewState, renderCategoryFilter, renderMemberTabs, renderSidebarQuestions, updateProgress } from './navigation.js';
import { setupMobile } from './mobile.js';
import { setupNotebookExport } from './notebook.js';
import { setupColumnResizers, setupRowResizers, setupTerminalResizer } from './resizer.js';
import { initPyodide } from './runner.js';
import { fetchSolutions, loadInitialSolutions } from './storage.js';
import { setupServerPolling } from './sync.js';

/* ==========================================================================
   Initialization: 로그인 필수 → 로그인되면 앱 시작
   ========================================================================== */
// 시작 중 예외가 나면 "확인하는 중..." 화면에 멈춰 있지 않고 원인을 보여 준다
const showFatal = (err) => {
  console.error("[앱 시작 실패]", err);
  const splash = document.getElementById("auth-splash");
  const overlay = document.getElementById("auth-overlay");
  if (splash && splash.style.display !== "none" && (!overlay || overlay.style.display === "none")) {
    splash.innerHTML = `<div style="max-width:520px;line-height:1.6;color:#b91c1c"><b>앱을 시작하지 못했습니다.</b><br>${String(err && err.message || err)}<br><small style="color:#718096">F12 → Console 탭의 빨간 오류도 확인해 주세요. Ctrl+F5로 새로고침해 보세요.</small></div>`;
  }
};
window.addEventListener("error", (e) => showFatal(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showFatal(e.reason));

document.addEventListener("DOMContentLoaded", async () => {
  // 0. 로그인 (저장된 로그인이 있으면 화면 없이 바로 통과)
  const me = await requireLogin();
  STATE.me = me;
  STATE.currentMember = me.uid;
  loadFavorites();

  // 1. 문제 데이터 로드 (모듈 또는 전역 fallback)
  if (typeof window.generateAll100Questions === "function") {
    STATE.questions = window.generateAll100Questions();
  } else {
    STATE.questions = generateAll100Questions();
  }

  // 2. 에디터 및 UI 초기화
  initCodeMirror();
  initPyodide();
  renderCategoryFilter();
  renderSidebarQuestions();
  updateProgress();

  // 3. 사용자 목록 + 풀이 로드 (서버 우선 -> localStorage)
  await loadInitialSolutions();
  loadCompareSelection();
  setupAccountUi({
    onNameChanged: () => {
      // 이름이 바뀌면 탭/진행률/비교 카드 이름을 다시 그린다
      const mine = STATE.users.find(u => u.uid === STATE.me.uid);
      if (mine) mine.displayName = STATE.me.displayName;
      renderMemberTabs();
      updateProgress();
    }
  });
  renderSidebarQuestions();

  // 4. 마지막으로 보던 문제/사람 탭 복원 (없으면 1번 문제, 내 코드)
  const savedView = loadViewState();
  if (savedView) {
    STATE.currentMember = savedView.member;
    // 추가해 둔 목록에 없는 사람을 보고 있었다면 목록에 넣어 주고(자리가 없으면 내 코드로)
    if (STATE.currentMember !== me.uid && !STATE.compareUids.includes(STATE.currentMember)) {
      if (STATE.compareUids.length < MAX_COMPARE - 1) STATE.compareUids.push(STATE.currentMember);
      else STATE.currentMember = me.uid;
    }
  }
  // 새로고침 후에도 추가해 둔 사람들의 코드를 바로 볼 수 있도록 함께 불러온다
  try { await fetchSolutions(); } catch (e) { /* 폴링이 다시 시도한다 */ }
  loadQuestion(savedView ? savedView.questionId : 1);
  renderSidebarQuestions();
  updateProgress();
  document.querySelector(".q-item.active")?.scrollIntoView({ block: "center" });

  // 5. 이벤트 리스너 세팅
  setupEventListeners();
  setupComparePicker();
  setupCompareView();
  setupNotebookExport();
  setupColumnResizers();
  setupRowResizers();
  setupTerminalResizer();
  if (savedView?.isDiffMode) restoreDiffMode();
  setupMobile();

  // 6. 배포 서버(server_db.py) 변경 감지 폴링: 다른 사람이 저장하면 새로고침 없이 반영
  setupServerPolling();
});
