export interface Config {
  port: number;
  host: string;
}

export function pick<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

export type Unwrap<T> = T extends Promise<infer U> ? U : T extends string ? number : never;
