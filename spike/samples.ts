// Gate case samples for the Phase 0 spike. Each section is intentionally
// minimal but representative of the real-world pain the tool must explain.

// ── Case A: generic function call — can we see what T and K were inferred as?
export function pick<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
const user = { id: 1, name: "Zee", tags: ["dev"] as string[] };
export const picked = pick(user, "tags");

// ── Case B: conditional type — can we see which branch fired?
type IsString<T> = T extends string ? "yes" : "no";
export type CaseB1 = IsString<"hello">;
export type CaseB2 = IsString<42>;

// ── Case C: failed assignment — can we get the structural mismatch path?
interface Config {
  server: {
    port: number;
    tls: { cert: string; key: string };
  };
  retries: number;
}
export const config: Config = {
  server: {
    port: 8080,
    tls: { cert: "cert.pem", key: 42 }, // <- error buried two levels deep
  },
  retries: 3,
};

// Case C2: assigning a pre-typed value — this produces the multi-level
// "not assignable" elaboration cascade that the error explainer must render.
const looseConfig = {
  server: {
    port: 8080,
    tls: { cert: "cert.pem", key: 42 },
  },
  retries: 3,
};
export const config2: Config = looseConfig;
