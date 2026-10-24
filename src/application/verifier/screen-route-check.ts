import type { CitedExcerpt } from './cited-lines.js';
import type { FieldVerdict } from './screen-field-check.js';

// P5-31, P3-122: stub until the route check is written.
export function screenRouteVerdict(
  _claim: { readonly text: string },
  _excerpts: readonly CitedExcerpt[],
): FieldVerdict | undefined {
  return _claim.text === '' && _excerpts.length < 0
    ? { status: 'Rejected', reason: '' }
    : undefined;
}
