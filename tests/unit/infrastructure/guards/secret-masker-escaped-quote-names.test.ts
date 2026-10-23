import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';

// P3-128 (RF-141): how much precision each name applies to a value between escaped quotes. A
// password name masks any value, as the plain form does; an API key or secret name masks a value
// that is not a switch, number, placeholder or code, digit or not; a token name also needs a digit
// or a symbol (P3-116). Synthetic values only (RNF-003).

const masker = new SecretMasker();
const bs = String.fromCharCode(92);
const eq = `${bs}"`;

describe('a password name masks any value between escaped quotes', () => {
  it.each([
    ['a value with no digit', 'correct horse'],
    ['a switch', 'true'],
    ['a placeholder', '<password>'],
    ['a variable', '$' + '{PASSWORD}'],
    ['a type word', 'string'],
    ['a number', '12345'],
  ])('RF-141 masks %s', (_name, value) => {
    expect(masker.mask(`password=${eq}${value}${eq}`).text).toBe(
      `password=${eq}[MASKED:password]${eq}`,
    );
  });
});

describe('an API key or secret name masks a value with no digit (P3-128)', () => {
  it.each([
    ['api_key', 'api-key'],
    ['secret', 'password'],
    ['client_secret', 'password'],
  ])('RF-141 masks a digit-less value under %s', (name, kind) => {
    expect(masker.mask(`${name}=${eq}abcdefgh${eq}`).text).toBe(
      `${name}=${eq}[MASKED:${kind}]${eq}`,
    );
  });

  it.each([
    ['a switch', 'true'],
    ['a number', '30'],
    ['code', 'getKey()'],
  ])('RF-141 leaves %s under api_key alone', (_name, value) => {
    const text = `api_key=${eq}${value}${eq}`;

    expect(masker.mask(text).text).toBe(text);
  });

  it('RF-141 a token name still needs a digit or a symbol', () => {
    const text = `token=${eq}abcdefgh${eq}`;

    expect(masker.mask(text).text).toBe(text);
    expect(masker.mask(`token=${eq}abcd1234${eq}`).text).toBe(
      `token=${eq}[MASKED:bearer-token]${eq}`,
    );
  });
});

describe('the value between escaped quotes (P3-128)', () => {
  it('RF-141 a plain double quote inside the value does not end it', () => {
    const text = `password=${eq}FAKE"inner-0000${eq} tail`;

    expect(masker.mask(text).text).toBe(`password=${eq}[MASKED:password]${eq} tail`);
  });

  it('RF-141 a nested escaped quote inside the value does not leave the tail visible', () => {
    const nested = `${bs}${bs}${bs}"`;
    const text = `password=${eq}FAKE${nested}inner-0000${eq} tail`;

    const result = masker.mask(text).text;

    expect(result).toBe(`password=${eq}[MASKED:password]${eq} tail`);
  });

  it('RF-141 a secret name needs a left boundary', () => {
    const text = `topsecret=${eq}FAKE-sec-0000${eq}`;

    expect(masker.mask(text).text).toBe(text);
    expect(masker.mask(`top_secret=${eq}FAKE-sec-0000${eq}`).text).toContain('MASKED:password');
    expect(masker.mask(`topSecret=${eq}FAKE-sec-0000${eq}`).text).toContain('MASKED:password');
  });
});
