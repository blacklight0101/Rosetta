import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';

// P3-128 (RF-141, RF-145; follow-up of P3-116 and P3-127): a setting value between backslash-escaped
// quotes is masked whole and the backslashes stay. Synthetic values only (RNF-003).

const masker = new SecretMasker();
const bs = String.fromCharCode(92);
const eq = `${bs}"`; // the two characters backslash, double quote
const fakePassword = 'FAKE-pw-0000';
const fakeKey = 'FAKE-key-0000';

describe('a value between escaped quotes (P3-128)', () => {
  it('RF-141 masks the whole value of the card shape and keeps the backslashes', () => {
    const text = `Password=${eq}${fakePassword}${eq} and ${eq}x${eq}`;

    const result = masker.mask(text);

    expect(result.text).toBe(`Password=${eq}[MASKED:password]${eq} and ${eq}x${eq}`);
    expect(result.counts.password).toBe(1);
  });

  it('RF-141 masks a value that holds a space, a quote of the other kind and a symbol', () => {
    const text = `pwd: ${eq}FAKE pw 'a' ;0${eq}, next`;

    expect(masker.mask(text).text).toBe(`pwd: ${eq}[MASKED:password]${eq}, next`);
  });

  it('RF-141 masks an escaped quote that was escaped twice (a YAML string holding one)', () => {
    const twice = `${bs}${bs}${bs}"`;
    const text = `"Password=${twice}${fakePassword}${twice} and ${twice}x${twice}"`;

    expect(masker.mask(text).text).toBe(
      `"Password=${twice}[MASKED:password]${twice} and ${twice}x${twice}"`,
    );
  });

  it('RF-141 masks a value in an escaped JSON string with an escaped key', () => {
    const text = `{"a":"${eq}password${eq}: ${eq}${fakePassword}${eq}"}`;

    expect(masker.mask(text).text).toBe(`{"a":"${eq}password${eq}: ${eq}[MASKED:password]${eq}"}`);
  });
});

describe('other secret names between escaped quotes (P3-128)', () => {
  it.each([
    ['api_key', 'api-key', fakeKey],
    ['ApiKey', 'api-key', fakeKey],
    ['access_token', 'bearer-token', 'FAKE-tk-0000'],
    ['client_secret', 'password', 'FAKE-sec-0000'],
  ])('RF-141 masks %s between escaped quotes', (name, kind, value) => {
    const result = masker.mask(`${name}=${eq}${value}${eq} ok`);

    expect(result.text).toBe(`${name}=${eq}[MASKED:${kind}]${eq} ok`);
  });

  it('RF-141 an escaped single quote closes at an escaped single quote', () => {
    const q = `${bs}'`;

    expect(masker.mask(`Password=${q}${fakePassword}${q} and ${eq}x${eq}`).text).toBe(
      `Password=${q}[MASKED:password]${q} and ${eq}x${eq}`,
    );
  });

  it('RF-141 an escaped quote that is never closed still masks the value', () => {
    const result = masker.mask(`Password=${eq}${fakePassword} rest`);

    expect(result.text).not.toContain(fakePassword);
    expect(result.text).toContain(`Password=${eq}[MASKED:password]`);
  });
});

describe('plain and JSON-quoted values are masked as before (P3-128)', () => {
  it.each([
    [`Password=${fakePassword} and x`, 'Password=[MASKED:password] and x'],
    [`Password="${fakePassword}" and "x"`, 'Password="[MASKED:password]" and "x"'],
    [`{"password":"${fakePassword}"}`, '{"password":"[MASKED:password]"}'],
    [`"Password": "${fakePassword}"`, '"Password": "[MASKED:password]"'],
  ])('RF-141 masks %j', (text, masked) => {
    expect(masker.mask(text).text).toBe(masked);
  });
});

describe('ordinary settings between escaped quotes are not masked (P3-116 precision, P3-128)', () => {
  it.each([
    `Password=${eq}${eq} and ${eq}x${eq}`,
    `token=${eq}string${eq}`,
    `max_token=${eq}30${eq}`,
    `max_tokens=${eq}FAKE-tk-0000${eq}`,
    `api_key=${eq}YOUR_API_KEY${eq}`,
    `secret=${eq}config.secret${eq}`,
    `ApiKeyHeaderName=${eq}X-Api-Key${eq}`,
    `Compass=${eq}FAKE-0000${eq}`,
    `the ${eq}password${eq} field and ${eq}x${eq}`,
  ])('RF-141 leaves %j alone', (text) => {
    expect(masker.mask(text).text).toBe(text);
  });
});
