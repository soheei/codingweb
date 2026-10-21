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
