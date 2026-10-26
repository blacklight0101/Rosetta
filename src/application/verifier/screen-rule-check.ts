import type { CitedExcerpt } from './cited-lines.js';
import { screenFieldVerdict, type FieldVerdict } from './screen-field-check.js';
import { screenRouteVerdict } from './screen-route-check.js';

// P3-122, P5-31: the derived screen claims the cited lines settle without a model: a field is on
// the screen, and the route of a page is its file path.

// RF-626
export function screenRuleVerdict(
  claim: { readonly text: string },
  excerpts: readonly CitedExcerpt[],
): FieldVerdict | undefined {
  return screenFieldVerdict(claim, excerpts) ?? screenRouteVerdict(claim, excerpts);
}
