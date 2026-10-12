import type { ProviderKind } from '../ports/llm-provider.js';

// RF-143, DEC-16: whether sending code to a provider of this kind needs the run's consent. The
// kind decides, never the address: Ollama runs on the host or next to Rosetta (RF-401) and the fake
// never leaves the process, so both are local; OpenAI, Anthropic and an OpenAI-compatible service
// (whose base URL must be public, RF-1104) are cloud providers.

// RF-143
export function needsCloudConsent(target: {
  readonly kind: ProviderKind;
  readonly endpointHost: string;
}): boolean {
  switch (target.kind) {
    case 'ollama':
    case 'fake':
      return false;
    case 'openai':
    case 'openai-compatible':
    case 'anthropic':
      return true;
  }
}
