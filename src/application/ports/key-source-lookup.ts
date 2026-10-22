import type { KeySource } from '../../domain/budget/price-table.js';
import type { ProviderKind } from './llm-provider.js';

// RF-1104, RF-1106, DEC-107: which key a role's calls would use, read without opening the key. The
// run's start caps (RF-1106) need it before any role is built; the provider factory keeps the choice.

/** What the key choice of one role depends on (the same inputs as `chooseKeySource`). */
export interface KeyChoiceRequest {
  readonly userId: string;
  readonly serverKeysAllowed: boolean;
  readonly kind: ProviderKind;
  readonly keySource: 'user' | 'user-then-server';
}

export interface KeySourceLookup {
  /** The key source the role would use; undefined when no key can serve it. */
  keySourceOf(request: KeyChoiceRequest): Promise<KeySource | undefined>;
}
