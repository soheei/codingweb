import { STATE } from './config.js';
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
      appendTerminal("✓ 실행이 완료되었습니다. (출력된 결과 없음: print() 함수 작성 여부를 확인하세요)", "system");
    }

  } catch (err) {
    const duration = (performance.now() - startTime).toFixed(1);
    timeBadge.textContent = `에러 (${duration}ms)`;
    
    // 에러 메시지 가공 및 한국어 친절 안내
    let errMsg = err.message || String(err);
    appendTerminal(`[실행 오류 발생]\n${errMsg}`, "error");
  }
}

export function appendTerminal(text, type = "stdout") {
  const terminal = document.getElementById("terminal-output");
  const div = document.createElement("div");
  div.className = `terminal-line ${type}`;
  div.textContent = text;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}
