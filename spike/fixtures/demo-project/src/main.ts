import { pick, type Config, type Unwrap } from "./shapes";

// Cross-file mismatch: `port` is declared in shapes.ts.
export const cfg: Config = { port: "80", host: "localhost" };

// Generic inference at a call site.
export const hostName = pick(cfg, "host");

// Conditional trace through an imported alias.
export type Extracted = Unwrap<Promise<Date>>;

// Non-literal assignment: produces a nested "because" elaboration chain.
const wide = { port: "3000", host: "localhost" };
export const narrowed: Config = wide;
