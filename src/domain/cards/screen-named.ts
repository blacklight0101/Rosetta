import type { Citation } from './citation.js';
import type { ScreenAction } from './flow-screen.js';
import { nameHolds } from './name-words.js';

// P5-44, RF-626, ADR-005: an action or a link the markup of a page does not show (a link in a grid
// template, a redirect in code-behind, a button whose label the reader cannot match) still has
// the claims the agent wrote about the page. The ones whose text names the item are the lines
// that can show it, so the item cites those and not every range of its card.

/** A claim the agent wrote, before the card numbers it. */
export interface WrittenClaim {
  readonly text: string;
  readonly citations: readonly Citation[];
}

/** The last segment of a path-like target, without its query: `~/Doc/Bill.aspx?id=1` -> `Bill.aspx`. */
function lastSegment(target: string): string {
  const [path = ''] = target.split(/[?#]/u);
  return path.split(/[\\/]/u).at(-1) ?? '';
}

/** What names a link to `target`: the target as written and its last path segment. */
export function linkNames(target: string): readonly string[] {
  return [...new Set([target, lastSegment(target)])].filter((name) => name.trim() !== '');
}

/** What names an action: its label and its handler or flow. */
export function actionNames(action: ScreenAction): readonly string[] {
  return [action.label, action.handler, action.flow].filter(
    (name): name is string => name !== undefined && name.trim() !== '',
  );
}

/**
 * The citations of the claims whose text names any of `names`, each range once, in the order
 * written; none when no claim names them.
 */
export function citationsNaming(
  written: readonly WrittenClaim[],
  names: readonly string[],
): readonly Citation[] {
  const seen = new Set<string>();
  const found: Citation[] = [];
  const naming = written.filter((claim) => names.some((name) => nameHolds(claim.text, name)));
  for (const citation of naming.flatMap((claim) => claim.citations)) {
    const key = `${citation.path}:${String(citation.startLine)}-${String(citation.endLine)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(citation);
  }
  return found;
}
