import { renderQuadDiffView } from './compare.js';
import { DEFAULT_CODE, FIXED_MEMBERS, STATE, STORAGE_KEY_VIEW, isTemplateCode } from './config.js';
import { saveLocal, updateSaveStatus } from './storage.js';

/* ==========================================================================
   마지막으로 보던 화면 기억 (새로고침/재접속 시 복원)
   ========================================================================== */
export function saveViewState() {
  try {
    localStorage.setItem(STORAGE_KEY_VIEW, JSON.stringify({
      questionId: STATE.currentQuestionId,
      member: STATE.currentMember,
      isDiffMode: STATE.isDiffMode
    }));
  } catch (err) {}
}

export function loadViewState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_VIEW));
    if (!saved) return null;
    return {
      questionId: STATE.questions.some(q => q.id === saved.questionId) ? saved.questionId : 1,
      member: FIXED_MEMBERS.includes(saved.member) ? saved.member : STATE.currentMember,
      isDiffMode: saved.isDiffMode === true
    };
  } catch (err) {
    return null;
  }
}

/* ==========================================================================
   Question Details & 4-Member Navigation
   ========================================================================== */
export function loadQuestion(id) {
  STATE.currentQuestionId = id;
  const q = STATE.questions.find(x => x.id === id);
  if (!q) return;

  document.getElementById("current-q-num").textContent = `Q. ${String(q.id).padStart(2, '0')}`;
  document.getElementById("current-q-title").textContent = q.title;
  
  const diffBadge = document.getElementById("current-q-diff");
  diffBadge.textContent = q.difficulty;
  diffBadge.className = `q-badge q-diff ${q.difficulty}`;

  document.getElementById("current-q-cat").textContent = q.category;
  document.getElementById("current-q-desc").innerHTML = q.desc;

  // 문제 변경 시 해당 문제의 기본 예제 입력으로 입력창 자동 채우기
  loadSampleInputForQuestion(q);

  document.querySelectorAll(".q-item").forEach(item => {
    item.classList.toggle("active", Number(item.dataset.id) === id);
  });

  renderMemberTabs();
  loadCurrentMemberCode();

  if (STATE.isDiffMode) {
    renderQuadDiffView();
  }
  saveViewState();
}

// 문제에 알맞은 예제 입력 자동 세팅
export function loadSampleInputForQuestion(q) {
  const inputEl = document.getElementById("user-custom-input");
  if (!inputEl) return;

  if (q.id === 1) { // 10배
    inputEl.value = "5";
  } else if (q.id === 2) { // 16배 나누어 출력
    inputEl.value = "32";
  } else if (q.id === 3) { // 1등급 한우
    inputEl.value = "7";
  } else if (q.id === 4) { // 3으로 나눈 나머지
    inputEl.value = "10";
  } else if (q.id === 5) { // 8진수와 16진수
    inputEl.value = "10";
  } else if (q.id === 6) { // You
    inputEl.value = "Nice to meet you";
  } else if (q.id === 7) { // 가장 큰 나머지
    inputEl.value = "10";
  } else if (q.id === 8) { // 기억상실
    inputEl.value = "2 1 5";
  } else if (q.id === 9) { // 등차수열
    inputEl.value = "1 3 5";
  } else if (q.id === 10) { // 림보게임
    inputEl.value = "5\n160 175 162 168 159";
  } else if (q.id === 12) { // 삼각형의 조건
    inputEl.value = "3 4 5";
  } else if (q.id === 13) { // 소수 구하기
    inputEl.value = "17";
  } else if (q.id === 20) { // 최대공약수
    inputEl.value = "12 18";
  } else {
    inputEl.value = "3\n5";
  }
}

export function loadCurrentMemberCode() {
  const qId = STATE.currentQuestionId;
  const member = STATE.currentMember;
  const code = (STATE.solutions[qId] && STATE.solutions[qId][member]) || DEFAULT_CODE;
  
  if (STATE.editor) {
    STATE.editor.setValue(code);
    STATE.editor.clearHistory();
    STATE.hasUnsavedChanges = false;
    updateSaveStatus("saved");
  }
}

export function renderMemberTabs() {
  const container = document.getElementById("member-tabs");
  container.innerHTML = "";

  FIXED_MEMBERS.forEach(member => {
    const tab = document.createElement("div");
    tab.className = `member-tab ${member === STATE.currentMember ? "active" : ""}`;
    tab.innerHTML = `<i class="fa-solid fa-user-circle"></i> ${member}`;
    tab.addEventListener("click", () => {
      // 탭 변경 전 현재 코드 즉시 저장
      if (STATE.hasUnsavedChanges) {
        saveLocal();
      }
      STATE.currentMember = member;
      saveViewState();
      renderMemberTabs();
      loadCurrentMemberCode();
      renderSidebarQuestions();
      updateProgress();
    });
    container.appendChild(tab);
  });
}

export function renderSidebarQuestions() {
  const listEl = document.getElementById("question-list");
  const searchQuery = document.getElementById("question-search").value.toLowerCase().trim();
  const filterDiff = document.getElementById("filter-difficulty").value;
  const filterCat = document.getElementById("filter-category").value;

  listEl.innerHTML = "";

  const filtered = STATE.questions.filter(q => {
    const matchSearch = String(q.id).includes(searchQuery) || q.title.toLowerCase().includes(searchQuery) || q.category.toLowerCase().includes(searchQuery);
    const matchDiff = filterDiff === "all" || q.difficulty === filterDiff;
    const matchCat = filterCat === "all" || q.category === filterCat;
    return matchSearch && matchDiff && matchCat;
  });

  filtered.forEach(q => {
    const isSolved = isSolvedByCurrentMember(q.id);

    const item = document.createElement("div");
    item.className = `q-item ${q.id === STATE.currentQuestionId ? "active" : ""}`;
    item.dataset.id = q.id;

    item.innerHTML = `
      <div class="q-item-info">
        <span class="badge-tag ${q.difficulty}">${q.difficulty}</span>
        <div class="q-item-title">${q.title}</div>
      </div>
      <div class="q-item-status">
        <span class="status-badge ${isSolved ? 'solved' : ''}">
          <i class="${isSolved ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i>
        </span>
      </div>
    `;

    item.addEventListener("click", () => {
      if (STATE.hasUnsavedChanges) {
        saveLocal();
      }
      loadQuestion(q.id);
    });

    listEl.appendChild(item);
  });
}

export function renderCategoryFilter() {
  const catSelect = document.getElementById("filter-category");
  const categories = [...new Set(STATE.questions.map(q => q.category))];
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  });
}

export function isSolvedByCurrentMember(qId) {
  const code = STATE.solutions[qId] && STATE.solutions[qId][STATE.currentMember];
  return !!code && code.trim() !== "" && !isTemplateCode(code);
}

export function updateProgress() {
  let solvedCount = 0;
  STATE.questions.forEach(q => {
    if (isSolvedByCurrentMember(q.id)) solvedCount++;
  });
  document.getElementById("progress-label").textContent = `${STATE.currentMember} 완료율:`;

  const percent = Math.round((solvedCount / (STATE.questions.length || 100)) * 100);
  document.getElementById("progress-percent").textContent = `${percent}%`;
  document.getElementById("progress-count").textContent = `${solvedCount} / ${STATE.questions.length || 100} 완료`;
  document.getElementById("progress-fill").style.width = `${percent}%`;
}
