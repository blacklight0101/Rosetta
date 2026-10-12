import { describe, expect, it } from 'vitest';
import {
  isKeyProvider,
  isUsableKeyValue,
  keyAdditionalData,
  lastFourOf,
  parseBaseUrl,
} from '../../../../src/domain/accounts/provider-keys.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixtureKey } from '../../../support/provider-key-fixtures.js';

// RF-1104: the providers a user stores a key for, the shape of a key value, the last four
// characters shown for it, the additional data that binds a sealed key to its row, and the rules
// of an OpenAI-compatible base URL (https, no credentials, no query or fragment).

describe('provider key rules', () => {
  it.each(['openai', 'anthropic', 'openai-compatible'])('RF-1104 %s takes a key', (provider) => {
    expect(isKeyProvider(provider)).toBe(true);
  });

  it.each(['ollama', 'fake', 'OpenAI', ''])('RF-1104 %s takes no key', (provider) => {
    expect(isKeyProvider(provider)).toBe(false);
  });

  it('RF-1104 shows only the last four characters', () => {
    expect(lastFourOf(fixtureKey('Tail9Q'))).toBe('il9Q');
    expect(lastFourOf(`${'x'.repeat(20)}éü€😀`)).toBe('éü€😀');
  });

  it('RF-1104 binds a sealed key to its user and provider', () => {
    expect(keyAdditionalData('00000000-0000-4000-9000-0000000000a1', 'openai')).toBe(
      '00000000-0000-4000-9000-0000000000a1:openai',
    );
  });

  it('RF-1104 accepts a key of 16 to 512 visible characters', () => {
    expect(isUsableKeyValue('a'.repeat(16))).toBe(true);
    expect(isUsableKeyValue('a'.repeat(512))).toBe(true);
    expect(isUsableKeyValue(fixtureKey('Usable1'))).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['shorter than 16 characters, where four would be a large part of it', 'a'.repeat(15)],
    ['longer than 512 characters', 'a'.repeat(513)],
    ['with a space', `${'a'.repeat(10)} ${'b'.repeat(10)}`],
    ['with a line break', `${'a'.repeat(20)}\n`],
    ['with a control character', `${'a'.repeat(20)}\u0007`],
    ['with a no-break space', `${'a'.repeat(20)}${String.fromCodePoint(0xa0)}`],
  ])('RF-1104 refuses a key %s', (_case, key) => {
    expect(isUsableKeyValue(key)).toBe(false);
  });
});

describe('parseBaseUrl', () => {
  it.each([
    ['https://llm.example.com/v1', 'https://llm.example.com/v1', 'llm.example.com'],
    [
      'https://LLM.Example.com:8443/api/v1/',
      'https://llm.example.com:8443/api/v1/',
      'llm.example.com',
    ],
    [
      'https://[2606:4700:4700::1111]/v1',
      'https://[2606:4700:4700::1111]/v1',
      '[2606:4700:4700::1111]',
    ],
  ])('RF-1104 accepts %s', (text, href, hostname) => {
    expect(parseBaseUrl(text)).toEqual({ ok: true, value: { href, hostname } });
  });

  it.each([
    ['http, not https', 'http://llm.example.com/v1'],
    ['another scheme', 'ftp://llm.example.com/v1'],
    ['credentials in the URL', 'https://user:secret@llm.example.com/v1'],
    ['a user name in the URL', 'https://user@llm.example.com/v1'],
    ['a query string', 'https://llm.example.com/v1?token=abc'],
    ['a fragment', 'https://llm.example.com/v1#part'],
    ['no URL at all', 'llm.example.com/v1'],
    ['an empty value', ''],
    ['more than 2,048 characters', `https://llm.example.com/${'a'.repeat(2_048)}`],
  ])('RF-1104 refuses a base URL with %s', (_case, text) => {
    expect(parseBaseUrl(text)).toEqual({ ok: false, error: ERROR_CODES.baseUrlRejected });
  });
});
