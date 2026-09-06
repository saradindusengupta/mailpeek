// Pure, DOM-independent heuristics for detecting where quoted/forwarded content
// begins in a plain-text body. Kept outside webview/ so the extension-host test
// suite (tsconfig.json excludes src/webview/**) can import and unit-test it directly.

const ORIGINAL_MESSAGE_RE = /^-{2,}\s*Original Message\s*-{2,}\s*$/im;
const ON_WROTE_RE = /^On .+wrote:\s*$/im;

/**
 * Returns the character index where the earliest quote/forward marker line
 * starts, or undefined if neither pattern matches.
 */
export function findQuoteMarkerIndex(text: string): number | undefined {
  let earliest: number | undefined;
  for (const re of [ORIGINAL_MESSAGE_RE, ON_WROTE_RE]) {
    const match = re.exec(text);
    if (match && (earliest === undefined || match.index < earliest)) {
      earliest = match.index;
    }
  }
  return earliest;
}
