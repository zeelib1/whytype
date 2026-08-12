/**
 * Bundles the TS default lib .d.ts files (copied from typescript-strada/lib
 * by the postinstall step) so the engine can run with no filesystem.
 */
const raw = import.meta.glob("./libs/lib*.d.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** Map of "/lib/lib.xxx.d.ts" -> file contents. */
export const libFiles = new Map<string, string>();
for (const [path, content] of Object.entries(raw)) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  libFiles.set("/lib/" + base, content);
}
