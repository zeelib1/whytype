/**
 * The gallery of famous confusing errors — each one dependency-free (the
 * engine is single-file) and chosen to showcase one thing the tool explains
 * well. These double as the demo-video material for launch.
 */
export interface Example {
  slug: string;
  title: string;
  note: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    slug: "buried-mismatch",
    title: "The buried mismatch",
    note: "The wrong type is two levels deep. Read the chain, not the wall of text.",
    code: `interface Config {
  server: {
    port: number;
    tls: { cert: string; key: string };
  };
  retries: number;
}

const looseConfig = {
  server: {
    port: 8080,
    tls: { cert: "cert.pem", key: 42 },
  },
  retries: 3,
};

const config: Config = looseConfig;
`,
  },
  {
    slug: "never-parameter",
    title: "Not assignable to… never?",
    note: "You never wrote 'never'. The union's methods intersected into it.",
    code: `declare const items: string[] | number[];

// push on a union of arrays only accepts what BOTH arrays accept:
// string & number = never.
items.push("hello");
`,
  },
  {
    slug: "contravariance",
    title: "The backwards arrow",
    note: "Callback parameters check in the opposite direction. The chain shows the flip.",
    code: `type Listener = (event: MouseEvent | KeyboardEvent) => void;

const onlyMouse = (event: MouseEvent) => {
  console.log(event.clientX);
};

// A listener must handle EVERY event it can receive —
// so the parameter check runs backwards (contravariance).
const listen: Listener = onlyMouse;
`,
  },
  {
    slug: "excess-property",
    title: "The helpful typo",
    note: "Fresh object literals get extra scrutiny — and a suggestion.",
    code: `interface ChartOptions {
  width: number;
  height: number;
}

const options: ChartOptions = {
  width: 640,
  heigth: 480,
};
`,
  },
  {
    slug: "distribution",
    title: "Why not (string | number)[]?",
    note: "Put the cursor on Mixed: conditionals distribute over unions, member by member.",
    code: `type ToArray<T> = T extends unknown ? T[] : never;

// Expectation: (string | number)[]
// Reality: string[] | number[] — put the cursor on Mixed to see why.
type Mixed = ToArray<string | number>;
`,
  },
  {
    slug: "any-both-branches",
    title: "any takes both branches",
    note: "Put the cursor on Sneaky: any is the one type that refuses to choose.",
    code: `type IsString<T> = T extends string ? "yes" : "no";

type Sure = IsString<"hi">;

// Cursor here: why is this "yes" | "no"?
type Sneaky = IsString<any>;
`,
  },
  {
    slug: "readonly-door",
    title: "readonly is a one-way door",
    note: "A readonly array fits where nothing will mutate it — and nowhere else.",
    code: `function total(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

const frozen: readonly number[] = [1, 2, 3];

total(frozen);
`,
  },
  {
    slug: "watch-inference",
    title: "Watch inference happen",
    note: "Put the cursor inside the call: every type parameter, and what it became.",
    code: `function prop<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const config = { host: "localhost", port: 8080, tls: true };

// Cursor inside the parentheses: T and K, inferred live.
const port = prop(config, "port");
`,
  },
];
