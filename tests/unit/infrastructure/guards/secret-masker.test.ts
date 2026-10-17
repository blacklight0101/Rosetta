import { describe, expect, it } from 'vitest';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { innocentTexts, secretCases } from '../../../support/secret-fixture.js';

function lineCount(text: string): number {
  return text.split('\n').length;
}

const masker = new SecretMasker();
const wholeFixture = secretCases.map((secretCase) => secretCase.text).join('\n');

describe('SecretMasker on each fixture case', () => {
  it.each(secretCases)('RF-141 replaces $name with [MASKED:$kind]', (secretCase) => {
    const result = masker.mask(secretCase.text);

    expect(result.text).toBe(secretCase.masked);
    expect(result.counts[secretCase.kind]).toBe(1);
  });

  it.each(secretCases)('RF-141 removes every fake value of $name', (secretCase) => {
    const { text } = masker.mask(secretCase.text);

    for (const secret of secretCase.secrets) {
      expect(text).not.toContain(secret);
    }
  });

  it.each(secretCases)('RF-141 keeps the line count and line numbers of $name', (secretCase) => {
    const input = `first line\n${secretCase.text}`;
    const lines = masker.mask(input).text.split('\n');

    expect(lines).toHaveLength(lineCount(input));
    expect(lines[0]).toBe('first line');
    expect(lines.slice(1).join('\n')).toBe(secretCase.masked);
  });

  it.each(innocentTexts)('RF-141 leaves text that only looks like a secret alone: %s', (text) => {
    const result = masker.mask(text);

    expect(result.text).toBe(text);
    expect(Object.values(result.counts).every((count) => count === 0)).toBe(true);
  });
});

describe('SecretMasker on the whole fixture', () => {
  it('RF-141 counts every masked secret per kind', () => {
    expect(masker.mask(wholeFixture).counts).toEqual({
      'api-key': 12,
      'bearer-token': 44,
      'connection-string': 7,
      password: 39,
      'private-key': 3,
    });
  });

  it('RF-141 keeps every line of the whole fixture in place', () => {
    expect(lineCount(masker.mask(wholeFixture).text)).toBe(lineCount(wholeFixture));
  });

  it('RF-141 does not mask an already masked value again', () => {
    const once = masker.mask(wholeFixture);

    const twice = masker.mask(once.text);

    expect(twice.text).toBe(once.text);
    expect(Object.values(twice.counts).every((count) => count === 0)).toBe(true);
  });
});

describe('SecretMasker failure', () => {
  it('RF-141 throws a coded error with the cause when masking fails, so callers fail closed', () => {
    const broken = new SecretMasker([{ kind: 'password', pattern: /password=\S+/ }]);

    let thrown: unknown;
    try {
      broken.mask('password=anything');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(RosettaError);
    expect(thrown).toHaveProperty('code', 'RST-2101');
    expect(thrown).toHaveProperty('cause', expect.any(TypeError));
  });
});
