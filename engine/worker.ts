/// <reference lib="webworker" />
/**
 * Engine worker: owns the TypeScript compiler so the UI thread never blocks.
 */
import { analyze, initEngine, inspect, tsVersion } from "./analyze";
import { libFiles } from "./libs";
import type { EngineRequest, EngineResponse } from "./types";

initEngine(libFiles);

const post = (msg: EngineResponse) => self.postMessage(msg);

self.onmessage = (ev: MessageEvent<EngineRequest>) => {
  const req = ev.data;
  try {
    if (req.kind === "analyze") {
      post({ id: req.id, kind: "analyze", diagnostics: analyze(req.code) });
    } else if (req.kind === "inspect") {
      post({ id: req.id, kind: "inspect", result: inspect(req.code, req.position) });
    }
  } catch (err) {
    post({ id: req.id, kind: "error", message: String(err) });
  }
};

post({ id: 0, kind: "ready", tsVersion });
