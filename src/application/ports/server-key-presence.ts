import type { KeyProvider } from '../../domain/accounts/provider-keys.js';

// RF-1104, RF-613: whether the server holds a key of its own for a provider (an environment
// variable). The key itself never leaves the infrastructure; the estimate before a plan run only
// asks whether a call would be refused for want of one (RST-2302).

export interface ServerKeyPresence {
  has(provider: KeyProvider): boolean;
}
