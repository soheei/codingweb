import { DEFAULT_CODE, MAX_COMPARE, MIN_COMPARE, STATE, moveItem, sortFavoritesFirst, toggleFavorite, STORAGE_KEY_COMPARE, escapeHtml, isMe, nameOf } from './config.js';
import { fetchSolutions, executeSave, updateSaveStatus } from './storage.js';
import { loadCurrentMemberCode, renderMemberTabs, saveViewState, switchOwner } from './navigation.js';
import { showToast } from './ui.js';

/* ==========================================================================
   N-Member Comparison View (나 + 1~5명 = 2~6명)
   - 내 카드만 편집 가능, 나머지는 읽기 전용(실행/복사 가능)
   - 카드 사이 경계선 드래그로 가로·세로 크기 자유 조절, 카드별 최대화
   ========================================================================== */
export const quadEditors = {};

// 인원별 기본 분할(열 × 행). 5명은 3×2 에서 마지막 카드가 2칸을 차지, 6명은 3×2
const LAYOUT = { 2: { c: 2, r: 1 }, 3: { c: 3, r: 1 }, 4: { c: 2, r: 2 }, 5: { c: 3, r: 2 }, 6: { c: 3, r: 2 } };
let cols = [];
let rows = [];
let maximized = null; // 최대화된 카드의 uid
const $ = (id) => document.getElementById(id);

export const compareList = () => [STATE.me.uid, ...STATE.compareUids];

/* ---------------------------------------------------------------- 선택 기억 */
const storageKey = () => `${STORAGE_KEY_COMPARE}_${STATE.me.uid}`;

export function loadCompareSelection() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    STATE.compareUids = saved.filter(uid => STATE.users.some(u => u.uid === uid) && uid !== STATE.me.uid).slice(0, MAX_COMPARE - 1);
  } catch (e) {
    STATE.compareUids = [];
  }
}

// 앱을 켠 직후 서버가 아직 깨어나는 중이면 사용자 목록을 못 받아 저장된 선택이 걸러져 비어 버린다.
// 나중에 목록을 받았는데 선택이 비어 있으면(사용자가 직접 비운 경우는 저장값도 비어 있다) 저장값에서 다시 복원한다. 복원했으면 true.
export function restoreSelectionIfEmpty() {
  if (STATE.compareUids.length) return false;
  loadCompareSelection();
  return STATE.compareUids.length > 0;
}

export function saveCompareSelection() {
  try { localStorage.setItem(storageKey(), JSON.stringify(STATE.compareUids)); } catch (e) { /* 무시 */ }
}

/* ---------------------------------------------------------------- 비교 대상 선택 모달 */
let draft = [];
let onPickApplied = null;

export function openComparePicker(onApplied) {
  onPickApplied = onApplied || null;
  draft = [...STATE.compareUids];
  $("compare-search").value = "";
  $("compare-me-name").textContent = STATE.me.displayName;
  renderPickerList();
  $("compare-modal").style.display = "flex";
}

function closePicker() { $("compare-modal").style.display = "none"; }

function renderPickerList() {
  const q = $("compare-search").value.trim().toLowerCase();
  const full = draft.length >= MAX_COMPARE - 1;
  const others = STATE.users.filter(u => u.uid !== STATE.me.uid && u.displayName.toLowerCase().includes(q));
  const { fav, rest } = sortFavoritesFirst(others);
  const row = (u) => {
    const on = draft.includes(u.uid);
    const dis = !on && full;
    const isFav = STATE.favorites.includes(u.uid);
    return `<label class="cmp-row ${dis ? "disabled" : ""}">
      <input type="checkbox" data-uid="${escapeHtml(u.uid)}" ${on ? "checked" : ""} ${dis ? "disabled" : ""}>
      <button type="button" class="fav-btn ${isFav ? "on" : ""}" data-uid="${escapeHtml(u.uid)}" title="${isFav ? "즐겨찾기 해제" : "즐겨찾기 (맨 위에 표시)"}"><i class="${isFav ? "fa-solid" : "fa-regular"} fa-star"></i></button>
      <span class="cmp-name">${escapeHtml(u.displayName)}<small>풀이 ${u.solvedCount}/100</small></span>
    </label>`;
  };
  $("compare-list").innerHTML = others.length
    ? (fav.length ? `<div class="cmp-section">즐겨찾기</div>${fav.map(row).join("")}<div class="cmp-section">전체</div>` : "") + rest.map(row).join("")
    : `<div class="owner-dd-empty">표시할 사용자가 없습니다</div>`;

  const total = draft.length + 1;
  const bad = total < MIN_COMPARE;
  const info = $("compare-sel-info");
  info.textContent = `선택 ${total}명 / ${MIN_COMPARE}~${MAX_COMPARE}명` + (bad ? " · 1명 이상 더 선택하세요" : full ? " · 최대 인원" : "");
  info.classList.toggle("bad", bad);
  $("btn-compare-apply").disabled = bad;
}

export function setupComparePicker() {
  $("compare-list").addEventListener("click", (e) => {
    const star = e.target.closest(".fav-btn");
    if (!star) return;
    e.preventDefault(); // 행(label)이 눌려 체크박스가 바뀌지 않도록
    e.stopPropagation();
    toggleFavorite(star.dataset.uid);
    renderPickerList();
  });
  $("compare-list").addEventListener("change", (e) => {
    const cb = e.target.closest("input[type=checkbox]");
    if (!cb) return;
    const uid = cb.dataset.uid;
    draft = cb.checked ? [...draft, uid] : draft.filter(x => x !== uid);
    renderPickerList();
  });
  $("compare-search").addEventListener("input", renderPickerList);
  $("btn-compare-clear").addEventListener("click", () => { draft = []; renderPickerList(); });
  $("btn-compare-cancel").addEventListener("click", closePicker);
  $("btn-close-compare-modal").addEventListener("click", closePicker);
  $("compare-modal").addEventListener("click", (e) => { if (e.target === $("compare-modal")) closePicker(); });
  $("btn-compare-apply").addEventListener("click", async () => {
    STATE.compareUids = [...draft];
    saveCompareSelection();
    closePicker();
    maximized = null;
    cols = []; rows = [];
    // 보고 있던 사람이 목록에서 빠졌으면 내 코드로 돌아간다
    if (STATE.currentMember !== STATE.me.uid && !STATE.compareUids.includes(STATE.currentMember)) {
      await switchOwner(STATE.me.uid);
    } else {
      renderMemberTabs();
    }
    onPickApplied?.();
    if (STATE.isDiffMode) await renderCompareView();
  });
  $("btn-change-compare").addEventListener("click", () => openComparePicker());
  $("btn-reset-layout").addEventListener("click", () => resetCompareLayout());
}

/* ---------------------------------------------------------------- 모드 전환 */
export function enterDiffMode() {
  STATE.isDiffMode = true;
  $("standard-view").style.display = "none";
  $("diff-view").style.display = "flex";
  $("diff-mode-text").textContent = "단일 에디터로 복귀";
  const btn = $("btn-toggle-diff-mode");
  btn.classList.replace("btn-accent", "btn-secondary");
  renderCompareView();
  saveViewState();
}

export function exitDiffMode() {
  STATE.isDiffMode = false;
  $("diff-view").style.display = "none";
  $("standard-view").style.display = "flex";
  $("diff-mode-text").textContent = "비교하기";
  const btn = $("btn-toggle-diff-mode");
  btn.classList.replace("btn-secondary", "btn-accent");
  loadCurrentMemberCode();
  renderMemberTabs();
  setTimeout(() => STATE.editor.refresh(), 50);
  saveViewState();
}

// "비교하기" 버튼: 비교 중이 아니면 대상 선택 후 진입, 비교 중이면 복귀
export function toggleDiffMode() {
  if (STATE.isDiffMode) return exitDiffMode();
  openComparePicker(() => enterDiffMode());
}

// 새로고침 후 비교 화면 복원용 (선택이 유효할 때만)
export function restoreDiffMode() {
  if (STATE.compareUids.length >= MIN_COMPARE - 1) enterDiffMode();
}

/* ---------------------------------------------------------------- 렌더링 */
// 카드 크기 비율은 인원수별로 기억해 새로고침해도 유지한다
const layoutKey = () => `${STORAGE_KEY_COMPARE}_layout_${STATE.me.uid}`;
function readLayouts() {
  try { return JSON.parse(localStorage.getItem(layoutKey()) || "{}") || {}; } catch (e) { return {}; }
}
function saveLayout() {
  const n = compareList().length;
  try {
    const all = readLayouts();
    all[n] = { cols, rows };
    localStorage.setItem(layoutKey(), JSON.stringify(all));
  } catch (e) { /* 무시 */ }
}
function clearLayout(n) {
  try {
    const all = readLayouts();
    delete all[n];
    localStorage.setItem(layoutKey(), JSON.stringify(all));
  } catch (e) { /* 무시 */ }
}
function resetSizes(n, useSaved = true) {
  const L = LAYOUT[n];
  const saved = useSaved ? readLayouts()[n] : null;
  const ok = saved && Array.isArray(saved.cols) && Array.isArray(saved.rows)
    && saved.cols.length === L.c && saved.rows.length === L.r
    && [...saved.cols, ...saved.rows].every(v => typeof v === "number" && v > 0.05);
  cols = ok ? [...saved.cols] : Array(L.c).fill(1);
  rows = ok ? [...saved.rows] : Array(L.r).fill(1);
}

function applyGridSizes() {
  const g = $("quad-diff-container");
  g.style.gridTemplateColumns = cols.map(x => `${x}fr`).join(" ");
  g.style.gridTemplateRows = rows.map(x => `${x}fr`).join(" ");
}

export async function renderCompareView() {
  const container = $("quad-diff-container");
  const qId = STATE.currentQuestionId;
  const list = compareList();
  const n = list.length;

  // 선택한 사람들의 풀이 확보
  try { await fetchSolutions(list); } catch (e) { showToast("일부 풀이를 불러오지 못했습니다."); }
  if (!STATE.isDiffMode || qId !== STATE.currentQuestionId) return;

  Object.keys(quadEditors).forEach(k => delete quadEditors[k]);
  container.innerHTML = "";
  if (!LAYOUT[n]) return;
  if (cols.length !== LAYOUT[n].c || rows.length !== LAYOUT[n].r) resetSizes(n);
  if (maximized && !list.includes(maximized)) maximized = null;

  // 헤더: 비교 대상 칩
  $("compare-chips").innerHTML = list.map(uid => {
    const me = isMe(uid);
    return `<span class="cmp-chip ${me ? "me" : ""}">${escapeHtml(nameOf(uid))}${me ? "" : `<button class="cmp-chip-x" data-uid="${escapeHtml(uid)}" title="비교에서 제외">×</button>`}</span>`;
  }).join("");
  $("compare-count").textContent = `${n}명 비교 중 (${MIN_COMPARE}~${MAX_COMPARE}명)`;

  list.forEach((uid, i) => {
    const me = isMe(uid);
    const stored = STATE.solutions[qId] && STATE.solutions[qId][uid];
    const code = stored || (me ? DEFAULT_CODE : "# 아직 풀지 않았습니다");

    const card = document.createElement("div");
    card.className = "quad-card";
    card.dataset.uid = uid;
    if (n === 5 && i === 4) card.style.gridColumn = "span 2";
    if (maximized && maximized !== uid) card.style.display = "none";

    card.innerHTML = `
      <div class="quad-card-header">
        <span class="quad-member-name"><span class="cmp-card-name">${escapeHtml(nameOf(uid))}</span>
          <span class="mode-badge ${me ? "edit" : "ro"}">${me ? "편집" : "읽기 전용"}</span></span>
        <div class="quad-card-tools">
          <button class="btn btn-sm btn-secondary btn-copy-member" data-uid="${escapeHtml(uid)}" title="코드 복사"><i class="fa-solid fa-copy"></i><span class="btn-label"> 복사</span></button>
          <button class="btn btn-sm btn-primary btn-run-member" data-uid="${escapeHtml(uid)}" title="이 코드만 단독 실행"><i class="fa-solid fa-play"></i><span class="btn-label"> 실행</span></button>
          <button class="btn btn-sm btn-secondary btn-zoom-member" data-uid="${escapeHtml(uid)}" title="이 카드만 크게 보기 / 원래대로">
            <i class="fa-solid ${maximized === uid ? "fa-compress" : "fa-expand"}"></i></button>
        </div>
      </div>
      <div class="quad-editor-body"><textarea id="quad-editor-${uid}"></textarea></div>
      <div class="quad-output-bar" id="quad-out-${uid}">대기중 (실행 결과가 여기에 표시됩니다)</div>`;
    container.appendChild(card);

    // 내 카드는 맨 앞에 고정, 다른 사람 카드는 머리글을 잡아 끌어 순서를 바꿀 수 있다
    if (!me) {
      const header = card.querySelector(".quad-card-header");
      header.draggable = true;
      header.classList.add("draggable-header");
      header.title = "머리글을 끌어서 다른 카드 위에 놓으면 순서가 바뀝니다";
      header.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", uid); e.dataTransfer.effectAllowed = "move"; card.classList.add("dragging-card"); });
      header.addEventListener("dragend", () => card.classList.remove("dragging-card"));
    }
    card.addEventListener("dragover", (e) => { if (!me) { e.preventDefault(); card.classList.add("drop-target"); } });
    card.addEventListener("dragleave", () => card.classList.remove("drop-target"));
    card.addEventListener("drop", async (e) => {
      card.classList.remove("drop-target");
      if (me) return;
      e.preventDefault();
      const from = e.dataTransfer.getData("text/plain");
      if (!from || from === uid || !STATE.compareUids.includes(from)) return;
      STATE.compareUids = moveItem(STATE.compareUids, from, uid);
      saveCompareSelection();
      renderMemberTabs();
      await renderCompareView();
    });

    const cm = CodeMirror.fromTextArea(card.querySelector("textarea"), {
      mode: "python",
      theme: "default",
      lineNumbers: true,
      autoCloseBrackets: me,
      indentUnit: 4,
      tabSize: 4,
      inputStyle: window.matchMedia("(pointer: coarse)").matches ? "contenteditable" : "textarea",
      readOnly: me ? false : true
    });
    cm.setValue(code);
    if (me) {
      cm.on("change", () => {
        if (!STATE.solutions[qId]) STATE.solutions[qId] = {};
        STATE.solutions[qId][uid] = cm.getValue();
        STATE.hasUnsavedChanges = true;
        updateSaveStatus("dirty");
        if (STATE.isAutoSaveEnabled) {
          if (STATE.saveTimer) clearTimeout(STATE.saveTimer);
          STATE.saveTimer = setTimeout(() => executeSave(false), 800);
        }
      });
    }
    quadEditors[uid] = cm;
  });

  if (maximized) {
    container.style.gridTemplateColumns = "1fr";
    container.style.gridTemplateRows = "1fr";
  } else {
    applyGridSizes();
  }
  requestAnimationFrame(() => { refreshEditors(); placeHandles(); });
}

function refreshEditors() {
  Object.values(quadEditors).forEach(cm => cm.refresh());
}

/* ---------------------------------------------------------------- 크기 조절 핸들 */
// 핸들은 렌더링할 때 한 번만 만들고, 크기를 바꿀 때는 위치만 갱신한다
// (드래그 중에 요소를 지우고 다시 만들면 포인터 추적이 끊긴다)
// 카드 크기를 기본(균등 분할)으로 되돌린다 — 경계선 더블클릭, "창 크기 기본값" 버튼 공용
function resetCompareLayout() {
  if (maximized) return;
  const n = $("quad-diff-container").querySelectorAll(".quad-card").length;
  if (!n) return;
  clearLayout(n);
  resetSizes(n, false);
  applyGridSizes();
  requestAnimationFrame(() => { refreshEditors(); positionHandles(); });
}

function placeHandles() {
  const container = $("quad-diff-container");
  container.querySelectorAll(".resize-handle").forEach(h => h.remove());
  if (maximized) return;
  const cards = [...container.querySelectorAll(".quad-card")];
  if (cards.length < 2 || window.matchMedia("(max-width: 860px)").matches) return;

  const add = (type, idx) => {
    const h = document.createElement("div");
    h.className = `resize-handle ${type}`;
    h.dataset.type = type;
    h.dataset.idx = String(idx);
    h.title = "드래그: 크기 조절 / 더블클릭: 균등 분할";
    h.addEventListener("dblclick", resetCompareLayout);
    h.addEventListener("pointerdown", (e) => startDrag(e, h, type, idx));
    container.appendChild(h);
  };
  for (let c = 0; c < cols.length - 1; c++) add("v", c);
  for (let r = 0; r < rows.length - 1; r++) add("h", r);
  positionHandles();
}

function positionHandles() {
  const container = $("quad-diff-container");
  const cards = [...container.querySelectorAll(".quad-card")];
  const handles = [...container.querySelectorAll(".resize-handle")];
  if (!handles.length) return;
  const C = container.getBoundingClientRect();
  const rect = (el) => el.getBoundingClientRect();
  const nCols = cols.length;
  const nRows = rows.length;

  handles.forEach(h => {
    const idx = Number(h.dataset.idx);
    if (h.dataset.type === "v") {
      // 세로 경계선: 그 경계가 카드 가장자리인 행들에 걸쳐서만 놓는다 (병합된 카드 안쪽은 제외)
      const top = rect(cards[idx]);
      let bottom = top;
      for (let r = 1; r < nRows; r++) {
        const rowCards = cards.slice(r * nCols, (r + 1) * nCols).filter(Boolean);
        if (rowCards.some(card => Math.abs(rect(card).right - top.right) < 3)) bottom = rect(rowCards[0]);
      }
      h.style.left = `${top.right + 4 - C.left + container.scrollLeft}px`;
      h.style.top = `${top.top - C.top}px`;
      h.style.height = `${bottom.bottom - top.top}px`;
    } else {
      const first = rect(cards[idx * nCols]);
      h.style.top = `${first.bottom + 4 - C.top + container.scrollTop}px`;
      h.style.left = "8px";
      h.style.width = `${C.width - 16}px`;
    }
  });
}

function startDrag(e, handle, type, idx) {
  e.preventDefault();
  handle.setPointerCapture(e.pointerId);
  handle.classList.add("dragging");
  const container = $("quad-diff-container");
  const arr = type === "v" ? cols : rows;
  const total = arr.reduce((a, b) => a + b, 0);
  const px = type === "v" ? container.clientWidth - 16 : container.clientHeight - 16;
  const start = type === "v" ? e.clientX : e.clientY;
  const a0 = arr[idx], b0 = arr[idx + 1];
  const MIN = 0.2;
  let raf = 0;

  const onMove = (ev) => {
    const d = ((type === "v" ? ev.clientX : ev.clientY) - start) / px * total;
    arr[idx] = Math.max(MIN, Math.min(a0 + b0 - MIN, a0 + d));
    arr[idx + 1] = a0 + b0 - arr[idx];
    applyGridSizes();
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; refreshEditors(); positionHandles(); });
  };
  const onUp = () => {
    handle.classList.remove("dragging");
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);
    positionHandles();
    saveLayout();
  };
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
}

/* ---------------------------------------------------------------- 카드 버튼 · 헤더 버튼 */
export function setupCompareView() {
  const container = $("quad-diff-container");
  container.addEventListener("click", async (e) => {
    const copy = e.target.closest(".btn-copy-member");
    const run = e.target.closest(".btn-run-member");
    const zoom = e.target.closest(".btn-zoom-member");
    if (copy) {
      const cm = quadEditors[copy.dataset.uid];
      navigator.clipboard.writeText(cm ? cm.getValue() : "");
      showToast(`${nameOf(copy.dataset.uid)}님의 코드가 클립보드에 복사되었습니다!`);
    } else if (run) {
      await runSingleMemberCode(run.dataset.uid);
    } else if (zoom) {
      maximized = maximized === zoom.dataset.uid ? null : zoom.dataset.uid;
      await renderCompareView();
    }
  });

  $("compare-chips").addEventListener("click", async (e) => {
    const x = e.target.closest(".cmp-chip-x");
    if (!x) return;
    if (STATE.compareUids.length <= MIN_COMPARE - 1) {
      alert(`최소 ${MIN_COMPARE}명(나 + 1명)은 비교해야 합니다.`);
      return;
    }
    STATE.compareUids = STATE.compareUids.filter(uid => uid !== x.dataset.uid);
    saveCompareSelection();
    cols = []; rows = [];
    if (STATE.currentMember === x.dataset.uid) STATE.currentMember = STATE.me.uid;
    renderMemberTabs();
    await renderCompareView();
  });

  window.addEventListener("resize", () => { if (STATE.isDiffMode) { refreshEditors(); placeHandles(); } });
}

/* ---------------------------------------------------------------- 실행 */
// 비교 창에서도 사용자가 입력창에 적은 input값을 그대로 주입하여 실행
export async function runSingleMemberCode(uid) {
  if (!STATE.isPyodideReady) {
    showToast("Python 준비 중입니다...");
    return;
  }

  const outBar = document.getElementById(`quad-out-${uid}`);
  if (!outBar) return;
  outBar.textContent = "실행 중...";
  outBar.style.color = "#d97706";

  const code = quadEditors[uid] ? quadEditors[uid].getValue() : DEFAULT_CODE;
  const userInput = document.getElementById("user-custom-input").value;
  const normalizedInput = userInput.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  try {
    const setupPyScript = `
import sys
import io
import builtins

_raw_user_input = ${JSON.stringify(normalizedInput)}

class SafeCustomStdin:
    def __init__(self, text):
        self.stream = io.StringIO(text)
        self.lines = [line + '\\n' for line in text.split('\\n')]
        if text.endswith('\\n') and len(self.lines) > 0:
            self.lines.pop()

    def readline(self, size=-1):
        return self.stream.readline(size)

    def read(self, size=-1):
        return self.stream.read(size)

    def readlines(self):
        return self.stream.readlines()

    def __iter__(self):
        return iter(self.lines)

sys.stdin = SafeCustomStdin(_raw_user_input)
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()

def _safe_input(prompt=None):
    if prompt is not None and prompt != '':
        sys.stdout.write(str(prompt))
    line = sys.stdin.readline()
    if not line:
        raise EOFError("EOFError: 입력값이 부족합니다.")
    return line.rstrip('\\r\\n')

builtins.input = _safe_input
`;

    await STATE.pyodide.runPythonAsync(setupPyScript);
    await STATE.pyodide.runPythonAsync(code);

    const stdout = await STATE.pyodide.runPythonAsync("sys.stdout.getvalue()");
    const stderr = await STATE.pyodide.runPythonAsync("sys.stderr.getvalue()");

    if (stderr && stderr.trim()) {
      outBar.textContent = `[에러] ${stderr.trim().split("\n").pop()}`;
      outBar.style.color = "#dc2626";
    } else if (stdout && stdout.trim()) {
      outBar.textContent = `[출력] ${stdout.trim().replace(/\n/g, " | ")}`;
      outBar.style.color = "#0284c7";
    } else {
      outBar.textContent = "[정상 완료] 출력 내용 없음";
      outBar.style.color = "#16a34a";
    }
  } catch (err) {
    outBar.textContent = `[예외] ${err.message.split("\n")[0]}`;
    outBar.style.color = "#dc2626";
  }
}

export async function runAllMembersSimultaneously() {
  for (const uid of compareList()) {
    await runSingleMemberCode(uid);
  }
  showToast(`${compareList().length}명의 코드가 동일한 입력값으로 일괄 검증되었습니다!`);
}
