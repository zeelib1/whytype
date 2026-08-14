/**
 * Node entry (`whytype/node`): real-project mode plus everything the neutral
 * entry offers. Kept separate so browser consumers never pull in ts.sys.
 */
export { createProject } from "./project";
export type { ExplainQuery, Position, Project, ProjectOptions } from "./project";
export { analyze, initEngine, inspect, tsVersion } from "./analyze";
export { renderDiagnostic, renderExplain, renderInspect } from "./render";
export type { RenderOptions } from "./render";
export type {
  CallInfo,
  ConditionalStep,
  ConditionalTrace,
  DiagnosticInfo,
  ExplainNode,
  ExplainResult,
  InspectResult,
  RelatedInfo,
  TypeParamBinding,
} from "./types";
