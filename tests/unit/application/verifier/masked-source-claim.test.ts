import { describe, expect, it } from 'vitest';
import type { CitedExcerpt } from '../../../../src/application/verifier/cited-lines.js';
import { maskedSourceReason } from '../../../../src/application/verifier/masked-source-claim.js';
import { MaskedLineFinder } from '../../../../src/infrastructure/guards/masked-line-finder.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  configLine,
  configPath,
  configText,
  fakePassword,
  maskedInSourceClaim,
  plainTextClaim,
} from '../../../support/masked-secret-fixtures.js';

// P5-34, RF-301, RF-141: a value Rosetta masked is written in plain text in the code. A claim that
// it "is masked in the source" is never Supported; the check needs no model.

const finder = new MaskedLineFinder(new SecretMasker());

function excerptOf(lines: readonly string[], cited: readonly [number, number]): CitedExcerpt[] {
  return [
    {
      path: configPath,
      startLine: 1,
      endLine: lines.length,
      lines,
      skipped: false,
      citedStartLine: cited[0],
      citedEndLine: cited[1],
    },
  ];
}

const config = excerptOf(configText.split('\n'), [configLine, configLine]);

describe('a claim that a masked value is masked in the source', () => {
  it.each([
    'The password is masked in the source.',
    'The password is hidden in the configuration file.',
    'The connection string stores the password redacted.',
    'The password is obfuscated.',
  ])('P5-34 is rejected on a line Rosetta masked: %s', (sentence) => {
    const reason = maskedSourceReason({ text: sentence }, config, finder);

    expect(reason).toMatch(/plain text/u);
    expect(reason).toMatch(/Rosetta/u);
    expect(reason).toContain(`${configPath}:${String(configLine)}`);
    expect(reason).not.toContain(fakePassword);
  });

  it('P5-34 the claim of the benchmark card is rejected', () => {
    expect(maskedSourceReason(maskedInSourceClaim, config, finder)).toBeDefined();
  });

  it('P5-34 the same words about a line Rosetta masked nothing on are left to the model', () => {
    const plain = excerptOf(['<add key="Theme" value="dark" />'], [1, 1]);

    expect(maskedSourceReason(maskedInSourceClaim, plain, finder)).toBeUndefined();
  });

  it('P5-34 a masked line outside the cited range, in the margin, does not reject the claim', () => {
    const margin = excerptOf(configText.split('\n'), [1, 1]);

    expect(maskedSourceReason(maskedInSourceClaim, margin, finder)).toBeUndefined();
  });

  it('P5-34 a claim that a plain-text secret is written there is left to the model', () => {
    expect(maskedSourceReason(plainTextClaim, config, finder)).toBeUndefined();
  });

  it('P5-34 a claim that says plain text and masked together is left to the model', () => {
    const text = 'The password is written in plain text, not masked, in App.config.';

    expect(maskedSourceReason({ text }, config, finder)).toBeUndefined();
  });

  it('P5-34 a skipped file is left to the model', () => {
    const skipped = config.map((each) => ({ ...each, skipped: true }));

    expect(maskedSourceReason(maskedInSourceClaim, skipped, finder)).toBeUndefined();
  });
});
