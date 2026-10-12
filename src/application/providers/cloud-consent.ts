import type { ProviderKind } from '../ports/llm-provider.js';

// RF-143, DEC-16: whether sending code to a provider of this kind needs the run's consent.

// RF-143
export function needsCloudConsent(_kind: ProviderKind): boolean {
  throw new Error('not implemented');
}
