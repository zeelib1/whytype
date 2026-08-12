/**
 * Shareable links: the code lives compressed in the URL hash (#code/...),
 * so links need no backend and nothing ever leaves the tab.
 * Same scheme as the official TS playground, so the format is battle-tested.
 */
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

const PREFIX = "#code/";

export function readCodeFromHash(): string | null {
  if (!location.hash.startsWith(PREFIX)) return null;
  try {
    return decompressFromEncodedURIComponent(location.hash.slice(PREFIX.length)) || null;
  } catch {
    return null;
  }
}

/** replaceState keeps the address bar current without polluting history. */
export function writeCodeToHash(code: string): void {
  const hash = PREFIX + compressToEncodedURIComponent(code);
  history.replaceState(null, "", hash);
}

export async function copyShareLink(code: string): Promise<boolean> {
  writeCodeToHash(code);
  try {
    await navigator.clipboard.writeText(location.href);
    return true;
  } catch {
    return false;
  }
}
