/**
 * Phase 0 spike: can the TS 6 (Strada) compiler API yield a meaningful
 * "type resolution tree" for the three gate cases?
 *
 * Gate A: generic call        -> inferred type arguments per type parameter
 * Gate B: conditional type    -> resolved result + which branch fired
 * Gate C: failed assignment   -> structural mismatch path (message chain tree)
 */
import ts from "typescript-strada";
import path from "node:path";

const sampleFile = path.join(__dirname, "samples.ts");
const program = ts.createProgram([sampleFile], {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  noEmit: true,
});
const checker = program.getTypeChecker();
const source = program.getSourceFile(sampleFile)!;

const typeToString = (t: ts.Type) =>
  checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);

function findAll<T extends ts.Node>(root: ts.Node, test: (n: ts.Node) => n is T): T[] {
  const out: T[] = [];
  const visit = (n: ts.Node) => {
    if (test(n)) out.push(n);
    n.forEachChild(visit);
  };
  visit(root);
  return out;
}

// ───────────────────────── Gate A: generic call instantiation ─────────────
console.log("═══ GATE A: generic call — inferred type arguments ═══");
for (const call of findAll(source, ts.isCallExpression)) {
  const sig = checker.getResolvedSignature(call);
  if (!sig) continue;
  const decl = sig.getDeclaration();
  const typeParams = (decl && ts.isFunctionLike(decl) && decl.typeParameters) || [];

  console.log(`call site: ${call.getText()}`);
  console.log(`  resolved signature: ${checker.signatureToString(sig)}`);
  console.log(`  return type:        ${typeToString(checker.getTypeAtLocation(call))}`);

  // The instantiation mapper is internal API, but it is exactly the data a
  // "generic stepper" needs: type parameter -> inferred argument.
  const mapper = (sig as any).mapper;
  if (mapper && typeParams.length) {
    const mapped = (tp: ts.Type): ts.Type =>
      (ts as any).getMappedType?.(tp, mapper) ??
      // fall back to walking the simple mapper shapes ourselves
      resolveViaMapper(tp, mapper);
    for (const tpNode of typeParams) {
      const tpType = checker.getTypeAtLocation(tpNode.name);
      const inferred = mapped(tpType);
      console.log(
        `  type param ${tpNode.name.getText()} := ${inferred ? typeToString(inferred) : "<unresolved>"}`
      );
    }
  }
  console.log();
}

/** Walk the internal TypeMapper union shapes (Simple | Array | Composite …). */
function resolveViaMapper(t: ts.Type, mapper: any): ts.Type | undefined {
  if (!mapper) return undefined;
  switch (mapper.kind) {
    case 0 /* Simple */:
      return mapper.source === t ? mapper.target : undefined;
    case 1 /* Array */: {
      const i = mapper.sources?.indexOf(t);
      return i >= 0 ? (mapper.targets?.[i] ?? mapper.sources[i]) : undefined;
    }
    case 4 /* Composite */:
    case 5 /* Merged */:
      return resolveViaMapper(t, mapper.mapper1) ?? resolveViaMapper(t, mapper.mapper2);
    default:
      return undefined;
  }
}

// ───────────────────────── Gate B: conditional type branch ────────────────
console.log("═══ GATE B: conditional type — which branch fired ═══");
for (const alias of findAll(source, ts.isTypeAliasDeclaration)) {
  if (!alias.name.text.startsWith("CaseB")) continue;
  const result = checker.getTypeAtLocation(alias.name);
  const refNode = alias.type; // e.g. IsString<42>
  console.log(`${alias.name.text} = ${refNode.getText()}`);
  console.log(`  resolves to: ${typeToString(result)}`);

  // Reconstruct the branch decision from the conditional type's internals:
  // an instantiated conditional carries resolvedTrueType / resolvedFalseType.
  if (ts.isTypeReferenceNode(refNode)) {
    const aliased = checker.getTypeFromTypeNode(refNode) as any;
    const target = checker
      .getTypeAtLocation(
        findAll(source, ts.isTypeAliasDeclaration).find((a) => a.name.text === "IsString")!.name
      );
    const condDecl = (target.aliasSymbol ?? (target as any).symbol)?.declarations?.[0];
    if (condDecl && ts.isTypeAliasDeclaration(condDecl) && ts.isConditionalTypeNode(condDecl.type)) {
      const trueT = checker.getTypeFromTypeNode(condDecl.type.trueType);
      const falseT = checker.getTypeFromTypeNode(condDecl.type.falseType);
      const branch =
        result === trueT ? "TRUE branch" : result === falseT ? "FALSE branch" : "<indeterminate>";
      console.log(
        `  check: ${condDecl.type.checkType.getText()} extends ${condDecl.type.extendsType.getText()} -> ${branch}`
      );
    }
    void aliased;
  }
  console.log();
}

// ───────────────────────── Gate C: structural mismatch path ───────────────
console.log("═══ GATE C: failed assignment — mismatch path as a tree ═══");
for (const diag of program.getSemanticDiagnostics(source)) {
  const pos = diag.start != null ? source.getLineAndCharacterOfPosition(diag.start) : null;
  console.log(
    `error TS${diag.code} at ${pos ? `${pos.line + 1}:${pos.character + 1}` : "?"}`
  );
  printChain(diag.messageText, 1);
  if (diag.relatedInformation) {
    for (const rel of diag.relatedInformation) {
      console.log(`  ↳ related (TS${rel.code}): ${ts.flattenDiagnosticMessageText(rel.messageText, " ")}`);
    }
  }
  console.log();
}

/** DiagnosticMessageChain is already a tree — exactly the error-explainer data. */
function printChain(msg: string | ts.DiagnosticMessageChain, depth: number) {
  const indent = "  ".repeat(depth);
  if (typeof msg === "string") {
    console.log(`${indent}${msg}`);
    return;
  }
  console.log(`${indent}[TS${msg.code}] ${msg.messageText}`);
  for (const next of msg.next ?? []) printChain(next, depth + 1);
}
