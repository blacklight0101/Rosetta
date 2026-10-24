import type { Claim } from '../../domain/cards/card.js';
import type { SecretLines } from '../ports/secret-lines.js';
import type { CitedExcerpt } from './cited-lines.js';

// P5-34, RF-301, RF-141, ADR-005: Rosetta masks a secret value before any model reads the line it
// stands on, so a reader that says the value "is masked in the source" describes Rosetta's work as
// the code's. The school benchmark had one such claim Supported on a Password= in App.config. The
// check is free and needs no model: the claim says a value is masked, hidden, redacted or
// obfuscated, it does not say the value is written in plain text, and a cited line is a line the
// masker replaces a secret on. A claim that a plain-text secret is written there is not touched.

const saysMasked = /\b(?:masked|hidden|redacted|obfuscated)\b/iu;
const namesSecret =
  /\b(?:password|passwd|pwd|secret|key|token|credential|connection string|value)s?\b/iu;
const saysPlainText = /\b(?:plain[\s-]?text|cleartext|unencrypted)\b/iu;

/** The first cited line the masker replaces a secret on, as `path:line`, or undefined. */
function maskedCitedLine(
  excerpts: readonly CitedExcerpt[],
  secretLines: SecretLines,
): string | undefined {
  for (const excerpt of excerpts) {
    if (excerpt.skipped) continue;
    const from = excerpt.citedStartLine ?? excerpt.startLine;
    const to = excerpt.citedEndLine ?? excerpt.endLine;
    for (const index of secretLines.of(excerpt.lines.join('\n'))) {
      const line = excerpt.startLine + index - 1;
      if (line >= from && line <= to) return `${excerpt.path}:${String(line)}`;
    }
  }
  return undefined;
}

/** Why the claim is rejected, or undefined when it is not that claim or its lines hold no masked value. */
// RF-301
export function maskedSourceReason(
  claim: Pick<Claim, 'text'>,
  excerpts: readonly CitedExcerpt[],
  secretLines: SecretLines,
): string | undefined {
  const { text } = claim;
  if (!saysMasked.test(text) || !namesSecret.test(text) || saysPlainText.test(text)) {
    return undefined;
  }
  const site = maskedCitedLine(excerpts, secretLines);
  if (site === undefined) return undefined;
  return `The cited line ${site} holds the value in plain text: Rosetta masked it before the model read the line, and the code does not mask it.`;
}
