import { DEFAULT_CODE, FIXED_MEMBERS, STATE } from './config.js';
import { showToast } from './ui.js';

/* ==========================================================================
   Jupyter Notebook Export (사람 + 문제 번호 범위 → .ipynb 1개)
   ========================================================================== */
export function setupNotebookExport() {
  const modal = document.getElementById("notebook-modal");
  const memberSelect = document.getElementById("notebook-member");
  const fromInput = document.getElementById("notebook-from");
  const toInput = document.getElementById("notebook-to");
  const skipTemplate = document.getElementById("notebook-skip-template");
  if (!modal) return;

  memberSelect.innerHTML = FIXED_MEMBERS.map(m => `<option value="${m}">${m}</option>`).join("");

  const close = () => { modal.style.display = "none"; };
  document.getElementById("btn-open-notebook-modal").addEventListener("click", () => {
    memberSelect.value = STATE.currentMember;
    modal.style.display = "flex";
  });
  document.getElementById("btn-close-notebook-modal").addEventListener("click", close);
  document.getElementById("btn-cancel-notebook").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  const toLines = (text) => text.split("\n").map((line, i, arr) => (i < arr.length - 1 ? line + "\n" : line));
  const normalize = (s) => s.split("\n").map(l => l.trimEnd()).join("\n").trim();

  document.getElementById("btn-confirm-notebook").addEventListener("click", () => {
    const member = memberSelect.value;
    let from = parseInt(fromInput.value, 10);
    let to = parseInt(toInput.value, 10);
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      alert("문제 번호를 숫자로 입력해주세요.");
      return;
    }
    if (from > to) [from, to] = [to, from];

    const cells = [];
    STATE.questions
      .filter(q => q.id >= from && q.id <= to)
      .sort((a, b) => a.id - b.id)
      .forEach(q => {
        const code = (STATE.solutions[q.id] && STATE.solutions[q.id][member]) || "";
        if (!code.trim()) return;
        if (skipTemplate.checked && normalize(code) === normalize(DEFAULT_CODE)) return;
        cells.push({
          cell_type: "markdown",
          metadata: {},
          source: toLines(`## ${q.id}. ${q.title}\n\n난이도: ${q.difficulty} · 분류: ${q.category}\n\n${q.desc}`)
        });
        cells.push({
          cell_type: "code",
          execution_count: null,
          metadata: {},
          outputs: [],
          source: toLines(code.replace(/\s+$/, ""))
        });
      });

    if (cells.length === 0) {
      alert(`${member}님이 ${from}~${to}번에 작성한 풀이가 없습니다.`);
      return;
    }

    const notebook = {
      cells,
      metadata: {
        kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
        language_info: { name: "python" }
      },
      nbformat: 4,
      nbformat_minor: 5
    };
    const blob = new Blob([JSON.stringify(notebook, null, 1)], { type: "application/x-ipynb+json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${member}_${from}-${to}번.ipynb`;
    a.click();
    URL.revokeObjectURL(url);
    close();
    showToast(`✓ ${member}님의 ${from}~${to}번 풀이 ${cells.length / 2}개를 노트북으로 내보냈습니다.`);
  });
}
