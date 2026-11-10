import { exitDiffMode, renderCompareView, saveCompareSelection } from './compare.js';
import { DEFAULT_CODE, MAX_COMPARE, MIN_COMPARE, STATE, moveItem, sortFavoritesFirst, toggleFavorite, STORAGE_KEY_VIEW, escapeHtml, isMe, isViewingOther, nameOf } from './config.js';
import { fetchSolutions, saveLocal, updateSaveStatus } from './storage.js';
import { showToast } from './ui.js';

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
      member: STATE.users.some(u => u.uid === saved.member) ? saved.member : STATE.me.uid,
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
    renderCompareView();
  }
  saveViewState();
}

// 문제 설명(q.desc)에 들어 있는 "예제 N → 입력" 블록들을 읽어 온다 (문제마다 하드코딩하지 않는다)
export function getSampleInputs(q) {
  if (!q || !q.desc) return [];
  const doc = new DOMParser().parseFromString(q.desc, "text/html");
  const pres = [...doc.querySelectorAll("pre")];
  // "입력" 제목 바로 뒤에 오는 <pre> 가 예제 입력
  let inputs = pres.filter(pre => {
    const prev = pre.previousElementSibling;
    return prev && prev.textContent.trim() === "입력";
  });
  // 제목 구조가 다르면 입력/출력이 번갈아 나온다고 보고 짝수 번째를 입력으로 사용
  if (!inputs.length) inputs = pres.filter((_, i) => i % 2 === 0);
  return inputs
    .map(pre => pre.textContent.replace(/\r\n?/g, "\n").replace(/\s+$/, "").replace(/^\n+/, ""))
    .filter(text => text.length > 0);
}

// 문제 설명 속 "입력/출력" 예제 쌍을 읽어 채점용 테스트케이스로 돌려준다: [{ input, output }]
export function getSampleCases(q) {
  if (!q || !q.desc) return [];
  const doc = new DOMParser().parseFromString(q.desc, "text/html");
  const titleOf = (pre) => (pre.previousElementSibling ? pre.previousElementSibling.textContent.trim() : "");
  const clean = (pre) => pre.textContent.replace(/\r\n?/g, "\n").replace(/^\n+/, "").replace(/\s+$/, "");
  const cases = [];
  let pending = null;
  for (const pre of doc.querySelectorAll("pre")) {
    const title = titleOf(pre);
    if (title === "입력") pending = clean(pre);
    else if (title === "출력" && pending !== null) { cases.push({ input: pending, output: clean(pre) }); pending = null; }
  }
  return cases;
}

// 입력창에 예제 입력을 채운다. index 번째 예제(0부터)를 쓰고, 채운 예제 정보를 돌려준다.
export function loadSampleInputForQuestion(q, index = 0) {
  const inputEl = document.getElementById("user-custom-input");
  if (!inputEl) return null;
  const samples = getSampleInputs(q);
  if (!samples.length) {
    inputEl.value = "";
    return { count: 0, used: -1 };
  }
  const used = ((index % samples.length) + samples.length) % samples.length;
  inputEl.value = samples[used];
  return { count: samples.length, used };
}

export function loadCurrentMemberCode() {
  const qId = STATE.currentQuestionId;
  const owner = STATE.currentMember;
  const code = (STATE.solutions[qId] && STATE.solutions[qId][owner]) || DEFAULT_CODE;

  if (STATE.editor) {
    STATE.editor.setValue(code);
    STATE.editor.clearHistory();
    STATE.hasUnsavedChanges = false;
    updateSaveStatus("saved");
  }
  applyReadOnlyState();
}

// 남의 코드를 보는 중이면 에디터를 읽기 전용으로 바꾸고 안내/복사 버튼을 보여 준다
export function applyReadOnlyState() {
  const ro = isViewingOther();
  STATE.editor?.setOption("readOnly", ro ? true : false);
  document.querySelector(".code-editor-wrapper")?.classList.toggle("is-readonly", ro);

  const banner = document.getElementById("ro-banner");
  if (banner) {
    banner.style.display = ro ? "flex" : "none";
    document.getElementById("ro-banner-name").textContent = nameOf(STATE.currentMember);
  }
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? "" : "none"; };
  show("btn-editor-save", !ro);
  show("btn-reset-template", !ro);
  show("btn-copy-to-mine", ro);
  show("autosave-status", !ro);
}

// 다른 사람(uid)의 코드 보기로 전환. null/내 uid 이면 내 코드로 돌아온다.
export async function switchOwner(uid) {
  if (STATE.hasUnsavedChanges) saveLocal();
  STATE.currentMember = uid || STATE.me.uid;
  if (isViewingOther()) {
    try {
      await fetchSolutions();
    } catch (e) {
      showToast("상대방의 코드를 불러오지 못했습니다.");
    }
  }
  saveViewState();
  renderMemberTabs();
  loadCurrentMemberCode();
  renderSidebarQuestions();
  updateProgress();
}

// 내가 "추가해 둔 사람" 목록(STATE.compareUids)은 탭과 비교하기가 함께 쓰며, 사용자가 지우기 전까지 새로고침해도 유지된다
async function pinUser(uid) {
  if (!STATE.compareUids.includes(uid)) {
    if (STATE.compareUids.length >= MAX_COMPARE - 1) {
      showToast(`다른 사람은 최대 ${MAX_COMPARE - 1}명까지 추가할 수 있습니다. 먼저 한 명을 지워 주세요.`);
      return;
    }
    STATE.compareUids.push(uid);
    saveCompareSelection();
  }
  await switchOwner(uid);
}

async function unpinUser(uid) {
  STATE.compareUids = STATE.compareUids.filter(x => x !== uid);
  saveCompareSelection();
  if (STATE.currentMember === uid) {
    await switchOwner(STATE.me.uid); // 보고 있던 사람을 지우면 내 코드로
  } else {
    renderMemberTabs();
  }
  if (STATE.isDiffMode) {
    if (STATE.compareUids.length < MIN_COMPARE - 1) {
      showToast("비교할 사람이 없어 단일 에디터로 돌아갑니다.");
      exitDiffMode();
    } else {
      renderCompareView();
    }
  }
}

function reorderPinned(fromUid, toUid) {
  if (fromUid === toUid) return;
  STATE.compareUids = moveItem(STATE.compareUids, fromUid, toUid);
  saveCompareSelection();
  renderMemberTabs();
  if (STATE.isDiffMode) renderCompareView();
}

export function renderMemberTabs() {
  const container = document.getElementById("member-tabs");
  container.innerHTML = "";
  const viewingOther = isViewingOther();

  const myTab = document.createElement("div");
  myTab.className = `member-tab my-tab ${!viewingOther ? "active" : ""}`;
  myTab.innerHTML = `내 코드`;
  myTab.addEventListener("click", () => { if (viewingOther) switchOwner(STATE.me.uid); });
  container.appendChild(myTab);

  // 추가해 둔 사람들: 클릭=보기, ×=목록에서 삭제, 드래그=순서 이동
  STATE.compareUids.filter(uid => STATE.users.some(u => u.uid === uid)).forEach(uid => {
    const tab = document.createElement("div");
    tab.className = `member-tab pinned ${STATE.currentMember === uid ? "active" : ""}`;
    tab.draggable = true;
    tab.dataset.uid = uid;
    tab.title = "클릭: 코드 보기 · 드래그: 순서 이동";
    tab.innerHTML = `<i class="fa-solid fa-lock"></i> <span class="pinned-name">${escapeHtml(nameOf(uid))}</span><button class="tab-x" title="목록에서 삭제">×</button>`;
    tab.addEventListener("click", (e) => {
      if (e.target.closest(".tab-x")) { e.stopPropagation(); unpinUser(uid); return; }
      if (STATE.currentMember !== uid) switchOwner(uid);
    });
    tab.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", uid); e.dataTransfer.effectAllowed = "move"; tab.classList.add("dragging-tab"); });
    tab.addEventListener("dragend", () => tab.classList.remove("dragging-tab"));
    tab.addEventListener("dragover", (e) => { e.preventDefault(); tab.classList.add("drop-target"); });
    tab.addEventListener("dragleave", () => tab.classList.remove("drop-target"));
    tab.addEventListener("drop", (e) => {
      e.preventDefault();
      tab.classList.remove("drop-target");
      const from = e.dataTransfer.getData("text/plain");
      if (from && STATE.compareUids.includes(from)) reorderPinned(from, uid);
    });
    container.appendChild(tab);
  });

  // 다른 사람 추가 드롭다운
  const dd = document.createElement("div");
  dd.className = "owner-dd";
  dd.innerHTML = `
    <div class="member-tab owner-dd-btn"><i class="fa-solid fa-user-plus"></i> 추가 <i class="fa-solid fa-caret-down"></i></div>
    <div class="owner-dd-menu">
      <input type="text" class="owner-dd-search" placeholder="이름 검색..." spellcheck="false">
      <div class="owner-dd-list"></div>
    </div>`;
  const btn = dd.querySelector(".owner-dd-btn");
  const menu = dd.querySelector(".owner-dd-menu");
  const list = dd.querySelector(".owner-dd-list");
  const search = dd.querySelector(".owner-dd-search");
  const renderList = () => {
    const q = search.value.trim().toLowerCase();
    const others = STATE.users.filter(u => u.uid !== STATE.me.uid && u.displayName.toLowerCase().includes(q));
    const { fav, rest } = sortFavoritesFirst(others);
    const row = (u) => {
      const isFav = STATE.favorites.includes(u.uid);
      return `<div class="owner-dd-item" data-uid="${escapeHtml(u.uid)}">
        <button type="button" class="fav-btn ${isFav ? "on" : ""}" data-uid="${escapeHtml(u.uid)}" title="${isFav ? "즐겨찾기 해제" : "즐겨찾기 (맨 위에 표시)"}"><i class="${isFav ? "fa-solid" : "fa-regular"} fa-star"></i></button>
        <span class="owner-dd-label">${escapeHtml(u.displayName)}${STATE.compareUids.includes(u.uid) ? ' <em>추가됨</em>' : ""}</span>
        <small>풀이 ${u.solvedCount}/100</small></div>`;
    };
    list.innerHTML = others.length
      ? (fav.length ? `<div class="cmp-section">즐겨찾기</div>${fav.map(row).join("")}<div class="cmp-section">전체</div>` : "") + rest.map(row).join("")
      : `<div class="owner-dd-empty">표시할 사용자가 없습니다</div>`;
  };
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("open");
    if (menu.classList.contains("open")) { renderList(); search.value = ""; search.focus(); }
  });
  search.addEventListener("input", renderList);
  search.addEventListener("click", e => e.stopPropagation());
  list.addEventListener("click", (e) => {
    const star = e.target.closest(".fav-btn");
    if (star) { e.stopPropagation(); toggleFavorite(star.dataset.uid); renderList(); return; }
    const item = e.target.closest(".owner-dd-item");
    if (item) pinUser(item.dataset.uid);
  });
  container.appendChild(dd);
}

export function renderSidebarQuestions() {
  const listEl = document.getElementById("question-list");
  const searchQuery = document.getElementById("question-search").value.toLowerCase().trim();
  const filterDiff = document.getElementById("filter-difficulty").value;
  const filterCat = document.getElementById("filter-category").value;

  listEl.innerHTML = "";

  // 2차 문제는 아직 없음 — 문제가 만들어지면 여기서 2차 목록을 쓰도록 바꾼다
  if (STATE.round !== 1) {
    listEl.innerHTML = '<div class="q-empty" style="padding: 24px 12px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">2차 문제는 준비 중입니다.</div>';
    return;
  }

  const filtered = STATE.questions.filter(q => {
    const matchSearch = String(q.id).includes(searchQuery) || q.title.toLowerCase().includes(searchQuery) || q.category.toLowerCase().includes(searchQuery);
    const matchDiff = filterDiff === "all" || q.difficulty === filterDiff;
    const matchCat = filterCat === "all" || q.category === filterCat;
    return matchSearch && matchDiff && matchCat;
  });

  filtered.forEach(q => {
    const isSolved = isSolvedByCurrentMember(q.id);
    const isFailed = !isSolved && isMe(STATE.currentMember) && !!STATE.failed[q.id];

    const item = document.createElement("div");
    item.className = `q-item ${q.id === STATE.currentQuestionId ? "active" : ""}`;
    item.dataset.id = q.id;

    item.innerHTML = `
      <div class="q-item-info">
        <span class="badge-tag ${q.difficulty}">${q.difficulty}</span>
        <div class="q-item-title">${q.title}</div>
      </div>
      <div class="q-item-status">
        <span class="status-badge ${isSolved ? 'solved' : ''} ${isFailed ? 'failed' : ''}">
          <i class="${isSolved ? 'fa-solid fa-circle-check' : isFailed ? 'fa-solid fa-circle-xmark' : 'fa-regular fa-circle'}"></i>
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

// 완료 = 문제 예제 입력을 모두 넣어 실행했을 때 출력이 예제 출력과 같았던 풀이 (채점 결과는 서버에 함께 저장된다)
export function isSolvedByCurrentMember(qId) {
  return !!(STATE.passed[qId] && STATE.passed[qId][STATE.currentMember]);
}

export function updateProgress() {
  if (STATE.round !== 1) { // 2차는 아직 문제가 없다
    document.getElementById("progress-label").textContent = `${nameOf(STATE.currentMember)} 완료율:`;
    document.getElementById("progress-percent").textContent = "0%";
    document.getElementById("progress-count").textContent = "0 / 0 완료";
    document.getElementById("progress-fill").style.width = "0%";
    return;
  }
  let solvedCount = 0;
  STATE.questions.forEach(q => {
    if (isSolvedByCurrentMember(q.id)) solvedCount++;
  });
  document.getElementById("progress-label").textContent = `${nameOf(STATE.currentMember)} 완료율:`;

  const percent = Math.round((solvedCount / (STATE.questions.length || 100)) * 100);
  document.getElementById("progress-percent").textContent = `${percent}%`;
  document.getElementById("progress-count").textContent = `${solvedCount} / ${STATE.questions.length || 100} 완료`;
  document.getElementById("progress-fill").style.width = `${percent}%`;
}
