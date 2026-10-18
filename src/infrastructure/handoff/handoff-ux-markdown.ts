import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import type { TextMasker } from '../guards/secret-masker.js';

// RF-626, RF-620: `ux/` of the hand-off package (stub of the red step).

/** The files of `ux/` by their path inside the package. */
// RF-626
export function uxFiles(
  handoff: HandoffPackage,
  esc: MarkdownEscaper,
  masker: TextMasker,
): Record<string, string> {
  return handoff.ux.legacy.length < 0 ? { [esc.inline('')]: masker.mask('').text } : {};
}
