import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { monaco } from "./monaco-setup";
import { EngineClient } from "./engine-client";
import { ExplainPanel } from "./components/ExplainPanel";
import { ExamplesGallery } from "./components/ExamplesGallery";
import { copyShareLink, readCodeFromHash, writeCodeToHash } from "./share";
import { renderExplain } from "../engine/render";
import type { DiagnosticInfo, ExplainResult, InspectResult } from "../engine/types";

const SAMPLE = `interface Config {
  server: {
    port: number;
    tls: { cert: string; key: string };
  };
  retries: number;
}

const looseConfig = {
  server: {
    port: 8080,
    tls: { cert: "cert.pem", key: 42 },
  },
  retries: 3,
};

// Click the error below, then read the reasoning on the right.
const config: Config = looseConfig;

// Or put the cursor inside a generic call to watch inference work:
function pick<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
const user = { id: 1, name: "Zee", tags: ["dev"] };
const tags = pick(user, "tags");

// Conditional types: put the cursor on an alias below to trace the decision.
type Unwrap<T> = T extends Promise<infer U> ? U
  : T extends string ? number
  : boolean;
type FromPromise = Unwrap<Promise<Date>>;
type FromString = Unwrap<"hello">;
type Mixed = Unwrap<"a" | Promise<string>>; // distributes over the union
type Sneaky = Unwrap<any>;                  // any takes BOTH branches
`;

const severity: Record<DiagnosticInfo["category"], monaco.MarkerSeverity> = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  suggestion: monaco.MarkerSeverity.Hint,
  message: monaco.MarkerSeverity.Info,
};

export function App() {
  const engine = useMemo(() => new EngineClient(), []);
  const editorHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor>();
  const [tsVersion, setTsVersion] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied" | "failed">("idle");
  const [showExamples, setShowExamples] = useState(false);
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo[]>([]);
  const [selected, setSelected] = useState<DiagnosticInfo | null>(null);
  const [inspection, setInspection] = useState<InspectResult | null>(null);
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;
  // Separate collections so a related-site flash never clobbers the hover wash.
  const flashDecor = useRef<monaco.editor.IEditorDecorationsCollection>();
  const hoverDecor = useRef<monaco.editor.IEditorDecorationsCollection>();
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  const runAnalysis = useCallback(
    async (code: string) => {
      const diags = await engine.analyze(code);
      setDiagnostics(diags);
      setSelected((prev) => {
        if (!prev) return diags[0] ?? null;
        return diags.find((d) => d.code === prev.code && d.start === prev.start) ?? diags[0] ?? null;
      });
      const model = editorRef.current?.getModel();
      if (model) {
        monaco.editor.setModelMarkers(
          model,
          "whytype",
          diags.map((d) => ({
            severity: severity[d.category],
            message: d.chain.message,
            startLineNumber: d.startLine,
            startColumn: d.startColumn,
            endLineNumber: d.endLine,
            endColumn: d.endColumn,
            code: `TS${d.code}`,
          }))
        );
      }
    },
    [engine]
  );

  useEffect(() => {
    engine.ready.then(setTsVersion);
    const editor = monaco.editor.create(editorHost.current!, {
      value: readCodeFromHash() ?? SAMPLE,
      language: "typescript",
      theme: "whytype",
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      fontSize: 13.5,
      lineHeight: 1.7,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 20, bottom: 20 },
      renderLineHighlight: "line",
      cursorBlinking: "smooth",
      automaticLayout: true,
      fixedOverflowWidgets: true,
    });
    editorRef.current = editor;
    flashDecor.current = editor.createDecorationsCollection();
    hoverDecor.current = editor.createDecorationsCollection();

    let timer: ReturnType<typeof setTimeout>;
    const analyzeSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const code = editor.getValue();
        runAnalysis(code);
        writeCodeToHash(code);
      }, 300);
    };
    editor.onDidChangeModelContent(analyzeSoon);

    editor.onDidChangeCursorPosition(async (e) => {
      const model = editor.getModel();
      if (!model) return;
      const offset = model.getOffsetAt(e.position);
      const hit = diagnosticsRef.current.find(
        (d) => offset >= d.start && offset <= d.start + d.length
      );
      if (hit) {
        setSelected(hit);
        return;
      }
      const result = await engine.inspect(editor.getValue(), offset);
      if (result) {
        setInspection(result);
        setSelected(null);
      }
    });

    engine.ready.then(() => runAnalysis(editor.getValue()));
    return () => editor.dispose();
  }, [engine, runAnalysis]);

  /** Jump to a same-file related site ("declared here") and flash it. */
  const revealRange = (start: number, length: number) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const from = model.getPositionAt(start);
    const to = model.getPositionAt(start + length);
    const range = new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column);
    editor.revealRangeInCenterIfOutsideViewport(range);
    editor.setPosition(from);
    clearTimeout(flashTimer.current);
    flashDecor.current?.set([{ range, options: { className: "wt-flash" } }]);
    flashTimer.current = setTimeout(() => flashDecor.current?.set([]), 1400);
  };

  /** Hovering the reasoning washes the code span it is about. */
  const hoverDiagnostic = (d: DiagnosticInfo | null) => {
    hoverDecor.current?.set(
      d
        ? [
            {
              range: new monaco.Range(d.startLine, d.startColumn, d.endLine, d.endColumn),
              options: { className: "wt-hover-span" },
            },
          ]
        : []
    );
  };

  // The exact markdown whytype_explain/whytype_snippet would return for the
  // current selection — renderExplain is the same serializer the MCP server uses.
  const agentMarkdown = useMemo(() => {
    if (!selected && !inspection) return null;
    const code = editorRef.current?.getValue() ?? "";
    const res: ExplainResult = {
      file: "snippet.ts",
      tsVersion: tsVersion ?? "…",
      diagnostics: selected ? [{ ...selected, file: "snippet.ts" }] : [],
      inspect: selected ? null : inspection,
    };
    return renderExplain(res, new Map([["snippet.ts", code]]));
  }, [selected, inspection, tsVersion]);

  const selectDiagnostic = (d: DiagnosticInfo) => {
    setSelected(d);
    const editor = editorRef.current;
    if (editor) {
      editor.revealLineInCenterIfOutsideViewport(d.startLine);
      editor.setPosition({ lineNumber: d.startLine, column: d.startColumn });
      editor.focus();
    }
  };

  const errorCount = diagnostics.filter((d) => d.category === "error").length;

  return (
    <div className="app">
      <header className="masthead">
        <div className="wordmark">
          <span className="wordmark-why">Why</span>Type
        </div>
        <div className="tagline">the compiler, explaining itself</div>
        <a className="share-btn docs-btn" href="/docs/">
          docs
        </a>
        <button
          className={`share-btn examples-btn ${showExamples ? "is-active" : ""}`}
          onClick={() => setShowExamples((v) => !v)}
        >
          examples
        </button>
        <button
          className="share-btn"
          onClick={async () => {
            const ok = await copyShareLink(editorRef.current?.getValue() ?? "");
            setShareState(ok ? "copied" : "failed");
            setTimeout(() => setShareState("idle"), 1800);
          }}
        >
          {shareState === "copied"
            ? "link copied"
            : shareState === "failed"
              ? "copy failed — grab the address bar"
              : "share"}
        </button>
      </header>
      <main className="split">
        <section className="pane pane-editor" ref={editorHost} aria-label="Code editor" />
        <section className="pane pane-explain" aria-label="Type reasoning">
          {showExamples ? (
            <ExamplesGallery
              onPick={(ex) => {
                const editor = editorRef.current;
                editor?.setValue(ex.code);
                // Old offsets are meaningless in the new code — drop them before
                // the cursor handler below runs its diagnostic hit-test.
                diagnosticsRef.current = [];
                setSelected(null);
                setInspection(null);
                setShowExamples(false);
                // Land the cursor where the example pays off (inference call,
                // distributing alias) so the reasoning appears without hunting.
                if (ex.cursorAt && editor) {
                  const offset = ex.code.indexOf(ex.cursorAt);
                  const model = editor.getModel();
                  if (offset >= 0 && model) {
                    const pos = model.getPositionAt(offset);
                    editor.setPosition(pos);
                    editor.revealPositionInCenter(pos);
                    editor.focus();
                  }
                }
              }}
            />
          ) : (
            <ExplainPanel
              diagnostics={diagnostics}
              selected={selected}
              inspection={inspection}
              onSelect={selectDiagnostic}
              onRevealRange={revealRange}
              onHoverDiagnostic={hoverDiagnostic}
              agentMarkdown={agentMarkdown}
            />
          )}
        </section>
      </main>
      <footer className="statusbar">
        <span>
          engine <strong>typescript@{tsVersion ?? "…"}</strong> (strada) · in-browser, nothing
          leaves this tab
          <span className="status-agents">
            {" "}
            · agents: <a href="/docs/#agents">npx whytype mcp</a>
          </span>
        </span>
        <span className={errorCount ? "status-errors" : "status-clean"}>
          {errorCount ? `${errorCount} error${errorCount > 1 ? "s" : ""}` : "no errors"}
        </span>
      </footer>
    </div>
  );
}
