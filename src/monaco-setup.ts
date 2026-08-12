import * as monaco from "monaco-editor";
// monaco 0.56 exposes the TS language service config as a NAMED EXPORT — the
// legacy monaco.languages.typescript namespace only exists through the old
// editor.main entry, which dev's prebundle resolves but the production build
// does not (that mismatch shipped a crash once; see git history). Import the
// value directly so both pipelines agree and the eager side effect survives.
import { typescriptDefaults } from "monaco-editor/language/typescript/monaco.contribution.js";
// Paths go through monaco's exports map ("./*.js" -> "./esm/vs/*.js"),
// so the esm/vs prefix must be omitted or build-time resolution fails.
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker.js?worker";

self.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

// WhyType's own engine is the single source of truth for semantics —
// Monaco's built-in checker would disagree (different TS version) and paint
// duplicate squiggles, so it is limited to syntax.
typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

monaco.editor.defineTheme("whytype", {
  base: "vs-dark",
  inherit: true,
  rules: [
    { token: "comment", foreground: "5c6773", fontStyle: "italic" },
    { token: "keyword", foreground: "9d8cff" },
    { token: "type.identifier", foreground: "5cc8ff" },
    { token: "string", foreground: "7ce0a3" },
    { token: "number", foreground: "ffa366" },
  ],
  colors: {
    "editor.background": "#0e1116",
    "editor.foreground": "#dee7f0",
    "editorLineNumber.foreground": "#3a4552",
    "editorLineNumber.activeForeground": "#77828f",
    "editor.lineHighlightBackground": "#151a2180",
    "editorCursor.foreground": "#5cc8ff",
    "editor.selectionBackground": "#264a63",
    "editorError.foreground": "#ff6b7a",
    "editorWidget.background": "#151a21",
    "editorWidget.border": "#232b36",
    "scrollbarSlider.background": "#232b3680",
    "scrollbarSlider.hoverBackground": "#2d3844",
  },
});

export { monaco };
