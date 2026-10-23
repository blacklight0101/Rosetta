import type { CitedExcerpt } from './cited-lines.js';

// P3-122: stub, replaced by the check.
export function screenFieldVerdict(
  claim: { readonly text: string },
  excerpts: readonly CitedExcerpt[],
): { readonly status: 'Supported' | 'Rejected'; readonly reason: string } | undefined {
  return claim.text.length > 0 && excerpts.length < 0
    ? { status: 'Supported', reason: '' }
    : undefined;
}
