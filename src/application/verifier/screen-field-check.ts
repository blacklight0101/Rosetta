import { detailKindOf } from '../../domain/cards/screen-claims.js';
import type { CitedExcerpt } from './cited-lines.js';

// RF-626, RF-301, ADR-005, DEC-18, DEC-19, P3-122, HB-02: a derived claim "Field X (text, optional)
// is on the screen" says one thing the cited lines can settle without a model: whether the field
// is named there. On the Haiku evaluation these claims were 85-90% of the verifier tokens of a
// Deepen run, one call each. The check looks for the field name as whole words (case, underscores,
// hyphens, spaces and camelCase do not matter: `Asset Tag`, `asset_tag` and `txtAssetTag` all hold
// `AssetTag`) in the lines the verifier would have been sent. Present is `Supported`; absent is
// `Rejected` with a plain reason. A name with no letter or digit, a file the scan did not read and
// any claim that is not a field claim are undecided and go to the model as before.

export interface FieldVerdict {
  readonly status: 'Supported' | 'Rejected';
  readonly reason: string;
}

/** The name between "Field " and the " (kind, required) is on the screen." of the claim text. */
function fieldNameOf(text: string): string | undefined {
  if (detailKindOf(text) !== 'field') return undefined;
  const match = /^Field (.*) \([^()]*\) is on the screen\.$/su.exec(text);
  return match?.[1];
}

/** The lower-case words of a text: split at camelCase humps and at every non-alphanumeric run. */
function wordsOf(text: string): readonly string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

function containsRun(haystack: readonly string[], needle: readonly string[]): boolean {
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
  }
  return false;
}

// RF-626
export function screenFieldVerdict(
  claim: { readonly text: string },
  excerpts: readonly CitedExcerpt[],
): FieldVerdict | undefined {
  const name = fieldNameOf(claim.text);
  if (name === undefined || excerpts.some((excerpt) => excerpt.skipped)) return undefined;
  const wanted = wordsOf(name);
  if (wanted.length === 0) return undefined;
  const present = excerpts.some((excerpt) =>
    containsRun(wordsOf(excerpt.lines.join('\n')), wanted),
  );
  return present
    ? { status: 'Supported', reason: `The cited lines contain the field name ${name}.` }
    : { status: 'Rejected', reason: `The cited lines do not contain the field name ${name}.` };
}
