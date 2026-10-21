import { generateAll100Questions } from './questions.js';
import { STATE } from './config.js';
import { initCodeMirror } from './editor.js';
import { setupEventListeners } from './events.js';
import { setupFirebaseModal } from './firebase.js';
import { loadQuestion, renderCategoryFilter, renderSidebarQuestions, updateProgress } from './navigation.js';
import { setupNotebookExport } from './notebook.js';
import { initPyodide } from './runner.js';
import { loadInitialSolutions } from './storage.js';
import { setupServerPolling } from './sync.js';

/* ==========================================================================
   Initialization
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
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

  // 3. 솔루션 로드 (서버 우선 -> localStorage)
  await loadInitialSolutions();
  renderSidebarQuestions();

  // 4. 1번 문제 로드
  loadQuestion(1);

  // 5. 이벤트 리스너 세팅
  setupEventListeners();
  setupFirebaseModal();
  setupNotebookExport();

  // 6. 배포 서버(server_db.py) 변경 감지 폴링: 팀원이 저장하면 새로고침 없이 반영
  setupServerPolling();
});
