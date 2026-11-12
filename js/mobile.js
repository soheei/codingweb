import { MIN_COMPARE, STATE, escapeHtml } from './config.js';
import { enterDiffMode, exitDiffMode, openComparePicker } from './compare.js';
import { isSolvedByCurrentMember, loadQuestion, stepQuestion } from './navigation.js';
import { saveLocal } from './storage.js';

const PANE_KEY = "codingmasters_mpane_v1"; // 마지막으로 쓴 하단 탭 (list | code | compare)
const PANES = ["list", "code", "compare"];

/* ==========================================================================
   모바일 전용 동작 (폭 860px 이하): 하단 탭(문제/코드/비교), 문제 설명 모달,
   입력/결과 전환, 키보드 위 단축키 줄. 데스크톱 화면에는 영향이 없다.
   ========================================================================== */
const $ = (id) => document.getElementById(id);
const isMobile = () => window.matchMedia("(max-width: 860px)").matches;

let pane = "list";          // 현재 탭: list | code | compare (처음 방문 기본값은 문제 탭)
let lastWorkPane = "code";  // 문제를 고른 뒤 돌아갈 탭 (code 또는 compare)

function paintPane() {
  document.body.dataset.mpane = pane;
  document.querySelectorAll("#m-nav button").forEach(b => b.classList.toggle("on", b.dataset.pane === pane));
}

// 탭을 직접 바꿨을 때만 저장한다. 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 조용히 넘어간다
function savePane() {
  try { localStorage.setItem(PANE_KEY, pane); } catch (e) { /* 무시 */ }
}
function readSavedPane() {
  try {
    const v = localStorage.getItem(PANE_KEY);
    return PANES.includes(v) ? v : null; // 값이 이상하면 없는 것으로 취급
  } catch (e) { return null; }
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
    const start = () => { enterDiffMode(); pane = "compare"; lastWorkPane = "compare"; savePane(); paintPane(); afterPaneChange(); };
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
  savePane();
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
  // 실제 보이는 높이(아이폰 주소창/키보드 반영)를 CSS 변수로 전달
  const vv = window.visualViewport;
  // 커서가 있는 줄이 에디터 안에서 보이도록 스크롤 (키보드로 에디터 높이가 바뀐 뒤)
  const keepCursorVisible = () => requestAnimationFrame(() => STATE.editor?.scrollIntoView(null, 32));
  const syncHeight = () => {
    const root = document.documentElement.style;
    const h = Math.round(vv ? vv.height : window.innerHeight);
    root.setProperty("--app-h", h + "px");
    // iOS 가 키보드를 띄우며 화면을 위로 옮긴 양. 키보드 상태(body.m-typing)에서 body 를 그만큼 내린다 (mobile.css)
    root.setProperty("--app-top", Math.round(vv ? vv.offsetTop : 0) + "px");
    if (isMobile() && (window.scrollY || (vv && vv.offsetTop))) window.scrollTo(0, 0);
    STATE.editor?.refresh();
    if (document.body.classList.contains("m-typing")) keepCursorVisible();
  };
  syncHeight();
  (vv || window).addEventListener("resize", syncHeight);
  vv?.addEventListener("scroll", syncHeight);
  window.addEventListener("orientationchange", () => setTimeout(syncHeight, 200));

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

  // 이전/다음 문제: 버튼과 스와이프가 같은 함수(step)를 쓴다.
  // 처음/마지막 문제라 이동할 수 없으면 버튼을 살짝 흔들어 알려 준다
  const step = (delta, btn) => {
    if (stepQuestion(delta)) return;
    // 누른 버튼(스와이프면 지금 탭에 보이는 버튼)을 흔든다
    const target = btn || [...document.querySelectorAll(`.q-step-btn[data-step="${delta}"]`)].find(b => b.offsetParent !== null);
    if (!target) return;
    target.classList.remove("bump");
    void target.offsetWidth; // 애니메이션을 처음부터 다시 재생
    target.classList.add("bump");
  };
  document.querySelectorAll(".q-step-btn[data-step]").forEach(btn => {
    btn.addEventListener("click", () => step(Number(btn.dataset.step), btn));
  });

  // 스와이프(코드 탭): 에디터 바깥에서 시작한 가로 스와이프만 인식한다.
  // 에디터, 탭 목록(가로 스크롤), 입력/결과 패널, 입력창, 문제 설명 모달은 제외 → 그 안의 터치·스크롤·선택 동작은 그대로
  const SWIPE_SKIP = ".CodeMirror, .member-tabs, .terminal-panel, .question-card, input, textarea, select";
  let swipe = null;
  const workspace = document.querySelector(".workspace");
  workspace?.addEventListener("touchstart", (e) => {
    swipe = null;
    if (!isMobile() || pane !== "code" || e.touches.length !== 1) return;
    if (document.body.classList.contains("desc-open") || document.body.classList.contains("picker-open")) return;
    if (e.target.closest(SWIPE_SKIP)) return;
    const t = e.touches[0];
    swipe = { x: t.clientX, y: t.clientY, at: Date.now() };
  }, { passive: true });
  workspace?.addEventListener("touchend", (e) => {
    if (!swipe) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, quick = Date.now() - swipe.at < 700;
    swipe = null;
    // 충분히 길고(60px), 거의 수평이고, 빠른 동작만: 세로 스크롤·탭과 헷갈리지 않게
    if (quick && Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 2) step(dx < 0 ? 1 : -1);
  }, { passive: true });
  workspace?.addEventListener("touchcancel", () => { swipe = null; }, { passive: true });

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

  // 코드 입력 중에는 화면 아래 영역(결과·탭)을 숨긴다
  let blurTimer = null;
  const view = $("standard-view");
  view.addEventListener("focusin", (e) => {
    if (!isMobile() || !e.target.closest(".CodeMirror")) return;
    clearTimeout(blurTimer);
    document.body.classList.add("m-typing");
    requestAnimationFrame(syncHeight); // 패널이 숨겨져 에디터가 커진 뒤 높이/커서 위치를 다시 맞춘다
  });
  view.addEventListener("focusout", (e) => {
    if (!e.target.closest(".CodeMirror")) return;
    blurTimer = setTimeout(() => {
      if (!document.activeElement?.closest?.(".CodeMirror")) document.body.classList.remove("m-typing");
      STATE.editor?.refresh();
    }, 200);
  });

  // 처음 화면: 마지막으로 쓴 탭. 저장된 값이 없거나 맞지 않으면 문제 탭에서 시작하고 자동으로 옮기지 않는다
  if (isMobile()) {
    const saved = readSavedPane();
    if (saved === "compare" && STATE.isDiffMode) pane = "compare";
    else if (saved === "code") { if (STATE.isDiffMode) exitDiffMode(); pane = "code"; }
    else pane = "list";
    // 문제를 고르면 돌아갈 작업 탭: 목록에서 시작해도 비교 중이었다면 비교로
    lastWorkPane = pane === "list" ? (STATE.isDiffMode ? "compare" : "code") : pane;
  } else {
    pane = STATE.isDiffMode ? "compare" : "code"; // 데스크톱은 탭이 없으니 기존 값 유지
    lastWorkPane = pane;
  }
  paintPane();
  afterPaneChange();

  // 폭이 넓어지면(회전 등) 모바일 상태를 정리한다
  window.addEventListener("resize", () => {
    if (!isMobile()) document.body.classList.remove("desc-open", "picker-open", "m-typing");
  });
}
