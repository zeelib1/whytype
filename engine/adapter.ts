/**
 * The ONLY module allowed to touch TypeScript internal APIs.
 *
 * Everything here is the seam for the Phase 4 port to tsgo's stable API
 * (TS 7.1): when that lands, this file is rewritten and nothing else moves.
 * Internal shapes are validated against the pinned typescript@6.0.3.
 */
import ts from "typescript-strada";

/**
 * Walk the internal TypeMapper union (Simple | Array | Deferred | Function |
 * Composite | Merged) to find what a type parameter was instantiated to.
 */
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

/**
 * Assignability check. Public API on the TypeChecker in recent versions;
 * fall back to the internal method of the same name when absent.
 */
export function isAssignable(checker: ts.TypeChecker, source: ts.Type, target: ts.Type): boolean {
  const fn = (checker as any).isTypeAssignableTo;
  if (typeof fn !== "function") throw new Error("isTypeAssignableTo unavailable");
  return fn.call(checker, source, target);
}

/**
 * For a resolved call signature, recover each declared type parameter and the
 * type it was inferred as. Returns [] when the callee is not generic or the
 * internals are not in the expected shape (never throws).
 */
export function getInferredTypeArguments(
  checker: ts.TypeChecker,
  signature: ts.Signature
): { name: string; type: ts.Type | undefined }[] {
  try {
    const decl = signature.getDeclaration();
    if (!decl || !ts.isFunctionLike(decl) || !decl.typeParameters?.length) return [];
    const mapper = (signature as any).mapper;
    if (!mapper) return [];
    return decl.typeParameters.map((tp) => {
      const tpType = checker.getTypeAtLocation(tp.name);
      return { name: tp.name.getText(), type: resolveViaMapper(tpType, mapper) };
    });
  } catch {
    return [];
  }
}
