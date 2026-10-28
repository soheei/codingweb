import { STATE } from './config.js';

/* ==========================================================================
   Column Resizer: 문제 설명 | 에디터 | 문제 목록 경계를 드래그해 가로 폭 조절
   ========================================================================== */
const STORAGE_KEY_COLUMNS = "codingmasters_columns_v1";
const MIN_LEFT = 240;
const MIN_RIGHT = 220;
const MIN_CENTER = 360;

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
