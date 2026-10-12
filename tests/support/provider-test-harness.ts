import { TestProviders } from '../../src/application/use-cases/test-providers.js';
import { actorOf, type Actor } from '../../src/domain/accounts/actor.js';
import type { UserAccount } from '../../src/domain/accounts/user.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { sampleAccount } from './account-fixtures.js';
import {
  factoryAccount,
  factoryHarness,
  type FactoryHarness,
  type FactoryHarnessOptions,
} from './provider-factory-harness.js';
import { templateSettings } from './project-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-407: the TestProviders use case over the factory harness (memory ledger, fake adapters) and a
// stored account.

export interface ProviderTestHarness extends FactoryHarness {
  readonly users: MemoryUserRepository;
  readonly account: UserAccount;
  readonly actor: Actor;
  readonly testProviders: TestProviders;
}

export interface ProviderTestOptions extends FactoryHarnessOptions {
  readonly user?: Partial<UserAccount>;
}

/** The harness with a stored account whose id is the factory harness's account. */
export async function providerTestHarness(
  options: ProviderTestOptions = {},
): Promise<ProviderTestHarness> {
  const base = factoryHarness(options);
  const users = new MemoryUserRepository();
  const account = sampleAccount({ ...options.user, id: factoryAccount.id });
  await users.insert(account);
  const testProviders = new TestProviders({
    users,
    serverSettings: base.serverSettings,
    template: templateSettings,
    factory: base.factory,
    ids: new SequenceIdGenerator(),
    unrecorded: base.sinks,
  });
  return { ...base, users, account, actor: actorOf(account), testProviders };
}
