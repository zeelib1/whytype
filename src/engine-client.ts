/**
 * Promise-based client over the engine worker. Stale responses (an older
 * analyze finishing after a newer one) are dropped by id.
 */
import type { DiagnosticInfo, EngineResponse, InspectResult } from "../engine/types";

type Pending = { resolve: (value: any) => void; reject: (err: Error) => void };

export class EngineClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  readonly ready: Promise<string>;

  constructor() {
    this.worker = new Worker(new URL("../engine/worker.ts", import.meta.url), {
      type: "module",
    });
    let readyResolve!: (v: string) => void;
    this.ready = new Promise((r) => (readyResolve = r));
    this.worker.onmessage = (ev: MessageEvent<EngineResponse>) => {
      const msg = ev.data;
      if (msg.kind === "ready") {
        readyResolve(msg.tsVersion);
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.kind === "error") p.reject(new Error(msg.message));
      else if (msg.kind === "analyze") p.resolve(msg.diagnostics);
      else p.resolve(msg.result);
    };
  }

  private send<T>(req: object): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id });
    });
  }

  analyze(code: string): Promise<DiagnosticInfo[]> {
    return this.send({ kind: "analyze", code });
  }

  inspect(code: string, position: number): Promise<InspectResult | null> {
    return this.send({ kind: "inspect", code, position });
  }
}
