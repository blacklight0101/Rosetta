import type { KeyProvider } from '../../domain/accounts/provider-keys.js';
import type { KeySource } from '../../domain/budget/price-table.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { ProviderKind } from '../ports/llm-provider.js';

// RF-1104, RF-002, ADR-015: which key a role's calls use. The user's own key first. Without one, the
// server key, only when the provider's `keySource` setting is `user-then-server`, the administrator
// allows server keys for the account and the server holds a key for the provider. Otherwise the run
// stops before any call and names the provider. A provider that runs on this side of the wire
// (Ollama, the fake of the tests) takes no key and is billed to none.

export interface KeyChoiceInput {
  readonly kind: ProviderKind;
  /** `providers.<name>.keySource` of the project settings. */
  readonly keySource: 'user' | 'user-then-server';
  readonly hasUserKey: boolean;
  /** `users.server_keys_allowed`. */
  readonly serverKeysAllowed: boolean;
  /** The server holds a key (an environment variable) for the provider's kind. */
  readonly hasServerKey: boolean;
}

/** The key row a provider kind uses; undefined for a kind that takes no key. */
// RF-1104
export function keyProviderOf(kind: ProviderKind): KeyProvider | undefined {
  switch (kind) {
    case 'openai':
    case 'anthropic':
    case 'openai-compatible':
      return kind;
    case 'ollama':
    case 'fake':
      return undefined;
  }
}

// RF-1104, RF-002
export function chooseKeySource(
  input: KeyChoiceInput,
): Result<KeySource, typeof ERROR_CODES.providerKeyMissing> {
  if (keyProviderOf(input.kind) === undefined) return ok('none');
  if (input.hasUserKey) return ok('user');
  const mayUseServer =
    input.keySource === 'user-then-server' && input.serverKeysAllowed && input.hasServerKey;
  return mayUseServer ? ok('server') : err(ERROR_CODES.providerKeyMissing);
}
