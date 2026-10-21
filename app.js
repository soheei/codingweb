import { generateAll100Questions } from './questions.js';

// Application Configuration (김민희, 양소희, 정호준, 차승우 4인 고정)
const FIXED_MEMBERS = ["김민희", "양소희", "정호준", "차승우"];
const DEFAULT_CODE = `import sys 

a = int(sys.stdin.readline()) 
b = int(sys.stdin.readline())

print(a + b)
`;

// 동기화 엔드포인트 설정
// 1. 로컬 파이썬 서버 엔드포인트 (server.py 연동)
const LOCAL_SERVER_API = (window.location.protocol.startsWith("http")) 
  ? `${window.location.origin}/api/sync` 
  : "http://localhost:5173/api/sync";

// 2. 전 세계 어디서든 다른 컴퓨터/브라우저 간 실시간 브로드캐스트 동기화 허브 (CORS 지원 & 실시간 SSE)
const CLOUD_SYNC_TOPIC = "codingmasters_team4_sync_hub_v1";
const CLOUD_PUB_URL = `https://ntfy.sh/${CLOUD_SYNC_TOPIC}`;
const CLOUD_SSE_URL = `https://ntfy.sh/${CLOUD_SYNC_TOPIC}/sse`;

const STORAGE_KEY_SOLUTIONS = "codingmasters_solutions_v5";
const STORAGE_KEY_FIREBASE = "codingmasters_firebase_url_v1";

const STATE = {
  questions: [],
  currentQuestionId: 1,
  currentMember: "김민희",
  members: FIXED_MEMBERS,
  solutions: {}, // { [qId]: { [member]: code } }
  isDiffMode: false,
  pyodide: null,
  isPyodideReady: false,
  editor: null,
  saveTimer: null,
  isAutoSaveEnabled: false,
  hasUnsavedChanges: false,
  isSyncing: false,
  lastSavedAt: null,
  clientId: "client_" + Math.random().toString(36).substring(2, 9),
  firebaseUrl: "", // 배포 서버(server_db.py)가 Firebase를 대신 사용하므로 브라우저 직접 연동은 쓰지 않음
  firebaseEventSource: null
};

/* ==========================================================================
   Initialization
   ========================================================================== */
document.addEventListener("DOMContentLoaded", async () => {
  // 1. 문제 데이터 로드 (모듈 또는 전역 fallback)
  if (typeof window.generateAll100Questions === "function") {
    STATE.questions = window.generateAll100Questions();
  } else {
    STATE.questions = generateAll100Questions();
  }

  // 2. 에디터 및 UI 초기화
  initCodeMirror();
  initPyodide();
  renderCategoryFilter();
  renderSidebarQuestions();
  updateProgress();

  // 3. 솔루션 로드 (서버 우선 -> localStorage)
  await loadInitialSolutions();

  // 4. 1번 문제 로드
  loadQuestion(1);

  // 5. 이벤트 리스너 세팅
  setupEventListeners();
  setupFirebaseModal();
  setupNotebookExport();

  // 6. ntfy 수신(SSE)은 사용하지 않음 (서버 폴링으로 대체)
  // setupRealtimeCloudSync();

  // 7. 배포 서버(server_db.py) 변경 감지 폴링: 팀원이 저장하면 새로고침 없이 반영
  setupServerPolling();
});

function getFirebaseEndpoint() {
  if (!STATE.firebaseUrl) return null;
  let url = STATE.firebaseUrl.trim();
  if (url.endsWith("/")) url = url.slice(0, -1);
  if (!url.endsWith(".json")) {
    url += "/codingmasters_solutions.json";
  }
  return url;
}

/* ==========================================================================
   Data Loading & Multi-Tier Storage Engine
   ========================================================================== */
async function loadInitialSolutions() {
  let loaded = false;

  // 1순위: Firebase 클라우드가 설정되어 있다면 Firebase에서 최우선 로드 (GitHub Pages 완전 지원)
  const fbEndpoint = getFirebaseEndpoint();
  if (fbEndpoint) {
    try {
      const fbRes = await fetch(fbEndpoint, { cache: "no-store" });
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        if (fbData && Object.keys(fbData).length > 0) {
          STATE.solutions = fbData;
          localStorage.setItem(STORAGE_KEY_SOLUTIONS, JSON.stringify(fbData));
          loaded = true;
          setSyncStatus("connected", "🔥 Firebase 실시간 클라우드 DB 연결됨 (GitHub Pages 지원)");
          updateFirebaseButtonState(true);
        }
      }
    } catch (err) {
      console.warn("Firebase 로드 실패:", err);
    }
  }

  // 2순위: 로컬 파이썬 서버(team_solutions_db.json)에서 로드 시도
  if (!loaded) {
    try {
      const res = await fetch(LOCAL_SERVER_API, { cache: "no-store" });
      if (res.ok) {
        const serverData = await res.json();
        if (serverData && Object.keys(serverData).length > 0) {
          STATE.solutions = serverData;
          localStorage.setItem(STORAGE_KEY_SOLUTIONS, JSON.stringify(serverData));
          loaded = true;
          setSyncStatus("connected", "로컬 서버 파일(team_solutions_db.json) 연결됨");
        }
      }
    } catch (err) {
      // 로컬 서버가 아직 안 켜져 있거나 오프라인일 때
    }
  }

  // 3순위: 브라우저 localStorage에서 복원
  if (!loaded) {
    const localData = localStorage.getItem(STORAGE_KEY_SOLUTIONS);
    if (localData) {
      try {
        STATE.solutions = JSON.parse(localData);
        loaded = true;
        setSyncStatus("connected", "로컬 브라우저 저장소 로드됨");
      } catch (e) {}
    }
  }

  // 4순위: 기본 템플릿 코드 채우기
  STATE.questions.forEach(q => {
    if (!STATE.solutions[q.id]) STATE.solutions[q.id] = {};
    FIXED_MEMBERS.forEach(m => {
      if (!STATE.solutions[q.id][m]) {
        STATE.solutions[q.id][m] = DEFAULT_CODE;
      }
    });
  });

  updateProgress();
  updateSaveStatus("saved");
}

// 로컬 저장 (localStorage)
function saveLocal() {
  localStorage.setItem(STORAGE_KEY_SOLUTIONS, JSON.stringify(STATE.solutions));
  updateProgress();
}

/* ==========================================================================
   Unified Save Engine (자동 저장 및 수동 저장 둘 다 완벽 지원)
   ========================================================================== */
// 사용자가 에디터에 타이핑할 때 호출
function handleEditorChange() {
  if (STATE.isDiffMode) return;
  
  const currentCode = STATE.editor.getValue();
  if (!STATE.solutions[STATE.currentQuestionId]) {
    STATE.solutions[STATE.currentQuestionId] = {};
  }
  
  // 변경사항 반영
  STATE.solutions[STATE.currentQuestionId][STATE.currentMember] = currentCode;
  STATE.hasUnsavedChanges = true;
  updateSaveStatus("dirty");

  // 자동 저장이 켜져 있으면 디바운스 실행 (800ms)
  if (STATE.isAutoSaveEnabled) {
    if (STATE.saveTimer) clearTimeout(STATE.saveTimer);
    STATE.saveTimer = setTimeout(() => {
      executeSave(false);
    }, 800);
  }
}

// 실제 저장 실행 (isManual: 수동 저장 버튼 클릭 여부)
// saveAll=false(기본): 현재 선택된 사람(탭)의 풀이만 서버에 보낸다. (다른 사람 칸을 덮어쓰지 않기 위함)
async function executeSave(isManual = false, saveAll = false) {
  if (STATE.saveTimer) clearTimeout(STATE.saveTimer);
  updateSaveStatus("saving");

  // 1. 브라우저 localStorage 즉시 저장
  saveLocal();

  let firebaseSaved = false;
  let serverSaved = false;
  let cloudBroadcasted = false;

  // 2. Firebase 실시간 클라우드 DB에 영구 저장 (GitHub Pages에서 핵심 동작)
  const fbEndpoint = getFirebaseEndpoint();
  if (fbEndpoint) {
    try {
      const fbRes = await fetch(fbEndpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(STATE.solutions)
      });
      if (fbRes.ok) {
        firebaseSaved = true;
      }
    } catch (err) {
      console.warn("Firebase 저장 에러:", err);
    }
  }

  // 3. 로컬 파이썬 서버에 영구 파일 저장 시도 (team_solutions_db.json)
  try {
    let serverPayload = STATE.solutions;
    if (!saveAll) {
      serverPayload = {};
      Object.keys(STATE.solutions).forEach(qId => {
        const code = STATE.solutions[qId] && STATE.solutions[qId][STATE.currentMember];
        if (typeof code === "string") serverPayload[qId] = { [STATE.currentMember]: code };
      });
    }
    const serverRes = await fetch(LOCAL_SERVER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serverPayload)
    });
    if (serverRes.ok) {
      serverSaved = true;
    }
  } catch (err) {
    // 로컬 서버 오프라인인 경우
  }

  // 4. 글로벌 실시간 클라우드 브로드캐스트 (다른 컴퓨터/브라우저로 즉시 전송)
  try {
    const cloudPayload = {
      clientId: STATE.clientId,
      updatedBy: STATE.currentMember,
      questionId: STATE.currentQuestionId,
      code: STATE.solutions[STATE.currentQuestionId][STATE.currentMember],
      allSolutions: STATE.solutions,
      timestamp: Date.now()
    };

    const cloudRes = await fetch(CLOUD_PUB_URL, {
      method: "POST",
      headers: { 
        "Title": `CodingMasters [Q${STATE.currentQuestionId}] ${STATE.currentMember}`,
        "Tags": "floppy_disk"
      },
      body: JSON.stringify(cloudPayload)
    });
    if (cloudRes.ok) {
      cloudBroadcasted = true;
    }
  } catch (err) {
    // 클라우드 오프라인
  }

  STATE.hasUnsavedChanges = false;
  STATE.lastSavedAt = new Date();
  updateSaveStatus("saved");

  // 상태 메시지 갱신
  let statusMsg = "저장 완료";
  if (firebaseSaved) {
    statusMsg = "🔥 Firebase 클라우드에 영구 저장 완료 (GitHub Pages 동기화)";
  } else if (serverSaved) {
    const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    statusMsg = isLocalHost
      ? "내 컴퓨터 서버(localhost)에 저장 완료 (배포 서버 아님)"
      : "배포 서버(Firebase)에 저장 완료";
  } else if (cloudBroadcasted) {
    statusMsg = "실시간 클라우드 & 로컬 저장소에 저장 완료";
  } else {
    statusMsg = "브라우저 로컬 저장소에 안전하게 저장 완료";
  }

  setSyncStatus("connected", `${statusMsg} (${STATE.lastSavedAt.toLocaleTimeString()})`);

  if (isManual) {
    showToast(`✓ [수동 저장 완료] ${statusMsg}!`);
  }
}

// 저장 상태 인디케이터 UI 업데이트
function updateSaveStatus(status) {
  const tag = document.getElementById("autosave-status");
  if (!tag) return;

  const timeStr = STATE.lastSavedAt ? STATE.lastSavedAt.toLocaleTimeString() : "";

  if (status === "dirty") {
    tag.innerHTML = `<i class="fa-solid fa-circle-dot" style="color: #f59e0b;"></i> <span style="color: #d97706; font-weight: 600;">저장되지 않은 변경사항</span>`;
  } else if (status === "saving") {
    tag.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color: #3b82f6;"></i> <span style="color: #2563eb;">저장 중...</span>`;
  } else if (status === "saved") {
    const modeLabel = STATE.isAutoSaveEnabled ? "자동 저장됨" : "수동 저장됨";
    tag.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> <span style="color: #059669; font-weight: 500;">${modeLabel} ${timeStr ? `(${timeStr})` : ""}</span>`;
  }
}

/* ==========================================================================
   Realtime Cloud SSE Sync (다른 컴퓨터나 다른 브라우저에서 즉시 반영)
   ========================================================================== */
function setupRealtimeCloudSync() {
  try {
    const sse = new EventSource(CLOUD_SSE_URL);
    
    sse.onopen = () => {
      setSyncStatus("connected", `실시간 팀 동기화 활성화됨 (${new Date().toLocaleTimeString()})`);
    };

    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (!data || !data.message) return;
        
        let payload = null;
        try {
          payload = JSON.parse(data.message);
        } catch (_) {
          return;
        }

        // 내가 보낸 것은 무시
        if (payload.clientId === STATE.clientId) return;

        // 다른 브라우저/컴퓨터에서 보낸 최신 솔루션 수신
        if (payload.allSolutions) {
          let hasDiff = false;
          Object.keys(payload.allSolutions).forEach(qId => {
            if (!STATE.solutions[qId]) STATE.solutions[qId] = {};
            FIXED_MEMBERS.forEach(m => {
              // 현재 내가 지금 입력 중인 에디터 탭을 제외하고 최신 반영
              const isCurrentlyEditing = (Number(qId) === STATE.currentQuestionId && m === STATE.currentMember && STATE.hasUnsavedChanges);
              if (!isCurrentlyEditing && payload.allSolutions[qId][m]) {
                if (STATE.solutions[qId][m] !== payload.allSolutions[qId][m]) {
                  STATE.solutions[qId][m] = payload.allSolutions[qId][m];
                  hasDiff = true;
                }
              }
            });
          });

          if (hasDiff) {
            saveLocal();
            // 현재 화면 갱신
            if (STATE.isDiffMode) {
              renderQuadDiffView();
            } else {
              loadCurrentMemberCode();
            }
            renderSidebarQuestions();
            updateProgress();
            showToast(`[실시간 동기화] ${payload.updatedBy || "팀원"} 님의 최신 풀이가 반영되었습니다!`);
          }
        }
      } catch (err) {
        // SSE 메시지 처리 오류 무시
      }
    };

    sse.onerror = () => {
      // 연결 재시도 중
    };
  } catch (err) {
    console.warn("SSE 연결 지원 안 됨 또는 오프라인:", err);
  }
}

/* ==========================================================================
   Server Polling Sync (server_db.py 의 /api/version 을 3초마다 확인)
   ========================================================================== */
function setupServerPolling() {
  const versionUrl = LOCAL_SERVER_API.replace(/\/api\/sync$/, "/api/version");
  let lastVersion = null;

  const tick = async () => {
    try {
      const vRes = await fetch(versionUrl, { cache: "no-store" });
      if (!vRes.ok) return; // 기존 server.py 등 /api/version 이 없으면 무시
      const { version } = await vRes.json();
      if (version === lastVersion) return;
      const first = lastVersion === null;
      lastVersion = version;
      if (first) return; // 최초 로드는 loadInitialSolutions 가 이미 처리

      const res = await fetch(LOCAL_SERVER_API, { cache: "no-store" });
      if (!res.ok) return;
      const serverData = await res.json();
      let hasDiff = false;
      Object.keys(serverData).forEach(qId => {
        if (!STATE.solutions[qId]) STATE.solutions[qId] = {};
        FIXED_MEMBERS.forEach(m => {
          const isCurrentlyEditing = (Number(qId) === STATE.currentQuestionId && m === STATE.currentMember && STATE.hasUnsavedChanges);
          const incoming = serverData[qId] && serverData[qId][m];
          if (!isCurrentlyEditing && incoming && STATE.solutions[qId][m] !== incoming) {
            STATE.solutions[qId][m] = incoming;
            hasDiff = true;
          }
        });
      });

      if (hasDiff) {
        saveLocal();
        if (STATE.isDiffMode) {
          renderQuadDiffView();
        } else {
          loadCurrentMemberCode();
        }
        renderSidebarQuestions();
        updateProgress();
        showToast("[실시간 동기화] 팀원의 최신 풀이가 반영되었습니다!");
      }
    } catch (err) {
      // 서버 일시 오프라인 - 다음 주기에 재시도
    }
  };

  tick();
  setInterval(tick, 3000);
}

/* ==========================================================================
   Jupyter Notebook Export (사람 + 문제 번호 범위 → .ipynb 1개)
   ========================================================================== */
function setupNotebookExport() {
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

function setSyncStatus(type, text) {
  const dot = document.getElementById("sync-dot");
  const label = document.getElementById("sync-text");
  if (dot) dot.className = `status-dot ${type === "connected" ? "ready" : "loading"}`;
  if (label) label.textContent = text;
}

/* ==========================================================================
   CodeMirror Setup & Keyboard Shortcuts
   ========================================================================== */
function initCodeMirror() {
  const textarea = document.getElementById("code-editor");
  STATE.editor = CodeMirror.fromTextArea(textarea, {
    mode: "python",
    theme: "default",
    lineNumbers: true,
    autoCloseBrackets: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    extraKeys: {
      "Ctrl-Enter": () => runCode(),
      "Cmd-Enter": () => runCode(),
      "Ctrl-S": (cm) => { executeSave(true); },
      "Cmd-S": (cm) => { executeSave(true); },
      "Tab": (cm) => cm.replaceSelection("    ", "end")
    }
  });

  STATE.editor.on("change", () => {
    handleEditorChange();
  });
}

/* ==========================================================================
   Pyodide Python 3 Execution Engine (input() 및 sys.stdin 100% 완벽 지원)
   ========================================================================== */
async function initPyodide() {
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
async function runCode() {
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

function appendTerminal(text, type = "stdout") {
  const terminal = document.getElementById("terminal-output");
  const div = document.createElement("div");
  div.className = `terminal-line ${type}`;
  div.textContent = text;
  terminal.appendChild(div);
  terminal.scrollTop = terminal.scrollHeight;
}

/* ==========================================================================
   Question Details & 4-Member Navigation
   ========================================================================== */
function loadQuestion(id) {
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
    renderQuadDiffView();
  }
}

// 문제에 알맞은 예제 입력 자동 세팅
function loadSampleInputForQuestion(q) {
  const inputEl = document.getElementById("user-custom-input");
  if (!inputEl) return;

  if (q.id === 1) { // 10배
    inputEl.value = "5";
  } else if (q.id === 2) { // 16배 나누어 출력
    inputEl.value = "32";
  } else if (q.id === 3) { // 1등급 한우
    inputEl.value = "7";
  } else if (q.id === 4) { // 3으로 나눈 나머지
    inputEl.value = "10";
  } else if (q.id === 5) { // 8진수와 16진수
    inputEl.value = "10";
  } else if (q.id === 6) { // You
    inputEl.value = "Nice to meet you";
  } else if (q.id === 7) { // 가장 큰 나머지
    inputEl.value = "10";
  } else if (q.id === 8) { // 기억상실
    inputEl.value = "2 1 5";
  } else if (q.id === 9) { // 등차수열
    inputEl.value = "1 3 5";
  } else if (q.id === 10) { // 림보게임
    inputEl.value = "5\n160 175 162 168 159";
  } else if (q.id === 12) { // 삼각형의 조건
    inputEl.value = "3 4 5";
  } else if (q.id === 13) { // 소수 구하기
    inputEl.value = "17";
  } else if (q.id === 20) { // 최대공약수
    inputEl.value = "12 18";
  } else {
    inputEl.value = "3\n5";
  }
}

function loadCurrentMemberCode() {
  const qId = STATE.currentQuestionId;
  const member = STATE.currentMember;
  const code = (STATE.solutions[qId] && STATE.solutions[qId][member]) || DEFAULT_CODE;
  
  if (STATE.editor) {
    STATE.editor.setValue(code);
    STATE.editor.clearHistory();
    STATE.hasUnsavedChanges = false;
    updateSaveStatus("saved");
  }
}

function renderMemberTabs() {
  const container = document.getElementById("member-tabs");
  container.innerHTML = "";

  FIXED_MEMBERS.forEach(member => {
    const tab = document.createElement("div");
    tab.className = `member-tab ${member === STATE.currentMember ? "active" : ""}`;
    tab.innerHTML = `<i class="fa-solid fa-user-circle"></i> ${member}`;
    tab.addEventListener("click", () => {
      // 탭 변경 전 현재 코드 즉시 저장
      if (STATE.hasUnsavedChanges) {
        saveLocal();
      }
      STATE.currentMember = member;
      renderMemberTabs();
      loadCurrentMemberCode();
      renderSidebarQuestions();
      updateProgress();
    });
    container.appendChild(tab);
  });
}

function renderSidebarQuestions() {
  const listEl = document.getElementById("question-list");
  const searchQuery = document.getElementById("question-search").value.toLowerCase().trim();
  const filterDiff = document.getElementById("filter-difficulty").value;
  const filterCat = document.getElementById("filter-category").value;

  listEl.innerHTML = "";

  const filtered = STATE.questions.filter(q => {
    const matchSearch = String(q.id).includes(searchQuery) || q.title.toLowerCase().includes(searchQuery) || q.category.toLowerCase().includes(searchQuery);
    const matchDiff = filterDiff === "all" || q.difficulty === filterDiff;
    const matchCat = filterCat === "all" || q.category === filterCat;
    return matchSearch && matchDiff && matchCat;
  });

  filtered.forEach(q => {
    const isSolved = isSolvedByCurrentMember(q.id);

    const item = document.createElement("div");
    item.className = `q-item ${q.id === STATE.currentQuestionId ? "active" : ""}`;
    item.dataset.id = q.id;

    item.innerHTML = `
      <div class="q-item-info">
        <span class="badge-tag ${q.difficulty}">${q.difficulty}</span>
        <div class="q-item-title">${q.title}</div>
      </div>
      <div class="q-item-status">
        <span class="status-badge ${isSolved ? 'solved' : ''}">
          <i class="${isSolved ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}"></i>
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

function renderCategoryFilter() {
  const catSelect = document.getElementById("filter-category");
  const categories = [...new Set(STATE.questions.map(q => q.category))];
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  });
}

function isSolvedByCurrentMember(qId) {
  const code = STATE.solutions[qId] && STATE.solutions[qId][STATE.currentMember];
  return !!code && code.trim() !== "" && code !== DEFAULT_CODE;
}

function updateProgress() {
  let solvedCount = 0;
  STATE.questions.forEach(q => {
    if (isSolvedByCurrentMember(q.id)) solvedCount++;
  });
  document.getElementById("progress-label").textContent = `${STATE.currentMember} 완료율:`;

  const percent = Math.round((solvedCount / (STATE.questions.length || 100)) * 100);
  document.getElementById("progress-percent").textContent = `${percent}%`;
  document.getElementById("progress-count").textContent = `${solvedCount} / ${STATE.questions.length || 100} 완료`;
  document.getElementById("progress-fill").style.width = `${percent}%`;
}

/* ==========================================================================
   4-Member Quad Comparison View
   ========================================================================== */
const quadEditors = {};

function toggleDiffMode() {
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
}

function renderQuadDiffView() {
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
async function runSingleMemberCode(member) {
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

async function runAllMembersSimultaneously() {
  for (const m of FIXED_MEMBERS) {
    await runSingleMemberCode(m);
  }
  showToast("4명의 코드가 동일한 입력값으로 일괄 검증되었습니다!");
}

/* ==========================================================================
   Event Listeners
   ========================================================================== */
function setupEventListeners() {
  document.getElementById("question-search").addEventListener("input", renderSidebarQuestions);
  document.getElementById("filter-difficulty").addEventListener("change", renderSidebarQuestions);
  document.getElementById("filter-category").addEventListener("change", renderSidebarQuestions);

  // 1. 수동 저장 버튼들 (상단 헤더 & 에디터 상단)
  document.getElementById("btn-manual-save")?.addEventListener("click", () => {
    executeSave(true);
  });
  document.getElementById("btn-editor-save")?.addEventListener("click", () => {
    executeSave(true);
  });

  // 2. 자동 저장 토글 버튼
  document.getElementById("btn-toggle-autosave")?.addEventListener("click", () => {
    STATE.isAutoSaveEnabled = !STATE.isAutoSaveEnabled;
    const btn = document.getElementById("btn-toggle-autosave");
    const textEl = document.getElementById("autosave-toggle-text");
    
    if (STATE.isAutoSaveEnabled) {
      btn.classList.add("active-toggle");
      textEl.textContent = "자동저장 ON";
      showToast("자동 저장이 활성화되었습니다 (작성 시 0.8초 후 자동 저장)");
    } else {
      btn.classList.remove("active-toggle");
      textEl.textContent = "자동저장 OFF";
      showToast("자동 저장이 꺼졌습니다. 상단의 [수동 저장] 또는 Ctrl+S로 저장하세요.");
    }
    updateSaveStatus(STATE.hasUnsavedChanges ? "dirty" : "saved");
  });

  // 3. 글로벌 키보드 단축키 (Ctrl + S: 수동 저장, Ctrl + Enter: 실행)
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      executeSave(true);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
  });

  // 4. 실행 및 클리어
  document.getElementById("btn-run-code").addEventListener("click", runCode);
  document.getElementById("btn-clear-term").addEventListener("click", () => {
    document.getElementById("terminal-output").innerHTML = "";
  });

  // 5. 사용자 입력창 전용 툴 (지우기 / 예제 채우기)
  document.getElementById("btn-clear-input").addEventListener("click", () => {
    document.getElementById("user-custom-input").value = "";
    document.getElementById("user-custom-input").focus();
  });
  document.getElementById("btn-load-sample-input").addEventListener("click", () => {
    const q = STATE.questions.find(x => x.id === STATE.currentQuestionId);
    if (q) {
      loadSampleInputForQuestion(q);
      showToast("이 문제의 추천 예제 입력값이 채워졌습니다.");
    }
  });

  // 6. 비교 모드 토글 및 4명 동시 실행
  document.getElementById("btn-toggle-diff-mode").addEventListener("click", toggleDiffMode);
  document.getElementById("btn-run-all-members")?.addEventListener("click", runAllMembersSimultaneously);

  // 7. 지금 즉시 동기화 버튼
  document.getElementById("btn-sync-now").addEventListener("click", async () => {
    showToast("서버 및 클라우드 최신 풀이 확인 중...");
    await loadInitialSolutions();
    loadCurrentMemberCode();
    renderSidebarQuestions();
    showToast("최신 풀이 상태가 동기화되었습니다!");
  });

  // 8. 기본 코드 초기화
  document.getElementById("btn-reset-template").addEventListener("click", () => {
    if (confirm("코드를 기본 디폴트 상태로 되돌리시겠습니까?")) {
      STATE.editor.setValue(DEFAULT_CODE);
      executeSave(true);
    }
  });

  // 9. JSON 파일 백업 (내보내기) - server.py의 team_solutions_db.json과 100% 동일한 이름 및 구조로 저장
  document.getElementById("btn-export-data").addEventListener("click", () => {
    // team_solutions_db.json 파일과 완벽히 동일한 데이터 구조
    const blob = new Blob([JSON.stringify(STATE.solutions, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "team_solutions_db.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("✓ team_solutions_db.json 파일로 저장되었습니다.");
  });

  // 10. JSON 파일 불러오기 (가져오기) - team_solutions_db.json 및 기존 백업 파일 완벽 지원
  const fileInput = document.getElementById("file-import-input");
  document.getElementById("btn-import-data").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    // @ts-ignore
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        // @ts-ignore
        const imported = JSON.parse(event.target.result);
        // team_solutions_db.json 직접 구조 또는 { solutions: ... } 래핑 구조 둘 다 지원
        const targetSolutions = imported.solutions ? imported.solutions : imported;
        
        if (targetSolutions && typeof targetSolutions === "object" && Object.keys(targetSolutions).length > 0) {
          STATE.solutions = { ...STATE.solutions, ...targetSolutions };
          await executeSave(true, true);
          loadQuestion(STATE.currentQuestionId);
          renderSidebarQuestions();
          showToast("✓ team_solutions_db.json 파일이 성공적으로 로드되고 동기화되었습니다!");
        } else {
          alert("올바른 team_solutions_db.json 또는 풀이 백업 파일이 아닙니다.");
        }
      } catch (err) {
        alert("JSON 파싱 에러: " + err.message);
      }
    };
    reader.readAsText(file);
    fileInput.value = "";
  });
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

/* ==========================================================================
   Firebase Realtime Database Setup & Streaming
   ========================================================================== */
function updateFirebaseButtonState(isConnected) {
  const btn = document.getElementById("btn-open-firebase-modal");
  const label = document.getElementById("firebase-btn-label");
  if (!btn || !label) return;
  if (isConnected) {
    btn.classList.add("connected");
    label.innerHTML = `<i class="fa-solid fa-check"></i> Firebase 연동됨`;
  } else {
    btn.classList.remove("connected");
    label.textContent = "Firebase 연동";
  }
}

// Firebase SSE 실시간 변경 감지 스트림
function initFirebaseRealtimeSync() {
  const fbEndpoint = getFirebaseEndpoint();
  if (!fbEndpoint) return;

  try {
    if (STATE.firebaseEventSource) {
      STATE.firebaseEventSource.close();
    }

    const fbSSE = new EventSource(fbEndpoint);
    STATE.firebaseEventSource = fbSSE;

    fbSSE.addEventListener("put", (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed && parsed.data) {
          const newData = parsed.data;
          let hasChange = false;
          Object.keys(newData).forEach(qId => {
            if (!STATE.solutions[qId]) STATE.solutions[qId] = {};
            FIXED_MEMBERS.forEach(m => {
              const isCurrent = (Number(qId) === STATE.currentQuestionId && m === STATE.currentMember && STATE.hasUnsavedChanges);
              if (!isCurrent && newData[qId] && newData[qId][m] && newData[qId][m] !== STATE.solutions[qId][m]) {
                STATE.solutions[qId][m] = newData[qId][m];
                hasChange = true;
              }
            });
          });
          if (hasChange) {
            saveLocal();
            if (STATE.isDiffMode) renderQuadDiffView();
            else loadCurrentMemberCode();
            renderSidebarQuestions();
            updateProgress();
            showToast("🔥 [Firebase] 다른 컴퓨터의 풀이가 실시간 동기화되었습니다!");
          }
        }
      } catch (err) {}
    });

    fbSSE.onerror = () => {
      // 자동 재연결
    };
  } catch (err) {
    console.warn("Firebase SSE 에러:", err);
  }
}

// Firebase 설정 모달 제어
function setupFirebaseModal() {
  const modal = document.getElementById("firebase-modal");
  const openBtn = document.getElementById("btn-open-firebase-modal");
  const closeBtn = document.getElementById("btn-close-firebase-modal");
  const input = document.getElementById("firebase-url-input");
  const saveBtn = document.getElementById("btn-save-firebase-url");
  const disconnectBtn = document.getElementById("btn-disconnect-firebase");
  const hint = document.getElementById("firebase-status-hint");

  if (!modal) return;

  // 기저장된 Firebase URL이 있으면 자동 반영
  if (STATE.firebaseUrl) {
    input.value = STATE.firebaseUrl;
    updateFirebaseButtonState(true);
    initFirebaseRealtimeSync();
  }

  openBtn?.addEventListener("click", () => {
    input.value = STATE.firebaseUrl || "";
    modal.style.display = "flex";
  });

  closeBtn?.addEventListener("click", () => {
    modal.style.display = "none";
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  // 연결 및 즉시 동기화 버튼 클릭
  saveBtn?.addEventListener("click", async () => {
    const rawUrl = input.value.trim();
    if (!rawUrl) {
      alert("Firebase Realtime Database URL을 입력해주세요.\n예: https://내프로젝트-default-rtdb.firebaseio.com");
      return;
    }

    saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 연결 테스트 중...`;

    try {
      let endpoint = rawUrl;
      if (endpoint.endsWith("/")) endpoint = endpoint.slice(0, -1);
      if (!endpoint.endsWith(".json")) endpoint += "/codingmasters_solutions.json";

      // GET 요청으로 연결 및 규칙 확인
      const testRes = await fetch(endpoint);
      if (testRes.ok) {
        STATE.firebaseUrl = rawUrl;
        localStorage.setItem(STORAGE_KEY_FIREBASE, rawUrl);
        updateFirebaseButtonState(true);
        initFirebaseRealtimeSync();

        // 기존 풀이를 Firebase로 즉시 업로드
        await executeSave(true);

        showToast("🔥 Firebase 클라우드 연결 및 동기화 성공!");
        if (hint) hint.innerHTML = `<span style="color: #10b981; font-weight: 600;">✓ Firebase 클라우드가 성공적으로 연결되었습니다!</span>`;
        setTimeout(() => { modal.style.display = "none"; }, 900);
      } else {
        throw new Error(`HTTP 상태코드 ${testRes.status} (Firebase 데이터베이스 보안 규칙을 '테스트 모드: read, write true'로 설정했는지 확인하세요)`);
      }
    } catch (err) {
      alert("Firebase 연결 실패: " + err.message);
      if (hint) hint.innerHTML = `<span style="color: #ef4444; font-weight: 600;">✕ 연결 실패: ${err.message}</span>`;
    } finally {
      saveBtn.innerHTML = `<i class="fa-solid fa-bolt"></i> <span>연결 & 즉시 동기화</span>`;
    }
  });

  // 연결 해제 버튼 클릭
  disconnectBtn?.addEventListener("click", () => {
    if (confirm("Firebase 클라우드 연동을 해제하시겠습니까?\n(로컬 저장소와 서버 파일은 계속 유지됩니다)")) {
      STATE.firebaseUrl = "";
      localStorage.removeItem(STORAGE_KEY_FIREBASE);
      if (STATE.firebaseEventSource) {
        STATE.firebaseEventSource.close();
        STATE.firebaseEventSource = null;
      }
      input.value = "";
      updateFirebaseButtonState(false);
      setSyncStatus("connected", "로컬 저장소 연결됨");
      showToast("Firebase 연결이 해제되었습니다.");
      modal.style.display = "none";
    }
  });
}

