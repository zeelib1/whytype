/**
 * The extraction engine: runs the TS 6 (Strada) checker over a single
 * in-memory file and converts its output into WhyType wire types.
 * Public compiler API only — internals live in adapter.ts.
 */
import ts from "typescript-strada";
import { getInferredTypeArguments } from "./adapter";
import type {
  CallInfo,
  ConditionalStep,
  ConditionalTrace,
  DiagnosticInfo,
  ExplainNode,
  InspectResult,
  RelatedInfo,
} from "./types";

export const tsVersion: string = ts.version;

/** Injected by the host (Vite worker bundles libs, the Node test reads disk). */
let libFiles = new Map<string, string>();

export function initEngine(libs: Map<string, string>): void {
  libFiles = libs;
  libCache.clear();
  session = null;
}

const FILE = "/main.ts";

const compilerOptions: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  noEmit: true,
};

const libCache = new Map<string, ts.SourceFile>();

function createHost(sourceFile: ts.SourceFile): ts.CompilerHost {
  return {
    getSourceFile(name, languageVersion) {
      if (name === FILE) return sourceFile;
      const cached = libCache.get(name);
      if (cached) return cached;
      const content = libFiles.get(name);
      if (content == null) return undefined;
      const sf = ts.createSourceFile(name, content, languageVersion, true);
      libCache.set(name, sf);
      return sf;
    },
    getDefaultLibLocation: () => "/lib",
    getDefaultLibFileName: (opts) => "/lib/" + ts.getDefaultLibFileName(opts),
    fileExists: (name) => name === FILE || libFiles.has(name),
    readFile: (name) => (name === FILE ? sourceFile.text : libFiles.get(name)),
    writeFile: () => {},
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
  };
}

interface Session {
  code: string;
  program: ts.Program;
  source: ts.SourceFile;
  checker: ts.TypeChecker;
}

let session: Session | null = null;

function makeProgram(code: string): Omit<Session, "code"> {
  const source = ts.createSourceFile(FILE, code, ts.ScriptTarget.ES2022, true);
  const program = ts.createProgram([FILE], compilerOptions, createHost(source));
  return { program, source, checker: program.getTypeChecker() };
}

/** Program-per-edit is fine at playground scale; incrementality comes with tsgo. */
function getSession(code: string): Session {
  if (session && session.code === code) return session;
  session = { code, ...makeProgram(code) };
  return session;
}

// ── diagnostics ────────────────────────────────────────────────────────────

function toExplainNode(msg: string | ts.DiagnosticMessageChain, code: number): ExplainNode {
  if (typeof msg === "string") return { code, message: msg, children: [] };
  return {
    code: msg.code,
    message: msg.messageText,
    children: (msg.next ?? []).map((n) => toExplainNode(n, n.code)),
  };
}

const categoryNames = ["warning", "error", "suggestion", "message"] as const;

export function analyze(code: string): DiagnosticInfo[] {
  const { program, source } = getSession(code);
  return analyzeSourceFile(program, source);
}

/** Program-agnostic core shared by the playground session and project mode. */
export function analyzeSourceFile(
  program: ts.Program,
  source: ts.SourceFile,
  opts?: { filePath?: string }
): DiagnosticInfo[] {
  const all = [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  ];
  return all.map((d) => {
    const start = d.start ?? 0;
    const length = d.length ?? 1;
    const s = source.getLineAndCharacterOfPosition(start);
    const e = source.getLineAndCharacterOfPosition(start + length);
    const related: RelatedInfo[] = (d.relatedInformation ?? []).map((r) => {
      const info: RelatedInfo = {
        code: r.code,
        message: ts.flattenDiagnosticMessageText(r.messageText, " "),
        start: r.file?.fileName === source.fileName ? r.start : undefined,
        length: r.file?.fileName === source.fileName ? r.length : undefined,
      };
      // Cross-file "declared here" sites become addressable in project mode.
      if (opts?.filePath && r.file && r.start != null) {
        const rp = r.file.getLineAndCharacterOfPosition(r.start);
        info.file = r.file.fileName;
        info.line = rp.line + 1;
        info.column = rp.character + 1;
      }
      return info;
    });
    const out: DiagnosticInfo = {
      code: d.code,
      category: categoryNames[d.category],
      start,
      length,
      startLine: s.line + 1,
      startColumn: s.character + 1,
      endLine: e.line + 1,
      endColumn: e.character + 1,
      chain: toExplainNode(d.messageText, d.code),
      related,
    };
    if (opts?.filePath) out.file = opts.filePath;
    return out;
  });
}

// ── inspection ─────────────────────────────────────────────────────────────

function nodeAtPosition(source: ts.SourceFile, position: number): ts.Node {
  let found: ts.Node = source;
  const visit = (n: ts.Node) => {
    if (position >= n.getStart(source) && position < n.getEnd()) {
      found = n;
      n.forEachChild(visit);
    }
  };
  visit(source);
  return found;
}

function nearestCall(node: ts.Node): ts.CallExpression | undefined {
  let cur: ts.Node | undefined = node;
  while (cur && !ts.isSourceFile(cur)) {
    if (ts.isCallExpression(cur)) return cur;
    if (ts.isStatement(cur)) return undefined;
    cur = cur.parent;
  }
  return undefined;
}

// ── conditional type tracing ───────────────────────────────────────────────

type ArgMapping = Map<string, { type: ts.Type; text: string }>;

/** Cursor anywhere in `type X = Alias<...>` or on an `Alias<...>` reference. */
function findConditionalReference(
  node: ts.Node,
  checker: ts.TypeChecker
): { refNode: ts.TypeReferenceNode; aliasDecl: ts.TypeAliasDeclaration } | null {
  let ref: ts.TypeReferenceNode | undefined;
  let cur: ts.Node | undefined = node;
  while (cur && !ts.isSourceFile(cur)) {
    if (ts.isTypeReferenceNode(cur)) ref = cur;
    if (!ref && ts.isTypeAliasDeclaration(cur) && ts.isTypeReferenceNode(cur.type)) {
      ref = cur.type;
    }
    cur = cur.parent;
  }
  if (!ref) return null;
  let symbol = checker.getSymbolAtLocation(ref.typeName);
  // An imported alias resolves to an ImportSpecifier; follow it to the real one.
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol);
  }
  const aliasDecl = symbol
    ?.getDeclarations()
    ?.find((d): d is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(d));
  if (!aliasDecl || !ts.isConditionalTypeNode(aliasDecl.type)) return null;
  return { refNode: ref, aliasDecl };
}

/** Is this type node exactly one of the alias's type parameters, unadorned? */
function nakedParamName(tn: ts.TypeNode, mapping: ArgMapping): string | null {
  if (ts.isTypeReferenceNode(tn) && !tn.typeArguments && ts.isIdentifier(tn.typeName)) {
    const name = tn.typeName.text;
    if (mapping.has(name)) return name;
  }
  return null;
}

/** Does this type node mention any of the alias's type parameters? */
function mentionsParam(tn: ts.TypeNode, mapping: ArgMapping): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isIdentifier(n) && mapping.has(n.text)) found = true;
    else n.forEachChild(visit);
  };
  visit(tn);
  return found;
}

/**
 * Compiles the inspected file's text with probe aliases appended and returns
 * the resulting file+checker. The playground appends to the virtual /main.ts;
 * project mode shadows the file inside a real program.
 */
export type ProbeCompiler = (fullText: string) => {
  source: ts.SourceFile;
  checker: ts.TypeChecker;
};

function traceConditional(
  node: ts.Node,
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  probe: ProbeCompiler
): ConditionalTrace | null {
  const found = findConditionalReference(node, checker);
  if (!found) return null;
  const { refNode, aliasDecl } = found;
  // The alias may be declared in another file (project mode) — getText must
  // read each node against its own source file, never the inspected one.
  const aliasSource = aliasDecl.getSourceFile();
  const params = aliasDecl.typeParameters ?? [];
  const args = refNode.typeArguments ?? [];
  if (!params.length || args.length !== params.length) return null;

  const typeToString = (t: ts.Type) =>
    checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);

  const mapping: ArgMapping = new Map();
  params.forEach((p, i) => {
    mapping.set(p.name.text, {
      type: checker.getTypeFromTypeNode(args[i]),
      text: args[i].getText(source),
    });
  });

  // Substitution is textual and the CHECKER evaluates every probe itself, so
  // infer positions and every exotic assignability rule keep exact TS
  // semantics — the tracer never guesses. Substitute only where it is sound:
  // a bare type parameter, or a node that mentions no parameters at all.
  const textFor = (tn: ts.TypeNode): string | null => {
    const naked = nakedParamName(tn, mapping);
    if (naked) return mapping.get(naked)!.text;
    if (!mentionsParam(tn, mapping)) return tn.getText(aliasSource);
    return null;
  };
  const typeFor = (tn: ts.TypeNode): ts.Type | null => {
    const naked = nakedParamName(tn, mapping);
    if (naked) return mapping.get(naked)!.type;
    if (!mentionsParam(tn, mapping)) return checker.getTypeFromTypeNode(tn);
    return null;
  };

  // Pass 1: plan a probe for every conditional node reachable in the alias.
  interface Plan {
    cond: ts.ConditionalTypeNode;
    checkText: string | null;
    checkType: ts.Type | null;
    extendsText: string | null;
    naked: boolean;
    probe?: string;
    memberProbes?: { text: string; probe: string }[];
  }
  const plans: Plan[] = [];
  const collect = (tn: ts.TypeNode) => {
    if (!ts.isConditionalTypeNode(tn)) return;
    plans.push({
      cond: tn,
      checkText: textFor(tn.checkType),
      checkType: typeFor(tn.checkType),
      extendsText: textFor(tn.extendsType),
      naked: nakedParamName(tn.checkType, mapping) !== null,
    });
    collect(tn.trueType);
    collect(tn.falseType);
  };
  collect(aliasDecl.type);

  let probeSrc = "";
  let probeId = 0;
  for (const plan of plans) {
    if (!plan.checkText || !plan.extendsText || !plan.checkType) continue;
    if (plan.naked && plan.checkType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never)) continue;
    if (plan.naked && plan.checkType.isUnion()) {
      plan.memberProbes = plan.checkType.types.map((m) => {
        const probe = `__WT_P${probeId++}`;
        probeSrc += `type ${probe} = [${typeToString(m)}] extends [${plan.extendsText}] ? "__WT_T" : "__WT_F";\n`;
        return { text: typeToString(m), probe };
      });
    } else {
      plan.probe = `__WT_P${probeId++}`;
      // Tuple-wrapping suppresses distribution so one probe = one verdict.
      probeSrc += `type ${plan.probe} = [${plan.checkText}] extends [${plan.extendsText}] ? "__WT_T" : "__WT_F";\n`;
    }
  }

  // Pass 2: one extra program answers every probe with real checker semantics.
  const verdictOf = new Map<string, "true" | "false" | "both" | "unknown">();
  if (probeSrc) {
    const probed = probe(source.text + "\n" + probeSrc);
    probed.source.forEachChild((st) => {
      if (!ts.isTypeAliasDeclaration(st) || !st.name.text.startsWith("__WT_P")) return;
      const s = probed.checker.typeToString(probed.checker.getTypeAtLocation(st.name));
      const hasT = s.includes('"__WT_T"');
      const hasF = s.includes('"__WT_F"');
      verdictOf.set(st.name.text, hasT && hasF ? "both" : hasT ? "true" : hasF ? "false" : "unknown");
    });
  }

  // Pass 3: walk the chain, following whichever branch actually fired.
  const steps: ConditionalStep[] = [];
  let cond: ts.ConditionalTypeNode | undefined = aliasDecl.type as ts.ConditionalTypeNode;

  for (let depth = 0; cond && depth < 6; depth++) {
    const plan = plans.find((p) => p.cond === cond);
    if (!plan) break;
    const step: ConditionalStep = {
      checkText: `${cond.checkType.getText()} extends ${cond.extendsType.getText()}`,
      checkResolved: plan.checkType ? typeToString(plan.checkType) : plan.checkText,
      extendsResolved: plan.extendsText,
      verdict: "unknown",
    };
    let next: ts.TypeNode | undefined;

    if (plan.naked && plan.checkType && plan.checkType.flags & ts.TypeFlags.Any) {
      // `any` is the one type that takes BOTH branches (result is their union).
      step.verdict = "both";
    } else if (plan.naked && plan.checkType && plan.checkType.flags & ts.TypeFlags.Never) {
      // Distributing over the empty union: nothing to check, result is never.
      step.verdict = "never";
    } else if (plan.memberProbes) {
      step.verdict = "distributes";
      step.members = plan.memberProbes.map((m) => ({
        text: m.text,
        verdict: verdictOf.get(m.probe) === "true" ? ("true" as const) : ("false" as const),
      }));
    } else if (plan.probe) {
      const v = verdictOf.get(plan.probe) ?? "unknown";
      step.verdict = v;
      if (v === "true" || v === "false") {
        next = v === "true" ? cond.trueType : cond.falseType;
        step.branchTakenText = next.getText();
      }
    }
    steps.push(step);
    cond = next && ts.isConditionalTypeNode(next) ? next : undefined;
  }

  return {
    referenceText: refNode.getText(source),
    steps,
    // InTypeAlias: print the structural result, not the alias being defined.
    result: checker.typeToString(
      checker.getTypeFromTypeNode(refNode),
      undefined,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias
    ),
  };
}

export function inspect(code: string, position: number): InspectResult | null {
  const { source, checker } = getSession(code);
  return inspectSourceFile(source, checker, position, (text) => makeProgram(text));
}

/** Program-agnostic core shared by the playground session and project mode. */
export function inspectSourceFile(
  source: ts.SourceFile,
  checker: ts.TypeChecker,
  position: number,
  probe: ProbeCompiler
): InspectResult | null {
  const node = nodeAtPosition(source, position);
  if (ts.isSourceFile(node)) return null;

  const typeToString = (t: ts.Type) =>
    checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);

  // Prefer the identifier/expression the user actually clicked.
  const target =
    ts.isIdentifier(node) || ts.isExpression(node) || ts.isTypeNode(node)
      ? node
      : node.parent ?? node;

  let typeString: string;
  try {
    typeString = typeToString(checker.getTypeAtLocation(target));
  } catch {
    return null;
  }

  let call: CallInfo | undefined;
  const callExpr = nearestCall(node);
  if (callExpr) {
    const sig = checker.getResolvedSignature(callExpr);
    if (sig) {
      call = {
        callText: callExpr.getText(source),
        signature: checker.signatureToString(sig),
        returnType: typeToString(checker.getTypeAtLocation(callExpr)),
        bindings: getInferredTypeArguments(checker, sig).map((b) => ({
          name: b.name,
          type: b.type ? typeToString(b.type) : null,
        })),
      };
    }
  }

  let conditional: ConditionalTrace | undefined;
  try {
    conditional = traceConditional(node, source, checker, probe) ?? undefined;
  } catch {
    conditional = undefined;
  }

  return { exprText: target.getText(source).slice(0, 120), typeString, call, conditional };
}
