import { STATE } from './config.js';

/* ==========================================================================
   Column Resizer: 문제 설명 | 에디터 | 문제 목록 경계를 드래그해 가로 폭 조절
   ========================================================================== */
const STORAGE_KEY_COLUMNS = "codingmasters_columns_v1";
const MIN_LEFT = 240;
const MIN_RIGHT = 220;
const MIN_CENTER = 360;

/* ==========================================================================
   Row Resizer (좁은 화면): 문제 목록 / 문제 설명 / 코드 입력창 높이를 위아래로 드래그해 조절
   ========================================================================== */
const STORAGE_KEY_ROWS = "codingmasters_rows_v1";
const ROW_TARGETS = {
  list:   { cssVar: "--list-h",   selector: ".sidebar-questions", min: 120 },
  desc:   { cssVar: "--desc-h",   selector: ".question-desc",     min: 40 },
  editor: { cssVar: "--editor-h", selector: ".code-editor-wrapper", min: 120 }
};

export function setupRowResizers() {
  const root = document.documentElement;
  const handles = document.querySelectorAll(".row-resizer");
  if (!handles.length) return;

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY_ROWS)) || {}; } catch (e) { /* 무시 */ }
  const persist = () => {
    try { localStorage.setItem(STORAGE_KEY_ROWS, JSON.stringify(saved)); } catch (e) { /* 무시 */ }
  };
  Object.entries(ROW_TARGETS).forEach(([key, t]) => {
    if (saved[key]) root.style.setProperty(t.cssVar, `${saved[key]}px`);
  });

  handles.forEach((handle) => {
    const key = handle.dataset.target;
    const t = ROW_TARGETS[key];
    if (!t) return;

    handle.addEventListener("pointerdown", (down) => {
      const target = document.querySelector(t.selector);
      if (!target) return;
      down.preventDefault();
      handle.setPointerCapture(down.pointerId);
      handle.classList.add("dragging");
      document.body.classList.add("row-resizing");

      const startY = down.clientY;
      const startH = target.getBoundingClientRect().height;
      let frame = 0;

      const onMove = (e) => {
        const h = Math.max(t.min, Math.round(startH + e.clientY - startY));
        root.style.setProperty(t.cssVar, `${h}px`);
        saved[key] = h;
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; STATE.editor?.refresh(); });
      };
      const onUp = () => {
        handle.releasePointerCapture(down.pointerId);
        handle.classList.remove("dragging");
        document.body.classList.remove("row-resizing");
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        persist();
        STATE.editor?.refresh();
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });

    // 더블클릭하면 기본 높이로 복원
    handle.addEventListener("dblclick", () => {
      root.style.removeProperty(t.cssVar);
      delete saved[key];
      persist();
      STATE.editor?.refresh();
    });
  });
}

export function setupColumnResizers() {
  const container = document.querySelector(".main-container");
  const leftHandle = document.getElementById("resizer-left");
  const rightHandle = document.getElementById("resizer-right");
  const questionCard = document.querySelector(".question-card");
  const sidebar = document.querySelector(".sidebar-questions");
  if (!container || !leftHandle || !rightHandle || !questionCard || !sidebar) return;

  const isDesktop = () => window.matchMedia("(min-width: 861px)").matches;

  const apply = (left, right) => {
    const total = container.clientWidth;
    left = Math.max(MIN_LEFT, Math.min(left, total - MIN_RIGHT - MIN_CENTER));
    right = Math.max(MIN_RIGHT, Math.min(right, total - left - MIN_CENTER));
    container.style.setProperty("--left-w", `${left}px`);
    container.style.setProperty("--right-w", `${right}px`);
    return { left, right };
  };

  const save = (left, right) => {
    try { localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify({ left, right })); } catch (e) { /* 저장 불가 환경은 무시 */ }
  };

  const refreshEditor = () => STATE.editor?.refresh();

  // 초기 폭: 저장된 값이 있으면 복원, 없으면 현재 렌더된 폭 사용
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY_COLUMNS)); } catch (e) { /* 무시 */ }
  const init = () => {
    if (!isDesktop()) return;
    const cur = saved && saved.left && saved.right
      ? saved
      : { left: questionCard.getBoundingClientRect().width, right: sidebar.getBoundingClientRect().width };
    apply(cur.left, cur.right);
    refreshEditor();
  };
  init();

  const startDrag = (side) => (downEvent) => {
    if (!isDesktop()) return;
    downEvent.preventDefault();
    const handle = downEvent.currentTarget;
    handle.setPointerCapture(downEvent.pointerId);
    handle.classList.add("dragging");
    document.body.classList.add("col-resizing");

    let current = {
      left: questionCard.getBoundingClientRect().width,
      right: sidebar.getBoundingClientRect().width
    };
    let frame = 0;

    const onMove = (e) => {
      const rect = container.getBoundingClientRect();
      const next = side === "left"
        ? { left: e.clientX - rect.left, right: current.right }
        : { left: current.left, right: rect.right - e.clientX };
      current = apply(next.left, next.right);
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; refreshEditor(); });
    };
    const onUp = () => {
      handle.releasePointerCapture(downEvent.pointerId);
      handle.classList.remove("dragging");
      document.body.classList.remove("col-resizing");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      save(current.left, current.right);
      refreshEditor();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  leftHandle.addEventListener("pointerdown", startDrag("left"));
  rightHandle.addEventListener("pointerdown", startDrag("right"));

  // 더블클릭하면 기본 폭으로 복원
  const reset = () => {
    container.style.removeProperty("--left-w");
    container.style.removeProperty("--right-w");
    try { localStorage.removeItem(STORAGE_KEY_COLUMNS); } catch (e) { /* 무시 */ }
    saved = null;
    init();
  };
  leftHandle.addEventListener("dblclick", reset);
  rightHandle.addEventListener("dblclick", reset);

  // 창 크기가 바뀌면 현재 폭을 새 창 크기에 맞게 보정
  window.addEventListener("resize", () => {
    if (!isDesktop()) return;
    const l = parseFloat(container.style.getPropertyValue("--left-w"));
    const r = parseFloat(container.style.getPropertyValue("--right-w"));
    if (l && r) { apply(l, r); refreshEditor(); }
  });
}

/* ==========================================================================
   Terminal Resizer: 코드 입력창 아래 "입력값 / 실행 결과" 패널 높이를 위아래로 드래그해 조절
   - 가운데 회색 막대(접기/펴기 버튼 줄)를 잡고 위아래로 끈다. 더블클릭하면 기본 높이로 복원.
   ========================================================================== */
const STORAGE_KEY_TERMINAL = "codingmasters_terminal_v1";

export function setupTerminalResizer() {
  const grid = document.querySelector(".editor-grid");
  const bar = document.querySelector(".terminal-toggle-bar");
  const panel = document.querySelector(".terminal-panel");
  const inputSection = document.querySelector(".input-panel-section");
  if (!grid || !bar || !panel) return;

  const MIN = 90;
  const isNarrow = () => window.matchMedia("(max-width: 860px)").matches;
  const apply = (h) => grid.style.setProperty("--terminal-h", `${h}px`);

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_TERMINAL));
    if (saved && saved.h >= MIN) apply(saved.h);
  } catch (e) { /* 무시 */ }

  bar.title = "위아래로 드래그해서 입력/실행결과 패널 높이 조절 (더블클릭: 초기화)";

  bar.addEventListener("pointerdown", (down) => {
    if (down.target.closest("button")) return; // 접기/펴기 버튼은 그대로 동작
    if (grid.classList.contains("terminal-collapsed")) return;
    down.preventDefault();
    bar.setPointerCapture(down.pointerId);
    bar.classList.add("dragging");
    document.body.classList.add("row-resizing");

    const startY = down.clientY;
    const startH = isNarrow() ? inputSection.getBoundingClientRect().height : panel.getBoundingClientRect().height;
    const maxH = () => Math.max(MIN, grid.getBoundingClientRect().height - 140);
    let h = startH;
    let frame = 0;

    const onMove = (e) => {
      h = Math.round(Math.max(MIN, Math.min(maxH(), startH - (e.clientY - startY))));
      apply(h);
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; STATE.editor?.refresh(); });
    };
    const onUp = () => {
      bar.classList.remove("dragging");
      document.body.classList.remove("row-resizing");
      bar.removeEventListener("pointermove", onMove);
      bar.removeEventListener("pointerup", onUp);
      bar.removeEventListener("pointercancel", onUp);
      try { localStorage.setItem(STORAGE_KEY_TERMINAL, JSON.stringify({ h })); } catch (e) { /* 무시 */ }
      STATE.editor?.refresh();
    };
    bar.addEventListener("pointermove", onMove);
    bar.addEventListener("pointerup", onUp);
    bar.addEventListener("pointercancel", onUp);
  });

  bar.addEventListener("dblclick", (e) => {
    if (e.target.closest("button")) return;
    grid.style.removeProperty("--terminal-h");
    try { localStorage.removeItem(STORAGE_KEY_TERMINAL); } catch (err) { /* 무시 */ }
    STATE.editor?.refresh();
  });
}
