import type { Actor } from '../../domain/accounts/actor.js';
import type { KeyProvider } from '../../domain/accounts/provider-keys.js';
import type { ProviderKeyRepository } from '../ports/provider-key-repository.js';

// RF-1104, RF-1105: the settings page lists the signed-in user's keys: the provider, the last four
// characters and the update time only. No other column of a key row leaves the server.

export interface ProviderKeySummary {
  readonly provider: KeyProvider;
  readonly last4: string;
  readonly updatedAt: Date;
}

export interface ListProviderKeysRequest {
  readonly actor: Actor;
}

export interface ListProviderKeysDependencies {
  readonly keys: ProviderKeyRepository;
}

export class ListProviderKeys {
  private readonly deps: ListProviderKeysDependencies;

  constructor(deps: ListProviderKeysDependencies) {
    this.deps = deps;
  }

  // RF-1104
  async execute(request: ListProviderKeysRequest): Promise<readonly ProviderKeySummary[]> {
    const records = await this.deps.keys.listForUser(request.actor.userId);
    return records.map(({ provider, last4, updatedAt }) => ({ provider, last4, updatedAt }));
  }
}
