import { DEFAULT_CODE, FIXED_MEMBERS, STATE } from './config.js';
import { loadCurrentMemberCode, saveViewState } from './navigation.js';
import { executeSave, updateSaveStatus } from './storage.js';
import { showToast } from './ui.js';

/* ==========================================================================
   4-Member Quad Comparison View
   ========================================================================== */
export const quadEditors = {};

export function toggleDiffMode() {
  STATE.isDiffMode = !STATE.isDiffMode;
  const standardView = document.getElementById("standard-view");
  const diffView = document.getElementById("diff-view");
  const toggleBtn = document.getElementById("btn-toggle-diff-mode");
  const modeText = document.getElementById("diff-mode-text");

  if (STATE.isDiffMode) {
    standardView.style.display = "none";
    diffView.style.display = "flex";
    modeText.textContent = "단일 에디터로 복귀";
    toggleBtn.classList.replace("btn-accent", "btn-secondary");
    renderQuadDiffView();
  } else {
    diffView.style.display = "none";
    standardView.style.display = "flex";
    modeText.textContent = "4인 전체 비교 모드";
    toggleBtn.classList.replace("btn-secondary", "btn-accent");
    loadCurrentMemberCode();
    setTimeout(() => STATE.editor.refresh(), 50);
  }
  saveViewState();
}

export function renderQuadDiffView() {
  const container = document.getElementById("quad-diff-container");
  container.innerHTML = "";
  const qId = STATE.currentQuestionId;

  FIXED_MEMBERS.forEach(member => {
    const card = document.createElement("div");
    card.className = "quad-card";
    const code = (STATE.solutions[qId] && STATE.solutions[qId][member]) || DEFAULT_CODE;

    card.innerHTML = `
      <div class="quad-card-header">
        <span class="quad-member-name"><i class="fa-solid fa-user"></i> ${member}</span>
        <div class="quad-card-tools">
          <button class="btn btn-sm btn-secondary btn-copy-member" data-member="${member}" title="코드 복사">
            <i class="fa-solid fa-copy"></i> 복사
          </button>
          <button class="btn btn-sm btn-primary btn-run-member" data-member="${member}" title="이 코드만 단독 실행">
            <i class="fa-solid fa-play"></i> 실행
          </button>
        </div>
      </div>
      <div class="quad-editor-body">
        <textarea id="quad-editor-${member}"></textarea>
      </div>
      <div class="quad-output-bar" id="quad-out-${member}">대기중 (실행 결과가 여기에 표시됩니다)</div>
    `;

    container.appendChild(card);

    setTimeout(() => {
      const textarea = document.getElementById(`quad-editor-${member}`);
      if (textarea) {
        const cm = CodeMirror.fromTextArea(textarea, {
          mode: "python",
          theme: "default",
          lineNumbers: true,
          autoCloseBrackets: true,
          indentUnit: 4,
          tabSize: 4
        });
        cm.setValue(code);

        cm.on("change", () => {
          if (!STATE.solutions[qId]) STATE.solutions[qId] = {};
          STATE.solutions[qId][member] = cm.getValue();
          STATE.hasUnsavedChanges = true;
          updateSaveStatus("dirty");

          if (STATE.isAutoSaveEnabled) {
            if (STATE.saveTimer) clearTimeout(STATE.saveTimer);
            STATE.saveTimer = setTimeout(() => executeSave(false), 800);
          }
        });

        quadEditors[member] = cm;
      }
    }, 20);
  });

  setTimeout(() => {
    document.querySelectorAll(".btn-copy-member").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const member = e.currentTarget.dataset.member;
        const code = quadEditors[member] ? quadEditors[member].getValue() : "";
        navigator.clipboard.writeText(code);
        showToast(`${member}의 코드가 클립보드에 복사되었습니다!`);
      });
    });

    document.querySelectorAll(".btn-run-member").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const member = e.currentTarget.dataset.member;
        await runSingleMemberCode(member);
      });
    });
  }, 50);
}

// 4인 비교 창에서도 사용자가 입력창에 적은 input값을 완벽히 주입하여 실행
export async function runSingleMemberCode(member) {
  if (!STATE.isPyodideReady) {
    showToast("Python 준비 중입니다...");
    return;
  }

  const outBar = document.getElementById(`quad-out-${member}`);
  if (!outBar) return;
  outBar.textContent = "실행 중...";
  outBar.style.color = "#d97706";

  const code = quadEditors[member] ? quadEditors[member].getValue() : DEFAULT_CODE;
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
  for (const m of FIXED_MEMBERS) {
    await runSingleMemberCode(m);
  }
  showToast("4명의 코드가 동일한 입력값으로 일괄 검증되었습니다!");
}
