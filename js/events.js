import { runAllMembersSimultaneously, toggleDiffMode } from './compare.js';
import { DEFAULT_CODE, STATE, isViewingOther, nameOf } from './config.js';
import { loadCurrentMemberCode, loadQuestion, loadSampleInputForQuestion, renderMemberTabs, renderSidebarQuestions, switchOwner, updateProgress } from './navigation.js';
import { runCode } from './runner.js';
import { executeSave, loadInitialSolutions, updateSaveStatus } from './storage.js';
import { showToast } from './ui.js';

/* ==========================================================================
   Event Listeners
   ========================================================================== */
export function setupEventListeners() {
  document.getElementById("question-search").addEventListener("input", renderSidebarQuestions);
  document.getElementById("filter-difficulty").addEventListener("change", renderSidebarQuestions);
  document.getElementById("filter-category").addEventListener("change", renderSidebarQuestions);
  document.getElementById("filter-round").addEventListener("change", (e) => {
    STATE.round = Number(e.target.value);
    renderSidebarQuestions();
    updateProgress();
  });

  // 1. 저장 버튼 (에디터 상단) — Ctrl+S 도 동일하게 동작
  document.getElementById("btn-editor-save")?.addEventListener("click", () => {
    executeSave(true);
  });

  // 3. 글로벌 키보드 단축키 (Ctrl + S: 수동 저장, Ctrl + Enter: 실행)
  window.addEventListener("keydown", (e) => {
    // 에디터 안에서는 CodeMirror 단축키(extraKeys)가 이미 처리하므로 중복 실행 방지
    if (e.target.closest && e.target.closest(".CodeMirror")) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      executeSave(true);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
  });

  // 4. 실행 및 클리어 (예제 입력으로 실행하면 정답 여부도 자동으로 가려진다)
  document.getElementById("btn-run-code").addEventListener("click", runCode);
  document.getElementById("btn-clear-term").addEventListener("click", () => {
    document.getElementById("terminal-output").innerHTML = "";
  });

  // 5. 사용자 입력창 전용 툴 (지우기 / 예제 채우기)
  document.getElementById("btn-clear-input").addEventListener("click", () => {
    document.getElementById("user-custom-input").value = "";
    document.getElementById("user-custom-input").focus();
  });
  // 눌 때마다 문제 속 예제를 차례로 채운다 (예제 1 → 예제 2 → ... → 예제 1)
  const sampleCursor = {};
  document.getElementById("btn-load-sample-input").addEventListener("click", () => {
    const q = STATE.questions.find(x => x.id === STATE.currentQuestionId);
    if (!q) return;
    const next = sampleCursor[q.id] ?? 0;
    const result = loadSampleInputForQuestion(q, next);
    if (!result || result.count === 0) {
      showToast("이 문제에는 채울 예제 입력이 없습니다.");
      return;
    }
    sampleCursor[q.id] = result.used + 1;
    showToast(result.count > 1
      ? `예제 ${result.used + 1} 입력을 채웠습니다. (전체 ${result.count}개)`
      : "예제 입력을 채웠습니다.");
  });

  // 5-1. 입력/실행결과 패널 내리기 · 올리기
  const editorGrid = document.querySelector(".editor-grid");
  const setTerminalCollapsed = (collapsed) => {
    editorGrid.classList.toggle("terminal-collapsed", collapsed);
    STATE.editor?.refresh();
  };
  document.getElementById("btn-terminal-collapse").addEventListener("click", () => setTerminalCollapsed(true));
  document.getElementById("btn-terminal-expand").addEventListener("click", () => setTerminalCollapsed(false));

  // 5-2. 문제 설명(왼쪽) · 문제 목록(오른쪽) 패널 숨기기 · 열기
  const mainContainer = document.querySelector(".main-container");
  const setupSidePanelToggle = (btnId, className, openIcon, closedIcon) => {
    const btn = document.getElementById(btnId);
    const storageKey = `codingmasters_${className}`;
    const render = (collapsed) => {
      mainContainer.classList.toggle(className, collapsed);
      btn.querySelector("i").className = `fa-solid ${collapsed ? closedIcon : openIcon}`;
      STATE.editor?.refresh();
    };
    try { render(localStorage.getItem(storageKey) === "1"); } catch (e) { /* 저장소 사용 불가 시 무시 */ }
    btn.addEventListener("click", () => {
      const collapsed = !mainContainer.classList.contains(className);
      render(collapsed);
      try { localStorage.setItem(storageKey, collapsed ? "1" : "0"); } catch (e) { /* 무시 */ }
    });
  };
  setupSidePanelToggle("btn-toggle-left", "left-collapsed", "fa-caret-left", "fa-caret-right");
  setupSidePanelToggle("btn-toggle-right", "right-collapsed", "fa-caret-right", "fa-caret-left");

  // 6. 비교 모드 토글 및 4명 동시 실행
  document.getElementById("btn-toggle-diff-mode").addEventListener("click", toggleDiffMode);
  document.getElementById("btn-run-all-members")?.addEventListener("click", runAllMembersSimultaneously);

  // 8. 기본 코드 초기화
  document.getElementById("btn-reset-template").addEventListener("click", () => {
    if (isViewingOther()) return; // 남의 코드는 초기화할 수 없다
    if (confirm("코드를 기본 디폴트 상태로 되돌리시겠습니까?")) {
      STATE.editor.setValue(DEFAULT_CODE);
      executeSave(true, false, true);
    }
  });

  // 8-1. 다른 사람 코드를 내 코드로 복사 (내 코드 탭으로 돌아가 같은 문제의 내 칸에 덮어쓴다)
  document.getElementById("btn-copy-to-mine")?.addEventListener("click", async () => {
    if (!isViewingOther()) return;
    const qId = STATE.currentQuestionId;
    const owner = STATE.currentMember;
    const code = STATE.editor.getValue();
    const mine = STATE.solutions[qId] && STATE.solutions[qId][STATE.me.uid];
    const hasMine = mine && mine.trim() && mine.trim() !== DEFAULT_CODE.trim();
    if (hasMine && !confirm(`이 문제에 이미 작성한 내 코드가 있습니다.
${nameOf(owner)}님의 코드로 덮어쓸까요?`)) return;
    STATE.solutions[qId][STATE.me.uid] = code;
    await switchOwner(STATE.me.uid);
    STATE.hasUnsavedChanges = true;
    await executeSave(true);
    showToast(`${nameOf(owner)}님의 코드를 내 코드로 복사해 저장했습니다.`);
  });

  // 열려 있는 드롭다운은 바깥을 누르면 닫는다
  document.addEventListener("click", () => {
    document.querySelectorAll(".owner-dd-menu.open").forEach(m => m.classList.remove("open"));
  });
}
