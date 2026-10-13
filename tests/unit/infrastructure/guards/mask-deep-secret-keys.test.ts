import { describe, expect, it } from 'vitest';
import { maskDeep } from '../../../../src/infrastructure/guards/mask-deep.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { fakeValue } from '../../../support/fake-value.js';

// FAKE SECRETS ONLY (RNF-003): plain words the text masker alone would not recognise.
const fakeSecret = `Plain ${fakeValue(14)} words`;
const masker = new SecretMasker();

describe('maskDeep on a key that names a secret', () => {
  it.each([
    ['token', '[MASKED:bearer-token]'],
    ['accessToken', '[MASKED:bearer-token]'],
    ['refresh_token', '[MASKED:bearer-token]'],
    ['X-Auth-Token', '[MASKED:bearer-token]'],
    ['authorization', '[MASKED:bearer-token]'],
    ['Authorization', '[MASKED:bearer-token]'],
    ['proxyAuthorization', '[MASKED:bearer-token]'],
    ['secret', '[MASKED:password]'],
    ['clientSecret', '[MASKED:password]'],
    ['client_secret', '[MASKED:password]'],
    ['secrets', '[MASKED:password]'],
  ])('RF-141 replaces the whole value under the key %s with %s', (key, marker) => {
    expect(maskDeep({ [key]: fakeSecret }, masker)).toEqual({ [key]: marker });
  });
});

describe('maskDeep on a secret key, for every value type and depth', () => {
  it('RF-141 replaces a number, a list and an object under such a key whole', () => {
    const masked = maskDeep(
      { token: 73915820, secret: [fakeSecret, fakeSecret], authorization: { scheme: fakeSecret } },
      masker,
    );

    expect(masked).toEqual({
      token: '[MASKED:bearer-token]',
      secret: '[MASKED:password]',
      authorization: '[MASKED:bearer-token]',
    });
  });

  it('RF-141 masks such a key at any depth, inside a list too', () => {
    const masked = maskDeep({ calls: [{ headers: { authorization: fakeSecret }, id: 7 }] }, masker);

    expect(masked).toEqual({
      calls: [{ headers: { authorization: '[MASKED:bearer-token]' }, id: 7 }],
    });
  });

  it('RF-141 keeps a null under such a key and leaves counts and timings alone', () => {
    const record = {
      token: null,
      inputTokens: 12,
      maxTokens: 4,
      contextTokens: 8_192,
      timeToFirstTokenMs: 90,
      areaTokenBudget: 50_000,
      secretCount: 3,
      tokenizer: 'cl100k',
    };

    expect(maskDeep(record, masker)).toEqual(record);
  });
});
