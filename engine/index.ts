/**
 * Public API surface of the WhyType engine — what @whytype/core exports.
 * Host-agnostic: callers inject the default-lib files (initEngine), so the
 * same code runs in a web worker, Node, or a VS Code extension host.
 */
export { analyze, initEngine, inspect, tsVersion } from "./analyze";
export type {
  CallInfo,
  ConditionalStep,
  ConditionalTrace,
  DiagnosticInfo,
  ExplainNode,
  InspectResult,
  RelatedInfo,
  TypeParamBinding,
} from "./types";
