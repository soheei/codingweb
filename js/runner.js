import { STATE, isViewingOther } from './config.js';
import { getSampleCases, renderSidebarQuestions, updateProgress } from './navigation.js';
import { executeSave, setPassed } from './storage.js';
import { showToast } from './ui.js';

/* ==========================================================================
   Pyodide Python 3 Execution Engine (input() 및 sys.stdin 100% 완벽 지원)
   ========================================================================== */
export async function initPyodide() {
  const statusEl = document.getElementById("pyodide-status");
  try {
    // @ts-ignore
    STATE.pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/"
    });
    STATE.isPyodideReady = true;

    statusEl.innerHTML = `
      <span class="status-dot ready"></span>
      <span class="status-text">Python 3.11 준비 완료</span>
    `;
  } catch (error) {
    statusEl.innerHTML = `
      <span class="status-dot" style="background: #dc2626;"></span>
      <span class="status-text">Python 로드 실패 (새로고침 권장)</span>
    `;
    console.error("Pyodide 로드 에러:", error);
  }
}

// 사용자 직접 입력창(sys.stdin / input()) 값 주입 실행기
export async function runCode() {
  if (!STATE.isPyodideReady) {
    showToast("Python 엔진 준비 중입니다. 2~3초 후 다시 눌러주세요.");
    return;
  }

  const code = STATE.editor.getValue();
  // 사용자가 직접 입력창에 타이핑한 값 가져오기
  const userInput = document.getElementById("user-custom-input").value;
  const terminal = document.getElementById("terminal-output");
  const timeBadge = document.getElementById("run-time-badge");
  
  terminal.innerHTML = "";
  timeBadge.style.display = "inline-block";
  timeBadge.textContent = "실행 중...";

  const startTime = performance.now();

  try {
    // 사용자 입력값 줄바꿈 정규화 (CRLF -> LF)
    const normalizedInput = userInput.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // 파이썬 환경의 sys.stdin, sys.stdout, sys.stderr 및 builtins.input을 완벽하게 오버라이드
    // input(), sys.stdin.readline(), sys.stdin.read(), sys.stdin.readlines() 모두 100% 지원
    const setupPyScript = `
import sys
import io
import builtins

_raw_user_input = ${JSON.stringify(normalizedInput)}

class SafeCustomStdin:
    def __init__(self, text):
        self.raw_text = text
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
        raise EOFError("EOFError: 입력창(sys.stdin)에 더 이상 읽을 데이터가 없습니다. 오른쪽 상단의 입력창에 테스트할 값을 적어주세요.")
    return line.rstrip('\\r\\n')

builtins.input = _safe_input
`;

    await STATE.pyodide.runPythonAsync(setupPyScript);

    // 실제 사용자 코드 실행
    await STATE.pyodide.runPythonAsync(code);

    const stdout = await STATE.pyodide.runPythonAsync("sys.stdout.getvalue()");
    const stderr = await STATE.pyodide.runPythonAsync("sys.stderr.getvalue()");

    const duration = (performance.now() - startTime).toFixed(1);
    timeBadge.textContent = `${duration}ms`;

    if (stdout && stdout.length > 0) {
      appendTerminal(stdout, "stdout");
    }
    if (stderr && stderr.length > 0) {
      appendTerminal(stderr, "error");
    }
    if (!stdout && !stderr) {
      appendTerminal("실행이 완료되었습니다. (출력된 결과 없음: print() 함수 작성 여부를 확인하세요)", "system");
    }

    await checkAgainstSample(userInput, stdout, !!stderr);

  } catch (err) {
    const duration = (performance.now() - startTime).toFixed(1);
    timeBadge.textContent = `에러 (${duration}ms)`;

    // 에러 메시지 가공 및 한국어 친절 안내
    let errMsg = err.message || String(err);
    appendTerminal(`[실행 오류 발생]\n${errMsg}`, "error");
    await checkAgainstSample(userInput, "", true);
  }
}

// 입력창 값이 문제의 예제 입력과 같을 때만 정답 여부를 가린다.
// 출력이 예제 출력과 같으면 모든 예제를 채점해 완료 여부를 정하고, 다르면 오답(빨간 표시)으로 처리한다.
async function checkAgainstSample(input, stdout, failedRun) {
  if (isViewingOther() || STATE.isDiffMode) return;
  const q = STATE.questions.find(x => x.id === STATE.currentQuestionId);
  const sample = getSampleCases(q).find(c => normalizeOutput(c.input) === normalizeOutput(input));
  if (!sample) return;
  if (!failedRun && normalizeOutput(sample.output) === normalizeOutput(stdout)) {
    await judgeCode({ keepTerminal: true });
    return;
  }
  appendTerminal(`오답: 예제 출력과 다릅니다.\n[기대 출력]\n${sample.output}`, "error");
  markWrong(q.id);
}

function markWrong(qId) {
  setPassed(qId, false);
  STATE.failed[qId] = true;
  renderSidebarQuestions();
  updateProgress();
}

/* ==========================================================================
   채점: 문제 설명의 예제 입력을 하나씩 넣어 실행하고, 출력이 예제 출력과 같을 때만 "완료" 로 표시한다.
   ========================================================================== */
// 줄 끝 공백과 앞뒤 빈 줄은 무시하고 비교한다 (그 외에는 글자 그대로 같아야 한다)
const normalizeOutput = (s) => String(s).replace(/\r\n?/g, "\n").split("\n").map(l => l.trimEnd()).join("\n").replace(/^\n+|\n+$/g, "");

// 입력값을 stdin 으로 넣어 코드를 한 번 실행한다. 화면에는 아무것도 쓰지 않고 결과만 돌려준다.
async function execPython(code, input) {
  const normalizedInput = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const py = STATE.pyodide;
  await py.runPythonAsync(`
import sys, io, builtins
_raw = ${JSON.stringify(normalizedInput)}
sys.stdin = io.StringIO(_raw)
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
def _safe_input(prompt=None):
    if prompt:
        sys.stdout.write(str(prompt))
    line = sys.stdin.readline()
    if not line:
        raise EOFError("입력이 더 이상 없습니다.")
    return line.rstrip('\\r\\n')
builtins.input = _safe_input
`);
  try {
    await py.runPythonAsync(code);
  } catch (err) {
    return { ok: false, stdout: await py.runPythonAsync("sys.stdout.getvalue()"), error: err.message || String(err) };
  }
  return { ok: true, stdout: await py.runPythonAsync("sys.stdout.getvalue()"), error: "" };
}

let isJudging = false;
export async function judgeCode({ keepTerminal = false } = {}) {
  if (isJudging) return;
  if (!STATE.isPyodideReady) { showToast("Python 엔진 준비 중입니다. 2~3초 후 다시 눌러주세요."); return; }
  if (isViewingOther() || STATE.isDiffMode) { showToast("내 코드를 보는 화면에서만 채점할 수 있습니다."); return; }

  const q = STATE.questions.find(x => x.id === STATE.currentQuestionId);
  const cases = getSampleCases(q);
  if (!cases.length) { showToast("이 문제에는 채점할 예제가 없습니다."); return; }

  isJudging = true;
  const btn = document.getElementById("btn-judge-code");
  if (btn) btn.disabled = true;
  if (!keepTerminal) document.getElementById("terminal-output").innerHTML = "";
  const code = STATE.editor.getValue();
  const qId = q.id;
  let allPass = true;

  try {
    for (let i = 0; i < cases.length; i++) {
      const { input, output } = cases[i];
      const r = await execPython(code, input);
      if (r.ok && normalizeOutput(r.stdout) === normalizeOutput(output)) {
        appendTerminal(`예제 ${i + 1}: 통과`, "pass");
      } else {
        allPass = false;
        const got = r.ok ? (r.stdout || "(출력 없음)") : `${r.stdout}${r.error}`;
        appendTerminal(`예제 ${i + 1}: 실패\n[입력]\n${input}\n[기대 출력]\n${output}\n[내 출력]\n${got}`, "error");
      }
    }
  } finally {
    isJudging = false;
    if (btn) btn.disabled = false;
  }

  // 채점하는 동안 코드를 고쳤거나 다른 문제로 넘어갔다면 이 결과는 버린다
  if (STATE.currentQuestionId !== qId || STATE.editor.getValue() !== code) {
    showToast("채점 중에 코드가 바뀌어 결과를 반영하지 않았습니다. 다시 채점해 주세요.");
    return;
  }

  if (!STATE.solutions[qId]) STATE.solutions[qId] = {};
  STATE.solutions[qId][STATE.me.uid] = code;
  const wasPassed = !!(STATE.passed[qId] && STATE.passed[qId][STATE.me.uid]);
  setPassed(qId, allPass);
  if (!allPass) STATE.failed[qId] = true;
  if (allPass) {
    appendTerminal(`모든 예제 통과 (${cases.length}/${cases.length}) — 완료로 표시되었습니다.`, "pass");
    showToast("모든 예제를 통과했습니다. 완료로 표시합니다.");
  } else {
    appendTerminal("일부 예제가 맞지 않아 완료로 표시되지 않았습니다.", "system");
  }
  if (allPass || wasPassed) await executeSave(false); // 코드와 통과 여부를 함께 서버에 저장
  else renderSidebarQuestions();
  updateProgress();
}

export function appendTerminal(text, type = "stdout") {
  const terminal = document.getElementById("terminal-output");
  const div = document.createElement("div");
  div.className = `terminal-line ${type}`;
  div.textContent = text;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}
