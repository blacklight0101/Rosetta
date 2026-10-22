import type {
  KeyChoiceRequest,
  KeySourceLookup,
} from '../../application/ports/key-source-lookup.js';
import type { ProviderKeyRepository } from '../../application/ports/provider-key-repository.js';
import { chooseKeySource, keyProviderOf } from '../../application/providers/key-choice.js';
import type { KeySource } from '../../domain/budget/price-table.js';
import type { ServerKeys } from './provider-access.js';

// RF-1104, RF-1106, DEC-107: the key source a role would use, for the start caps of a run (P3-91).
// The same choice as `resolveAccess`, but it reads only whether a key exists: the sealed key is
// opened only by the provider factory, the one place that uses a key.

export interface KeySourceLookupParts {
  readonly keys: ProviderKeyRepository;
  readonly serverKeys: ServerKeys;
}

// RF-1106
export function keySourceLookupOf(parts: KeySourceLookupParts): KeySourceLookup {
  return {
    async keySourceOf(request: KeyChoiceRequest): Promise<KeySource | undefined> {
      const provider = keyProviderOf(request.kind);
      const record =
        provider === undefined ? undefined : await parts.keys.find(request.userId, provider);
      const serverKey =
        provider === 'openai' || provider === 'anthropic' ? parts.serverKeys[provider] : undefined;
      const choice = chooseKeySource({
        kind: request.kind,
        keySource: request.keySource,
        hasUserKey: record !== undefined,
        serverKeysAllowed: request.serverKeysAllowed,
        hasServerKey: serverKey !== undefined,
      });
      return choice.ok ? choice.value : undefined;
    },
  };
}
