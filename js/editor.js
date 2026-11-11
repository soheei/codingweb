import { STATE } from './config.js';
import { runCode } from './runner.js';
import { executeSave, handleEditorChange } from './storage.js';

/* ==========================================================================
   CodeMirror Setup & Keyboard Shortcuts
   ========================================================================== */
export function initCodeMirror() {
  const textarea = document.getElementById("code-editor");
  STATE.editor = CodeMirror.fromTextArea(textarea, {
    mode: "python",
    theme: "default",
    lineNumbers: true,
    autoCloseBrackets: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    // 터치 기기(아이폰 등): 한글 입력기/키보드가 안정적으로 동작하는 contenteditable 방식 사용
    inputStyle: window.matchMedia("(pointer: coarse)").matches ? "contenteditable" : "textarea",
    extraKeys: {
      "Ctrl-Enter": () => runCode(),
      "Cmd-Enter": () => runCode(),      "Ctrl-S": (cm) => { executeSave(true); },
      "Cmd-S": (cm) => { executeSave(true); },
      "Tab": (cm) => cm.replaceSelection("    ", "end")
    }
  });

  STATE.editor.on("change", () => {
    handleEditorChange();
  });
}
