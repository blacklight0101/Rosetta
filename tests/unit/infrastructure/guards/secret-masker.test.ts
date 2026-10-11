import { describe, expect, it } from 'vitest';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { innocentTexts, secretCases } from '../../../support/secret-fixture.js';

function lineCount(text: string): number {
  return text.split('\n').length;
}

describe('SecretMasker', () => {
  const masker = new SecretMasker();

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
    const input = `first line\n${secretCase.text}\nlast line`;
    const lines = masker.mask(input).text.split('\n');

    expect(lines).toHaveLength(lineCount(input));
    expect(lines[0]).toBe('first line');
    expect(lines.at(-1)).toBe('last line');
  });

  it('RF-141 counts every masked secret per kind', () => {
    const content = secretCases.map((secretCase) => secretCase.text).join('\n');

    const { counts } = masker.mask(content);

    expect(counts).toEqual({
      'api-key': 5,
      'bearer-token': 1,
      'connection-string': 4,
      password: 4,
      'private-key': 3,
    });
  });

  it('RF-141 keeps every line of the whole fixture in place', () => {
    const content = secretCases.map((secretCase) => secretCase.text).join('\n');

    expect(lineCount(masker.mask(content).text)).toBe(lineCount(content));
  });

  it.each(innocentTexts)(
    'RF-141 leaves text that only looks like a secret unchanged: %s',
    (text) => {
      const result = masker.mask(text);

      expect(result.text).toBe(text);
      expect(Object.values(result.counts).every((count) => count === 0)).toBe(true);
    },
  );

  it('RF-141 does not mask an already masked value again', () => {
    const once = masker.mask(secretCases.map((secretCase) => secretCase.text).join('\n'));

    const twice = masker.mask(once.text);

    expect(twice.text).toBe(once.text);
    expect(Object.values(twice.counts).every((count) => count === 0)).toBe(true);
  });

  it('RF-141 throws a coded error with the cause when masking fails, so callers fail closed', () => {
    const broken = new SecretMasker([{ kind: 'password', pattern: /password=\S+/ }]);

    const attempt = (): unknown => broken.mask('password=anything');

    expect(attempt).toThrow(RosettaError);
    expect(attempt).toThrow(
      expect.objectContaining({ code: 'RST-2101', cause: expect.any(TypeError) }),
    );
  });
});
