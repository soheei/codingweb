import { runAllMembersSimultaneously, toggleDiffMode } from './compare.js';
import { DEFAULT_CODE, STATE } from './config.js';
import { loadCurrentMemberCode, loadQuestion, loadSampleInputForQuestion, renderSidebarQuestions } from './navigation.js';
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

  // 1. 수동 저장 버튼들 (상단 헤더 & 에디터 상단)
  document.getElementById("btn-manual-save")?.addEventListener("click", () => {
    executeSave(true);
  });
  document.getElementById("btn-editor-save")?.addEventListener("click", () => {
    executeSave(true);
  });

  // 2. 자동 저장 토글 버튼
  document.getElementById("btn-toggle-autosave")?.addEventListener("click", () => {
    STATE.isAutoSaveEnabled = !STATE.isAutoSaveEnabled;
    const btn = document.getElementById("btn-toggle-autosave");
    const textEl = document.getElementById("autosave-toggle-text");
    
    if (STATE.isAutoSaveEnabled) {
      btn.classList.add("active-toggle");
      textEl.textContent = "자동저장 ON";
      showToast("자동 저장이 활성화되었습니다 (작성 시 0.8초 후 자동 저장)");
    } else {
      btn.classList.remove("active-toggle");
      textEl.textContent = "자동저장 OFF";
      showToast("자동 저장이 꺼졌습니다. 상단의 [수동 저장] 또는 Ctrl+S로 저장하세요.");
    }
    updateSaveStatus(STATE.hasUnsavedChanges ? "dirty" : "saved");
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

  // 4. 실행 및 클리어
  document.getElementById("btn-run-code").addEventListener("click", runCode);
  document.getElementById("btn-clear-term").addEventListener("click", () => {
    document.getElementById("terminal-output").innerHTML = "";
  });

  // 5. 사용자 입력창 전용 툴 (지우기 / 예제 채우기)
  document.getElementById("btn-clear-input").addEventListener("click", () => {
    document.getElementById("user-custom-input").value = "";
    document.getElementById("user-custom-input").focus();
  });
  document.getElementById("btn-load-sample-input").addEventListener("click", () => {
    const q = STATE.questions.find(x => x.id === STATE.currentQuestionId);
    if (q) {
      loadSampleInputForQuestion(q);
      showToast("이 문제의 추천 예제 입력값이 채워졌습니다.");
    }
  });

  // 6. 비교 모드 토글 및 4명 동시 실행
  document.getElementById("btn-toggle-diff-mode").addEventListener("click", toggleDiffMode);
  document.getElementById("btn-run-all-members")?.addEventListener("click", runAllMembersSimultaneously);

  // 7. 지금 즉시 동기화 버튼
  document.getElementById("btn-sync-now").addEventListener("click", async () => {
    showToast("서버 및 클라우드 최신 풀이 확인 중...");
    await loadInitialSolutions();
    loadCurrentMemberCode();
    renderSidebarQuestions();
    showToast("최신 풀이 상태가 동기화되었습니다!");
  });

  // 8. 기본 코드 초기화
  document.getElementById("btn-reset-template").addEventListener("click", () => {
    if (confirm("코드를 기본 디폴트 상태로 되돌리시겠습니까?")) {
      STATE.editor.setValue(DEFAULT_CODE);
      executeSave(true, false, true);
    }
  });

  // 9. JSON 파일 백업 (내보내기) - server.py의 team_solutions_db.json과 100% 동일한 이름 및 구조로 저장
  document.getElementById("btn-export-data").addEventListener("click", () => {
    // team_solutions_db.json 파일과 완벽히 동일한 데이터 구조
    const blob = new Blob([JSON.stringify(STATE.solutions, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "team_solutions_db.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("✓ team_solutions_db.json 파일로 저장되었습니다.");
  });

  // 10. JSON 파일 불러오기 (가져오기) - team_solutions_db.json 및 기존 백업 파일 완벽 지원
  const fileInput = document.getElementById("file-import-input");
  document.getElementById("btn-import-data").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    // @ts-ignore
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        // @ts-ignore
        const imported = JSON.parse(event.target.result);
        // team_solutions_db.json 직접 구조 또는 { solutions: ... } 래핑 구조 둘 다 지원
        const targetSolutions = imported.solutions ? imported.solutions : imported;
        
        if (targetSolutions && typeof targetSolutions === "object" && Object.keys(targetSolutions).length > 0) {
          STATE.solutions = { ...STATE.solutions, ...targetSolutions };
          await executeSave(true, true);
          loadQuestion(STATE.currentQuestionId);
          renderSidebarQuestions();
          showToast("✓ team_solutions_db.json 파일이 성공적으로 로드되고 동기화되었습니다!");
        } else {
          alert("올바른 team_solutions_db.json 또는 풀이 백업 파일이 아닙니다.");
        }
      } catch (err) {
        alert("JSON 파싱 에러: " + err.message);
      }
    };
    reader.readAsText(file);
    fileInput.value = "";
  });
}
