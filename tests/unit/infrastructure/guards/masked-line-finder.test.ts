import { describe, expect, it } from 'vitest';
import { MaskedLineFinder } from '../../../../src/infrastructure/guards/masked-line-finder.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { configLine, configText, fakePassword } from '../../../support/masked-secret-fixtures.js';

// P5-34, RF-141: the lines of a text the masker replaces a secret on, by number from 1, and never
// the value. The masker keeps every line where it was, so the numbers are the file's own.

const finder = new MaskedLineFinder(new SecretMasker());

describe('the lines that hold a masked secret', () => {
  it('P5-34 names the line of a connection string with a password', () => {
    expect(finder.of(configText)).toEqual([configLine]);
  });

  it('P5-34 names each line, once, in order', () => {
    const text = `Password=${fakePassword}\nname=a\npwd: ${fakePassword}\n`;

    expect(finder.of(text)).toEqual([1, 3]);
  });

  it('P5-34 names the first and last line of a private key block that spans lines', () => {
    const text =
      'a\n-----BEGIN RSA PRIVATE KEY-----\nFAKEFAKE\nFAKEFAKE\n-----END RSA PRIVATE KEY-----\nb';

    expect(finder.of(text)).toEqual(expect.arrayContaining([2, 5]));
    expect(finder.of(text)).not.toContain(1);
    expect(finder.of(text)).not.toContain(6);
  });

  it('P5-34 finds nothing in a text with no secret, and counts CRLF lines as lines', () => {
    expect(finder.of('<a/>\r\n<b/>\r\n')).toEqual([]);
    expect(finder.of(`<a/>\r\nPassword=${fakePassword}\r\n`)).toEqual([2]);
  });
});
