import * as vscode from "vscode";
import { parseChain } from "./parseChain";
import { renderWhyHtml, type RelatedItem } from "./webview";

const TS_SOURCES = new Set(["ts", "ts-plugin", "typescript"]);
const LANGUAGES = ["typescript", "typescriptreact", "javascript", "javascriptreact"];

let panel: vscode.WebviewPanel | undefined;

function showWhy(uri: vscode.Uri, diagnostic: vscode.Diagnostic) {
  const related: RelatedItem[] = (diagnostic.relatedInformation ?? []).map((r) => ({
    message: r.message,
    location: `${vscode.workspace.asRelativePath(r.location.uri)}:${r.location.range.start.line + 1}`,
  }));

  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      "typelens.why",
      "TypeLens — Why?",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: false }
    );
    panel.onDidDispose(() => (panel = undefined));
  } else {
    panel.reveal(panel.viewColumn, true);
  }

  panel.webview.html = renderWhyHtml({
    code: typeof diagnostic.code === "object" ? diagnostic.code.value : diagnostic.code,
    chain: parseChain(diagnostic.message),
    related,
    file: vscode.workspace.asRelativePath(uri),
    line: diagnostic.range.start.line + 1,
  });
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "typelens.why",
      (uri?: vscode.Uri, diagnostic?: vscode.Diagnostic) => {
        // Invoked from a code action we get the diagnostic; from the command
        // palette we look one up at the cursor.
        if (uri && diagnostic) {
          showWhy(uri, diagnostic);
          return;
        }
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const at = editor.selection.active;
        const hit = vscode.languages
          .getDiagnostics(editor.document.uri)
          .find((d) => TS_SOURCES.has(d.source ?? "") && d.range.contains(at));
        if (hit) showWhy(editor.document.uri, hit);
        else vscode.window.showInformationMessage("TypeLens: no TypeScript error at the cursor.");
      }
    ),

    vscode.languages.registerCodeActionsProvider(
      LANGUAGES.map((language) => ({ language })),
      {
        provideCodeActions(document, _range, context) {
          return context.diagnostics
            .filter((d) => TS_SOURCES.has(d.source ?? ""))
            .map((d) => {
              const action = new vscode.CodeAction(
                "TypeLens: Why does this fail?",
                vscode.CodeActionKind.QuickFix
              );
              action.command = {
                command: "typelens.why",
                title: "TypeLens: Why does this fail?",
                arguments: [document.uri, d],
              };
              action.diagnostics = [d];
              return action;
            });
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );
}

export function deactivate() {}
