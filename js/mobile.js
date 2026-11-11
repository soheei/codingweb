import { MIN_COMPARE, STATE, escapeHtml } from './config.js';
import { enterDiffMode, exitDiffMode, openComparePicker } from './compare.js';
import { isSolvedByCurrentMember, loadQuestion } from './navigation.js';
import { saveLocal } from './storage.js';

/* ==========================================================================
   모바일 전용 동작 (폭 860px 이하): 하단 탭(문제/코드/비교), 문제 설명 모달,
   입력/결과 전환, 키보드 위 단축키 줄. 데스크톱 화면에는 영향이 없다.
   ========================================================================== */
const $ = (id) => document.getElementById(id);
const isMobile = () => window.matchMedia("(max-width: 860px)").matches;

let pane = "code";          // 현재 탭: list | code | compare
let lastWorkPane = "code";  // 문제를 고른 뒤 돌아갈 탭 (code 또는 compare)

function paintPane() {
  document.body.dataset.mpane = pane;
  document.querySelectorAll("#m-nav button").forEach(b => b.classList.toggle("on", b.dataset.pane === pane));
}

function afterPaneChange() {
  // 숨겨져 있던 CodeMirror는 보이게 된 뒤에 한 번 다시 그려야 한다
  setTimeout(() => {
    STATE.editor?.refresh();
    window.dispatchEvent(new Event("resize")); // 비교 카드 에디터 갱신
  }, 60);
}

export function setPane(next) {
  if (next === "compare") {
    const start = () => { enterDiffMode(); pane = "compare"; lastWorkPane = "compare"; paintPane(); afterPaneChange(); };
    if (STATE.isDiffMode) { start(); return; }
    // 이미 비교할 사람을 골라 둔 상태면 선택창 없이 바로 들어간다 ("비교 대상 변경" 버튼으로 바꿀 수 있다)
    if (STATE.compareUids.length >= MIN_COMPARE - 1) start();
    else openComparePicker(start);
    return;
  }
  if (next === "code") {
    if (STATE.isDiffMode) exitDiffMode();
    lastWorkPane = "code";
  }
  pane = next;
  paintPane();
  afterPaneChange();
}

/* ---------------------------------------------------------------- 문제 설명 모달 */
let descPushed = false;
function openDesc() {
  if (document.body.classList.contains("desc-open")) return;
  document.body.classList.add("desc-open");
  try { history.pushState({ desc: 1 }, ""); descPushed = true; } catch (e) { descPushed = false; }
  $("current-q-desc")?.scrollTo?.(0, 0);
}
function closeDesc() {
  if (!document.body.classList.contains("desc-open")) return;
  document.body.classList.remove("desc-open");
  if (descPushed) { descPushed = false; try { history.back(); } catch (e) { /* 무시 */ } }
}

/* ---------------------------------------------------------------- 문제 번호 선택 모달 */
let pickerPushed = false;
const statusIcon = (solved, failed) =>
  solved ? "fa-solid fa-circle-check" : failed ? "fa-solid fa-circle-xmark" : "fa-regular fa-circle";

function renderPickerList() {
  const grid = $("m-picker-grid");
  const kw = $("m-picker-search").value.trim().toLowerCase();
  const rows = STATE.questions.filter(q => !kw || String(q.id).includes(kw) || q.title.toLowerCase().includes(kw));
  grid.innerHTML = rows.length ? "" : '<div class="mp-empty">검색 결과가 없습니다.</div>';
  rows.forEach(q => {
    const solved = isSolvedByCurrentMember(q.id);
    const failed = !solved && !!STATE.failed?.[q.id];
    const b = document.createElement("button");
    b.type = "button";
    b.className = `mp-row${solved ? " solved" : ""}${failed ? " failed" : ""}${q.id === STATE.currentQuestionId ? " active" : ""}`;
    b.innerHTML = `<span class="mp-n">${q.id}</span><span class="mp-t">${escapeHtml(q.title)}</span>` +
      `<span class="badge-tag ${escapeHtml(q.difficulty)}">${escapeHtml(q.difficulty)}</span>` +
      `<span class="mp-s"><i class="${statusIcon(solved, failed)}"></i></span>`;
    b.addEventListener("click", () => {
      if (STATE.hasUnsavedChanges) saveLocal();
      loadQuestion(q.id); // 코드/비교 탭 그대로, 문제만 바뀐다
      closePicker();
    });
    grid.appendChild(b);
  });
}

function openPicker() {
  $("m-picker-search").value = "";
  const done = STATE.questions.filter(q => isSolvedByCurrentMember(q.id)).length;
  $("m-picker-progress").textContent = `완료 ${done} / ${STATE.questions.length}`;
  renderPickerList();
  document.body.classList.add("picker-open");
  try { history.pushState({ picker: 1 }, ""); pickerPushed = true; } catch (e) { pickerPushed = false; }
  $("m-picker-grid").querySelector(".active")?.scrollIntoView({ block: "center" });
}
function closePicker() {
  if (!document.body.classList.contains("picker-open")) return;
  document.body.classList.remove("picker-open");
  if (pickerPushed) { pickerPushed = false; try { history.back(); } catch (e) { /* 무시 */ } }
}

export function setupMobile() {
  paintPane();

  // 문제 번호 버튼 → 문제 선택 모달 (코드 탭, 비교 탭 공통)
  $("m-qbar-num").addEventListener("click", openPicker);
  $("m-picker-close").addEventListener("click", closePicker);
  $("m-picker-search").addEventListener("input", renderPickerList);
  $("m-picker").addEventListener("click", (e) => { if (e.target === $("m-picker")) closePicker(); });

  // 하단 탭
  document.querySelectorAll("#m-nav button").forEach(btn => {
    btn.addEventListener("click", () => setPane(btn.dataset.pane));
  });

  // 문제를 고르면 마지막으로 쓰던 작업 탭(코드/비교)으로 이동
  $("question-list").addEventListener("click", (e) => {
    if (!isMobile() || !e.target.closest(".q-item")) return;
    setPane(lastWorkPane);
  });

  // 문제 설명 모달: ✕ / 아래 버튼 / 바깥 영역 / Esc / 뒤로가기로 닫는다
  $("m-desc-open").addEventListener("click", openDesc);
  $("m-desc-close").addEventListener("click", closeDesc);
  $("m-desc-done").addEventListener("click", closeDesc);
  $("m-backdrop").addEventListener("click", closeDesc);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeDesc(); closePicker(); } });
  window.addEventListener("popstate", () => {
    // 뒤로가기: 모달만 닫고 앱은 그대로 둔다
    if (document.body.classList.contains("desc-open")) {
      descPushed = false;
      document.body.classList.remove("desc-open");
    }
    if (document.body.classList.contains("picker-open")) {
      pickerPushed = false;
      document.body.classList.remove("picker-open");
    }
  });

  // 문제 요약줄 배치(모바일): Q.24 제목 ........ [저장 표시][초기화][저장][실행][문제 보기]
  // 넓은 화면으로 돌아가면 모두 원래 자리로 되돌린다
  const saveTag = $("autosave-status");
  const tools = document.querySelector(".editor-tools");
  const qbar = $("m-qbar");
  // 비교 탭에서 쓰는 두 버튼(비교 대상 변경 / 전체 동시 검증)도 같은 줄로 옮긴다
  const cmpBtns = [$("btn-change-compare"), $("btn-run-all-members")].filter(Boolean);
  const placeToolbar = () => {
    if (!saveTag || !tools) return;
    if (isMobile()) {
      if (tools.parentElement !== qbar) {
        qbar.insertBefore(tools, $("m-desc-open")); // 저장 표시는 tools 안(초기화 버튼 왼쪽)에 그대로 있다
        cmpBtns.forEach(b => qbar.insertBefore(b, $("m-desc-open")));
      }
    } else if (tools.parentElement === qbar) {
      document.querySelector(".editor-header").appendChild(tools);
      cmpBtns.forEach(b => $("diff-view").querySelector(".diff-actions").appendChild(b));
    }
  };
  placeToolbar();
  window.addEventListener("resize", placeToolbar);

  // 햄버거(사용자) 메뉴의 노트북 내보내기
  $("btn-menu-notebook").addEventListener("click", () => {
    $("user-chip").classList.remove("open");
    $("btn-open-notebook-modal").click();
  });

  // 입력 / 결과 전환
  const panel = document.querySelector(".terminal-panel");
  const setTermTab = (tab) => {
    panel.dataset.tab = tab;
    panel.querySelectorAll(".m-term-tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  };
  panel.querySelectorAll(".m-term-tabs button").forEach(b => b.addEventListener("click", () => setTermTab(b.dataset.tab)));
  // 실행하면 결과 탭으로 자동 이동 (패널이 접혀 있으면 펼친다)
  $("btn-run-code").addEventListener("click", () => {
    if (!isMobile()) return;
    document.querySelector(".editor-grid")?.classList.remove("terminal-collapsed");
    setTermTab("out");
  });

  // 코드 입력 중에는 화면 아래 영역(결과·탭)을 숨기고 단축키 줄을 보여 준다
  let blurTimer = null;
  const view = $("standard-view");
  view.addEventListener("focusin", (e) => {
    if (!isMobile() || !e.target.closest(".CodeMirror")) return;
    clearTimeout(blurTimer);
    document.body.classList.add("m-typing");
  });
  view.addEventListener("focusout", (e) => {
    if (!e.target.closest(".CodeMirror")) return;
    blurTimer = setTimeout(() => {
      if (!document.activeElement?.closest?.(".CodeMirror")) document.body.classList.remove("m-typing");
      STATE.editor?.refresh();
    }, 200);
  });
  // 단축키: 누를 때 에디터가 포커스를 잃어 키보드가 닫히지 않도록 기본 동작을 막는다
  $("m-keys").querySelectorAll("button").forEach(b => {
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      if (!STATE.editor || STATE.editor.getOption("readOnly")) return;
      STATE.editor.replaceSelection(b.dataset.k);
      STATE.editor.focus();
    });
  });

  // 처음 화면: 저장된 비교 화면이 있으면 비교, 아니면 코드
  pane = STATE.isDiffMode ? "compare" : "code";
  lastWorkPane = pane;
  paintPane();
  afterPaneChange();

  // 폭이 넓어지면(회전 등) 모바일 상태를 정리한다
  window.addEventListener("resize", () => {
    if (!isMobile()) document.body.classList.remove("desc-open", "picker-open", "m-typing");
  });
}
