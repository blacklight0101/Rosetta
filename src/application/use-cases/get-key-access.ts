import type { Actor } from '../../domain/accounts/actor.js';
import { KEY_PROVIDERS, type KeyProvider } from '../../domain/accounts/provider-keys.js';
import type { ProviderKeyRepository } from '../ports/provider-key-repository.js';
import type { ServerKeyPresence } from '../ports/server-key-presence.js';
import type { UserRepository } from '../ports/user-repository.js';

// RF-436, RF-1104, DEC-225: which providers the signed-in user can use a key for, so the project
// settings page lists only those in its every-role control. Two facts per provider that takes a
// key: the user saved a key of their own, and the user may use the server's key (the administrator
// allows server keys for the account and the server holds one). No key and no part of one is read
// out; only the user's own rows count.

export interface KeyAccess {
  readonly provider: KeyProvider;
  readonly ownKey: boolean;
  readonly serverKey: boolean;
}

export interface GetKeyAccessDependencies {
  readonly keys: Pick<ProviderKeyRepository, 'listForUser'>;
  readonly users: Pick<UserRepository, 'findById'>;
  readonly serverKeys: ServerKeyPresence;
}

export class GetKeyAccess {
  private readonly deps: GetKeyAccessDependencies;

  constructor(deps: GetKeyAccessDependencies) {
    this.deps = deps;
  }

  // RF-436, RF-1104
  async execute(request: { readonly actor: Actor }): Promise<readonly KeyAccess[]> {
    const { userId } = request.actor;
    const [records, account] = await Promise.all([
      this.deps.keys.listForUser(userId),
      this.deps.users.findById(userId),
    ]);
    const own = new Set(records.map((record) => record.provider));
    const allowed = account?.serverKeysAllowed ?? false;
    return KEY_PROVIDERS.map((provider) => ({
      provider,
      ownKey: own.has(provider),
      serverKey: allowed && this.deps.serverKeys.has(provider),
    }));
  }
}
