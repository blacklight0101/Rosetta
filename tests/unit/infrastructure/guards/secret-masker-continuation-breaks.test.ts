import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  backslash,
  fakePassword,
  fakeToken,
  lineTerminators,
  passwordOption,
  tokenOption,
} from '../../../support/continuation-breaks.js';

// RF-141, RNF-003, P1-162, P2-42: a command line whose value stands on the line after a shell
// line continuation is still masked, for `--password` as for `--token`, and whatever line
// terminator follows the continuation mark.

describe('SecretMasker and a line continuation', () => {
  it.each(lineTerminators)(
    'RF-141 masks a --password value after a continuation and $name',
    ({ value }) => {
      const text = `run ${passwordOption} ${backslash}${value}  ${fakePassword} --verbose`;

      const result = new SecretMasker().mask(text);

      expect(result.text).not.toContain(fakePassword);
      expect(result.counts.password).toBe(1);
    },
  );

  it.each(lineTerminators)(
    'RF-141 masks a --token value after a continuation and $name',
    ({ value }) => {
      const text = `run ${tokenOption} Bearer ${backslash}${value}  ${fakeToken} --verbose`;

      const result = new SecretMasker().mask(text);

      expect(result.text).not.toContain(fakeToken);
      expect(result.counts['bearer-token']).toBe(1);
    },
  );

  it('RF-141 does not take a lone continuation mark for the --password value', () => {
    const result = new SecretMasker().mask(`run ${passwordOption} ${backslash}\n  ${fakePassword}`);

    expect(result.text).toContain(`${passwordOption} ${backslash}\n  [MASKED:password]`);
  });

  it('RF-141 masks a --password value on the same line as before', () => {
    const result = new SecretMasker().mask(`run ${passwordOption} ${fakePassword} --verbose`);

    expect(result.text).toBe(`run ${passwordOption} [MASKED:password] --verbose`);
  });

  it('RF-141 masks again to the same text', () => {
    const masker = new SecretMasker();
    const once = masker.mask(`run ${passwordOption} ${backslash}\r\n  ${fakePassword}`).text;

    expect(masker.mask(once).text).toBe(once);
  });
});
