import { describe, expect, it } from 'vitest';
import {
  chooseKeySource,
  keyProviderOf,
} from '../../../../src/application/providers/key-choice.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';

// RF-1104, RF-002: which key a role uses. The user's own key first; the server key only when the
// provider's setting allows it, the administrator allows it for the account and the server has one;
// a provider that takes no key needs none.

const both = {
  kind: 'openai',
  keySource: 'user-then-server',
  hasUserKey: true,
  serverKeysAllowed: true,
  hasServerKey: true,
} as const;

describe('chooseKeySource', () => {
  it('RF-1104 uses the user key when there is one, whatever the server offers', () => {
    expect(chooseKeySource(both)).toEqual({ ok: true, value: 'user' });
  });

  it('RF-1104 falls back to the server key when the user has none and may use it', () => {
    expect(chooseKeySource({ ...both, hasUserKey: false })).toEqual({ ok: true, value: 'server' });
  });

  it.each([
    ['the provider setting is user', { keySource: 'user' }],
    ['the administrator forbids server keys for the account', { serverKeysAllowed: false }],
    ['the server holds no key for the provider', { hasServerKey: false }],
  ] as const)('RF-002 stops with RST-2302 when %s', (_reason, change) => {
    const result = chooseKeySource({ ...both, hasUserKey: false, ...change });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.providerKeyMissing });
  });

  it('RF-1104 still prefers the own key when server keys are forbidden', () => {
    expect(chooseKeySource({ ...both, serverKeysAllowed: false })).toEqual({
      ok: true,
      value: 'user',
    });
  });

  it.each(['ollama', 'fake'] as const)('RF-1104 %s needs no key and is billed to none', (kind) => {
    const result = chooseKeySource({
      ...both,
      kind,
      keySource: 'user',
      hasUserKey: false,
      serverKeysAllowed: false,
      hasServerKey: false,
    });

    expect(result).toEqual({ ok: true, value: 'none' });
  });
});

describe('keyProviderOf', () => {
  it('RF-1104 maps the kinds that take a key to the key row and the others to none', () => {
    const kinds = ['openai', 'anthropic', 'openai-compatible', 'ollama', 'fake'] as const;

    expect(kinds.map(keyProviderOf)).toEqual([
      'openai',
      'anthropic',
      'openai-compatible',
      undefined,
      undefined,
    ]);
  });
});
